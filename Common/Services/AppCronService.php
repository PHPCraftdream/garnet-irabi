<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Services {
    use Aura\Cli\Stdio;
    use Aura\Cli\Stdio\Formatter;
    use Aura\SqlQuery\Common\SelectInterface;
    use PHPCraftdream\Garnet\Bundle\Modules\Email\FwEmailQueueService;
    use PHPCraftdream\Garnet\Bundle\Modules\Invite\FwInviteTokenService;
    use PHPCraftdream\Garnet\Kernel\Io\Cron\FwCronService;
    use PHPCraftdream\IRabi\Common\Tables\CronLog;
    use ReflectionClass;
    use RuntimeException;
    use Throwable;

    class AppCronService extends FwCronService {
        public static function registerTasks(): void {
            static::registerTask('email-queue', function (Stdio $stdio): int {
                return FwEmailQueueService::processQueue(50);
            }, 'Process email queue (send pending emails)');

            static::registerTask('complete-expired', function (Stdio $stdio): int {
                $stats = CronCompletionService::completeExpired(500);
                $stdio->outln("Completed: {$stats['slots']} slots, {$stats['bookings']} bookings");
                return array_sum($stats);
            }, 'Mark expired slots and bookings as completed');

            static::registerTask('disable-stale-tokens', function (Stdio $stdio): int {
                $stats = FwInviteTokenService::disableStale(500);
                $stdio->outln("Disabled tokens: {$stats['expired']} expired, {$stats['exhausted']} exhausted");
                return array_sum($stats);
            }, 'Disable expired and exhausted invite tokens');
        }

        public static function runAll(Stdio $stdio): int {
            static::registerTasks();
            $tasks = static::getTasks();
            $total = count($tasks);
            $success = 0;

            $stdio->outln("Running {$total} cron task(s)...");

            foreach ($tasks as $name => $task) {
                $stdio->out("  [{$name}] ... ");
                try {
                    $result = static::runWithLogging($name, $task['callback'], $stdio);
                    $stdio->outln('OK' . ($result !== null ? " ({$result})" : ''));
                    $success++;
                } catch (Throwable $e) {
                    $stdio->outln('ERROR: ' . $e->getMessage());
                }
            }

            $stdio->outln("Done: {$success}/{$total} tasks completed.");
            return $total - $success;
        }

        public static function runTask(string $taskName, Stdio $stdio): int {
            static::registerTasks();
            $tasks = static::getTasks();

            if (!isset($tasks[$taskName])) {
                $stdio->outln("Unknown task: {$taskName}");
                $stdio->outln('Available tasks: ' . implode(', ', array_keys($tasks)));
                return 1;
            }

            $stdio->out("Running task [{$taskName}] ... ");
            try {
                $result = static::runWithLogging($taskName, $tasks[$taskName]['callback'], $stdio);
                $stdio->outln('OK' . ($result !== null ? " ({$result})" : ''));
                return 0;
            } catch (Throwable $e) {
                $stdio->outln('ERROR: ' . $e->getMessage());
                return 1;
            }
        }

        /**
         * Запускает callback задачи, оборачивая его в логирование в ir_cron_log.
         *
         * @param callable $callback
         * @return mixed Возвращает то же, что и task callback (обычно int или null).
         * @throws Throwable Re-throws исключения, чтобы поведение CLI не менялось.
         */
        protected static function runWithLogging(string $taskName, callable $callback, Stdio $stdio): mixed {
            $log = CronLog::get();
            $startedAt = time();
            $startMicro = microtime(true);

            $captured = null;
            $usingCapture = $stdio instanceof CapturingStdio
                ? null
                : static::tryWrapStdio($stdio);

            $effectiveStdio = $usingCapture ?? $stdio;

            try {
                if ($effectiveStdio instanceof CapturingStdio) {
                    $effectiveStdio->resetBuffer();
                }
                $result = $callback($effectiveStdio);

                if ($effectiveStdio instanceof CapturingStdio) {
                    $captured = $effectiveStdio->getBuffer();
                }

                $finishedAt = time();
                $durationMs = (int)round((microtime(true) - $startMicro) * 1000);

                // Noise control: a minute-cron would otherwise flood the log with
                // thousands of identical "did nothing" rows. A no-op success
                // (task processed no work) is logged at most ONCE per UTC day per
                // task — a daily heartbeat that proves cron is alive — while runs
                // that actually did work, and all errors, are always recorded.
                $didWork = is_numeric($result) ? ((int)$result > 0) : ($result !== null);
                if (!$didWork && static::hasSuccessLogToday($log, $taskName, $startedAt)) {
                    return $result;
                }

                $log->insert([
                    'task_name' => $taskName,
                    'started_at' => $startedAt,
                    'finished_at' => $finishedAt,
                    'duration_ms' => $durationMs,
                    'status' => 'success',
                    'output' => $captured,
                    'error_message' => null,
                    'created_at' => $startedAt,
                ]);

                return $result;
            } catch (Throwable $e) {
                if ($effectiveStdio instanceof CapturingStdio) {
                    $captured = $effectiveStdio->getBuffer();
                }

                $finishedAt = time();
                $durationMs = (int)round((microtime(true) - $startMicro) * 1000);

                $log->insert([
                    'task_name' => $taskName,
                    'started_at' => $startedAt,
                    'finished_at' => $finishedAt,
                    'duration_ms' => $durationMs,
                    'status' => 'error',
                    'output' => $captured,
                    'error_message' => mb_substr($e->getMessage(), 0, 1024),
                    'created_at' => $startedAt,
                ]);

                throw $e;
            }
        }

        /**
         * True when a 'success' row already exists for this task within the
         * current UTC day — used to suppress duplicate no-op heartbeats.
         */
        protected static function hasSuccessLogToday(CronLog $log, string $taskName, int $now): bool {
            $dayStart = $now - ($now % 86400); // UTC midnight

            $rows = $log->selectAll(static function (SelectInterface $query) use ($taskName, $dayStart): void {
                $query->resetCols();
                $query->cols(['COUNT(*) as cnt']);
                $query->where('task_name = :task', ['task' => $taskName]);
                $query->where('status = :st', ['st' => 'success']);
                $query->where('created_at >= :ds', ['ds' => $dayStart]);
            });

            return (int)($rows[0]['cnt'] ?? 0) > 0;
        }

        /**
         * Пытается завернуть существующий Stdio в CapturingStdio, переиспользуя
         * его handles и formatter. Если это невозможно (например, fields private
         * в новой версии vendor) — возвращает null, и логирование ограничится
         * метаданными.
         */
        protected static function tryWrapStdio(Stdio $stdio): ?CapturingStdio {
            try {
                return new CapturingStdio(
                    $stdio->getStdin(),
                    $stdio->getStdout(),
                    $stdio->getStderr(),
                    static::extractFormatter($stdio),
                );
            } catch (Throwable) {
                return null;
            }
        }

        /**
         * Извлекает Formatter из Stdio. Поле protected, поэтому используем
         * рефлексию — это разовая операция per-cron-run.
         */
        protected static function extractFormatter(Stdio $stdio): Formatter {
            $ref = new ReflectionClass(Stdio::class);
            $prop = $ref->getProperty('formatter');
            $prop->setAccessible(true);
            $value = $prop->getValue($stdio);
            if (!$value instanceof Formatter) {
                throw new RuntimeException('Stdio formatter not accessible');
            }
            return $value;
        }
    }
}
