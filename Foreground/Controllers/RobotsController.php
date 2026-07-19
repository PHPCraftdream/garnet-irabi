<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Foreground\Controllers {
    use PHPCraftdream\Garnet\Kernel\Core\FrameworkController;
    use PHPCraftdream\Garnet\Kernel\Interfaces\IGlobalReqParams;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Router\IRouterUriParams;
    use PHPCraftdream\Garnet\Kernel\Io\IniConfig\AppConfig;
    use PHPCraftdream\Garnet\Kernel\Io\IniConfig\IniConfig;
    use PHPCraftdream\Garnet\Kernel\Io\Router\ControllerTools;

    /**
     * Serves /robots.txt at the domain root (no /system prefix).
     *
     * Public, no-auth GET endpoint registered with the $maintenanceOnly
     * middleware chain (same as SysLogController / FwJsErrorLogController)
     * and declared as a no-prefix path via
     * {@see \PHPCraftdream\Garnet\Kernel\Io\Router\RouterUriParams::registerNoPrefixPath()}
     * so crawlers find it at the absolute /robots.txt path the robots
     * protocol mandates.
     *
     * Why a dedicated controller (and a sibling SitemapController) instead
     * of a single SeoController with two methods: the Garnet router maps a
     * controller class to one URL const and derives the method from the
     * `~suffix` in the request path. /robots.txt and /sitemap.xml are two
     * unrelated root paths that share no prefix, so they cannot both reach
     * distinct named methods on one controller. The framework's own
     * convention for distinct public endpoints is distinct controllers
     * (SysLogController, SysOpcacheResetController, FwJsErrorLogController).
     *
     * Policy:
     *   - Allow: /              — index everything.
     *   - Disallow: /system/    — the whole app surface (bookings, balance,
     *     IM, dashboard, dev-login, sys/* diagnostic endpoints) sits under
     *     the /system route prefix. None of those are content pages worth
     *     indexing; several expose personal/account data when crawled. The
     *     only indexable public surfaces are the bare landing (/) and the
     *     CMS pages (/page/view~slug), both served without the prefix.
     *   - Sitemap: <absolute>/sitemap.xml — absolute URL built from
     *     app.ini base_url so the same code is correct in dev/test/prod
     *     (never a hardcoded host).
     */
    class RobotsController extends FrameworkController {
        public const URL = '/robots.txt';

        public static function get__main(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            $baseUrl = AppConfig::get(IniConfig::ENV_APP)->baseUrl();
            $sitemapUrl = $baseUrl . '/sitemap.xml';

            $body = "User-agent: *\n";
            $body .= "Allow: /\n";
            $body .= "Disallow: /system/\n";
            $body .= "\n";
            $body .= 'Sitemap: ' . $sitemapUrl . "\n";

            return ControllerTools::ok($body)->withHeader('Content-Type', 'text/plain; charset=utf-8');
        }
    }
}
