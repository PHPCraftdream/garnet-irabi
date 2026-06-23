<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Migrations\Items {
    use Aura\Cli\Stdio;
    use PHPCraftdream\Garnet\Kernel\Db\Link\DbPool;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Migration\IMigrationItem;
    use PHPCraftdream\IRabi\Common\Tables\ExpertCancellations;
    use PHPCraftdream\IRabi\Common\Tables\UserCancellations;

    /**
     * Split cancellation statistics into "declines" (отклонение до подтверждения)
     * vs "cancellations" (отмена после подтверждения).
     *
     * Adds a `kind` column to both cancellation tables. DEFAULT 'cancel' means
     * every existing row is backfilled as a cancellation (the historical
     * behaviour — they were all counted as "отмены"). New inserts set 'decline'
     * when the booking was still pending at the time of the action.
     *
     * Composite index (owner_id, kind) backs the per-kind COUNT queries shown
     * on profiles / dashboards / admin cards. Idempotent — re-runs are no-ops.
     */
    class M_0007 implements IMigrationItem {
        public static function update(Stdio $stdio): void {
            $pool = DbPool::get();

            $targets = [
                ExpertCancellations::get()->getTableName() => ['idx' => 'expert_kind', 'cols' => 'expert_id, kind'],
                UserCancellations::get()->getTableName() => ['idx' => 'user_kind',   'cols' => 'user_id, kind'],
            ];

            foreach ($targets as $table => $meta) {
                // kind column
                $hasCol = $pool->query("SHOW COLUMNS FROM {$table} LIKE 'kind'");
                if (empty($hasCol)) {
                    $pool->query("ALTER TABLE {$table} ADD COLUMN kind VARCHAR(16) NOT NULL DEFAULT 'cancel'");
                    $stdio->outln("M_0007: added {$table}.kind");
                } else {
                    $stdio->outln("M_0007: {$table}.kind already present, skipped");
                }

                // composite (owner_id, kind) index
                $idx = $meta['idx'];
                $hasIdx = $pool->query("SHOW INDEX FROM {$table} WHERE Key_name = '{$idx}'");
                if (empty($hasIdx)) {
                    $pool->query("ALTER TABLE {$table} ADD INDEX {$idx} ({$meta['cols']})");
                    $stdio->outln("M_0007: added index {$table}.{$idx}");
                } else {
                    $stdio->outln("M_0007: index {$table}.{$idx} already present, skipped");
                }
            }
        }
    }
}
