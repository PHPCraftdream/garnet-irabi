<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Tables {
    use PHPCraftdream\Garnet\Bundle\Modules\Balance\Tables\FwAccountBalance;
    use PHPCraftdream\Garnet\Bundle\Modules\Balance\Tables\FwBalanceLedger;
    use PHPCraftdream\Garnet\Kernel\Db\Link\NamedLock;
    use PHPCraftdream\Garnet\Kernel\Exceptions\DbException;
    use PHPCraftdream\Garnet\Kernel\Io\ErrorCatcher\ErrorCatcher;
    use PHPCraftdream\Garnet\Kernel\Io\Logs\Logger;
    use PHPCraftdream\IRabi\Common\Exceptions\AccountLockAcquireException;
    use Throwable;

    class AccountBalance extends FwAccountBalance {
        protected string $tableName = 'account_balance';

        /** Seconds to wait for the per-account advisory lock before giving up. */
        public const LOCK_TIMEOUT_SECONDS = 10;

        protected static function ledgerTable(): FwBalanceLedger {
            return BalanceLedger::get();
        }

        /**
         * Serialise money operations on a single account with a named MySQL
         * advisory lock (GET_LOCK / RELEASE_LOCK).
         *
         * Why: the framework replaces SQL transactions with idempotent CAS
         * updates. Debit flows first apply a transient CAS-debit to the
         * cached balance, then insert ledger rows, then recalculate() the
         * cache from the ledger. While that transient debit is in flight, a
         * concurrent recalculate() (top-up, refund, admin adjustment, or the
         * finally-block of a parallel booking) recomputes the cache from a
         * ledger in which the debit is still missing — resurrecting the
         * already-spent money, defeating the overdraft guard of the next
         * CAS-debit and letting the balance go negative (handover audit 03,
         * finding H-1).
         *
         * Serialising the whole critical section per account closes the
         * window: a concurrent recalculate() now blocks until the debit's
         * ledger row exists and the owning request has released the lock.
         *
         * Reentrancy: GET_LOCK is reentrant per connection — a second
         * GET_LOCK of the same name by the same mysqli link returns
         * immediately and increments a hold count; RELEASE_LOCK decrements
         * it. The framework's DbPool reuses a single free link for every
         * synchronous query in a request (DbPool::getLink /
         * DbMySQLiLink::query), and the debit critical sections in the
         * controllers run only synchronous queries, so the connection that
         * acquired the lock here is the same connection the closure runs
         * on. A nested withAccountLock() / recalculate() for the same
         * account is therefore acquired reentrantly and cannot deadlock.
         *
         * @template T
         * @param callable(): T $fn
         * @return T
         * @throws AccountLockAcquireException when the lock cannot be acquired within $timeout
         */
        public static function withAccountLock(int $accountId, callable $fn, int $timeout = self::LOCK_TIMEOUT_SECONDS): mixed {
            $lockName = self::lockNameFor($accountId);

            try {
                if (!self::acquireLock($lockName, $timeout)) {
                    throw new AccountLockAcquireException($lockName, $timeout);
                }

                return $fn();
            } finally {
                self::releaseLock($lockName);
            }
        }

        /**
         * Acquire the per-account advisory lock without a closure. For sites
         * that already have their own try/finally around the critical section
         * (SlotsController::post__book): call this before the section and
         * releaseAccountLock() in its finally. Composes reentrantly with
         * withAccountLock() and the overridden recalculate().
         *
         * @throws AccountLockAcquireException when the lock cannot be acquired within $timeout
         */
        public static function acquireAccountLock(int $accountId, int $timeout = self::LOCK_TIMEOUT_SECONDS): void {
            $lockName = self::lockNameFor($accountId);

            if (!self::acquireLock($lockName, $timeout)) {
                throw new AccountLockAcquireException($lockName, $timeout);
            }
        }

        /**
         * Release a lock previously acquired by acquireAccountLock() (or a
         * reentrant hold from withAccountLock()). Safe to call when no lock
         * is held — RELEASE_LOCK simply returns NULL in that case.
         */
        public static function releaseAccountLock(int $accountId): void {
            self::releaseLock(self::lockNameFor($accountId));
        }

        /**
         * Serialise every recalculate() per account too.
         *
         * This closes the race for paths that mutate the ledger without an
         * explicit withAccountLock() wrapper (FwBalanceLedger::addEntry()
         * called from top-up / refund / admin flows): a recalculate running
         * inside another request's debit critical section now waits for that
         * section's lock and can no longer recompute the cache from a ledger
         * that misses an in-flight debit. When the current connection
         * already holds the lock (the caller wrapped the section in
         * withAccountLock()), GET_LOCK returns reentrantly and immediately.
         */
        public static function recalculate(int $accountId): void {
            static::withAccountLock(
                $accountId,
                static function () use ($accountId): void {
                    parent::recalculate($accountId);
                },
            );
        }

        protected static function lockNameFor(int $accountId): string {
            return 'irabi_bal_' . $accountId;
        }

        /**
         * @return bool true only when GET_LOCK returned 1 (lock acquired)
         */
        protected static function acquireLock(string $name, int $timeout): bool {
            try {
                return NamedLock::acquire($name, $timeout);
            } catch (DbException) {
                return false;
            }
        }

        /**
         * Release a named advisory lock, never letting a release failure
         * escape to the caller.
         *
         * withAccountLock() calls this from its finally block, and
         * releaseAccountLock() is called from SlotsController::post__book's
         * own finally — in both places an exception thrown here would
         * REPLACE the critical section's real outcome (PHP finally
         * semantics): a successful booking result would turn into an
         * uncaught 500 despite its writes being committed, or a real
         * business exception would be silently masked by the release
         * error. NamedLock::release() does throw DbException on genuine
         * state errors (lock stolen on the owning connection, drain
         * deadline timeouts), so the failure mode is real.
         *
         * Swallowing is safe specifically because the lock is not
         * permanently leaked: MySQL auto-releases every named lock when
         * its owning connection closes (see NamedLock's docblock), so a
         * failed RELEASE_LOCK at worst delays the release until
         * connection teardown — an acceptable degradation next to
         * masking a committed money-path result or a root-cause
         * exception. Log loudly instead.
         */
        protected static function releaseLock(string $name): void {
            try {
                NamedLock::release($name);
            } catch (Throwable $e) {
                try {
                    Logger::get(Logger::ERROR_LOGGER)->write(
                        'account_lock_release',
                        "Failed to release account lock '{$name}': " . ErrorCatcher::getExceptionStrResult($e),
                    );
                } catch (Throwable) {
                    // Logger unavailable — nothing more to do; never let
                    // logging break the caller's real result/exception.
                }
            }
        }
    }
}
