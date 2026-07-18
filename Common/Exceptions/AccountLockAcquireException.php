<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Exceptions {
    use RuntimeException;

    /**
     * Thrown when AccountBalance::withAccountLock() cannot acquire the
     * per-account advisory lock within the timeout — i.e. another request
     * is mid-flight on the same account's money operations. Callers must
     * surface this to the client as a retryable 503 and never fall back to
     * the unprotected path, which would reopen the H-1 race window.
     */
    class AccountLockAcquireException extends RuntimeException {
        public function __construct(string $lockName, int $timeout) {
            parent::__construct(
                "Could not acquire account balance lock '{$lockName}' within {$timeout}s",
            );
        }
    }
}
