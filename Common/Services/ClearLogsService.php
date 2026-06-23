<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Services {
    use FilesystemIterator;
    use PHPCraftdream\IRabi\Common\Tables\AdminActionLog;
    use PHPCraftdream\IRabi\Common\Tables\CronLog;
    use PHPCraftdream\IRabi\Common\Tables\EntityHistory;
    use PHPCraftdream\IRabi\Common\Tables\MailLog;
    use PHPCraftdream\IRabi\Common\Tables\MailLogRecipients;
    use PHPCraftdream\IRabi\Common\Tables\SupportAssignmentLog;
    use PHPCraftdream\IRabi\IRabi;
    use RecursiveDirectoryIterator;
    use RecursiveIteratorIterator;
    use Throwable;

    /**
     * Wipes operational/diagnostic logs — the file journals (Errors / System /
     * Routes) and the log DB tables. Financial records (PaymentsLog) are NOT
     * touched: those are an audit trail, not a clearable log.
     *
     * Destructive; callers gate it behind test mode.
     */
    class ClearLogsService {
        /** @var array<string, class-string> label => table gateway class */
        private const LOG_TABLES = [
            'mail_log' => MailLog::class,
            'mail_log_recipients' => MailLogRecipients::class,
            'admin_action_log' => AdminActionLog::class,
            'cron_log' => CronLog::class,
            'support_assignment_log' => SupportAssignmentLog::class,
            'entity_history' => EntityHistory::class,
        ];

        /**
         * @return array{deleted: array<string, int>, total: int}
         */
        public static function clear(): array {
            $deleted = [];

            foreach (self::LOG_TABLES as $label => $cls) {
                try {
                    $table = $cls::get();
                    $count = (int)$table->getCount();
                    if ($count > 0) {
                        $table->getQueryEx()->ex('DELETE FROM ' . $table->getTableName());
                    }
                    $deleted[$label] = $count;
                } catch (Throwable) {
                    $deleted[$label] = 0;
                }
            }

            $deleted['log_files'] = self::clearLogFiles();

            return ['deleted' => $deleted, 'total' => array_sum($deleted)];
        }

        /**
         * Delete every file under WorkDir/LogJournal (Errors / System / Routes).
         * Directory tree is kept; the loggers recreate files on the next write.
         */
        private static function clearLogFiles(): int {
            $dir = rtrim(IRabi::getInstance()->workDir, '/\\') . DIRECTORY_SEPARATOR . 'LogJournal';
            if (!is_dir($dir)) {
                return 0;
            }

            $n = 0;
            try {
                $it = new RecursiveIteratorIterator(
                    new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS),
                    RecursiveIteratorIterator::CHILD_FIRST,
                );
                foreach ($it as $entry) {
                    if ($entry->isFile() && @unlink($entry->getPathname())) {
                        $n++;
                    }
                }
            } catch (Throwable) {
                // best-effort
            }
            return $n;
        }
    }
}
