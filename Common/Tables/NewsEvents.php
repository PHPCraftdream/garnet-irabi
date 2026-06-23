<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Tables {
    use PHPCraftdream\Garnet\Bundle\Modules\News\Tables\FwNewsEvents;
    use PHPCraftdream\Garnet\Kernel\Db\Tables\DbTableBuilderFactory;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Db\ITableBuilderDriver;

    class NewsEvents extends FwNewsEvents {
        protected string $tableName = 'news_events';

        public static function init(): ITableBuilderDriver {
            return DbTableBuilderFactory::newCreateTable(table: static::get())
                ->addIdColumn()
                ->addColumn(column: 'event_type', type: 'VARCHAR', length: '50')
                ->addColumn(column: 'audience_type', type: 'ENUM', length: "'broadcast','personal'")
                ->addColumn(column: 'audience_id', type: 'INT', length: '11', null: true)
                ->addColumn(column: 'actor_id', type: 'INT', length: '11', null: false)
                ->addColumn(column: 'target_key', type: 'VARCHAR', length: '64', null: true)
                ->addColumn(column: 'payload', type: 'TEXT', null: false)
                ->addColumn(column: 'created_at', type: 'INT', length: '11', null: false, default: '0')
                ->addIndex(indexName: 'audience', indexes: ['audience_type', 'audience_id'])
                ->addIndex(indexName: 'actor_id', indexes: ['actor_id'])
                ->addIndex(indexName: 'event_type', indexes: ['event_type'])
                ->addIndex(indexName: 'target_key', indexes: ['target_key'])
                ->addIndex(indexName: 'created_at', indexes: ['created_at'])
            ;
        }
    }
}
