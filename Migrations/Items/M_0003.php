<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Migrations\Items {
    use Aura\Cli\Stdio;
    use PHPCraftdream\Garnet\Kernel\Db\Link\DbPool;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Migration\IMigrationItem;
    use PHPCraftdream\IRabi\Common\Tables\InviteTokens;

    /**
     * Invite tokens carry the account_type to mint on registration —
     * lets admins issue separate links for users vs. experts. Default
     * 'user' preserves the old single-type behaviour for existing
     * tokens.
     */
    class M_0003 implements IMigrationItem {
        public static function update(Stdio $stdio): void {
            $pool = DbPool::get();
            $table = InviteTokens::get()->getTableName();

            // idempotent guard — re-running the migration shouldn't blow up
            $rows = $pool->query("SHOW COLUMNS FROM {$table} LIKE 'account_type'");
            if (empty($rows)) {
                $pool->query("ALTER TABLE {$table} ADD COLUMN account_type VARCHAR(16) NOT NULL DEFAULT 'user' AFTER created_by");
                $stdio->outln("M_0003: added {$table}.account_type");
            } else {
                $stdio->outln("M_0003: {$table}.account_type already present, skipped");
            }
        }
    }
}
