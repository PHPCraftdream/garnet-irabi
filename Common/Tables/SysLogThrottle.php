<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Tables {
    use PHPCraftdream\Garnet\Kernel\Db\Tables\DbTable;
    use PHPCraftdream\Garnet\Kernel\Db\Tables\DbTableBuilderFactory;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Db\ITableBuilderDriver;

    /**
     * Per-IP fixed-window counter for the public /sys/log breadcrumb endpoint.
     *
     * One row per client IP; `window_start` marks the current minute bucket and
     * `cnt` how many log writes landed in it. Both are reset atomically on the
     * first request of a new window (see SysLogController). Purely a cheap
     * anti-spam guard — rows are self-recycling (overwritten every window), so
     * there is no unbounded growth and no retention job is required.
     */
    class SysLogThrottle extends DbTable {
        protected string $tableName = 'sys_log_throttle';
        protected string $primaryKey = 'id';

        public static function init(): ITableBuilderDriver {
            return DbTableBuilderFactory::newCreateTable(table: static::get())
                ->addIdColumn()
                ->addColumn(column: 'ip',           type: 'VARCHAR', length: '45', null: false)
                ->addColumn(column: 'window_start',  type: 'INT', length: '11', null: false, default: '0')
                ->addColumn(column: 'cnt',           type: 'INT', length: '11', null: false, default: '0')
                ->addIndex(indexName: 'ip', indexes: ['ip'], type: 'UNIQUE')
            ;
        }
    }
}
