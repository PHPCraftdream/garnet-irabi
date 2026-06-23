<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Tables {
    use PHPCraftdream\Garnet\Kernel\Db\Tables\DbTable;
    use PHPCraftdream\Garnet\Kernel\Db\Tables\DbTableBuilderFactory;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Db\ITableBuilderDriver;

    class Payments extends DbTable {
        protected string $tableName = 'payments';

        protected string $primaryKey = 'id';

        public static function init(): ITableBuilderDriver {
            return DbTableBuilderFactory::newCreateTable(table: static::get())
                ->addIdColumn()
                ->addColumn(column: 'account_id', type: 'INT', length: '11')
                ->addColumn(column: 'sum', type: 'FLOAT', length: '11')
                ->addColumn(column: 'commission', type: 'FLOAT', length: '11')
                ->addColumn(column: 'created_at', type: 'INT', length: '11', null: false, default: '0')
                ->addColumn(column: 'paid_at', type: 'INT', length: '11', null: true)
                ->addColumn(column: 'timezone', type: 'VARCHAR', length: '45')
                ->addIndex(indexName: 'account_id', indexes: ['account_id'])
            ;
        }
    }
}
