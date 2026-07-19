<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Foreground\Controllers {
    use PHPCraftdream\Garnet\Kernel\Core\FrameworkController;
    use PHPCraftdream\Garnet\Kernel\Interfaces\IGlobalReqParams;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Router\IRouterUriParams;
    use PHPCraftdream\Garnet\Kernel\Io\IniConfig\AppConfig;
    use PHPCraftdream\Garnet\Kernel\Io\IniConfig\IniConfig;
    use PHPCraftdream\Garnet\Kernel\Io\Router\ControllerTools;
    use PHPCraftdream\IRabi\Common\Services\StaticPagesService;

    /**
     * Serves /sitemap.xml at the domain root (no /system prefix).
     *
     * DYNAMIC — generated on every request from the published static
     * pages, so it never goes stale when an owner edits/creates/unpublishes
     * a page through the Dashboard (audit 15-content-copywriting-seo.md,
     * M-2). A static file would rot at the first admin content change.
     *
     * Public, no-auth GET endpoint: same $maintenanceOnly chain and
     * no-prefix registration as RobotsController (see its docblock for the
     * one-controller-per-endpoint rationale).
     *
     * Source of data: {@see StaticPagesService::listPublishedPagesForUser()}
     * with (isLoggedIn=false, isModerator=false) — the anonymous-crawler
     * perspective. Pages whose visibility is 'auth'/'moderator' 404 for a
     * logged-out crawler, so advertising them in the sitemap would mislead
     * search engines.
     *
     * URL shape per page:
     *   - slug 'home' → bare root '/'  (served by IRabi::tryServeLanding)
     *   - any other slug → '/page/view~{slug}' (StaticPagesController)
     * Using the real public URL per slug avoids duplicate-content entries
     * (/ vs /page/view~home). Absolute <loc> is built from app.ini base_url
     * — correct in dev/test/prod, no hardcoded host.
     */
    class SitemapController extends FrameworkController {
        public const URL = '/sitemap.xml';

        public static function get__main(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            $baseUrl = AppConfig::get(IniConfig::ENV_APP)->baseUrl();

            $pages = StaticPagesService::listPublishedPagesForUser(false, false);

            $xml = '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
            $xml .= '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . "\n";

            foreach ($pages as $page) {
                $slug = (string)($page['slug'] ?? '');
                if ($slug === '') {
                    continue;
                }

                $path = $slug === 'home' ? '/' : ('/page/view~' . $slug);
                $loc = htmlspecialchars($baseUrl . $path, ENT_XML1 | ENT_QUOTES, 'UTF-8');

                $xml .= "  <url>\n";
                $xml .= '    <loc>' . $loc . "</loc>\n";

                $updatedAt = (int)($page['updated_at'] ?? 0);
                if ($updatedAt > 0) {
                    $xml .= '    <lastmod>' . date('Y-m-d', $updatedAt) . "</lastmod>\n";
                }

                $xml .= "  </url>\n";
            }

            $xml .= '</urlset>' . "\n";

            return ControllerTools::ok($xml)->withHeader('Content-Type', 'application/xml; charset=utf-8');
        }
    }
}
