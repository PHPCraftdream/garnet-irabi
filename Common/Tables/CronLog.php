<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Tables {
    use PHPCraftdream\Garnet\Bundle\Modules\Cron\Tables\FwCronLog;

    /**
     * IRabi-prefixed cron log. Schema and reader/writer semantics live
     * in the abstract parent; this subclass only pins the table name.
     */
    class CronLog extends FwCronLog {
        protected string $tableName = 'cron_log';
    }
}
