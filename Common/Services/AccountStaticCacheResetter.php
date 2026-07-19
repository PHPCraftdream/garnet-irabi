<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Services {
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\Account;

    /**
     * App-level resetter for the framework Account process-static caches.
     *
     * Mirrors SessionStaticCacheResetter for the two caches the framework's
     * Account class holds in protected static properties:
     *   - Account::$items          — per-login Account instance map, filled
     *                                by Account::get() and never cleared.
     *   - Account::$sessionAccount — the Account bound to the current
     *                                request's session, filled by
     *                                Account::fromSession() and never
     *                                cleared.
     * Both carry the same cross-request leakage risk as Session::$instance
     * on any persistent-worker runtime (php-fpm / RoadRunner / Swoole /
     * FrankenPHP) and the same "always clear first" fix. See
     * SessionStaticCacheResetter's docblock for the full rationale and
     * run_web.php for the call site.
     *
     * Not redeclaring the statics keeps the parent's storage —
     * `static::$items = []` / `static::$sessionAccount = null` here write
     * to exactly the slots that Account::get() / Account::fromSession()
     * read, so no existing call site needs to change.
     *
     * This class MUST NOT be instantiated or used as an Account replacement
     * — it exists solely as a carrier for the reset() method.
     */
    abstract class AccountStaticCacheResetter extends Account {
        /**
         * Clear both Account caches: the session-bound Account and the
         * per-login instance map. Safe on a cold process (clearing null /
         * [] is a no-op); required at the start of every web request so
         * a reused worker never serves one user's Account into another
         * user's request.
         */
        public static function reset(): void {
            static::$items = [];
            static::$sessionAccount = null;
        }
    }
}
