<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Migrations\Items {
    use Aura\Cli\Stdio;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\DbAccount;
    use PHPCraftdream\Garnet\Kernel\Db\Link\DbPool;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Migration\IMigrationItem;

    /**
     * Consent audit columns on accounts. Framework's EmailAuthMiddleware
     * persists session consent flags here on first successful verify,
     * and Account::has{Consent,Marketing} reads them for downstream
     * filters (marketing crons, admin badges).
     *
     * Storing as INT(10) UNSIGNED (unix timestamp). NULL = never granted.
     * Idempotent — re-runs are no-ops.
     */
    class M_0005 implements IMigrationItem {
        public static function update(Stdio $stdio): void {
            $pool = DbPool::get();
            $table = DbAccount::get()->getTableName();

            $columns = [
                'consent_pd_at' => 'INT(10) UNSIGNED NULL DEFAULT NULL',
                'consent_marketing_at' => 'INT(10) UNSIGNED NULL DEFAULT NULL',
                'consent_marketing_withdrawn_at' => 'INT(10) UNSIGNED NULL DEFAULT NULL',
            ];

            foreach ($columns as $name => $def) {
                $rows = $pool->query("SHOW COLUMNS FROM {$table} LIKE '{$name}'");
                if (empty($rows)) {
                    $pool->query("ALTER TABLE {$table} ADD COLUMN {$name} {$def}");
                    $stdio->outln("M_0005: added {$table}.{$name}");
                } else {
                    $stdio->outln("M_0005: {$table}.{$name} already present, skipped");
                }
            }
        }
    }
}
