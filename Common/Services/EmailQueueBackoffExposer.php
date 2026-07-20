<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Services {
    use PHPCraftdream\Garnet\Bundle\Modules\Email\FwEmailQueueService;

    /**
     * App-level exposer for the framework's protected static
     * FwEmailQueueService::backoffSeconds().
     *
     * Mirrors the SessionStaticCacheResetter / AccountStaticCacheResetter
     * pattern (late-static-binding subclass) but for a protected static
     * METHOD rather than a property: a thin subclass adds a public static
     * wrapper that calls the inherited protected static method via
     * `static::` — legal because the call happens from inside a subclass
     * of the declaring class, which is exactly what "protected" grants.
     *
     * Why this exists: EmailWatchdogService::recoverStuckSending() must
     * compute the same next_attempt_at backoff that
     * FwEmailQueueService::processQueue()'s failure branch uses, so a
     * watchdog-recovered row re-enters the identical retry cadence a
     * live SMTP failure would have produced. Hand-duplicating the
     * BACKOFF_TIERS_SECONDS ladder (or the tier-lookup arithmetic) here
     * would silently drift out of sync the next time the framework
     * tunes its backoff strategy — which is exactly what happened to the
     * old linear-formula comment this class replaces. Exposing the real
     * method instead makes drift impossible: there is exactly one
     * implementation of "what does attempt N wait before retrying".
     *
     * This class MUST NOT be instantiated or used as an
     * FwEmailQueueService replacement (no setTableClasses() is ever
     * called on it) — it exists solely as a carrier for backoffSeconds().
     */
    abstract class EmailQueueBackoffExposer extends FwEmailQueueService {
        /**
         * Public passthrough to the inherited protected static
         * backoffSeconds($attemptNumber). Same contract as the framework
         * method: $attemptNumber is 1-based (1 = first failure), and the
         * return value is the delay in seconds before the next retry,
         * per FwEmailQueueService::BACKOFF_TIERS_SECONDS.
         */
        public static function backoffSeconds(int $attemptNumber): int {
            return parent::backoffSeconds($attemptNumber);
        }
    }
}
