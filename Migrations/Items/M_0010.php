<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Migrations\Items {
    use Aura\Cli\Stdio;
    use PHPCraftdream\Garnet\Kernel\Db\Link\DbPool;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Migration\IMigrationItem;
    use PHPCraftdream\IRabi\Common\Tables\BalanceLedger;

    /**
     * Add UNIQUE INDEX `uq_idempotent` on balance_ledger
     * (account_id, entry_type, ref_type, ref_id) to prevent duplicate
     * ledger entries for the same business operation (idempotency guard).
     *
     * IMPORTANT — existing duplicates:
     * If the table already contains duplicate rows for the same
     * (account_id, entry_type, ref_type, ref_id) combination, the
     * ALTER TABLE will fail. This migration detects that case, logs the
     * duplicate groups, and skips the index creation so that the rest of
     * the migration pipeline is not blocked. The duplicates must be
     * resolved manually (business decision: which row to keep) before
     * re-running the migration.
     *
     * NULL handling: MySQL UNIQUE indexes treat each NULL as distinct,
     * so entries without ref_type/ref_id (NULL, NULL) are never
     * constrained — which is correct (generic top-ups, manual adjustments
     * are allowed to repeat).
     */
    class M_0010 implements IMigrationItem {
        public static function update(Stdio $stdio): void {
            $pool = DbPool::get();
            $table = BalanceLedger::get()->getTableName();

            // 1. Check if index already exists
            $indexes = $pool->query("SHOW INDEX FROM `{$table}` WHERE Key_name = 'uq_idempotent'");
            if (!empty($indexes)) {
                $stdio->outln("M_0010: {$table}.uq_idempotent already exists, skipped");
                return;
            }

            // 2. Check for existing duplicates that would block UNIQUE index creation
            $dupes = $pool->query("
                SELECT account_id, entry_type, ref_type, ref_id, COUNT(*) AS cnt
                FROM `{$table}`
                WHERE ref_type IS NOT NULL AND ref_id IS NOT NULL
                GROUP BY account_id, entry_type, ref_type, ref_id
                HAVING cnt > 1
            ");

            if (!empty($dupes)) {
                $stdio->outln('M_0010: WARNING — found ' . count($dupes) . " duplicate group(s) in {$table}:");
                foreach ($dupes as $d) {
                    $stdio->outln("  account_id={$d['account_id']} entry_type={$d['entry_type']} ref_type={$d['ref_type']} ref_id={$d['ref_id']} count={$d['cnt']}");
                }
                $stdio->outln('M_0010: SKIPPED index creation — resolve duplicates manually, then re-run migration');
                return;
            }

            // 3. Safe to create the unique index
            $pool->query("
                ALTER TABLE `{$table}`
                ADD UNIQUE INDEX `uq_idempotent` (`account_id`, `entry_type`, `ref_type`, `ref_id`)
            ");
            $stdio->outln("M_0010: added UNIQUE INDEX uq_idempotent on {$table}");
        }
    }
}
