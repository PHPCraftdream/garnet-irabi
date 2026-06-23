<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Services {
    use PHPCraftdream\Garnet\Kernel\Db\Query\QueryEx;

    /**
     * DDL helpers for the isolated test scope. Shared by `test:provision`
     * (clean slate before migrate) and `test:teardown` (drop everything).
     *
     * Every operation is hard-scoped to a `{$prefix}_*` table set in the
     * CURRENT database, so it can only ever touch the test-worker namespace,
     * never the live `db_ir_*` tables.
     */
    class TestScopeDbService {
        /**
         * Drop every table named `{$prefix}_*` in the current database.
         * Returns the number of tables dropped. FK checks are disabled for
         * the duration so inter-table constraints don't block the drop order.
         */
        public static function dropScopeTables(string $prefix): int {
            $qx = QueryEx::get();

            // `_` and `%` are LIKE wildcards. Escape them so the pattern
            // matches the literal prefix and only its own table set — never
            // a sibling scope (`test_worker_0` must not catch `test_worker_10`).
            $like = self::escapeLike($prefix) . '\\_%';

            $rows = $qx->exFetch(
                'SELECT TABLE_NAME FROM information_schema.tables
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME LIKE ?',
                [$like],
            );

            if (!is_array($rows) || empty($rows)) {
                return 0;
            }

            $qx->ex('SET FOREIGN_KEY_CHECKS = 0');
            $dropped = 0;
            foreach ($rows as $row) {
                $table = (string)($row['TABLE_NAME'] ?? '');
                if ($table === '') {
                    continue;
                }
                // Defence in depth: never drop a table that isn't ours, even
                // if information_schema returned something unexpected.
                if (!str_starts_with($table, $prefix . '_')) {
                    continue;
                }
                $qx->ex('DROP TABLE IF EXISTS `' . str_replace('`', '', $table) . '`');
                $dropped++;
            }
            $qx->ex('SET FOREIGN_KEY_CHECKS = 1');

            return $dropped;
        }

        private static function escapeLike(string $value): string {
            return str_replace(['\\', '_', '%'], ['\\\\', '\\_', '\\%'], $value);
        }
    }
}
