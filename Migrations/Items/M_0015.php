<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Migrations\Items {
    use Aura\Cli\Stdio;
    use PHPCraftdream\Garnet\Kernel\Db\Link\DbPool;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Migration\IMigrationItem;
    use PHPCraftdream\IRabi\Common\Tables\MagicLoginTokens;

    /**
     * Create the magic_login_tokens table for the new one-click
     * magic-login mechanism (32-char one-time URL codes, 5-minute
     * validity, replacing the old hash-based #token= auth link).
     *
     * Idempotent — init()->ex() emits CREATE TABLE IF NOT EXISTS, and the
     * SHOW TABLES guard keeps the status line honest on a re-run.
     */
    class M_0015 implements IMigrationItem {
        public static function update(Stdio $stdio): void {
            $pool = DbPool::get();
            $table = MagicLoginTokens::get()->getTableName();

            $exists = $pool->query("SHOW TABLES LIKE '{$table}'");
            if (!empty($exists)) {
                $stdio->outln("M_0015: table {$table} already exists, skipped");

                return;
            }

            MagicLoginTokens::get()->init()->ex();

            $stdio->outln("M_0015: created table {$table}");
        }
    }
}
