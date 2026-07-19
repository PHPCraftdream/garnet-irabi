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
        /**
         * Named MySQL advisory lock serialising overlapping email-queue
         * cron ticks. See NamedLock for why processQueue() needs this
         * external guard (its SELECT-then-UPDATE loop has no per-row
         * claim, so two concurrent runs would both deliver the same
         * email). Two cron ticks are two CLI processes, hence two DB
         * connections — they contend on this lock across processes.
         */
        public const EMAIL_QUEUE_LOCK = 'irabi_email_queue';

        /**
         * Named MySQL advisory lock serialising overlapping finance-audit
         * cron ticks. The audit is read-only, but two concurrent ticks
         * would both walk the same tables and double-log the same
         * discrepancy counts; the lock keeps the per-tick output coherent
         * and matches the audit's §4 recommendation (GET_LOCK around the
         * reconciliation). Non-blocking: a tick that finds a prior tick
         * still alive skips entirely rather than waiting.
         */
        public const FINANCE_AUDIT_LOCK = 'irabi_finance_audit';

        public static function registerTasks(): void {
            static::registerTask('email-queue', function (Stdio $stdio): int {
                if (!NamedLock::tryAcquire(self::EMAIL_QUEUE_LOCK)) {
                    $stdio->outln('email-queue: previous run still active, skipping');

                    return 0;
                }

                try {
                    // First recover rows stuck in `sending` from a past
                    // cron tick whose process crashed mid-send (audit
                    // 09-email H-2). The freshly-acquired lock above is
                    // the proof that every `sending` row is an orphan —
                    // see EmailWatchdogService for the invariant. Order
                    // matters: clean up orphans BEFORE letting
                    // processQueue() re-select, so a recovered row with a
                    // future next_attempt_at is correctly skipped this
                    // tick and retried on a later one.
                    $recovery = EmailWatchdogService::recoverStuckSending();
                    if ($recovery['recovered'] > 0) {
                        $stdio->outln(sprintf(
                            'email-watchdog: recovered %d stuck sending email(s)',
                            $recovery['recovered'],
                        ));
                    }

                    // Add recovered to the return so a crash-recovery tick
                    // is always recorded in cron_log (didWork), even when
                    // processQueue itself had nothing to send afterwards.
                    return FwEmailQueueService::processQueue(50) + $recovery['recovered'];
                } finally {
                    NamedLock::release(self::EMAIL_QUEUE_LOCK);
                }
            }, 'Process email queue (send pending emails)');

            static::registerTask('complete-expired', function (Stdio $stdio): int {
                $stats = CronCompletionService::completeExpired(500);
                $stdio->outln(
                    "Completed: {$stats['slots']} slots, {$stats['bookings']} bookings"
                    . ", {$stats['pending_expired']} pending-expired"
                );
                return array_sum($stats);
            }, 'Mark expired slots and bookings as completed');

            static::registerTask('disable-stale-tokens', function (Stdio $stdio): int {
                $stats = FwInviteTokenService::disableStale(500);
                $stdio->outln("Disabled tokens: {$stats['expired']} expired, {$stats['exhausted']} exhausted");
                return array_sum($stats);
            }, 'Disable expired and exhausted invite tokens');

            static::registerTask('db-backup', static function (Stdio $stdio): int {
                // Daily DB snapshot + 7-day/4-week retention + best-effort
                // off-site upload. See DbBackupCronTask for the full policy;
                // the local backup is the load-bearing step and the only one
                // that can fail the tick — retention and off-site are soft.
                return DbBackupCronTask::run($stdio);
            }, 'Daily DB backup with 7-day + 4-week retention and optional off-site upload');

            static::registerTask('log-rotation', static function (Stdio $stdio): int {
                // 1-year retention for both the WorkDir/LogJournal file
                // journals and the operational log tables — mirrors the
                // privacy-policy promise (docs/handover-audit/01-legal-
                // compliance.md F-05, required for 152-ФЗ). See
                // LogRotationCronTask for the full policy; per-category
                // and per-table failures are soft (logged, not thrown)
                // so a partial schema or a missing dir never aborts the
                // whole tick.
                return LogRotationCronTask::run($stdio);
            }, 'Prune file journals and log tables older than 1 year (privacy policy F-05)');

            static::registerTask('session-retention', static function (Stdio $stdio): int {
                // The last unpurgeable slice of F-05: the framework
                // session/session_data tables. The file journals and six
                // log tables above are covered by log-rotation (task
                // #60); the session tables — which carry consent
                // timestamps, auth_login links and other personal-data-
                // derived params — were never pruned before this task.
                // Same 365-day inactivity window as log-rotation for a
                // uniform 1-year retention policy. No NamedLock: this is
                // a read-then-delete on an age slice, so an overlapping
                // tick at worst finds nothing left on the second pass.
                // Failures are soft (reported, not thrown).
                return SessionRetentionCronTask::run($stdio);
            }, 'Prune session and session_data rows inactive for over 1 year (privacy policy F-05)');

            static::registerTask('finance-audit', static function (Stdio $stdio): int {
                // Read-only reconciliation of account_balance vs
                // balance_ledger (handover audit 03, finding H-4, §4).
                // Detection only — repair is a separate human-gated
                // command. Skips entirely when a prior tick is still
                // alive (non-blocking lock) so overlapping cron ticks
                // never double-walk the tables. Output lands in cron_log
                // via the wrapping CapturingStdio — the per-category
                // counts are the useful signal; 0 across the board is
                // the expected healthy-state result every tick.
                if (!NamedLock::tryAcquire(self::FINANCE_AUDIT_LOCK)) {
                    $stdio->outln('finance-audit: previous run still active, skipping');

                    return 0;
                }

                try {
                    $report = BalanceReconciliationService::runAll();
                } finally {
                    NamedLock::release(self::FINANCE_AUDIT_LOCK);
                }

                // Aggregate discrepancy count across every category: the
                // idempotency-index smoke contributes 1 when the index is
                // missing (a structural breach), 0 otherwise.
                $mismatch =
                    $report['cache_vs_ledger']['count']
                    + $report['booking_pairing']['count']
                    + $report['orphans']['count']
                    + $report['global_zero']['count']
                    + $report['negatives']['count']
                    + ($report['idempotency_index']['present'] ? 0 : 1);

                $stdio->outln(sprintf(
                    'finance-audit: cache_vs_ledger=%d booking_pairing=%d orphans=%d'
                    . ' global_zero_breach=%d negatives=%d idempotency_index=%s',
                    $report['cache_vs_ledger']['count'],
                    $report['booking_pairing']['count'],
                    $report['orphans']['count'],
                    $report['global_zero']['count'],
                    $report['negatives']['count'],
                    $report['idempotency_index']['present'] ? 'ok' : 'MISSING',
                ));

                // The cron tick itself must not fail on discovered
                // discrepancies — that would mark every subsequent tick
                // as an error until repair, drowning the per-category
                // counts in cron_log noise. Return the mismatch count
                // (a non-zero "did work" signal to the cron logger so
                // this tick always gets a row even on a clean run).
                return $mismatch;
            }, 'Reconcile account_balance vs balance_ledger (read-only, audit H-4)');
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
