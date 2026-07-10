<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Tables {
    use PHPCraftdream\Garnet\Kernel\Db\Tables\DbTable;
    use PHPCraftdream\Garnet\Kernel\Db\Tables\DbTableBuilderFactory;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Db\ITableBuilderDriver;

    /**
     * Отмены бронирований пользователем.
     */
    class UserCancellations extends DbTable {
        protected string $tableName = 'user_cancellations';
        protected string $primaryKey = 'id';

        public static function init(): ITableBuilderDriver {
            return DbTableBuilderFactory::newCreateTable(table: static::get())
                ->addIdColumn()
                ->addColumn(column: 'user_id', type: 'INT', length: '11', null: false)
                ->addColumn(column: 'booking_id', type: 'INT', length: '11', null: false)
                ->addColumn(column: 'slot_id', type: 'INT', length: '11', null: false)
                ->addColumn(column: 'expert_id', type: 'INT', length: '11', null: false)
                ->addColumn(column: 'reason', type: 'TEXT', null: false)
                ->addColumn(column: 'created_at', type: 'INT', length: '11', null: false, default: '0')
                ->addColumn(column: 'kind', type: 'VARCHAR', length: '16', null: false, default: 'cancel')
                ->addIndex(indexName: 'user_id', indexes: ['user_id'])
                ->addIndex(indexName: 'expert_id', indexes: ['expert_id'])
                ->addIndex(indexName: 'created_at', indexes: ['created_at'])
                ->addIndex(indexName: 'user_kind', indexes: ['user_id', 'kind'])
            ;
        }
    }
}
