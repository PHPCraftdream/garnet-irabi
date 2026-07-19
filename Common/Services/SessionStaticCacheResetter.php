<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Services {
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Session\Session;

    /**
     * App-level resetter for the framework Session process-static singleton.
     *
     * The framework's Session class holds a process-static singleton in a
     * protected static property (Session::$instance) that is NEVER cleared
     * between HTTP requests — it is sealed on first access via
     * Session::get() and reused for the lifetime of the PHP process. On the
     * current production infrastructure (php-cgi — one OS process per
     * request) this is benign because the process dies after every request
     * and the static dies with it. On any persistent-worker runtime
     * (php-fpm with reused workers, RoadRunner, Swoole, FrankenPHP, …)
     * the singleton sealed by the FIRST request served on a worker would
     * be served verbatim to every later request on the same worker,
     * leaking one user's session cookies / data / CSRF token into another
     * user's request — a confirmed account-takeover mechanism (handover
     * audit 04-concurrency-race-conditions.md, finding C-1 → L-3).
     *
     * This is the Session half of the "always clear first" companion to
     * WorkerScopeMiddleware (which already plays this exact defensive role
     * for the IniConfig runtime override). It is invoked as the first
     * executable statement in run_web.php, before ErrorCatcher::init /
     * IRabi construction / any middleware — anything that could lazily
     * populate the cache.
     *
     * Mechanism: this is a thin subclass that deliberately does NOT
     * redeclare the static property. In PHP a protected static property
     * that is not redeclared in a child occupies the SAME storage slot as
     * the parent's, so `static::$instance = null` here writes to exactly
     * the slot that Session::get() reads. The same late-static-binding
     * trick is already used in this project by
     * Common/Tables/AccountBalance (which overrides recalculate() and the
     * framework picks up the override via static::) — here it is applied
     * to the property itself rather than a method. No existing call to
     * Session::get() / Session::touchCSRF_() / Session::peekCSRF_()
     * anywhere in the codebase needs to change.
     *
     * This class MUST NOT be instantiated or used as a Session replacement
     * — it exists solely as a carrier for the reset() method.
     */
    abstract class SessionStaticCacheResetter extends Session {
        /**
         * Clear the cached Session singleton. Safe to call on a process
         * that has never populated the cache (clearing null is null);
         * required at the start of every web request so a reused worker
         * process cannot serve request N>1 the session data it sealed
         * during request 1.
         */
        public static function reset(): void {
            static::$instance = null;
        }
    }
}
