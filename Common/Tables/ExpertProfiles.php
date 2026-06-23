<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Tables {
    use PHPCraftdream\Garnet\Kernel\Db\Tables\DbTable;
    use PHPCraftdream\Garnet\Kernel\Db\Tables\DbTableBuilderFactory;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Db\ITableBuilderDriver;

    /**
     * Профили экспертов (преподавателей/консультантов).
     */
    class ExpertProfiles extends DbTable {
        protected string $tableName = 'expert_profiles';
        protected string $primaryKey = 'id';

        public static function init(): ITableBuilderDriver {
            return DbTableBuilderFactory::newCreateTable(table: static::get())
                ->addIdColumn()
                ->addColumn(column: 'account_id', type: 'INT', length: '11')
                ->addColumn(column: 'display_name', type: 'VARCHAR', length: '255')
                ->addColumn(column: 'bio', type: 'TEXT')
                ->addColumn(column: 'specialization', type: 'VARCHAR', length: '255')
                ->addColumn(column: 'photo', type: 'VARCHAR', length: '255')
                ->addColumn(column: 'is_approved', type: 'TINYINT', length: '1')
                ->addIndex(indexName: 'account_id', indexes: ['account_id'])
                ->addIndex(indexName: 'is_approved', indexes: ['is_approved'])
            ;
        }
    }
}
