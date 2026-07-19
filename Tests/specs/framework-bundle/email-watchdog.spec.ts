/**
 * Email-queue stuck-`sending` watchdog (audit 09-email-notifications H-2).
 *
 * FwEmailQueueService::processQueue() flips a row to `sending`, then
 * calls SMTP synchronously, then flips it to `sent`/`error`. If the PHP
 * process dies between the `sending` flip and the final status (OOM,
 * kill, fatal, reboot, dropped DB link), the row is stuck in `sending`
 * forever: processQueue only ever selects ('queued','error'), retry()
 * is called by nobody, and the crash happens before logAttempt() — so
 * the loss is invisible in the audit tables too.
 *
 * The framework table has NO column recording when a row entered
 * `sending` (only created_at = enqueue time), and processQueue() lives
 * in vendor and writes no such timestamp — so a literal time-based
 * watchdog ("sending older than N minutes") is impossible without
 * patching the framework.
 *
 * EmailWatchdogService instead relies on the email-queue cron tick's
 * NamedLock serialisation (task #57): the freshly-acquired lock proves
 * no concurrent processQueue() is running, so any row still in
 * `sending` is an orphan from a crashed past tick. It flips each to
 * `error`, increments attempts, and sets the same backoff as the real
 * SMTP-failure branch — so a recovered row re-enters the normal retry
 * cycle, or goes terminal once attempts are exhausted.
 *
 * This spec seeds `sending` rows directly via SQL — exactly the state a
 * real crash leaves — and proves the watchdog recovers them on the next
 * `php run_cmd.php cron email-queue` tick, without touching ordinary
 * queued/error rows and without breaking the normal send path.
 */

import { test, expect, tn, getDbPrefix } from '../../helpers/scoped-test';
import { spawnSync } from 'child_process';
import * as path from 'path';
import mysql from 'mysql2/promise';
import { DB } from '../../helpers/db';

test.describe.configure({ mode: 'serial' });

// __dirname = <app>/Tests/specs/framework-bundle → three levels up = <app>.
// Same depth as cron-cli.spec.ts::REPO_ROOT; run_cmd.php lives at the app root.
const APP_DIR = path.resolve(__dirname, '../../..');

// Unique recipient per process+run so concurrent workers / re-runs never
// collide on the same seeded row. The `.test` suffix keeps processQueue in
// its dev short-circuit path (no real SMTP) — see FwEmailQueueService.
const SUFFIX = `${process.pid}_${Date.now().toString(36)}`;
const recip = (label: string) => `${label}_${SUFFIX}@dev.test`;

function runEmailQueueCron(prefix: string): { stdout: string; stderr: string; status: number | null } {
    const res = spawnSync('php', ['run_cmd.php', 'cron', 'email-queue'], {
        cwd: APP_DIR,
        env: { ...process.env, DB_PREFIX_OVERRIDE: prefix },
        encoding: 'utf8',
    });
    return { stdout: res.stdout ?? '', stderr: res.stderr ?? '', status: res.status };
}

type QueueRow = {
    status: string;
    attempts: number;
    max_attempts: number;
    next_attempt_at: number | null;
};

async function readQueueRow(id: number): Promise<QueueRow> {
    const conn = await mysql.createConnection(DB);
    try {
        const [rows] = await conn.execute<any[]>(
            `SELECT status, attempts, max_attempts, next_attempt_at
             FROM ${tn('email_queue')} WHERE id = ?`,
            [id],
        );
        return rows[0] ?? { status: '(missing)', attempts: -1, max_attempts: -1, next_attempt_at: null };
    } finally {
        await conn.end();
    }
}

/**
 * Seed an email_queue row in an arbitrary state. Emulates a crashed
 * process for status='sending' (the exact residue a real crash leaves).
 */
async function seedRow(opts: {
    recipient: string;
    status: string;
    attempts: number;
    maxAttempts: number;
    nextAttemptAt: number | null;
}): Promise<number> {
    const conn = await mysql.createConnection(DB);
    try {
        await conn.execute(`DELETE FROM ${tn('email_queue')} WHERE recipient_email = ?`, [opts.recipient]);
        const [res]: any = await conn.execute(
            `INSERT INTO ${tn('email_queue')}
             (account_id, recipient_email, subject, body_html, status, attempts, max_attempts,
              next_attempt_at, sent_at, created_at)
             VALUES (NULL, ?, 'watchdog test', '<p>body</p>', ?, ?, ?, ?, NULL, UNIX_TIMESTAMP())`,
            [opts.recipient, opts.status, opts.attempts, opts.maxAttempts, opts.nextAttemptAt],
        );
        return Number(res.insertId);
    } finally {
        await conn.end();
    }
}

async function deleteRowAndAttempts(id: number): Promise<void> {
    const conn = await mysql.createConnection(DB);
    try {
        await conn.execute(`DELETE FROM ${tn('email_attempts')} WHERE queue_id = ?`, [id]);
        await conn.execute(`DELETE FROM ${tn('email_queue')} WHERE id = ?`, [id]);
    } finally {
        await conn.end();
    }
}

// Holds seeded ids across the serial tests for cleanup.
const seeded: number[] = [];

test.describe('email-watchdog: recovers stuck `sending` rows on the next cron tick', () => {
    test('recoverable sending row (attempts=0/max=3) → error, attempts=1, future retry', async () => {
        const id = await seedRow({
            recipient: recip('recover0'),
            status: 'sending',
            attempts: 0,
            maxAttempts: 3,
            nextAttemptAt: null,
        });
        seeded.push(id);
        expect(id).toBeGreaterThan(0);

        const beforeRun = Math.floor(Date.now() / 1000);
        const res = runEmailQueueCron(getDbPrefix());
        // eslint-disable-next-line no-console
        console.log('[watchdog recover0 cron output]', (res.stdout + res.stderr).trim());

        const row = await readQueueRow(id);
        // Watchdog flipped sending → error and counted the crashed attempt.
        expect(row.status).toBe('error');
        expect(row.attempts).toBe(1);
        // 1 < 3 → not terminal, so a future retry is scheduled (not NULL).
        expect(row.next_attempt_at).not.toBeNull();
        expect(row.next_attempt_at!).toBeGreaterThan(beforeRun);
    });

    test('last-attempt sending row (attempts=2/max=3) → error, attempts=3, terminal (NULL)', async () => {
        const id = await seedRow({
            recipient: recip('recover2'),
            status: 'sending',
            attempts: 2,
            maxAttempts: 3,
            nextAttemptAt: null,
        });
        seeded.push(id);
        expect(id).toBeGreaterThan(0);

        runEmailQueueCron(getDbPrefix());

        const row = await readQueueRow(id);
        // 2 → 3 exhausts the budget → terminal error, no further retry.
        expect(row.status).toBe('error');
        expect(row.attempts).toBe(3);
        expect(row.next_attempt_at).toBeNull();
    });

    test('watchdog touches only `sending`: a queued row with future retry is left untouched', async () => {
        // A `queued` row whose next_attempt_at is far in the future is
        // skipped by processQueue (filter: next_attempt_at <= now) AND
        // must be skipped by the watchdog (which only reads `sending`).
        const queuedId = await seedRow({
            recipient: recip('untouched-queued'),
            status: 'queued',
            attempts: 0,
            maxAttempts: 3,
            nextAttemptAt: Math.floor(Date.now() / 1000) + 3600,
        });
        seeded.push(queuedId);

        // A real `sending` orphan in the SAME tick proves the watchdog
        // ran and did its job — so the queued row being untouched is a
        // genuine selectivity result, not "watchdog did nothing".
        const sendingId = await seedRow({
            recipient: recip('untouched-sending'),
            status: 'sending',
            attempts: 0,
            maxAttempts: 3,
            nextAttemptAt: null,
        });
        seeded.push(sendingId);

        const res = runEmailQueueCron(getDbPrefix());
        expect((res.stdout + res.stderr)).toContain('email-watchdog: recovered');

        const sendingRow = await readQueueRow(sendingId);
        expect(sendingRow.status).toBe('error');
        expect(sendingRow.attempts).toBe(1);

        // The queued row is byte-for-byte unchanged — the watchdog never
        // read it and processQueue correctly deferred it to the future.
        const queuedRow = await readQueueRow(queuedId);
        expect(queuedRow.status).toBe('queued');
        expect(queuedRow.attempts).toBe(0);

        // And the watchdog left no email_attempts diagnostic row for the
        // queued id (it only logs for `sending` rows it recovered).
        const conn = await mysql.createConnection(DB);
        try {
            const [rows] = await conn.execute<any[]>(
                `SELECT COUNT(*) AS cnt FROM ${tn('email_attempts')} WHERE queue_id = ?`,
                [queuedId],
            );
            expect(Number(rows[0]?.cnt ?? 0)).toBe(0);
        } finally {
            await conn.end();
        }
    });

    test('main send path still works in the same tick: a fresh queued email is delivered', async () => {
        // The watchdog runs before processQueue every tick; this proves it
        // did not break the normal send path. A `.test` recipient with no
        // backoff is immediately eligible and dev-short-circuited to `sent`.
        const id = await seedRow({
            recipient: recip('normal-send'),
            status: 'queued',
            attempts: 0,
            maxAttempts: 3,
            nextAttemptAt: null,
        });
        seeded.push(id);
        expect(id).toBeGreaterThan(0);

        runEmailQueueCron(getDbPrefix());

        const row = await readQueueRow(id);
        expect(row.status).toBe('sent');
        expect(row.attempts).toBe(1);
    });

    test('cleanup: remove seeded rows and their attempts', async () => {
        for (const id of seeded) {
            await deleteRowAndAttempts(id);
        }
    });
});
