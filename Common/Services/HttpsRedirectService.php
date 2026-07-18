<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Services {
    /**
     * Pure, side-effect-free HTTPS redirect + HSTS policy for the app.
     *
     * Lives as a pure function so it can be exercised without a TLS stand:
     * this project has no PHPUnit/Kahlan harness for app-level code, only
     * Playwright e2e against a dev server that is always `isDev=true` over
     * plain HTTP by design. A direct `php -r "require ...; var_dump(...);"`
     * call against this class verifies every input combination offline.
     *
     * Wired in run_web.php as a defense-in-depth layer on top of whatever
     * the hosting panel / nginx is configured to do — it never conflicts
     * with a hosting-level redirect (this code only fires when the request
     * actually reaches PHP, and an upstream redirect would have prevented
     * that), and never runs in dev so the local `php garnet serve` /
     * Playwright stack on plain HTTP is left untouched.
     */
    class HttpsRedirectService {
        /**
         * HSTS header value sent on every HTTPS response in production.
         *
         * max-age=31536000 is one year (the value recommended by RFC 6797
         * §6.2). includeSubDomains pins the policy to all subdomains of
         * the host — every IRabi subdomain serves over the same cert, so
         * there is no narrower scope worth configuring.
         *
         * `preload` is intentionally NOT appended: opting into the HSTS
         * preload list is a one-way, host-wide decision that has to be
         * done through the submission form at hstspreload.org and requires
         * the domain owner's explicit action — it doesn't belong in code.
         */
        public const HSTS_HEADER = 'Strict-Transport-Security: max-age=31536000; includeSubDomains';

        /**
         * Decide whether the request was already served over HTTPS.
         *
         * "HTTPS" can be signalled by EITHER the direct `$_SERVER['HTTPS']`
         * server variable OR a reverse-proxy header (X-Forwarded-Proto:
         * https / X-Forwarded-Ssl: on). The latter matters when the app
         * sits behind a CDN or a TLS-terminating proxy that does not set
         * the `HTTPS` FastCGI param — without consulting the proxy header
         * a behind-CDN deployment would look "plaintext" forever and
         * redirect-loop against itself.
         *
         * The legacy `'off'` value comes from ancient CGI setups where
         * the variable was always present and equal to 'off' on HTTP —
         * it must NOT count as HTTPS.
         */
        public static function isHttps(array $server): bool {
            $https = (string)($server['HTTPS'] ?? '');
            if ($https !== '' && strcasecmp($https, 'off') !== 0) {
                return true;
            }

            $forwardedProto = strtolower((string)($server['HTTP_X_FORWARDED_PROTO'] ?? ''));
            if ($forwardedProto === 'https') {
                return true;
            }

            $forwardedSsl = strtolower((string)($server['HTTP_X_FORWARDED_SSL'] ?? ''));
            if ($forwardedSsl === 'on') {
                return true;
            }

            return false;
        }

        /**
         * Return the https:// URL the current request should be 301-ed to,
         * or null when no redirect should happen.
         *
         * Returns null (do not redirect) when:
         *   - $isDev is true — the local dev server / Playwright stack is
         *     plain HTTP by design. Tying the redirect to anything other
         *     than this flag would lock the dev stack in a redirect loop.
         *   - the request already arrived over HTTPS — nothing to upgrade.
         *   - no HTTP_HOST is present (CLI / malformed env) — safest to
         *     no-op rather than guess a destination from SERVER_NAME,
         *     which is more often misconfigured than not behind proxies.
         *
         * Preserves the original path AND query string via REQUEST_URI,
         * which PHP populates verbatim from the request line — including
         * any `?id=…` / anchor-style fragments the router depends on.
         */
        public static function redirectTarget(array $server, bool $isDev): ?string {
            if ($isDev) {
                return null;
            }

            if (static::isHttps($server)) {
                return null;
            }

            $host = (string)($server['HTTP_HOST'] ?? '');
            if ($host === '') {
                return null;
            }

            $requestUri = (string)($server['REQUEST_URI'] ?? '');
            if ($requestUri === '') {
                $requestUri = '/';
            }

            return 'https://' . $host . $requestUri;
        }
    }
}
