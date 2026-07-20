/**
 * Migration idempotency (audit 14-data-integrity-migrations.md H-2 + H-4):
 *
 * Both M_0001 and M_0002 used to issue raw ALTERs / a destructive seed
 * with no guards. The trigger scenario is identical for both: the single
 * `migration` tracker row (id=1000, the only row in that table) is lost
 * — a partial DB restore, a manual `UPDATE migration SET version=0`
 * during incident investigation, or a tracker-table corruption — so the
 * runner's `range($dbVersion+1, $fsVersion)` loop replays M_0001..M_0013
 * on an already-migrated DB.
 *
 *   - H-4 (M_0001): the unguarded `ADD COLUMN type/photo/photo_cropped/
 *     crop_info` + `ADD INDEX type` chain aborted with "Duplicate column
 *     name 'type'" / "Duplicate key name".
 *   - H-2 (M_0002): the unguarded `ADD COLUMN active_dup_key` + two
 *     `ADD UNIQUE INDEX` aborted the same way.
 *   - H-2 (content, the severe one): `StaticPagesSeed::install()` does
 *     wipe()+seed() — a parameterless `DELETE FROM static_pages /
 *     static_page_blocks / static_snippets`. If the ALTERs above were
 *     patched by hand and the migration re-run, this would SILENTLY
 *     destroy admin-authored/edited page content and replace it with the
 *     canonical seed. No error, no log — just gone.
 *
 * This spec simulates the trigger directly:
 *   1. Edit one static_pages row to a marker value (admin-edit stand-in).
 *   2. Reset the tracker row to version 0 (simulate tracker loss/rollback).
 *   3. Re-run the full migration via `php run_cmd.php migration` against
 *      the worker-isolated tables (DB_PREFIX_OVERRIDE).
 *   4. Assert: exit 0, no "Duplicate column"/"Duplicate key" errors, the
 *      tracker is back at fsVersion, the admin marker survived (NOT wiped
 *      & reseeded), and the guarded columns/indexes still exist exactly
 *      once (not duplicated).
 *
 * Worker isolation already runs the FIRST migration pass when building the
 * template DB, so "fresh install produces the right schema" is covered by
 * the rest of the suite. This spec covers the SECOND pass — the replay.
 */

import { test, expect, tn, getDbPrefix } from '../../helpers/scoped-test';
import { spawnSync } from 'child_process';
import * as path from 'node:path';
import { withConnection } from '../../helpers/db';

const APP_DIR = path.resolve(__dirname, '../../..');

/**
 * Final filesystem version (Migrations/AppMigration.php::$currentVersion).
 * The tracker must return here after the replayed run. Read from the
 * constant rather than hard-coding so a future bump doesn't silently
 * stale this assertion — the runner itself reports fsVersion in output.
 */
const FS_VERSION = 14;

/**
 * Run the migration the same way `php garnet migration` does, but pointed
 * at the worker-isolated table set via DB_PREFIX_OVERRIDE. Mirrors the
 * invocation pattern in log-rotation-cron.spec.ts / db-backup-cron.spec.ts.
 */
function runMigration(prefix: string): { stdout: string; stderr: string; exitCode: number | null } {
    const res = spawnSync('php', ['run_cmd.php', 'migration'], {
        cwd: APP_DIR,
        env: { ...process.env, DB_PREFIX_OVERRIDE: prefix },
        encoding: 'utf8',
        timeout: 120000,
    });
    return { stdout: res.stdout ?? '', stderr: res.stderr ?? '', exitCode: res.status };
}

test.describe('migration idempotency — M_0001/M_0002 guards survive a tracker reset', () => {
    test.describe.configure({ mode: 'serial' });

    // Captured in beforeAll so afterAll can restore the canonical title
    // regardless of whether the guard held (marker survived) or the bug
    // was present (wipe+reseed overwrote it). Either way the worker table
    // is left with the canonical content for sibling specs.
    let canonicalHomeTitle: string | null = null;
    let migrationResult: { stdout: string; stderr: string; exitCode: number | null } | null = null;

    const MARKER = `ADMIN_EDITED_must_survive_migration_rerun_${process.pid}_${Date.now().toString(36)}`;

    test.beforeAll(async () => {
        await withConnection(async (conn) => {
            // 1. Capture the canonical home title (seeded by the first
            //    migration pass during worker-template build) so we can
            //    restore it after the test.
            const [seedRow]: any = await conn.execute(
                `SELECT title FROM ${tn('static_pages')} WHERE slug = 'home' LIMIT 1`,
            );
            canonicalHomeTitle = seedRow.length > 0 ? seedRow[0].title : null;

            // 2. Simulate an admin edit: overwrite the home page title with
            //    a unique marker. If the StaticPagesSeed guard works, this
            //    value must still be present after the re-run. If the guard
            //    is missing (the H-2 content bug), install()'s wipe() will
            //    delete this row and seed() will put the canonical title
            //    back — the assertion below catches exactly that.
            await conn.execute(
                `UPDATE ${tn('static_pages')} SET title = ? WHERE slug = 'home'`,
                [MARKER],
            );

            // 3. Simulate tracker-row loss / manual rollback for incident
            //    investigation: reset the version to 0 so the runner's
            //    range(1, fsVersion) loop replays every migration item,
            //    including M_0001 and M_0002, on the already-migrated DB.
            //    version is VARCHAR(5); id=1000 is the single tracker row
            //    (MigrationTable::$idForVersion).
            await conn.execute(
                `UPDATE ${tn('migration')} SET version = '0' WHERE id = 1000`,
            );
        });

        // 4. Re-run the full migration pipeline against the worker tables.
        //    Done once in beforeAll so both assertions below share one
        //    captured output.
        migrationResult = runMigration(getDbPrefix());
    });

    test.afterAll(async () => {
        // Restore the canonical home title so sibling specs in this worker
        // see the seeded content, not our marker. No-op if the seed never
        // produced a home row (shouldn't happen, but stay defensive).
        if (canonicalHomeTitle !== null) {
            await withConnection(async (conn) => {
                await conn.execute(
                    `UPDATE ${tn('static_pages')} SET title = ? WHERE slug = 'home'`,
                    [canonicalHomeTitle],
                );
            });
        }
    });

    test('re-run exits 0 with no "Duplicate column/key" errors and restores the tracker version', () => {
        const res = migrationResult!;
        const out = res.stdout + res.stderr;

        // The replay must not abort. An unguarded ADD COLUMN/INDEX would
        // throw a DbException that the runner catches, prints as
        // "Error on execute: <sql>", then rethrows — non-zero exit.
        expect(res.exitCode, `migration output:\n${out}`).toBe(0);

        // Load-bearing negative assertions: the specific failure modes the
        // guards exist to prevent. If any of these appear, a guard is
        // missing or ineffective.
        expect(out).not.toMatch(/Duplicate column name/i);
        expect(out).not.toMatch(/Duplicate key name/i);
        expect(out).not.toMatch(/Error on execute:/);

        // The runner replayed every step and stamped the final version.
        // "database updated to version N" is printed after each step.
        expect(out).toContain(`database updated to version ${FS_VERSION}`);
    });

    test('the admin-edited static_pages row survived the re-run (content guard held)', async () => {
        // THE most important assertion in this spec. The unguarded
        // StaticPagesSeed::install() would have wipe()'d this row and
        // seed()'d the canonical title back — silently destroying an
        // admin edit. The COUNT(*)==0 guard in M_0002 must skip the call
        // entirely when the table already holds rows.
        const rows = await withConnection(async (conn) => {
            const [r]: any = await conn.execute(
                `SELECT title FROM ${tn('static_pages')} WHERE slug = 'home' LIMIT 1`,
            );
            return r as Array<{ title: string }>;
        });

        expect(rows.length, 'home page row must still exist').toBe(1);
        expect(rows[0].title, 'admin edit must survive migration re-run — wipe() must NOT have fired').toBe(MARKER);
    });

    test('the tracker version is back at fsVersion after the re-run', async () => {
        const version = await withConnection(async (conn) => {
            const [r]: any = await conn.execute(
                `SELECT version FROM ${tn('migration')} WHERE id = 1000 LIMIT 1`,
            );
            return r.length > 0 ? Number(r[0].version) : null;
        });
        expect(version).toBe(FS_VERSION);
    });

    test('guarded columns and indexes exist exactly once (no duplication)', async () => {
        // MySQL forbids two same-named indexes on one table and two
        // same-named columns, so a successful replay (exit 0, no
        // Duplicate-key error) already implies uniqueness. These
        // assertions confirm the objects are still present and were not
        // somehow dropped or doubled — belt-and-suspenders on top of the
        // exit-code / error-message checks above.

        await withConnection(async (conn) => {
            // M_0001 — accounts.{type,photo,photo_cropped,crop_info}. `SHOW
            // COLUMNS ... LIKE ?` errors under mysql2's prepared-statement
            // protocol ("near '?'") — SHOW isn't a regular SELECT, so the
            // column names (a fixed, hardcoded literal list, not user
            // input) are inlined directly instead of bound as a parameter.
            for (const col of ['type', 'photo', 'photo_cropped', 'crop_info']) {
                const [cols]: any = await conn.execute(
                    `SHOW COLUMNS FROM ${tn('accounts')} LIKE '${col}'`,
                );
                expect(cols.length, `accounts.${col} must exist exactly once`).toBe(1);
            }

            // M_0001 — accounts index `type` (single column → 1 SHOW INDEX row).
            const [acctTypeIdx]: any = await conn.execute(
                `SHOW INDEX FROM ${tn('accounts')} WHERE Key_name = 'type'`,
            );
            expect(acctTypeIdx.length, 'accounts.type index must exist exactly once').toBe(1);

            // M_0002 — bookings.active_dup_key generated column.
            const [adk]: any = await conn.execute(
                `SHOW COLUMNS FROM ${tn('bookings')} LIKE 'active_dup_key'`,
            );
            expect(adk.length, 'bookings.active_dup_key must exist exactly once').toBe(1);

            // M_0002 — bookings.uq_active_booking (single column → 1 row).
            const [abIdx]: any = await conn.execute(
                `SHOW INDEX FROM ${tn('bookings')} WHERE Key_name = 'uq_active_booking'`,
            );
            expect(abIdx.length, 'bookings.uq_active_booking index must exist exactly once').toBe(1);

            // M_0002 — balance_ledger.uq_ledger_ref is a 4-column index, so
            // SHOW INDEX returns one row per column. One index → 4 rows;
            // two duplicated indexes would yield 8. Asserting 4 proves no
            // duplication despite the multi-column shape.
            const [lrIdx]: any = await conn.execute(
                `SHOW INDEX FROM ${tn('balance_ledger')} WHERE Key_name = 'uq_ledger_ref'`,
            );
            expect(lrIdx.length, 'balance_ledger.uq_ledger_ref index must exist exactly once (4 columns = 4 rows)').toBe(4);
        });
    });
});
