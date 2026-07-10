<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Tables {
    use PHPCraftdream\Garnet\Kernel\Db\Tables\DbTable;
    use PHPCraftdream\Garnet\Kernel\Db\Tables\DbTableBuilderFactory;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Db\ITableBuilderDriver;

    class TimeSlots extends DbTable {
        protected string $tableName = 'time_slots';
        protected string $primaryKey = 'id';

        public static function generateUid(): string {
            return bin2hex(random_bytes(8));
        }

        public static function init(): ITableBuilderDriver {
            return DbTableBuilderFactory::newCreateTable(table: static::get())
                ->addIdColumn()
                ->addColumn(column: 'expert_id', type: 'INT', length: '11')
                ->addColumn(column: 'start_at', type: 'INT', length: '11', null: false, default: '0')
                ->addColumn(column: 'end_at', type: 'INT', length: '11', null: false, default: '0')
                ->addColumn(column: 'duration_min', type: 'INT', length: '11')
                ->addColumn(column: 'cost', type: 'INT', length: '11')
                ->addColumn(column: 'is_online', type: 'TINYINT', length: '1')
                ->addColumn(column: 'location', type: 'VARCHAR', length: '255')
                ->addColumn(column: 'max_users', type: 'INT', length: '11')
                ->addColumn(column: 'status', type: 'ENUM', length: "'free','booked','completed','cancelled'")
                ->addColumn(column: 'uid', type: 'VARCHAR', length: '16', null: false, default: '')
                ->addColumn(column: 'created_at', type: 'INT', length: '11', null: false, default: '0')
                ->addColumn(column: 'cancellation_penalty_percent', type: 'TINYINT', length: '3', null: false, default: '0')
                ->addIndex(indexName: 'expert_id', indexes: ['expert_id'])
                ->addIndex(indexName: 'expert_status', indexes: ['expert_id', 'status', 'start_at'])
                ->addIndex(indexName: 'status_start', indexes: ['status', 'start_at'])
            ;
        }
    }
}
