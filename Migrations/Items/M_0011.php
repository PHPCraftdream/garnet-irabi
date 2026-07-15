<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Migrations\Items {
    use Aura\Cli\Stdio;
    use PHPCraftdream\Garnet\Kernel\Db\Link\DbPool;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Migration\IMigrationItem;
    use PHPCraftdream\IRabi\Common\Tables\SysLogThrottle;

    /**
     * Create the sys_log_throttle table backing the per-IP rate limit on the
     * public /sys/log breadcrumb endpoint (security finding F-LOG-01).
     *
     * Idempotent — CREATE TABLE IF NOT EXISTS, skipped if already present.
     */
    class M_0011 implements IMigrationItem {
        public static function update(Stdio $stdio): void {
            $pool = DbPool::get();
            $table = SysLogThrottle::get()->getTableName();

            $exists = $pool->query("SHOW TABLES LIKE '{$table}'");
            if (empty($exists)) {
                $pool->query(
                    "CREATE TABLE IF NOT EXISTS `{$table}` (
                        `id`           INT(11)     NOT NULL AUTO_INCREMENT,
                        `ip`           VARCHAR(45) NOT NULL,
                        `window_start` INT(11)     NOT NULL DEFAULT 0,
                        `cnt`          INT(11)     NOT NULL DEFAULT 0,
                        PRIMARY KEY (`id`),
                        UNIQUE KEY `ip` (`ip`)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
                );
                $stdio->outln("M_0011: created table {$table}");
            } else {
                $stdio->outln("M_0011: table {$table} already exists, skipped");
            }
        }
    }
}
