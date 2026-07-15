<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Foreground\Controllers {
    use PHPCraftdream\Garnet\Kernel\Core\FrameworkController;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\Account;
    use PHPCraftdream\Garnet\Kernel\Interfaces\IGlobalReqParams;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Router\IRouterUriParams;
    use PHPCraftdream\Garnet\Kernel\Io\Logs\Logger;
    use PHPCraftdream\Garnet\Kernel\Io\Router\ControllerTools;
    use PHPCraftdream\IRabi\Common\Tables\SysLogThrottle;
    use Throwable;

    /**
     * Public, no-CSRF endpoint that lets the frontend post diagnostic
     * checkpoints to a server-side log file. Sister to /js-error/~report,
     * but for non-error breadcrumbs (e.g. auth-magic flow tracing) — the
     * JS-error pipeline is meant for actual exceptions and dedupes by
     * message signature, which breaks for repeated low-cardinality
     * events.
     *
     * Lines land in `WorkDir/LogJournal/System/<date>/APP_LOGGER-fe-<cat>.log`,
     * one JSON record per line. Pull them with `php garnet log-tail fe-<cat>`
     * (locally) or `php garnet remote-log-tail fe-<cat>` (against prod).
     *
     * Hardening:
     *   - `cat` is whitelisted to ASCII word chars + `-`, capped at 32 chars
     *   - `msg` and `meta` capped at 1 KB each (cheap DoS guard)
     *   - silently no-ops when the APP_LOGGER isn't bound — safe even
     *     before the app bootstraps the journal directories
     */
    class SysLogController extends FrameworkController {
        public const URL = '/sys/log';

        private const MAX_CAT_LEN = 32;
        private const MAX_MSG_LEN = 1024;
        private const MAX_META_LEN = 1024;

        // Per-IP fixed-window rate limit (finding F-LOG-01): at most
        // RATE_MAX_PER_WINDOW breadcrumb writes per RATE_WINDOW_SEC-second bucket
        // per client IP. Generous enough for legitimate diagnostic tracing, tight
        // enough to blunt unauthenticated log-spam / disk-growth abuse.
        private const RATE_WINDOW_SEC = 60;
        private const RATE_MAX_PER_WINDOW = 60;

        public static function post__log(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            $cat = (string)$globals->readPostValue('cat', '');
            $msg = (string)$globals->readPostValue('msg', '');
            $meta = (string)$globals->readPostValue('meta', '');

            // Sanitise cat: ASCII word chars + dash only, single segment.
            $cat = trim($cat);
            if ($cat === '' || strlen($cat) > self::MAX_CAT_LEN || preg_match('~^[A-Za-z0-9_\-]+$~', $cat) !== 1) {
                return ControllerTools::JSON(['ok' => false, 'error' => 'invalid_cat'], status: 400);
            }

            if ($msg === '') {
                return ControllerTools::JSON(['ok' => false, 'error' => 'invalid_msg'], status: 400);
            }

            if (self::isRateLimited((string)$globals->ip())) {
                return ControllerTools::JSON(['ok' => false, 'error' => 'rate_limited'], status: 429);
            }

            $msg = mb_substr($msg, 0, self::MAX_MSG_LEN);
            $meta = $meta !== '' ? mb_substr($meta, 0, self::MAX_META_LEN) : '';

            try {
                $logger = Logger::silentGet(Logger::SYSTEM_LOGGER);
                if ($logger === null) {
                    // No logger bound yet — silently accept the breadcrumb
                    // (the caller never wants to surface a 5xx for tracing).
                    return ControllerTools::JSON(['ok' => true, 'dropped' => 'no_logger'], status: 200);
                }

                $payload = [
                    't' => time(),
                    'cat' => $cat,
                    'msg' => $msg,
                    'meta' => $meta,
                    'uid' => Account::fromSession()?->id() ?? 0,
                    'ip' => (string)$globals->ip(),
                    'ua' => mb_substr((string)$globals->readServerValue('HTTP_USER_AGENT', ''), 0, 256),
                ];
                $line = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                if ($line === false) {
                    return ControllerTools::JSON(['ok' => false, 'error' => 'encode_failed'], status: 500);
                }

                $logger->append('fe-' . $cat, $line);
            } catch (Throwable) {
                // Logging must never break the caller.
                return ControllerTools::JSON(['ok' => false], status: 200);
            }

            return ControllerTools::JSON(['ok' => true], status: 200);
        }

        /**
         * Per-IP fixed-window rate check. Atomically bumps the caller's counter
         * for the current minute bucket and reports whether it now exceeds the
         * cap. Fail-open by design: an empty/unknown IP or any DB error never
         * blocks a legitimate breadcrumb — rate limiting is best-effort spam
         * mitigation, not an auth gate.
         */
        private static function isRateLimited(string $ip): bool {
            $ip = trim($ip);
            if ($ip === '') {
                return false;
            }

            try {
                $now = time();
                $window = $now - ($now % self::RATE_WINDOW_SEC);
                $table = SysLogThrottle::get()->getTableName();

                // On a new window reset cnt to 1, otherwise increment in place —
                // single atomic upsert, no read-modify-write race.
                SysLogThrottle::get()->getQueryEx()->ex(
                    "INSERT INTO `{$table}` (ip, window_start, cnt)
                     VALUES (?, ?, 1)
                     ON DUPLICATE KEY UPDATE
                        cnt = IF(window_start = VALUES(window_start), cnt + 1, 1),
                        window_start = VALUES(window_start)",
                    [$ip, $window]
                );

                $row = SysLogThrottle::get()->selectOneByField('ip', $ip);
                return $row !== null && (int)$row['cnt'] > self::RATE_MAX_PER_WINDOW;
            } catch (Throwable) {
                return false;
            }
        }
    }
}
