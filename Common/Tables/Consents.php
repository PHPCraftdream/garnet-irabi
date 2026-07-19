<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Tables {
    use PHPCraftdream\Garnet\Kernel\Db\Tables\DbTable;
    use PHPCraftdream\Garnet\Kernel\Db\Tables\DbTableBuilderFactory;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Db\ITableBuilderDriver;

    /**
     * Consent audit trail — one row per consent event (given/withdrawn).
     *
     * Backs the 152-ФЗ / GDPR consent-journal requirement: every time a user
     * grants or withdraws a consent we record who, what, when, from where
     * (IP + User-Agent) and which document revision they agreed to. The
     * accounts.consent_pd_at / consent_marketing_at columns only keep the
     * LATEST timestamp; this table keeps the full history (repeated grants,
     * withdrawals, …) so the fact and content of a specific consent can be
     * proven on audit or dispute.
     *
     * Populated by ConsentJournalService, invoked from
     * IrabiAuthMiddleware::sendSuccessLogin() at every successful email-code
     * login (the moment consent is actually confirmed). The `action='withdrawn'`
     * value is reserved for the upcoming withdrawal flow (task #72); the
     * column is part of the schema now so that flow needs no migration.
     */
    class Consents extends DbTable {
        protected string $tableName = 'consents';

        protected string $primaryKey = 'id';

        public static function init(): ITableBuilderDriver {
            return DbTableBuilderFactory::newCreateTable(table: static::get())
                ->addIdColumn()
                ->addColumn(column: 'account_id', type: 'INT', length: '11', null: false)
                ->addColumn(column: 'consent_type', type: 'ENUM', length: "'personal_data','marketing'", null: false)
                ->addColumn(column: 'action', type: 'ENUM', length: "'given','withdrawn'", null: false, default: 'given')
                ->addColumn(column: 'document_version', type: 'VARCHAR', length: '32', null: false)
                ->addColumn(column: 'ip', type: 'VARCHAR', length: '45')
                ->addColumn(column: 'user_agent', type: 'VARCHAR', length: '255')
                ->addColumn(column: 'created_at', type: 'INT', length: '11', null: false)
                ->addIndex(indexName: 'account_id', indexes: ['account_id'])
            ;
        }
    }
}
