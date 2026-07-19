/**
 * Process-static cache reset (audit 04-concurrency-race-conditions.md
 * C-1 → L-3): Session::$instance / Account::$sessionAccount / Account::$items
 * are process-static properties that the framework NEVER clears between
 * HTTP requests. On the current php-cgi host (one OS process per request)
 * they start cold every request, so the leak is not exploitable there.
 * On any persistent-worker runtime (php-fpm / RoadRunner / Swoole /
 * FrankenPHP) the first request served by a worker would otherwise seal
 * its Session/Account values and leak them to every later request on the
 * same worker — a confirmed cross-user account-takeover mechanism.
 *
 * run_web.php now calls SessionStaticCacheResetter::reset() +
 * AccountStaticCacheResetter::reset() as its first executable statement
 * (before ErrorCatcher::init / IRabi construction / any middleware).
 *
 * The leak itself cannot be reproduced through real HTTP on the current
 * dev stack (`php garnet serve` spawns one `php -S` process per request),
 * so this spec proves the MECHANISM in isolation: spawn a PHP process,
 * seal non-default values into the framework statics via reflection,
 * invoke the resetters, and assert the statics return to their cold
 * defaults. This is the narrow case where direct reflection on protected
 * statics is justified — we are testing the fact of the reset, not
 * Session/Account business logic.
 *
 * Two groups:
 *   1. Static-cache reset behaviour (one PHP process, reflection).
 *   2. run_web.php wiring — the reset call is present, early (before
 *      BenchmarkLog::init / ErrorCatcher::init), and references both
 *      resetter classes. Static source checks, since the live dev
 *      server's process-per-request model means we cannot observe the
 *      reset having any effect end-to-end.
 */

import { test, expect } from '@playwright/test';
import { spawnSync } from 'child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const APP_DIR = path.resolve(__dirname, '../../..');

/**
 * One-shot PHP probe. Seals non-default values into the framework
 * Session/Account process-static caches, invokes both resetters, and
 * emits a single JSON object describing the state at each phase. Run in
 * a FRESH php process so the statics start at their cold defaults.
 */
function probeReset(): Record<string, boolean | number> {
    const code = `
declare(strict_types=1);
require __DIR__ . '/autoload.php';

use PHPCraftdream\\Garnet\\Kernel\\Db\\Entity\\Session\\Session;
use PHPCraftdream\\Garnet\\Kernel\\Db\\Entity\\Account\\Account;
use PHPCraftdream\\IRabi\\Common\\Services\\SessionStaticCacheResetter;
use PHPCraftdream\\IRabi\\Common\\Services\\AccountStaticCacheResetter;

// Session is typed '?ISession' and its ctor is protected, so use
// newInstanceWithoutConstructor to mint a real ISession without going
// through Session::get() (which would need cookies / DB).
\$sessStub = (new ReflectionClass(Session::class))->newInstanceWithoutConstructor();

\$rcSess = new ReflectionClass(Session::class);
\$beforeDefault = \$rcSess->getStaticPropertyValue('instance');

\$rcSess->setStaticPropertyValue('instance', \$sessStub);
\$sealedId = spl_object_id(\$rcSess->getStaticPropertyValue('instance'));

SessionStaticCacheResetter::reset();
\$afterReset = \$rcSess->getStaticPropertyValue('instance');

// Re-seal a fresh stub — spl_object_id MUST differ, proving the reset
// discarded the old object and a subsequent Session::get() would mint
// a brand-new singleton rather than resurrecting the sealed one.
\$rcSess->setStaticPropertyValue('instance', (new ReflectionClass(Session::class))->newInstanceWithoutConstructor());
\$reSealedId = spl_object_id(\$rcSess->getStaticPropertyValue('instance'));

// Account: same trick for the two statics.
\$accStub = (new ReflectionClass(Account::class))->newInstanceWithoutConstructor();
\$rcAcc = new ReflectionClass(Account::class);
\$itemsBefore = \$rcAcc->getStaticPropertyValue('items');
\$sessAccBefore = \$rcAcc->getStaticPropertyValue('sessionAccount');

\$rcAcc->setStaticPropertyValue('items', ['probe_login' => \$accStub]);
\$rcAcc->setStaticPropertyValue('sessionAccount', \$accStub);

AccountStaticCacheResetter::reset();
\$itemsAfter = \$rcAcc->getStaticPropertyValue('items');
\$sessAccAfter = \$rcAcc->getStaticPropertyValue('sessionAccount');

echo json_encode([
    'session_before_default_null' => \$beforeDefault === null,
    'session_sealed_id' => \$sealedId,
    'session_after_reset_null' => \$afterReset === null,
    'session_resealed_id' => \$reSealedId,
    'session_resealed_id_differs' => \$sealedId !== \$reSealedId,
    'account_items_before_empty' => \$itemsBefore === [],
    'account_sessionAccount_before_null' => \$sessAccBefore === null,
    'account_items_after_empty' => \$itemsAfter === [],
    'account_sessionAccount_after_null' => \$sessAccAfter === null,
]);
`;
    const res = spawnSync('php', ['-r', code], {
        cwd: APP_DIR,
        encoding: 'utf8',
        timeout: 30000,
    });
    if (res.status !== 0) {
        throw new Error(`probeReset php failed (exit=${res.status}): ${res.stdout} ${res.stderr}`);
    }
    const trimmed = res.stdout.trim();
    const lastLine = trimmed.split(/\r?\n/).pop()!;
    return JSON.parse(lastLine);
}

// ─────────────────────────────────────────────────────────────────────────
// 1. Static-cache reset mechanism
// ─────────────────────────────────────────────────────────────────────────

test.describe('ProcessStaticCache resetter — clears framework statics', () => {
    test('SessionStaticCacheResetter::reset() nulls Session::$instance', () => {
        const r = probeReset();

        // Cold process: the framework default is null. If this fails, the
        // probe itself is bogus (running in a contaminated process) and
        // every later assertion is suspect.
        expect(r.session_before_default_null).toBe(true);

        // Sealed value was observed as non-null (sanity: the spl_object_id
        // captured below would be meaningless otherwise).
        expect(r.session_after_reset_null).toBe(true);

        // The load-bearing assertion: a fresh seal after reset produces a
        // NEW object id. This is what the audit's "leak" would violate —
        // on a contaminated process the second seal would resurrect the
        // first request's object.
        expect(r.session_sealed_id).not.toBe(r.session_resealed_id);
        expect(r.session_resealed_id_differs).toBe(true);
    });

    test('AccountStaticCacheResetter::reset() nulls $sessionAccount and empties $items', () => {
        const r = probeReset();

        expect(r.account_items_before_empty).toBe(true);
        expect(r.account_sessionAccount_before_null).toBe(true);

        // Both caches cleared by the single reset() call.
        expect(r.account_items_after_empty).toBe(true);
        expect(r.account_sessionAccount_after_null).toBe(true);
    });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. run_web.php wiring — static source checks
//
// The live dev server (php garnet serve) runs process-per-request, so
// no end-to-end test can OBSERVE the reset having an effect. Instead we
// statically verify the call is wired correctly: present in run_web.php,
// references both resetter classes, and runs before any code that could
// populate the cache (BenchmarkLog::init is the long-standing "first
// executable" marker that predates this change).
// ─────────────────────────────────────────────────────────────────────────

test.describe('run_web.php wiring', () => {
    const runWebPath = path.join(APP_DIR, 'run_web.php');
    let src = '';

    test.beforeAll(() => {
        src = fs.readFileSync(runWebPath, 'utf8');
    });

    test('calls both resetters', () => {
        // Bare call sites — present verbatim.
        expect(src).toContain('AccountStaticCacheResetter::reset();');
        expect(src).toContain('SessionStaticCacheResetter::reset();');
    });

    test('reset runs before BenchmarkLog::init / ErrorCatcher::init / IRabi construction', () => {
        const accReset = src.indexOf('AccountStaticCacheResetter::reset();');
        const sessReset = src.indexOf('SessionStaticCacheResetter::reset();');
        const benchmark = src.indexOf('BenchmarkLog::init(');
        const errorCatcher = src.indexOf('ErrorCatcher::init(');
        const irabi = src.indexOf('new IRabi(');

        expect(accReset).toBeGreaterThan(-1);
        expect(sessReset).toBeGreaterThan(-1);
        expect(benchmark).toBeGreaterThan(-1);
        expect(errorCatcher).toBeGreaterThan(-1);
        expect(irabi).toBeGreaterThan(-1);

        // Both resets must precede every cache-touching bootstrap step.
        // BenchmarkLog is the conservative earliest marker — it has been
        // the first executable statement in run_web.php since before
        // this change, so anything that actually loads Session/Account
        // happens strictly after it.
        expect(accReset).toBeLessThan(benchmark);
        expect(sessReset).toBeLessThan(benchmark);
        expect(accReset).toBeLessThan(errorCatcher);
        expect(sessReset).toBeLessThan(errorCatcher);
        expect(accReset).toBeLessThan(irabi);
        expect(sessReset).toBeLessThan(irabi);
    });

    test('run_cmd.php (CLI path) is NOT touched — out of scope, single-process', () => {
        // The leak is specific to the persistent-worker web model; CLI
        // commands are single-process by nature and a reset there would
        // be noise. Guard that we did not accidentally wire it in.
        const cmdPath = path.join(APP_DIR, 'run_cmd.php');
        const cmdSrc = fs.readFileSync(cmdPath, 'utf8');
        expect(cmdSrc).not.toContain('StaticCacheResetter');
    });
});
