<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Foreground\Controllers {
    use PHPCraftdream\Garnet\Bundle\Modules\SystemSettings\FwAppSettings;
    use PHPCraftdream\Garnet\Bundle\Utils\HtmlLayout;
    use PHPCraftdream\Garnet\Kernel\Core\FrameworkController;
    use PHPCraftdream\Garnet\Kernel\Interfaces\IGlobalReqParams;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Router\IRouterUriParams;
    use PHPCraftdream\Garnet\Kernel\Io\Router\ControllerTools;
    use PHPCraftdream\Garnet\Kernel\Io\Twig\Twig;
    use PHPCraftdream\Garnet\Kernel\Io\Twig\TwigParams;
    use PHPCraftdream\IRabi\Foreground\I18n\ForegroundI18n;
    use PHPCraftdream\IRabi\Foreground\Params\Menu;

    /**
     * Interstitial gateway for outbound links.
     *
     * Why a gateway: opening untrusted URLs as `target=_blank` only is a normal
     * link click for popup blockers (no `window.open` from JS), and the
     * interstitial page strips Referer (`<meta name="referrer" content="no-referrer">`)
     * and shows the user the destination before continuing — defence against
     * phishing payloads hidden behind innocent-looking text.
     */
    class ExternalController extends FrameworkController {
        public const URL = '/external';

        public static function get__main(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            $url = $globals->getUri();
            $rawTo = (string)$globals->readGetValue('to', '');
            $target = static::sanitizeUrl($rawTo);
            $t = ForegroundI18n::getInstance();

            $hostText = $target !== null ? (parse_url($target, PHP_URL_HOST) ?: $target) : '';

            $content = Twig::get()->render('Foreground/External.twig', [
                'title' => $t->External_Title(FwAppSettings::brandName()),
                'description' => $t->External_Description(),
                'host_label' => $t->External_Host(),
                'full_label' => $t->External_FullUrl(),
                'continue_label' => $t->External_Continue(),
                'cancel_label' => $t->External_Cancel(),
                'invalid_label' => $t->External_InvalidUrl(),
                'target_url' => $target,
                'host_text' => $hostText,
            ]);

            return ControllerTools::ok(HtmlLayout::render(
                TwigParams::init()->get(TwigParams::DEF_LAYOUT_PARAMS, [
                    'content' => $content,
                    'top_menu_items' => Menu::main($url),
                    'side_menu_items' => Menu::side($url),
                    'meta_referrer' => 'no-referrer',
                ])
            ));
        }

        /**
         * Whitelist http(s) URLs only. Reject `javascript:`, `data:`, relative paths,
         * and anything malformed. Returns the canonical URL or null.
         */
        private static function sanitizeUrl(string $raw): ?string {
            $raw = trim($raw);
            if ($raw === '' || strlen($raw) > 2000) {
                return null;
            }
            $parts = parse_url($raw);
            if ($parts === false || empty($parts['scheme']) || empty($parts['host'])) {
                return null;
            }
            $scheme = strtolower((string)$parts['scheme']);
            if ($scheme !== 'http' && $scheme !== 'https') {
                return null;
            }
            return $raw;
        }
    }
}
