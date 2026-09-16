/**
 * Email-queue cron overlap race (audit 04-concurrency H-1 / 09-email H-1):
 * FwEmailQueueService::processQueue() runs a plain SELECT-then-UPDATE loop
 * with no per-row claim on each email. Two overlapping cron ticks of the
 * `email-queue` task can both SELECT the same queued row before either marks
 * it `sending`, and both end up delivering the same email — a duplicate send.
 *
 * The framework cannot be patched from the app (vendor), so the fix
 * serialises the whole processQueue() call behind a MySQL named advisory
 * lock (NamedLock, acquired non-blocking in the email-queue task callback):
 * if a previous tick still holds the lock, the current tick logs
 * "previous run still active, skipping" and returns 0, leaving the queue
 * untouched for the next tick to retry.
 *
 * Determinism caveat (honest assessment): reproducing the ORIGINAL race —
 * two genuinely-overlapping CLI invocations that both read the same SELECT
 * before either writes `sending` — is timing-dependent and unreliable in CI,
 * exactly as noted for the CAS-debit race in
 * cross-role/balance-debit-recalculate-race.spec.ts. Instead this spec
 * deterministically proves the GUARD that closes the race: while an external
 * connection holds the named lock, a real `php run_cmd.php cron email-queue`
 * tick cannot acquire it, skips, and leaves the queued email untouched; the
 * moment the lock is released, the next tick acquires it and processes the
 * email exactly once. That is a 100%-deterministic, cross-connection lock
 * exclusivity proof at the point the original race would have occurred.
 */

import { test, expect, tn, getDbPrefix } from '../../helpers/scoped-test';
import { runServerCommand } from '../../helpers/server-command';
import { isProd, remoteRuntimeDir } from '../../helpers/ssh-bridge';
import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import mysql from 'mysql2/promise';
import { DB } from '../../helpers/db';

const APP_ROOT = path.resolve(__dirname, '../../..');

test.describe.configure({ mode: 'serial' });

const LOCK_NAME = 'irabi_email_queue';
// Unique recipient per process+run so concurrent workers / re-runs never
// collide on the same seeded row. The `.test` suffix keeps processQueue in
// its dev short-circuit path (no real SMTP) — see FwEmailQueueService.
const RECIPIENT = `locktest_${process.pid}_${Date.now().toString(36)}@dev.test`;

let queueId = 0;

/**
 * Run the email-queue cron task against the worker-isolated tables.
 *
 * `php run_cmd.php cron <task>` honours DB_PREFIX_OVERRIDE (see run_cmd.php)
 * to target the test_worker_N schema, same mechanism as
 * isolation-setup.ts::runCli() and booking-time-guards Fix 7.
 */
function runEmailQueueCron(prefix: string): { stdout: string; stderr: string; status: number | null } {
    const res = runServerCommand(['cron', 'email-queue'], prefix);
    return { stdout: res.stdout, stderr: res.stderr, status: res.exitCode };
}

async function readQueueRow(id: number): Promise<{ status: string; attempts: number; sent_at: number | null }> {
    const conn = await mysql.createConnection(DB);
    try {
        const [rows] = await conn.execute<any[]>(
            `SELECT status, attempts, sent_at FROM ${tn('email_queue')} WHERE id = ?`,
            [id],
        );
        return rows[0] ?? { status: '(missing)', attempts: -1, sent_at: null };
    } finally {
        await conn.end();
    }
}

test.describe('email-queue cron: named-lock serialises overlapping ticks', () => {
    // test:hold-lock (remote holder path below) is test-mode gated.
    let markerWasOurs = false;

    test.beforeAll(() => {
        if (!isProd()) return;
        const wasOn = runServerCommand(['test-mode', 'status']).stdout.includes('ON');
        if (!wasOn) {
            runServerCommand(['test-mode', 'on']);
            markerWasOurs = true;
        }
    });

    test.afterAll(() => {
        if (markerWasOurs) {
            runServerCommand(['test-mode', 'off']);
        }
    });

    test('seed a queued .test email', async () => {
        const conn = await mysql.createConnection(DB);
        try {
            await conn.execute(`DELETE FROM ${tn('email_queue')} WHERE recipient_email = ?`, [RECIPIENT]);
            const [res]: any = await conn.execute(
                `INSERT INTO ${tn('email_queue')}
                 (account_id, recipient_email, subject, body_html, status, attempts, max_attempts,
                  next_attempt_at, sent_at, created_at)
                 VALUES (NULL, ?, 'lock-race test', '<p>body</p>', 'queued', 0, 3, NULL, NULL, UNIX_TIMESTAMP())`,
                [RECIPIENT],
            );
            queueId = Number(res.insertId);
        } finally {
            await conn.end();
        }
        expect(queueId).toBeGreaterThan(0);
    });

    test('while another connection holds the lock, cron skips and leaves the email queued', async () => {
        // GET_LOCK() is session-scoped: it only holds for the lifetime of
        // the ONE connection that acquired it.
        //
        // Locally that's a plain mysql2 connection kept open across the
        // `await` below — straightforward.
        //
        // Under PW_PROD, ssh-bridge.ts issues each remote SQL call as its
        // own fresh process/connection (documented limitation — no
        // transactions across calls, same root cause). A lock "held" via
        // one ssh round-trip is already released by the time a LATER ssh
        // round-trip runs the cron. So the holder and the cron under test
        // must be two processes within the SAME remote shell invocation —
        // one backgrounded via `php garnet test:hold-lock` (see
        // CMDTestHoldLock.php), one foregrounded — so both genuinely hold
        // open, concurrent connections on the same box.
        let out: string;

        if (isProd()) {
            // Mirrors runServerCommand's remote quoting (helpers/server-command.ts)
            // for the cron leg — DB_PREFIX_OVERRIDE only takes effect with a
            // matching GARNET_TEST_TOKEN (TestScope), same rule as everywhere else.
            const token = process.env.RUN_TEST_TOKEN ?? '';
            if (!token) {
                throw new Error('[email-queue-cron-lock] PW_PROD=1 but RUN_TEST_TOKEN is unset.');
            }
            const q = (s: string): string => `'${s.replace(/'/g, "'\\''")}'`;
            const prefix = getDbPrefix();
            const remoteCmd = `php garnet test:hold-lock ${q(LOCK_NAME)} 6 & sleep 1; `
                + `DB_PREFIX_OVERRIDE=${q(prefix)} GARNET_TEST_TOKEN=${q(token)} php garnet cron email-queue; wait`;
            out = execFileSync(
                'php',
                ['garnet', 'ssh', remoteCmd, `--cwd=${remoteRuntimeDir()}`, '--no-tty'],
                { cwd: APP_ROOT, encoding: 'utf8', timeout: 30000 },
            );
        } else {
            const holder = await mysql.createConnection(DB);
            try {
                const [acq] = await holder.execute<any[]>(`SELECT GET_LOCK(?, 5) AS got`, [LOCK_NAME]);
                expect(Number(acq[0]?.got)).toBe(1);

                const res = runEmailQueueCron(getDbPrefix());
                out = res.stdout + res.stderr;
            } finally {
                // Closing the connection would free the lock too, but release
                // explicitly so the next test can acquire deterministically.
                await holder.execute(`SELECT RELEASE_LOCK(?)`, [LOCK_NAME]).catch(() => {});
                await holder.end();
            }
        }

        // eslint-disable-next-line no-console
        console.log('[email-queue cron skip-path output]', out.trim());

        // The task callback printed the skip line — CapturingStdio
        // forwards to real stdout — proving tryAcquire() returned false
        // while another connection held the lock.
        expect(out).toContain('previous run still active, skipping');

        // The queued email must be untouched: processQueue never ran.
        const row = await readQueueRow(queueId);
        expect(row.status).toBe('queued');
        expect(row.attempts).toBe(0);
        expect(row.sent_at).toBeNull();
    });

    test('once the lock is free, cron acquires it and processes the email exactly once', async () => {
        const res = runEmailQueueCron(getDbPrefix());
        const out = res.stdout + res.stderr;
        // eslint-disable-next-line no-console
        console.log('[email-queue cron normal-path output]', out.trim());
        // No skip this time — the task ran processQueue and the dev
        // `.test` short-circuit marked the row `sent`.
        expect(out).not.toContain('previous run still active, skipping');

        const row = await readQueueRow(queueId);
        expect(row.status).toBe('sent');
        expect(row.attempts).toBe(1);
        expect(row.sent_at).not.toBeNull();
    });

    test('a second idle tick does not reprocess the already-sent email', async () => {
        // processQueue filters `status IN ('queued','error')`, so a `sent`
        // row is never re-selected; attempts must stay at 1 (no double send).
        runEmailQueueCron(getDbPrefix());
        const row = await readQueueRow(queueId);
        expect(row.status).toBe('sent');
        expect(row.attempts).toBe(1);
    });

    // afterAll (not a plain test) — serial mode skips every subsequent
    // test once one fails, so a cleanup step written as a regular test
    // never runs after a mid-flow assertion fails, leaving a stray
    // email_queue row behind. Hooks run regardless of test outcome.
    test.afterAll(async () => {
        const conn = await mysql.createConnection(DB);
        try {
            await conn.execute(`DELETE FROM ${tn('email_queue')} WHERE recipient_email = ?`, [RECIPIENT]);
        } finally {
            await conn.end();
        }
    });
});
