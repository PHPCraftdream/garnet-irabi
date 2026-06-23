/**
 * `php garnet cron` end-to-end CLI test.
 *
 * The cron entry point goes through `consoleInit()` (not `runWebApp()`),
 * so any service registered via `setTableClasses(...)` inside `runWebApp`
 * is invisible to it. Regression: in IRabi we used to wire FwEmailQueueService
 * and FwInviteTokenService only from the web path — `php garnet cron`
 * threw `LogicException: setTableClasses() must be called before use`
 * for two of three tasks, silently every minute on prod.
 *
 * This spec exercises the CLI directly (no browser) and asserts:
 *   1. `php garnet cron` exits 0
 *   2. Output lists all three tasks and reports `Done: 3/3 tasks completed`
 *   3. No service throws `setTableClasses() must be called before use`
 *   4. `cron:task disable-stale-tokens` actually disables a stale token (DB check)
 */

import { test, expect } from '../../helpers/scoped-test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as path from 'node:path';
import mysql from 'mysql2/promise';
import { DB, liveDbPrefix } from '../../helpers/db';

// `php garnet cron` runs from consoleInit — no HTTP, no X-Test-Worker header,
// so the WorkerScopeMiddleware never swaps the table prefix. The CLI always
// touches the LIVE `db_ir_*` tables. Mirror that here: insert / query directly
// against the live prefix instead of the worker-scoped `tn()` table name.
const LIVE_PREFIX = liveDbPrefix();
const tnLive = (table: string): string => `${LIVE_PREFIX}_${table}`;

const execFileAsync = promisify(execFile);

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

async function runGarnet(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    try {
        const result = await execFileAsync('php', ['garnet', ...args], {
            cwd: REPO_ROOT,
            timeout: 60000,
            shell: false,
        });
        return { stdout: result.stdout, stderr: result.stderr, exitCode: 0 };
    } catch (err: any) {
        return {
            stdout: err.stdout ?? '',
            stderr: err.stderr ?? '',
            exitCode: err.code ?? 1,
        };
    }
}

test.describe('php garnet cron — CLI boot wires service tables', () => {
    test('runs all 3 tasks without setTableClasses errors', async () => {
        const result = await runGarnet(['cron']);

        expect(result.stdout).not.toContain('setTableClasses() must be called');
        expect(result.stderr).not.toContain('setTableClasses() must be called');

        // Tasks print their name + task-specific output + "OK" on a following
        // line — assert each name appears and the overall summary reports 3/3.
        expect(result.stdout).toContain('[email-queue]');
        expect(result.stdout).toContain('[complete-expired]');
        expect(result.stdout).toContain('[disable-stale-tokens]');
        expect(result.stdout).toMatch(/Done:\s*3\/3 tasks completed/);
        expect(result.stdout).not.toMatch(/ERROR:/);
        expect(result.exitCode).toBe(0);
    });

    test('cron:task disable-stale-tokens actually disables expired tokens', async () => {
        // `php garnet cron` runs against the LOCAL machine's DB, but under
        // PW_PROD the mysql bridge routes this spec's seed/verify queries to the
        // REMOTE box — so the locally-run cron never sees the row we seed
        // remotely. The CLI-touches-its-own-DB contract is a local concern;
        // skip the DB round-trip assertion on a remote run (the boot test above
        // still runs). Covered by the local suite.
        test.skip(process.env.PW_PROD === '1', 'local-only: CLI hits local DB, bridge hits remote DB');
        const label = `Test cron stale ${Date.now()}`;

        // Seed: an expired token (expires_at in the past, is_disabled=0)
        const conn = await mysql.createConnection(DB);
        let tokenId: number;
        try {
            await conn.execute(`DELETE FROM ${tnLive('invite_tokens')} WHERE label LIKE 'Test cron stale%'`);
            const [res] = await conn.execute<any>(
                `INSERT INTO ${tnLive('invite_tokens')}
                 (token, label, expires_at, max_uses, uses_left, is_disabled, created_at, created_by, account_type)
                 VALUES (?, ?, ?, 1, 1, 0, UNIX_TIMESTAMP(), NULL, 'user')`,
                [`cronstale_${Date.now().toString(36)}`, label, Math.floor(Date.now() / 1000) - 3600],
            );
            tokenId = res.insertId;
        } finally {
            await conn.end();
        }

        // Sanity-check: token was created, not yet disabled
        let row = await readTokenRow(tokenId);
        expect(row.is_disabled).toBe(0);

        // Run only the relevant task
        const result = await runGarnet(['cron', 'disable-stale-tokens']);
        expect(result.exitCode).toBe(0);
        expect(result.stdout).not.toContain('setTableClasses() must be called');
        expect(result.stdout).toMatch(/Disabled tokens:\s*\d+\s*expired/);

        // The expired token should now be marked is_disabled=1
        row = await readTokenRow(tokenId);
        expect(row.is_disabled).toBe(1);

        // Cleanup
        const conn2 = await mysql.createConnection(DB);
        try {
            await conn2.execute(`DELETE FROM ${tnLive('invite_tokens')} WHERE id = ?`, [tokenId]);
        } finally {
            await conn2.end();
        }
    });
});

async function readTokenRow(id: number): Promise<{ id: number; is_disabled: number }> {
    const conn = await mysql.createConnection(DB);
    try {
        const [rows] = await conn.execute<any[]>(
            `SELECT id, is_disabled FROM ${tnLive('invite_tokens')} WHERE id = ?`, [id],
        );
        return rows[0];
    } finally {
        await conn.end();
    }
}
