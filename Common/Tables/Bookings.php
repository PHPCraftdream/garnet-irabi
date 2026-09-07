<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Tables {
    use PHPCraftdream\Garnet\Kernel\Db\Tables\DbTable;
    use PHPCraftdream\Garnet\Kernel\Db\Tables\DbTableBuilderFactory;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Db\ITableBuilderDriver;

    class Bookings extends DbTable {
        protected string $tableName = 'bookings';
        protected string $primaryKey = 'id';

        public static function init(): ITableBuilderDriver {
            return DbTableBuilderFactory::newCreateTable(table: static::get())
                ->addIdColumn()
                ->addColumn(column: 'user_id', type: 'INT', length: '11')
                ->addColumn(column: 'bookable_type', type: 'ENUM', length: "'time_slot'")
                ->addColumn(column: 'bookable_id', type: 'INT', length: '11')
                ->addColumn(column: 'status', type: 'ENUM', length: "'pending','confirmed','cancelled','completed'")
                ->addColumn(column: 'created_at',   type: 'INT', length: '11', null: false, default: '0')
                ->addColumn(column: 'confirmed_at', type: 'INT', length: '11', null: true)
                ->addColumn(column: 'cancelled_at', type: 'INT', length: '11', null: true)
                // Отметки об отправленных напоминаниях ученику: NULL — ещё не
                // отправляли. Отметка нужна именно в брони, а не в слоте:
                // напоминание адресовано конкретному записавшемуся, и отмена
                // его брони не должна влиять на остальных.
                ->addColumn(column: 'reminded_1d_at', type: 'INT', length: '11', null: true)
                ->addColumn(column: 'reminded_2h_at', type: 'INT', length: '11', null: true)
                ->addIndex(indexName: 'user_id', indexes: ['user_id'])
                ->addIndex(indexName: 'user_status', indexes: ['user_id', 'status'])
                ->addIndex(indexName: 'bookable', indexes: ['bookable_type', 'bookable_id'])
            ;
        }
    }
}
