<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Tables {
    use PHPCraftdream\Garnet\Kernel\Db\Tables\DbTable;
    use PHPCraftdream\Garnet\Kernel\Db\Tables\DbTableBuilderFactory;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Db\ITableBuilderDriver;

    /**
     * Per-account, per-category throttle timestamps for email notifications.
     */
    class EmailThrottle extends DbTable {
        protected string $tableName = 'email_throttle';
        protected string $primaryKey = 'id';

        public static function init(): ITableBuilderDriver {
            return DbTableBuilderFactory::newCreateTable(table: static::get())
                ->addIdColumn()
                ->addColumn(column: 'account_id', type: 'INT', length: '11', null: false)
                ->addColumn(column: 'category',   type: 'VARCHAR', length: '32', null: false)
                ->addColumn(column: 'last_sent_at', type: 'INT', length: '11', null: false, default: '0')
                ->addIndex(indexName: 'account_category', indexes: ['account_id', 'category'], type: 'UNIQUE')
                ->addIndex(indexName: 'account_id', indexes: ['account_id'])
            ;
        }
    }
}
