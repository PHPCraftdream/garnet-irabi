<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Services {
    use Aura\SqlQuery\Common\SelectInterface;
    use PHPCraftdream\IRabi\Common\Tables\EmailAttempts;
    use PHPCraftdream\IRabi\Common\Tables\EmailQueue;
    use Throwable;

    /**
     * Recovers email_queue rows stuck in `sending` status after a
     * process crash (handover audit 09-email-notifications H-2).
     *
     * Background: FwEmailQueueService::processQueue() flips a row to
     * `sending`, then calls SMTP synchronously, then flips it to `sent`
     * or `error`. If the PHP process dies between the `sending` flip and
     * the final status (OOM, kill, fatal, server reboot, dropped DB
     * link), the row is stuck forever: processQueue only ever selects
     * `('queued','error')`, retry() is called by nobody, so the email is
     * silently lost — with no trace in email_attempts / mail_log either,
     * because the crash happens before logAttempt() runs.
     *
     * Why lock-based, not time-based: the audit recommendation is
     * "`sending` older than N minutes → error". That requires a column
     * recording WHEN the row entered `sending`. The framework's
     * email_queue table (FwEmailQueue) has only `created_at` (enqueue
     * time), NOT a send-start timestamp, and processQueue() — which
     * lives in vendor and cannot be patched here — does not write one.
     * Adding such a column alone would change nothing: there is no write
     * path to populate it. A time-based watchdog is therefore impossible
     * without modifying the framework, so this service deliberately does
     * NOT add such a column.
     *
     * This service instead leans on a guarantee the project already has:
     * the email-queue cron tick is serialised by a MySQL named advisory
     * lock (PHPCraftdream\Garnet\Kernel\Db\Link\NamedLock::tryAcquire()
     * in AppCronService, task #57). GET_LOCK is bound to the DB connection
     * (session): when the holder process crashes, its connection drops and
     * MySQL releases the lock automatically, so the next tick acquires it
     * fresh. The invariant this relies on: processQueue() is synchronous and
     * single-pass, so when it RETURNS normally every row it touched is
     * already out of `sending` (flipped to `sent` or `error`). Therefore
     * any row STILL in `sending` at the instant a freshly-acquired lock
     * proves there is no concurrent processQueue() running — is an
     * orphan from a CRASHED past run, not a legitimately in-flight send.
     * Recovering it unconditionally (no age threshold) is safe, because
     * a live send is physically impossible under the held lock.
     *
     * This is a correct workaround for the current schema, NOT a full
     * replacement for an honest updated_at/sending_at approach. If the
     * framework ever adds such a column AND a write path, the check here
     * can be tightened to also bound the age — but the lock invariant
     * alone is sufficient and race-free today.
     */
    class EmailWatchdogService {
        /**
         * Find every `sending` row and recover it as a failed attempt,
         * using the SAME status / attempts / backoff shape processQueue()
         * uses on a real SMTP failure — so a recovered row re-enters the
         * normal retry cycle, or reaches its terminal `error` once the
         * attempt budget is exhausted.
         *
         * MUST be called only while the caller holds EMAIL_QUEUE_LOCK
         * (AppCronService acquires it just before invoking this). That
         * lock is the correctness proof that every `sending` row found
         * here is an orphan; without it, this method could clobber a
         * genuinely in-flight send.
         *
         * @return array{recovered:int, items:array<int,array<string,mixed>>}
         *     recovered: how many rows were flipped out of `sending`.
         *     items: per-row detail {id, old_attempts, new_attempts,
         *     is_final} for cron logging.
         */
        public static function recoverStuckSending(): array {
            $queue = EmailQueue::get();

            $rows = $queue->selectAll(static function (SelectInterface $query): void {
                $query->where('status = ?', ['sending']);
                $query->orderBy(['id ASC']);
            });

            $items = [];

            foreach ($rows as $row) {
                $id = (int)($row['id'] ?? 0);
                $oldAttempts = (int)($row['attempts'] ?? 0);
                $maxAttempts = (int)($row['max_attempts'] ?? 0);

                $newAttempts = $oldAttempts + 1;
                $isFinal = $newAttempts >= $maxAttempts;

                // Same backoff as FwEmailQueueService::processQueue()'s
                // failure branch: delegates to the framework's own
                // backoffSeconds() (via EmailQueueBackoffExposer, since it
                // is protected static there) instead of duplicating the
                // BACKOFF_TIERS_SECONDS ladder here, so this can never
                // drift out of sync with the real formula again; NULL
                // when the attempt budget is exhausted.
                $nextAttemptAt = $isFinal ? null : time() + EmailQueueBackoffExposer::backoffSeconds($newAttempts);

                $queue->updateById([
                    'status' => 'error',
                    'attempts' => $newAttempts,
                    'next_attempt_at' => $nextAttemptAt,
                ], $id);

                static::logRecoveryAttempt($id, $newAttempts);

                $items[] = [
                    'id' => $id,
                    'old_attempts' => $oldAttempts,
                    'new_attempts' => $newAttempts,
                    'is_final' => $isFinal,
                ];
            }

            return ['recovered' => count($items), 'items' => $items];
        }

        /**
         * Best-effort email_attempts row marking this attempt as a
         * crash-recovery, not a live SMTP result. Mirrors the shape of
         * FwEmailQueueService::logAttempt() (private in vendor, so
         * unreachable from here) — the table insert itself is a
         * legitimate direct path with no validation bypassed (logAttempt
         * is just a bare insert). Wrapped in try/catch like the framework
         * version: a logging failure must never abort the recovery, the
         * status flip above is the load-bearing part.
         */
        private static function logRecoveryAttempt(int $queueId, int $attemptNumber): void {
            try {
                EmailAttempts::get()->insert([
                    'queue_id' => $queueId,
                    'attempt_number' => $attemptNumber,
                    'status' => 'error',
                    'error_message' => 'recovered by watchdog: process crashed mid-send',
                    'created_at' => time(),
                ]);
            } catch (Throwable) {
                // Best-effort: the recovery UPDATE has already succeeded.
            }
        }
    }
}
