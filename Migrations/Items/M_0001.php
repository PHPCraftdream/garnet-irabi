<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Migrations\Items {
    use Aura\Cli\Stdio;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\DbAccount;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\DbAccountData;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\DbLog\EntityLog;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Session\SessionData;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Settings\SettingsTable;
    use PHPCraftdream\Garnet\Kernel\Db\Link\DbPool;
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
            //
            // The two MODIFY COLUMN calls are idempotent by nature (MODIFY
            // reshapes an existing column, never ADDs). The four ADD COLUMN
            // + ADD INDEX steps below are guarded against the "tracker row
            // lost / version hand-reset" replay scenario: if the migration
            // runner re-executes M_0001 on an already-migrated DB, an
            // unguarded ADD would fail with "Duplicate column name" /
            // "Duplicate key name" and abort the whole pipeline.
            //
            // Column types/nullability below match exactly what the
            // DbTableBuilderFactory chain emitted before this change
            // (addColumn($n, 'VARCHAR', $len) → "VARCHAR($len) NULL", no
            // DEFAULT, no AFTER) — verified against the builder source in
            // Kernel/Db/Tables/TableBuilderMySQL.php — so a fresh install
            // lands the identical schema.
            $accountsTable = DbAccount::get()->getTableName();
            $pool->query("ALTER TABLE {$accountsTable} MODIFY COLUMN login VARCHAR(128) NOT NULL");
            $pool->query("ALTER TABLE {$accountsTable} MODIFY COLUMN name VARCHAR(64) NULL");

            $accountColumns = [
                'type' => 'VARCHAR(32) NULL',
                'photo' => 'VARCHAR(128) NULL',
                'photo_cropped' => 'VARCHAR(128) NULL',
                'crop_info' => 'VARCHAR(128) NULL',
            ];

            foreach ($accountColumns as $column => $def) {
                $exists = $pool->query("SHOW COLUMNS FROM {$accountsTable} LIKE '{$column}'");
                if (empty($exists)) {
                    $pool->query("ALTER TABLE {$accountsTable} ADD COLUMN {$column} {$def}");
                    $stdio->outln("M_0001: added {$accountsTable}.{$column}");
                } else {
                    $stdio->outln("M_0001: {$accountsTable}.{$column} already present, skipped");
                }
            }

            $hasTypeIndex = $pool->query("SHOW INDEX FROM {$accountsTable} WHERE Key_name = 'type'");
            if (empty($hasTypeIndex)) {
                $pool->query("ALTER TABLE {$accountsTable} ADD INDEX type (type)");
                $stdio->outln("M_0001: added index {$accountsTable}.type");
            } else {
                $stdio->outln("M_0001: index {$accountsTable}.type already present, skipped");
            }

            PendingUploadsTable::init()->ex();

            $stdio->outln('M_0001: framework schema created');
        }
    }
}
