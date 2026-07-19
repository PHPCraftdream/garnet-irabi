/**
 * session-retention cron task (audit 01-legal-compliance.md F-05):
 *
 * Before this task, NOTHING pruned the framework `session`/`session_data`
 * tables. The session cookie lives up to 5 years (Cookie::rememberForever
 * → +5 years), and a session row whose owner never came back stayed
 * forever — carrying consent timestamps, auth_login links and other
 * personal-data-derived params. The file journals + six log tables were
 * handled by log-rotation (task #60); the session tables are the last
 * unpurgeable slice of F-05, closed here.
 *
 * This spec proves the new automated layer in two halves:
 *
 *   1. Live cron integration — `php run_cmd.php cron session-retention`
 *      actually deletes a 400-day-old session AND its session_data
 *      children, while a fresh session and its children survive. Also
 *      asserts worker-safety: every session that was in-window
 *      (lastUsage >= now-365d) before the tick — which is the exact age
 *      profile of the Playwright worker's own live login sessions — is
 *      still present after. The fresh marker seeded here stands in for
 *      a live session (same lastUsage≈now); the in-window-id check
 *      covers any real one directly.
 *
 *   2. Boundary-inclusive cutoff (clock-free) — invoked via a direct
 *      SessionRetentionService::pruneSessions($fixedNow) call with a
 *      frozen "now", so the exact-boundary row's fate does not depend
 *      on the real cron's time(). A row at lastUsage == cutoff is KEPT
 *      (boundary-inclusive, the `<` is strict), one second past is
 *      DELETED, one second inside is KEPT — the "keep more, not less"
 *      rule mirrored from log-rotation's file-half boundary test. The
 *      frozen clock is real-now captured once (NOT a far-future value):
 *      determinism comes from passing the same value to seed + prune,
 *      and real-now keeps real worker login sessions safely in-window
 *      so the half doesn't nuke the worker's auth state.
 */

import { test, expect, tn, getDbPrefix } from '../../helpers/scoped-test';
import { spawnSync } from 'child_process';
import * as path from 'node:path';
import { withConnection } from '../../helpers/db';

const APP_DIR = path.resolve(__dirname, '../../..');
const DAY = 86400;

/**
 * Frozen "now" for the boundary half — captured ONCE at module load and
 * injected into both the seed timestamps and the service call, so the
 * cutoff is deterministic regardless of how long the test takes.
 *
 * NOT a far-future clock on purpose: a 2030 clock would push the cutoff
 * to ~2029, which lands ABOVE every real worker login session in the
 * test schema (lastUsage ≈ real now ≈ 2026) and would nuke them all —
 * breaking the worker's auth for the rest of the suite and inflating
 * the prune count. Real-now keeps the cutoff at ~now-365d, where every
 * real session is safely in-window (lastUsage ≈ now ≫ cutoff) and only
 * the seeded PAST marker falls below it.
 *
 * Determinism does NOT come from the clock being far away — it comes
 * from passing the SAME frozen value to seed and prune, so PHP's time()
 * is never consulted in the assertion path. The 1-second straddle
 * (PAST/BOUNDARY/INSIDE at cutoff-1/cutoff/cutoff+1) is exact because
 * both sides use FIXED_CUTOFF = FIXED_NOW - 365*DAY, computed once.
 */
const FIXED_NOW = Math.floor(Date.now() / 1000);
const FIXED_CUTOFF = FIXED_NOW - 365 * DAY;

/**
 * Unique markers per process+run. `session.name` is UNIQUE, so these
 * never collide across concurrent workers or re-runs, and let the suite
 * clean up exactly its own rows (never a real worker session).
 */
const MARKER = `sret_${process.pid}_${Date.now().toString(36)}`;
const OLD_NAME = `${MARKER}_old`;
const FRESH_NAME = `${MARKER}_fresh`;
const PAST_NAME = `${MARKER}_past`;
const BOUNDARY_NAME = `${MARKER}_boundary`;
const INSIDE_NAME = `${MARKER}_inside`;

/**
 * Run the session-retention cron task the same way the real crontab
 * will, against the worker-isolated tables. Mirrors the invocation in
 * log-rotation-cron.spec.ts / email-queue-cron-lock.spec.ts.
 */
function runSessionRetentionCron(prefix: string): { stdout: string; stderr: string; exitCode: number | null } {
    const res = spawnSync('php', ['run_cmd.php', 'cron', 'session-retention'], {
        cwd: APP_DIR,
        env: { ...process.env, DB_PREFIX_OVERRIDE: prefix },
        encoding: 'utf8',
        timeout: 60000,
    });
    return { stdout: res.stdout ?? '', stderr: res.stderr ?? '', exitCode: res.status };
}

/**
 * Invoke SessionRetentionService::pruneSessions($fixedNow) directly with
 * an injected clock, against the worker-isolated tables. Boots the app
 * inline (mirrors run_cmd.php's boot, minus IoRunConsole::run) so the
 * DB_PREFIX_OVERRIDE applies. Used for the boundary half where the real
 * cron's time() would make the exact-boundary row flaky.
 */
function runServiceWithFixedClock(prefix: string, nowTs: number): { sessions_deleted: number; session_data_deleted: number } {
    // NOTE: namespace backslashes are doubled (\\ → \) for the JS template
    // literal; PHP vars use a lone $ (no ${} appears, so no JS interpolation).
    const code = `
require getcwd() . "/autoload.php";
use PHPCraftdream\\Garnet\\Kernel\\Core\\Env\\Env;
use PHPCraftdream\\Garnet\\Kernel\\Io\\IniConfig\\IniConfig;
use PHPCraftdream\\IRabi\\IRabi;
use PHPCraftdream\\IRabi\\Common\\Services\\SessionRetentionService;
IRabi::setPublicDirInit(getcwd() . DS . "WorkDir" . DS . "public" . DS);
$app = new IRabi(Env::isDevDir());
$app->consoleInit();
$override = getenv("DB_PREFIX_OVERRIDE");
if (is_string($override) && preg_match('/^[A-Za-z0-9_]{1,40}$/', $override) === 1) {
    IniConfig::db()->setRuntimeOverride("prefix", $override);
}
echo "RESULT=" . json_encode(SessionRetentionService::pruneSessions((int)$argv[1]));
`;
    const res = spawnSync('php', ['-r', code, '--', String(nowTs)], {
        cwd: APP_DIR,
        env: { ...process.env, DB_PREFIX_OVERRIDE: prefix },
        encoding: 'utf8',
        timeout: 60000,
    });
    if (res.status !== 0) {
        throw new Error(`pruneSessions direct call failed (exit=${res.status}): ${res.stdout} ${res.stderr}`);
    }
    const line = res.stdout.split(/\r?\n/).find((l) => l.startsWith('RESULT='));
    if (!line) {
        throw new Error(`pruneSessions direct call produced no RESULT line: ${res.stdout} ${res.stderr}`);
    }
    return JSON.parse(line.slice('RESULT='.length));
}

/** Insert a session row + N session_data children. Returns the session id. */
async function seedSession(
    name: string,
    lastUsage: number,
    childParams: string[],
): Promise<number> {
    return withConnection(async (conn) => {
        const [r]: any = await conn.execute(
            `INSERT INTO ${tn('session')} (name, lastUsage) VALUES (?, ?)`,
            [name, lastUsage],
        );
        const sessionId = Number(r.insertId);
        for (const param of childParams) {
            await conn.execute(
                `INSERT INTO ${tn('session_data')} (sessionId, param, value) VALUES (?, ?, ?)`,
                [sessionId, param, `v_${param}`],
            );
        }
        return sessionId;
    });
}

// ─────────────────────────────────────────────────────────────────────────
// 1. Live cron integration + worker-safety
// ─────────────────────────────────────────────────────────────────────────
test.describe('cron session-retention — live DB prune + worker sessions untouched', () => {
    test.describe.configure({ mode: 'serial' });

    let oldSessionId = 0;
    let freshSessionId = 0;
    let inWindowIdsBefore: number[] = [];

    test.beforeAll(async () => {
        // 400 days is unambiguously past the 365-day window; "now" is
        // unambiguously inside it — neither side is near the boundary,
        // so the assertions are timing-robust (the exact-boundary case
        // is covered by the clock-free half below).
        const oldTs = Math.floor(Date.now() / 1000) - 400 * DAY;
        const freshTs = Math.floor(Date.now() / 1000);
        const cutoff = Math.floor(Date.now() / 1000) - 365 * DAY;

        await withConnection(async (conn) => {
            // Clean any leftover from a previous run of this spec.
            await conn.execute(
                `DELETE FROM ${tn('session_data')} WHERE sessionId IN (
                    SELECT id FROM (SELECT id FROM ${tn('session')} WHERE name LIKE ?) AS z
                )`,
                [`${MARKER}_%`],
            );
            await conn.execute(
                `DELETE FROM ${tn('session')} WHERE name LIKE ?`,
                [`${MARKER}_%`],
            );
        });

        oldSessionId = await seedSession(OLD_NAME, oldTs, ['consent_pd_at', 'auth_login']);
        freshSessionId = await seedSession(FRESH_NAME, freshTs, ['token']);

        // Snapshot every in-window session id that exists right now —
        // this includes the FRESH marker AND any real Playwright-worker
        // login session (all have lastUsage≈now). The cron must leave
        // every one of them in place.
        inWindowIdsBefore = await withConnection(async (conn) => {
            const [rows]: any[] = await conn.execute(
                `SELECT id FROM ${tn('session')} WHERE lastUsage >= ?`,
                [cutoff],
            );
            return rows.map((r) => Number(r.id));
        });
    });

    test.afterAll(async () => {
        // Clean up exactly the survivors of this spec (FRESH marker +
        // its child; the OLD marker was pruned by the cron under test).
        await withConnection(async (conn) => {
            await conn.execute(
                `DELETE FROM ${tn('session_data')} WHERE sessionId IN (
                    SELECT id FROM (SELECT id FROM ${tn('session')} WHERE name LIKE ?) AS z
                )`,
                [`${MARKER}_%`],
            );
            await conn.execute(
                `DELETE FROM ${tn('session')} WHERE name LIKE ?`,
                [`${MARKER}_%`],
            );
        });
    });

    test('deletes only the old session and its children; fresh session + children survive', async () => {
        const prefix = getDbPrefix();
        const res = runSessionRetentionCron(prefix);
        const out = res.stdout + res.stderr;

        // Cron CLI returns 0 and the task reports its work.
        expect(res.exitCode).toBe(0);
        expect(out).toContain('[session-retention]');
        expect(out).toContain('OK');
        expect(out).not.toMatch(/ERROR:/);

        const rows = await withConnection(async (conn) => {
            const [oldSess]: any[] = await conn.execute(
                `SELECT id FROM ${tn('session')} WHERE id = ?`,
                [oldSessionId],
            );
            const [freshSess]: any[] = await conn.execute(
                `SELECT id FROM ${tn('session')} WHERE id = ?`,
                [freshSessionId],
            );
            const [oldChildren]: any[] = await conn.execute(
                `SELECT param FROM ${tn('session_data')} WHERE sessionId = ? ORDER BY param`,
                [oldSessionId],
            );
            const [freshChildren]: any[] = await conn.execute(
                `SELECT param FROM ${tn('session_data')} WHERE sessionId = ? ORDER BY param`,
                [freshSessionId],
            );
            return {
                oldGone: oldSess.length === 0,
                freshKept: freshSess.length === 1,
                oldChildrenGone: oldChildren.length === 0,
                freshChildrenKept: freshChildren.map((r) => r.param),
            };
        });

        // The load-bearing assertions: OLD pruned (session + both
        // children), FRESH kept (session + its child) — proves the age
        // filter and the children-before-parents delete order, not a
        // blind wipe.
        expect(rows.oldGone).toBe(true);
        expect(rows.freshKept).toBe(true);
        expect(rows.oldChildrenGone).toBe(true);
        expect(rows.freshChildrenKept).toEqual(['token']);
    });

    test('every in-window session (incl. live worker logins) survived the tick', async () => {
        // Direct worker-safety proof: the cron deletes ONLY lastUsage <
        // cutoff rows, so every session that was in-window before must
        // still exist — including the Playwright worker's own live
        // login sessions (age profile identical to the FRESH marker).
        expect(inWindowIdsBefore.length).toBeGreaterThan(0);

        const survivors = await withConnection(async (conn) => {
            const placeholders = inWindowIdsBefore.map(() => '?').join(',');
            const [rows]: any[] = await conn.execute(
                `SELECT id FROM ${tn('session')} WHERE id IN (${placeholders})`,
                inWindowIdsBefore,
            );
            return new Set(rows.map((r) => Number(r.id)));
        });

        for (const id of inWindowIdsBefore) {
            expect(survivors.has(id), `in-window session id ${id} was deleted by the tick`).toBe(true);
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. Boundary-inclusive cutoff (clock-free, fixed $now)
// ─────────────────────────────────────────────────────────────────────────
test.describe('SessionRetentionService — boundary-inclusive cutoff (fixed clock)', () => {
    test.describe.configure({ mode: 'serial' });

    let pastSessionId = 0;
    let boundarySessionId = 0;
    let insideSessionId = 0;

    test.beforeAll(async () => {
        // Three rows straddling the cutoff by 1 second each:
        //   PAST     lastUsage = cutoff - 1  → DELETED (< cutoff)
        //   BOUNDARY lastUsage = cutoff      → KEPT   (== cutoff, strict <)
        //   INSIDE   lastUsage = cutoff + 1  → KEPT   (> cutoff)
        await withConnection(async (conn) => {
            await conn.execute(
                `DELETE FROM ${tn('session_data')} WHERE sessionId IN (
                    SELECT id FROM (SELECT id FROM ${tn('session')} WHERE name LIKE ?) AS z
                )`,
                [`${MARKER}_%`],
            );
            await conn.execute(
                `DELETE FROM ${tn('session')} WHERE name LIKE ?`,
                [`${MARKER}_%`],
            );
        });

        pastSessionId = await seedSession(PAST_NAME, FIXED_CUTOFF - 1, ['p']);
        boundarySessionId = await seedSession(BOUNDARY_NAME, FIXED_CUTOFF, ['p']);
        insideSessionId = await seedSession(INSIDE_NAME, FIXED_CUTOFF + 1, ['p']);
    });

    test.afterAll(async () => {
        // Clean up survivors (BOUNDARY + INSIDE and their children; PAST
        // was pruned by the service call under test).
        await withConnection(async (conn) => {
            await conn.execute(
                `DELETE FROM ${tn('session_data')} WHERE sessionId IN (
                    SELECT id FROM (SELECT id FROM ${tn('session')} WHERE name LIKE ?) AS z
                )`,
                [`${MARKER}_%`],
            );
            await conn.execute(
                `DELETE FROM ${tn('session')} WHERE name LIKE ?`,
                [`${MARKER}_%`],
            );
        });
    });

    test('keeps the exact-boundary row, deletes only strictly-older rows', async () => {
        const prefix = getDbPrefix();
        const result = runServiceWithFixedClock(prefix, FIXED_NOW);

        // PAST session + its 1 child deleted; BOUNDARY and INSIDE kept.
        expect(result.sessions_deleted).toBe(1);
        expect(result.session_data_deleted).toBe(1);

        const rows = await withConnection(async (conn) => {
            const [past]: any[] = await conn.execute(
                `SELECT id FROM ${tn('session')} WHERE id = ?`,
                [pastSessionId],
            );
            const [boundary]: any[] = await conn.execute(
                `SELECT id FROM ${tn('session')} WHERE id = ?`,
                [boundarySessionId],
            );
            const [inside]: any[] = await conn.execute(
                `SELECT id FROM ${tn('session')} WHERE id = ?`,
                [insideSessionId],
            );
            const [pastChild]: any[] = await conn.execute(
                `SELECT id FROM ${tn('session_data')} WHERE sessionId = ?`,
                [pastSessionId],
            );
            const [boundaryChild]: any[] = await conn.execute(
                `SELECT id FROM ${tn('session_data')} WHERE sessionId = ?`,
                [boundarySessionId],
            );
            return {
                pastGone: past.length === 0,
                boundaryKept: boundary.length === 1,
                insideKept: inside.length === 1,
                pastChildGone: pastChild.length === 0,
                boundaryChildKept: boundaryChild.length === 1,
            };
        });

        // The load-bearing boundary assertion: == cutoff is KEPT (the
        // service's WHERE is `lastUsage < cutoff`, strict), only the
        // strictly-older row is removed — "keep more, not less".
        expect(rows.pastGone).toBe(true);
        expect(rows.boundaryKept).toBe(true);
        expect(rows.insideKept).toBe(true);
        expect(rows.pastChildGone).toBe(true);
        expect(rows.boundaryChildKept).toBe(true);
    });
});
