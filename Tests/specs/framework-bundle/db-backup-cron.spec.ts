/**
 * db-backup cron task (audit 12-production-readiness-devops.md C-1):
 *
 * Before this task, the only DB-backup mechanism was `php garnet db:backup`
 * (manual, or auto-fired by `deploy` / `restore` / `wipe`). Nothing ran on
 * a schedule, no rotation existed, and every dump stayed on the same disk
 * as the DB it backed up. This spec proves the new automated layer:
 *
 *   1. Retention is exercised in isolation (temp dir, deterministic fixed
 *      filenames — no real WorkDir/Backups/ touched, no clock dependency).
 *      Proves the 7-daily + 4-weekly policy keeps exactly the files it
 *      should and deletes the rest.
 *
 *   2. `php run_cmd.php cron db-backup` actually creates a fresh .sql.gz
 *      in WorkDir/Backups/ — proving the live call chain
 *      AppCronService → DbBackupCronTask → GarnetDbBackupCommand::autoBackup
 *      works end-to-end. The created file is removed at the end of the
 *      suite so the dev stand isn't polluted.
 *
 *   3. With no WebDAV creds configured (the default dev-stand state), the
 *      cron tick prints the explicit "off-site upload not configured"
 *      warning and still exits 0 — the local backup remains the
 *      load-bearing step, off-site is opportunistic. Same cron invocation
 *      as (2), so the assertions share the same captured output.
 */

import { test, expect } from '../../helpers/scoped-test';
import { spawnSync } from 'child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

test.describe.configure({ mode: 'serial' });

const APP_DIR = path.resolve(__dirname, '../../..');
const BACKUPS_DIR = path.join(APP_DIR, 'WorkDir', 'Backups');

/**
 * Invoke DbBackupRetentionService::prune() on $dir via `php -r`, returning
 * the list of deleted basenames. The retention service is pure PHP (no
 * framework boot, no DB) so we only need the composer autoloader.
 */
function pruneViaPhp(dir: string): string[] {
    // NB: backslashes inside the heredoc are real PHP namespace separators.
    // JS template strings pass them through verbatim to PHP -r.
    const code = `
require ${JSON.stringify(path.join(APP_DIR, 'autoload.php'))};
$deleted = \\PHPCraftdream\\IRabi\\Common\\Services\\DbBackupRetentionService::prune($argv[1]);
foreach ($deleted as $p) { echo basename($p) . PHP_EOL; }
`;
    const res = spawnSync('php', ['-r', code, '--', dir], {
        cwd: APP_DIR,
        encoding: 'utf8',
    });
    if (res.status !== 0) {
        throw new Error(`pruneViaPhp failed (exit=${res.status}): ${res.stdout} ${res.stderr}`);
    }
    return res.stdout.split(/\r?\n/).map((s) => s.trim()).filter((s) => s.length > 0);
}

/**
 * Run the db-backup cron task the same way the real crontab will. Returns
 * the captured stdout+stderr and the process exit code.
 */
function runDbBackupCron(): { stdout: string; stderr: string; exitCode: number | null } {
    const res = spawnSync('php', ['run_cmd.php', 'cron', 'db-backup'], {
        cwd: APP_DIR,
        encoding: 'utf8',
        timeout: 60000,
    });
    return { stdout: res.stdout ?? '', stderr: res.stderr ?? '', exitCode: res.status };
}

function listBackups(): string[] {
    if (!fs.existsSync(BACKUPS_DIR)) return [];
    return fs.readdirSync(BACKUPS_DIR)
        .filter((f) => /^backup_.*\.sql\.gz$/.test(f))
        .sort();
}

/**
 * Parse the basename of the freshly-written backup from the cron task's
 * stdout. The task prints `db-backup: local backup written — <basename>`.
 * Using this — not a before/after directory diff — makes the test robust
 * to same-second basename collisions with a concurrent sibling spec
 * (cron-cli.spec.ts runs `php garnet cron` in parallel and the framework
 * names files with only second-granular timestamps, so two ticks in the
 * same second produce the same name and confuse a dir-diff).
 */
function parseBackupBasename(stdout: string): string | null {
    const m = stdout.match(/db-backup: local backup written — (backup_[^\s]+\.sql\.gz)/);
    return m ? m[1] : null;
}

test.describe('DbBackupRetentionService — isolated unit test', () => {
    let tmpDir = '';

    test.beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'irabi-retention-'));
    });

    test.afterEach(() => {
        if (tmpDir && fs.existsSync(tmpDir)) {
            for (const f of fs.readdirSync(tmpDir)) {
                fs.unlinkSync(path.join(tmpDir, f));
            }
            fs.rmdirSync(tmpDir);
        }
    });

    test('keeps 7 newest + 1 newest of each of last 4 distinct ISO weeks', () => {
        // Fixed-date dataset — assertions below assume the framework's
        // ISO-week grouping for THESE exact filenames and are independent
        // of when the test runs (the date is parsed from the filename, not
        // file mtime, and not from wall-clock "now").
        //
        // Quick ISO-week map of the seeds (Monday starts each ISO week):
        //   2026-06-15 = wk 25   2026-06-14..08 = wk 24   2026-06-01 = wk 23
        //   2026-05-25 = wk 22   2026-05-18 = wk 21      2026-05-11 = wk 20
        //   2026-05-04 = wk 19   2026-04-27 = wk 18      2026-01-01 = wk 1
        const seeds = [
            'backup_20260615-080000_cron.sql.gz',  //  1  wk 25
            'backup_20260614-080000_cron.sql.gz',  //  2  wk 24
            'backup_20260613-080000_cron.sql.gz',  //  3  wk 24
            'backup_20260612-080000_cron.sql.gz',  //  4  wk 24
            'backup_20260611-080000_cron.sql.gz',  //  5  wk 24
            'backup_20260610-080000_cron.sql.gz',  //  6  wk 24
            'backup_20260609-080000_cron.sql.gz',  //  7  wk 24
            'backup_20260608-080000_cron.sql.gz',  //  8  wk 24 (Mon)
            'backup_20260601-080000_cron.sql.gz',  //  9  wk 23 (Mon)
            'backup_20260525-080000_cron.sql.gz',  // 10  wk 22 (Mon)
            'backup_20260518-080000_cron.sql.gz',  // 11  wk 21
            'backup_20260511-080000_cron.sql.gz',  // 12  wk 20
            'backup_20260504-080000_cron.sql.gz',  // 13  wk 19
            'backup_20260427-080000_cron.sql.gz',  // 14  wk 18
            'backup_20260101-080000_cron.sql.gz',  // 15  wk 1
        ];
        for (const name of seeds) {
            fs.writeFileSync(path.join(tmpDir, name), 'fake-gzip');
        }

        const deleted = pruneViaPhp(tmpDir);

        // ── Expected protected set (union of daily-7 + weekly-4) ──────────
        // Daily 7 (newest 7): files 1–7.
        // Weekly 4 (newest of each of 4 most recent distinct ISO weeks):
        //   wk 25 → file 1 (already in daily)
        //   wk 24 → file 2 (already in daily)
        //   wk 23 → file 9 (NEW)
        //   wk 22 → file 10 (NEW)
        // Protected = {1, 2, 3, 4, 5, 6, 7, 9, 10}  → 9 files kept.
        //
        // Worth calling out: file 8 (2026-06-08) is NEWER than file 9
        // (2026-06-01) but gets DELETED, because it shares ISO week 24
        // with files 2–7 and the weekly rule keeps only ONE per week
        // (file 2). File 9 is the only sample in week 23, so it's
        // protected as that week's representative. This is intentional —
        // the policy bounds storage to ~weekly granularity beyond the
        // 7-day window, not "keep the N newest overall".
        const expectedKept = new Set([
            'backup_20260615-080000_cron.sql.gz',
            'backup_20260614-080000_cron.sql.gz',
            'backup_20260613-080000_cron.sql.gz',
            'backup_20260612-080000_cron.sql.gz',
            'backup_20260611-080000_cron.sql.gz',
            'backup_20260610-080000_cron.sql.gz',
            'backup_20260609-080000_cron.sql.gz',
            'backup_20260601-080000_cron.sql.gz',
            'backup_20260525-080000_cron.sql.gz',
        ]);
        const expectedDeleted = new Set([
            'backup_20260608-080000_cron.sql.gz',  // wk 24 — same as newer files 2..7
            'backup_20260518-080000_cron.sql.gz',
            'backup_20260511-080000_cron.sql.gz',
            'backup_20260504-080000_cron.sql.gz',
            'backup_20260427-080000_cron.sql.gz',
            'backup_20260101-080000_cron.sql.gz',
        ]);

        const actualKept = new Set(fs.readdirSync(tmpDir));
        expect(new Set(deleted)).toEqual(expectedDeleted);
        expect(actualKept).toEqual(expectedKept);
        // Sanity: nothing double-counted.
        expect(deleted.length + actualKept.size).toBe(seeds.length);
    });

    test('non-matching filenames are left untouched (no opinion on manual dumps)', () => {
        fs.writeFileSync(path.join(tmpDir, 'manual_snapshot.sql.gz'), 'x');
        fs.writeFileSync(path.join(tmpDir, 'backup_20260615-080000_cron.sql.gz'), 'x');
        const deleted = pruneViaPhp(tmpDir);
        expect(deleted).toEqual([]);
        // Both files survive — one matches the pattern (only 1 → kept as
        // daily 1-of-1), the other doesn't match and is preserved as-is.
        expect(fs.readdirSync(tmpDir).sort()).toEqual([
            'backup_20260615-080000_cron.sql.gz',
            'manual_snapshot.sql.gz',
        ]);
    });

    test('impossible dates (Feb 30) are rejected, not silently rolled over', () => {
        // mktime would silently turn Feb 30 into Mar 2; the service's
        // round-trip check must reject it instead of grouping it under
        // an unrelated ISO week. The file stays on disk (we don't recognise
        // it as a backup), but it is NOT counted toward retention.
        fs.writeFileSync(path.join(tmpDir, 'backup_20260230-080000_cron.sql.gz'), 'x');
        const deleted = pruneViaPhp(tmpDir);
        expect(deleted).toEqual([]);
        expect(fs.existsSync(path.join(tmpDir, 'backup_20260230-080000_cron.sql.gz'))).toBe(true);
    });
});

test.describe('cron db-backup — live run + off-site-not-configured warning', () => {
    const createdByTest: string[] = [];

    test.afterEach(() => {
        // Cleanup: delete every backup this test invocation created. The
        // framework's filename format embeds a second-granular timestamp,
        // so a file whose mtime is at or after the suite's start time was
        // made by us (the dev stand does not run db-backup on a schedule).
        for (const name of createdByTest.splice(0)) {
            const p = path.join(BACKUPS_DIR, name);
            if (fs.existsSync(p)) {
                fs.unlinkSync(p);
            }
        }
    });

    test('creates a fresh .sql.gz in WorkDir/Backups/ and exits 0', () => {
        const startSec = Math.floor(Date.now() / 1000);

        const res = runDbBackupCron();
        const out = res.stdout + res.stderr;

        // Cron CLI returns 0 on success. The task itself returns the byte
        // size of the backup (a non-zero "did work" signal).
        expect(res.exitCode).toBe(0);
        expect(out).toContain('[db-backup]');
        expect(out).toContain('OK');
        expect(out).not.toMatch(/ERROR:/);

        // The cron task prints the basename of the file it just wrote.
        // Use that as the authoritative identifier — see the note on
        // parseBackupBasename for why a directory-diff is unsafe here.
        const basename = parseBackupBasename(out);
        expect(basename).not.toBeNull();
        expect(basename).toMatch(/^backup_\d{8}-\d{6}_cron\.sql\.gz$/);
        createdByTest.push(basename as string);

        // The file exists and is a non-trivial gzip — proves real content
        // was written, not a zero-byte stub.
        const fullPath = path.join(BACKUPS_DIR, basename as string);
        const stat = fs.statSync(fullPath);
        expect(stat.size).toBeGreaterThan(100);
        expect(stat.mtimeMs / 1000).toBeGreaterThanOrEqual(startSec - 1);

        // gzip magic bytes (1f 8b) — the framework writes a real .sql.gz,
        // restore is documented to detect gzip by these bytes.
        const fd = fs.openSync(fullPath, 'r');
        const buf = Buffer.alloc(2);
        fs.readSync(fd, buf, 0, 2, 0);
        fs.closeSync(fd);
        expect(buf[0]).toBe(0x1f);
        expect(buf[1]).toBe(0x8b);
    });

    test('logs the explicit "off-site upload not configured" warning', () => {
        // Same invocation as above — the off-site warning is part of every
        // tick when WorkDir/Config/backup.ini is absent or has an empty
        // [webdav] url. The dev stand has no backup.ini, so this is the
        // default-state path.
        const res = runDbBackupCron();
        const out = res.stdout + res.stderr;

        expect(res.exitCode).toBe(0);
        expect(out).toContain('db-backup: off-site upload not configured, backup stays local-only.');
        // And the local-backup line, proving the off-site leg is gated on
        // the local step having already succeeded.
        expect(out).toMatch(/db-backup: local backup written/);

        // Track the freshly-created file for cleanup. Authoritative source
        // is the basename printed to stdout (see parseBackupBasename).
        const basename = parseBackupBasename(out);
        if (basename) createdByTest.push(basename);
    });
});
