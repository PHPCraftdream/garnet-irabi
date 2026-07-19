/**
 * log-rotation cron task (audit 12-production-readiness-devops.md H-3):
 *
 * Before this task, NOTHING pruned the WorkDir/LogJournal file journals
 * or the six operational log tables — they grew forever on a shared
 * host with bounded disk. The QA-only `php garnet clear-logs` is a full
 * wipe behind test-mode, not age-based retention, so it cannot serve as
 * the production rotation mechanism.
 *
 * This spec proves the new automated layer:
 *
 *   1. File half — exercised in isolation (temp dir, fixed "now", no
 *      real WorkDir/LogJournal touched, no clock dependency). Proves
 *      the 365-day boundary: an entry dated exactly 365 days before
 *      "now" is KEPT (boundary-inclusive), one dated 366 days is
 *      removed, non-dated entries are left untouched, and the whole
 *      dated DIRECTORY (the real layout — a YYYY-MM-DD dir holding
 *      .log files) is removed together.
 *
 *   2. DB half — `php run_cmd.php cron log-rotation` actually deletes
 *      log rows older than 365 days, while fresh rows survive. Runs
 *      against the worker-isolated tables via DB_PREFIX_OVERRIDE, the
 *      same mechanism as email-queue-cron-lock.spec.ts.
 *
 *   3. Dev-stand safety — the live cron tick also walks the REAL
 *      WorkDir/LogJournal (the path is app-global, not prefix-scoped).
 *      On a healthy stand nothing there is older than the window, so
 *      the file pass is a no-op. This spec snapshots the dev LogJournal
 *      tree before and after the cron run and asserts it is unchanged,
 *      so any accidental deletion is caught here rather than in prod.
 */

import { test, expect, tn, getDbPrefix } from '../../helpers/scoped-test';
import { spawnSync } from 'child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import mysql from 'mysql2/promise';
import { DB, withConnection } from '../../helpers/db';

const APP_DIR = path.resolve(__dirname, '../../..');
const LOG_JOURNAL_DIR = path.join(APP_DIR, 'WorkDir', 'LogJournal');

/**
 * Fixed "now" for the file-part unit test: 2026-07-19 12:00:00 UTC.
 * 365 days before this date (the service's cutoff) is 2025-07-19:
 *   2025-07-19 → 2026-07-19 spans exactly 365 days (no Feb 29 in the
 *   range). So entries dated < 2025-07-19 are deleted; >= 2025-07-19
 *   are kept, with 2025-07-19 itself the boundary-inclusive kept case.
 */
const FIXED_NOW = Math.floor(Date.UTC(2026, 6, 19, 12, 0, 0) / 1000); // month is 0-based

/**
 * Invoke LogRotationService::pruneFiles() on $dir with a fixed $now via
 * `php -r`. The service's file pass is pure PHP (no framework boot, no
 * DB) — only the composer autoloader is needed. Returns the per-category
 * deletion counts as a map.
 */
function pruneFilesViaPhp(dir: string, nowTs: number): Record<string, number> {
    const code = `
date_default_timezone_set('UTC');
require ${JSON.stringify(path.join(APP_DIR, 'autoload.php'))};
$counts = \\PHPCraftdream\\IRabi\\Common\\Services\\LogRotationService::pruneFiles($argv[1], (int)$argv[2]);
foreach ($counts as $cat => $n) { echo $cat . '=' . $n . PHP_EOL; }
`;
    const res = spawnSync('php', ['-r', code, '--', dir, String(nowTs)], {
        cwd: APP_DIR,
        encoding: 'utf8',
    });
    if (res.status !== 0) {
        throw new Error(`pruneFilesViaPhp failed (exit=${res.status}): ${res.stdout} ${res.stderr}`);
    }
    const out: Record<string, number> = {};
    for (const line of res.stdout.split(/\r?\n/)) {
        const m = line.match(/^(\w+)=(\d+)$/);
        if (m) out[m[1]] = Number(m[2]);
    }
    return out;
}

/**
 * Build the dated-dir layout the framework Logger creates: one dir per
 * day named YYYY-MM-DD, holding one or more .log files.
 */
function seedDatedDir(parent: string, dateStr: string): void {
    const dir = path.join(parent, dateStr);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'SYSTEM_LOGGER-test.log'), 'entry');
}

function listEntries(parent: string): string[] {
    return fs.existsSync(parent) ? fs.readdirSync(parent).sort() : [];
}

/**
 * Recursive hash of the dev LogJournal tree — used to assert the live
 * cron tick did not mutate the real stand while pruning the worker DB.
 */
function snapshotTree(root: string): string {
    if (!fs.existsSync(root)) return '<missing>';
    const lines: string[] = [];
    const walk = (dir: string, rel = '') => {
        for (const name of fs.readdirSync(dir).sort()) {
            const full = path.join(dir, name);
            const r = rel ? `${rel}/${name}` : name;
            const stat = fs.statSync(full);
            lines.push(r + (stat.isDirectory() ? '/' : ''));
            if (stat.isDirectory()) walk(full, r);
        }
    };
    walk(root);
    return lines.join('\n');
}

/**
 * Run the log-rotation cron task the same way the real crontab will,
 * against the worker-isolated tables. Returns captured stdio + exit.
 */
function runLogRotationCron(prefix: string): { stdout: string; stderr: string; exitCode: number | null } {
    const res = spawnSync('php', ['run_cmd.php', 'cron', 'log-rotation'], {
        cwd: APP_DIR,
        env: { ...process.env, DB_PREFIX_OVERRIDE: prefix },
        encoding: 'utf8',
        timeout: 60000,
    });
    return { stdout: res.stdout ?? '', stderr: res.stderr ?? '', exitCode: res.status };
}

const DAY = 86400;
// Unique markers per process+run so concurrent workers / re-runs never
// collide, and so the suite can clean up exactly its own rows.
const OLD_MARKER = `logrot_old_${process.pid}_${Date.now().toString(36)}`;
const FRESH_MARKER = `logrot_fresh_${process.pid}_${Date.now().toString(36)}`;

// ─────────────────────────────────────────────────────────────────────────
// 1. File half — isolated unit test
// ─────────────────────────────────────────────────────────────────────────
test.describe('LogRotationService — file pruning (isolated, fixed clock)', () => {
    let tmpRoot = '';

    test.beforeEach(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'irabi-logrot-'));
    });

    test.afterEach(() => {
        if (tmpRoot && fs.existsSync(tmpRoot)) {
            fs.rmSync(tmpRoot, { recursive: true, force: true });
        }
    });

    test('removes dated dirs older than 365 days; keeps the boundary day and newer', () => {
        // Seeds span the 2025-07-19 cutoff (365 days before FIXED_NOW):
        //   2024-12-01 — way old       → DELETED
        //   2025-07-18 — 366 days old  → DELETED (just past boundary)
        //   2025-07-19 — 365 days old  → KEPT   (boundary-inclusive)
        //   2025-07-20 — 364 days old  → KEPT
        //   2026-07-18 — 1 day old     → KEPT
        //   2026-07-19 — today         → KEPT
        //   README.txt  — non-dated    → KEPT (untouched)
        const systemDir = path.join(tmpRoot, 'System');
        for (const d of ['2024-12-01', '2025-07-18', '2025-07-19', '2025-07-20', '2026-07-18', '2026-07-19']) {
            seedDatedDir(systemDir, d);
        }
        fs.writeFileSync(path.join(systemDir, 'README.txt'), 'manual');

        // Errors: one old, one fresh — proves multi-category counting.
        seedDatedDir(path.join(tmpRoot, 'Errors'), '2024-06-01');
        seedDatedDir(path.join(tmpRoot, 'Errors'), '2026-01-01');
        // Routes: only fresh — proves a category with nothing to prune.
        seedDatedDir(path.join(tmpRoot, 'Routes'), '2026-07-19');

        const counts = pruneFilesViaPhp(tmpRoot, FIXED_NOW);

        // Per-category deletion counts.
        expect(counts.System).toBe(2);
        expect(counts.Errors).toBe(1);
        expect(counts.Routes).toBe(0);

        // Survivors in System: boundary day + newer + today + non-dated.
        expect(listEntries(systemDir)).toEqual([
            '2025-07-19',
            '2025-07-20',
            '2026-07-18',
            '2026-07-19',
            'README.txt',
        ]);
        // The boundary-kept dir still holds its .log content — the whole
        // dated dir is preserved, not just emptied.
        expect(fs.existsSync(path.join(systemDir, '2025-07-19', 'SYSTEM_LOGGER-test.log'))).toBe(true);

        // Errors survivors: only the fresh one.
        expect(listEntries(path.join(tmpRoot, 'Errors'))).toEqual(['2026-01-01']);
        expect(listEntries(path.join(tmpRoot, 'Routes'))).toEqual(['2026-07-19']);
    });

    test('impossible dates (Feb 30) are skipped, not deleted', () => {
        // The service must not act on a directory whose name parses as a
        // date but is not a real calendar date. It is left in place
        // rather than risk removing something we cannot reason about.
        seedDatedDir(path.join(tmpRoot, 'System'), '2025-02-30');
        const counts = pruneFilesViaPhp(tmpRoot, FIXED_NOW);
        expect(counts.System).toBe(0);
        expect(listEntries(path.join(tmpRoot, 'System'))).toEqual(['2025-02-30']);
    });

    test('missing LogJournal dir is a no-op returning all-zero counts', () => {
        const counts = pruneFilesViaPhp(path.join(tmpRoot, 'does-not-exist'), FIXED_NOW);
        expect(counts).toEqual({ Errors: 0, System: 0, Routes: 0 });
    });

    test('a custom shorter window deletes correspondingly newer entries', () => {
        // With a 10-day window, a 30-day-old dir is stale. Proves the
        // retentionDays parameter actually drives the cutoff (not a
        // hard-coded 365 inside the service).
        seedDatedDir(path.join(tmpRoot, 'System'), '2026-06-19'); // 30 days before FIXED_NOW
        // pruneFiles with retentionDays=10 via a direct PHP call.
        const code = `
date_default_timezone_set('UTC');
require ${JSON.stringify(path.join(APP_DIR, 'autoload.php'))};
$c = \\PHPCraftdream\\IRabi\\Common\\Services\\LogRotationService::pruneFiles($argv[1], (int)$argv[2], (int)$argv[3]);
echo $c['System'];
`;
        const res = spawnSync('php', ['-r', code, '--', tmpRoot, String(FIXED_NOW), '10'], {
            cwd: APP_DIR,
            encoding: 'utf8',
        });
        expect(res.status).toBe(0);
        expect(Number(res.stdout)).toBe(1);
        expect(listEntries(path.join(tmpRoot, 'System'))).toEqual([]);
    });
});

// ─────────────────────────────────────────────────────────────────────────
// 2 + 3. DB half — live cron run + dev-stand safety
// ─────────────────────────────────────────────────────────────────────────
test.describe('cron log-rotation — live DB prune + dev LogJournal untouched', () => {
    test.describe.configure({ mode: 'serial' });

    let oldCronLogId = 0;
    let freshCronLogId = 0;
    let oldMailLogId = 0;
    let freshMailLogId = 0;
    let devSnapshotBefore = '';

    test.beforeAll(async () => {
        devSnapshotBefore = snapshotTree(LOG_JOURNAL_DIR);

        // Seed four rows across two log tables:
        //   cron_log: one OLD (>365d), one FRESH (now).
        //   mail_log: one OLD (>365d), one FRESH (now).
        // 400 days is unambiguously past the 365-day window; "now" is
        // unambiguously inside it — neither side is near the boundary,
        // so the assertions are timing-robust.
        const oldTs = Math.floor(Date.now() / 1000) - 400 * DAY;
        const freshTs = Math.floor(Date.now() / 1000);

        await withConnection(async (conn) => {
            // Clean any leftover from a previous run of this spec.
            await conn.execute(
                `DELETE FROM ${tn('cron_log')} WHERE task_name IN (?, ?)`,
                [OLD_MARKER, FRESH_MARKER],
            );
            await conn.execute(
                `DELETE FROM ${tn('mail_log')} WHERE recipient_email IN (?, ?)`,
                [OLD_MARKER, FRESH_MARKER],
            );

            const [r1]: any = await conn.execute(
                `INSERT INTO ${tn('cron_log')}
                 (task_name, started_at, finished_at, duration_ms, status, created_at)
                 VALUES (?, ?, ?, 0, 'success', ?)`,
                [OLD_MARKER, oldTs, oldTs, oldTs],
            );
            oldCronLogId = Number(r1.insertId);

            const [r2]: any = await conn.execute(
                `INSERT INTO ${tn('cron_log')}
                 (task_name, started_at, finished_at, duration_ms, status, created_at)
                 VALUES (?, ?, ?, 0, 'success', ?)`,
                [FRESH_MARKER, freshTs, freshTs, freshTs],
            );
            freshCronLogId = Number(r2.insertId);

            const [r3]: any = await conn.execute(
                `INSERT INTO ${tn('mail_log')}
                 (recipient_email, mail_type, subject, status, created_at)
                 VALUES (?, 'logrot-test', 'old seed', 'sent', ?)`,
                [OLD_MARKER, oldTs],
            );
            oldMailLogId = Number(r3.insertId);

            const [r4]: any = await conn.execute(
                `INSERT INTO ${tn('mail_log')}
                 (recipient_email, mail_type, subject, status, created_at)
                 VALUES (?, 'logrot-test', 'fresh seed', 'sent', ?)`,
                [FRESH_MARKER, freshTs],
            );
            freshMailLogId = Number(r4.insertId);
        });
    });

    test.afterAll(async () => {
        // Clean up exactly the rows this spec seeded (the FRESH ones
        // survive the cron run and must be removed; the OLD ones were
        // already deleted by the rotation under test).
        await withConnection(async (conn) => {
            await conn.execute(
                `DELETE FROM ${tn('cron_log')} WHERE task_name IN (?, ?)`,
                [OLD_MARKER, FRESH_MARKER],
            );
            await conn.execute(
                `DELETE FROM ${tn('mail_log')} WHERE recipient_email IN (?, ?)`,
                [OLD_MARKER, FRESH_MARKER],
            );
        });
    });

    test('deletes only rows older than 365 days, keeps fresh rows', async () => {
        const prefix = getDbPrefix();
        const res = runLogRotationCron(prefix);
        const out = res.stdout + res.stderr;

        // Cron CLI returns 0 and the task reports the categories it walked.
        expect(res.exitCode).toBe(0);
        expect(out).toContain('[log-rotation]');
        expect(out).toContain('OK');
        expect(out).not.toMatch(/ERROR:/);
        // mail_log_recipients is skipped with an explicit reason every tick.
        expect(out).toContain('mail_log_recipients — skipped (no timestamp column)');

        const rows = await withConnection(async (conn) => {
            const [cronOld] = await conn.execute<any[]>(
                `SELECT id FROM ${tn('cron_log')} WHERE id = ?`,
                [oldCronLogId],
            );
            const [cronFresh] = await conn.execute<any[]>(
                `SELECT id FROM ${tn('cron_log')} WHERE id = ?`,
                [freshCronLogId],
            );
            const [mailOld] = await conn.execute<any[]>(
                `SELECT id FROM ${tn('mail_log')} WHERE id = ?`,
                [oldMailLogId],
            );
            const [mailFresh] = await conn.execute<any[]>(
                `SELECT id FROM ${tn('mail_log')} WHERE id = ?`,
                [freshMailLogId],
            );
            return {
                cronOldGone: cronOld.length === 0,
                cronFreshKept: cronFresh.length === 1,
                mailOldGone: mailOld.length === 0,
                mailFreshKept: mailFresh.length === 1,
            };
        });

        // The load-bearing assertions: OLD pruned, FRESH kept, in BOTH
        // tables — proves the age filter, not a blind wipe.
        expect(rows.cronOldGone).toBe(true);
        expect(rows.cronFreshKept).toBe(true);
        expect(rows.mailOldGone).toBe(true);
        expect(rows.mailFreshKept).toBe(true);
    });

    test('the real WorkDir/LogJournal tree is unchanged by the live tick', () => {
        // The cron tick walks the dev LogJournal too (the path is
        // app-global). On a healthy stand nothing there is older than
        // the window, so the file pass is a no-op — this asserts that,
        // catching any accidental deletion before it reaches prod.
        const devSnapshotAfter = snapshotTree(LOG_JOURNAL_DIR);
        expect(devSnapshotAfter).toBe(devSnapshotBefore);
    });
});
