<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Tables {
    use PHPCraftdream\Garnet\Kernel\Db\Tables\DbTable;
    use PHPCraftdream\Garnet\Kernel\Db\Tables\DbTableBuilderFactory;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Db\ITableBuilderDriver;

    class PaymentsLog extends DbTable {
        protected string $tableName = 'payments_log';

        protected string $primaryKey = 'id';

        public static function init(): ITableBuilderDriver {
            return DbTableBuilderFactory::newCreateTable(table: static::get())
                ->addIdColumn()
                ->addColumn(column: 'payment_id', type: 'INT', length: '11')
                ->addColumn(column: 'timezone', type: 'VARCHAR', length: '45')
                ->addColumn(column: 'created_at', type: 'INT', length: '11', null: false, default: '0')
                ->addColumn(column: 'action', type: 'VARCHAR', length: '255')
                ->addColumn(column: 'info', type: 'LONGTEXT')
                ->addIndex(indexName: 'payment_id', indexes: ['payment_id'])
            ;
        }
    }
}
