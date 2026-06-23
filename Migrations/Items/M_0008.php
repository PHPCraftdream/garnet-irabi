<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Migrations\Items {
    use Aura\Cli\Stdio;
    use PHPCraftdream\Garnet\Kernel\Db\Link\DbPool;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Migration\IMigrationItem;
    use PHPCraftdream\IRabi\Common\Tables\EmailThrottle;

    /**
     * Create the email_throttle table for per-account, per-category
     * email-notification frequency throttling.
     *
     * Idempotent — uses CREATE TABLE IF NOT EXISTS and checks for the
     * unique index before adding it.
     */
    class M_0008 implements IMigrationItem {
        public static function update(Stdio $stdio): void {
            $pool = DbPool::get();
            $table = EmailThrottle::get()->getTableName();

            $exists = $pool->query("SHOW TABLES LIKE '{$table}'");
            if (empty($exists)) {
                $pool->query(
                    "CREATE TABLE IF NOT EXISTS `{$table}` (
                        `id`           INT(11)     NOT NULL AUTO_INCREMENT,
                        `account_id`   INT(11)     NOT NULL,
                        `category`     VARCHAR(32) NOT NULL,
                        `last_sent_at` INT(11)     NOT NULL DEFAULT 0,
                        PRIMARY KEY (`id`),
                        UNIQUE KEY `account_category` (`account_id`, `category`),
                        KEY `account_id` (`account_id`)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
                );
                $stdio->outln("M_0008: created table {$table}");
            } else {
                $stdio->outln("M_0008: table {$table} already exists, skipped");
            }
        }
    }
}
