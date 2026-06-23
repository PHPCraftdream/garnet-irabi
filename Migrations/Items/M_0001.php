<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Migrations\Items {
    use Aura\Cli\Stdio;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\DbAccount;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\DbAccountData;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\DbLog\EntityLog;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Session\SessionData;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Settings\SettingsTable;
    use PHPCraftdream\Garnet\Kernel\Db\Link\DbPool;
    use PHPCraftdream\Garnet\Kernel\Db\Tables\DbTableBuilderFactory;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Migration\IMigrationItem;
    use PHPCraftdream\Garnet\Kernel\Io\FileUpload\PendingUploadsTable;

    /**
     * Framework-level schema.
     *
     * Creates the storage every Garnet app expects regardless of bundle:
     *   - session / session_data — request session state
     *   - settings              — app key/value settings
     *   - entity_log            — generic audit trail
     *   - accounts / accounts_data — auth identities and EAV-style account flags
     *   - fw_pending_uploads    — staging for client-side file uploads
     *
     * Application-specific tables (`ir_*`) live in M_0002.
     */
    class M_0001 implements IMigrationItem {
        public static function update(Stdio $stdio): void {
            $pool = DbPool::get();

            SessionData::get()->init();
            SettingsTable::get()->init()->ex();
            EntityLog::get()->init()->ex();
            DbAccount::get()->init()->ex();
            DbAccountData::get()->init()->ex();

            // Account profile shape — historically built up via several
            // ALTERs (login length, optional name, account type + photo
            // columns). Folded into the framework migration so a fresh
            // install gets the final layout in one pass.
            $accountsTable = DbAccount::get()->getTableName();
            $pool->query("ALTER TABLE {$accountsTable} MODIFY COLUMN login VARCHAR(128) NOT NULL");
            $pool->query("ALTER TABLE {$accountsTable} MODIFY COLUMN name VARCHAR(64) NULL");

            DbTableBuilderFactory::newAlterTable(DbAccount::get())
                ->addColumn('type', 'VARCHAR', '32')
                ->addColumn('photo', 'VARCHAR', '128')
                ->addColumn('photo_cropped', 'VARCHAR', '128')
                ->addColumn('crop_info', 'VARCHAR', '128')
                ->addIndex('type', ['type'])
                ->ex();

            PendingUploadsTable::init()->ex();

            $stdio->outln('M_0001: framework schema created');
        }
    }
}
