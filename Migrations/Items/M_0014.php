<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Migrations\Items {
    use Aura\Cli\Stdio;
    use PHPCraftdream\Garnet\Kernel\Db\Link\DbPool;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Migration\IMigrationItem;
    use PHPCraftdream\IRabi\Common\Tables\Consents;

    /**
     * Create the consents consent-audit-trail table (legal finding F-04:
     * there was no journal of consent events — only the latest timestamp
     * on accounts). Each consent grant/withdrawal is now a separate row
     * with IP, User-Agent and the document version the user agreed to.
     *
     * Idempotent — init()->ex() emits CREATE TABLE IF NOT EXISTS, and the
     * SHOW TABLES guard keeps the status line honest on a re-run.
     */
    class M_0014 implements IMigrationItem {
        public static function update(Stdio $stdio): void {
            $pool = DbPool::get();
            $table = Consents::get()->getTableName();

            $exists = $pool->query("SHOW TABLES LIKE '{$table}'");
            if (!empty($exists)) {
                $stdio->outln("M_0014: table {$table} already exists, skipped");

                return;
            }

            Consents::get()->init()->ex();

            $stdio->outln("M_0014: created table {$table}");
        }
    }
}
