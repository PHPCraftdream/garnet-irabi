<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Services {
    use PHPCraftdream\Garnet\Kernel\Db\Query\QueryEx;

    /**
     * Thin wrapper around MySQL named advisory locks (GET_LOCK /
     * RELEASE_LOCK) for serialising app-level work the framework does
     * not itself guard against overlapping runs.
     *
     * Why this exists: FwEmailQueueService::processQueue() does a plain
     * SELECT-then-UPDATE loop with no row-level claim on each email, so
     * two overlapping cron ticks of the `email-queue` task can both
     * SELECT the same queued row before either marks it `sending`, and
     * both deliver it. The framework cannot be patched here (vendor), so
     * we instead serialise the whole processQueue() call per cron tick
     * with a single named lock held for the duration of the run.
     *
     * Unlike AccountBalance::acquireLock() — which waits up to 10s for a
     * money operation and throws on timeout — the default here is a
     * non-blocking probe: callers that merely want to skip a duplicate
     * run (overlapping cron ticks) pass $timeoutSec = 0 and branch on the
     * bool result instead of blocking or throwing. The next cron tick
     * retries a few seconds later.
     *
     * Reentrancy: GET_LOCK is reentrant per connection — a second
     * GET_LOCK of the same name by the SAME link returns 1 and bumps a
     * hold count; a DIFFERENT connection gets 0 immediately at
     * $timeoutSec = 0. The framework's DbPool reuses a single free link
     * for every synchronous query in a request (DbPool::getLink), and
     * processQueue() runs only synchronous queries, so tryAcquire() and
     * release() bracket the queue work on the same connection that
     * performed it — the lock covers the whole bracketed section and is
     * also freed automatically when the CLI connection closes at process
     * exit. Two overlapping `php garnet cron email-queue` invocations are
     * two separate PHP processes with two separate links, so they contend
     * on the named lock exactly as intended.
     */
    class NamedLock {
        /**
         * Try to acquire a named advisory lock.
         *
         * @param int $timeoutSec Seconds to wait; 0 = never block, return
         *                        false immediately if another connection
         *                        holds the lock.
         * @return bool true only when GET_LOCK returned 1 (lock acquired).
         *              false on timeout (0) or a deadlock error (-1).
         */
        public static function tryAcquire(string $name, int $timeoutSec = 0): bool {
            $rows = QueryEx::get()->exFetch('SELECT GET_LOCK(?, ?) AS lk', [$name, $timeoutSec]);

            if (!is_array($rows)) {
                return false;
            }

            $first = $rows[0] ?? null;

            return is_array($first) && (int)($first['lk'] ?? null) === 1;
        }

        /**
         * Release a lock previously acquired by tryAcquire(). Safe to
         * call when no lock is held — RELEASE_LOCK returns NULL then,
         * which we discard.
         */
        public static function release(string $name): void {
            QueryEx::get()->ex('SELECT RELEASE_LOCK(?)', [$name]);
        }
    }
}
