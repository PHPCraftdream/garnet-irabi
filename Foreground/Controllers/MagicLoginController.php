<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Foreground\Controllers {
    use PHPCraftdream\Garnet\Bundle\I18n\FwI18n;
    use PHPCraftdream\Garnet\Bundle\Modules\Auth\Controllers\FwMagicLoginController;
    use PHPCraftdream\Garnet\Bundle\Modules\SystemSettings\FwAppSettings;
    use PHPCraftdream\Garnet\Bundle\Utils\HtmlLayout;
    use PHPCraftdream\Garnet\Bundle\Utils\RenderIsland;
    use PHPCraftdream\Garnet\Kernel\Interfaces\IGlobalReqParams;
    use PHPCraftdream\Garnet\Kernel\Io\Router\ControllerTools;
    use PHPCraftdream\Garnet\Kernel\Io\Twig\TwigParams;
    use PHPCraftdream\IRabi\Foreground\I18n\ForegroundI18n;
    use PHPCraftdream\IRabi\Foreground\Middlewares\IrabiAuthMiddleware;
    use PHPCraftdream\IRabi\IRabi;

    /**
     * One-click magic-login: GET /magic-login/code~{32-char one-time token}.
     * Deliberately not "/~magic-login" — that would collide with the
     * router's own "/path/~methodName" convention (RouterUriParams finds
     * the LAST "/~" in the URI to split off an explicit method name, so a
     * controller base URL starting with "/~" swallows the "code~<token>"
     * param as method params instead of a URI param). Same shape as
     * RegisterController::URL ("/first-step", not "/~first-step").
     *
     * All flow logic (validate/consume/login/redirect) lives in the
     * framework base class — this subclass only wires app-specific bits:
     * which auth middleware to complete the login through (so
     * IrabiAuthMiddleware::sendSuccessLogin()'s consent-journal override
     * fires), how to turn the stored return_uri into a real redirect URL,
     * and how to render the error page for an invalid/expired/used link.
     */
    class MagicLoginController extends FwMagicLoginController {
        public const URL = '/magic-login';

        protected static function authMiddlewareClass(): string {
            return IrabiAuthMiddleware::class;
        }

        protected static function buildRedirectUrl(string $returnUri): string {
            return IRabi::url($returnUri);
        }

        protected static function renderError(IGlobalReqParams $globals, string $reason): mixed {
            $t = ForegroundI18n::getInstance();
            $supportContacts = FwAppSettings::supportContacts();

            $reasonLabels = [
                'unknown' => FwI18n::t('Auth_MagicLink_Error_Unknown'),
                'expired' => FwI18n::t('Auth_MagicLink_Error_Expired'),
                'used' => FwI18n::t('Auth_MagicLink_Error_Used'),
            ];

            $content = RenderIsland::render('invite-error', [
                'reason' => $reasonLabels[$reason] ?? $reasonLabels['unknown'],
                'title' => $t->Invite_Error_Title(),
                'contactMessage' => $t->Invite_Error_ContactSupport(),
                'supportContacts' => $supportContacts,
            ]);

            return ControllerTools::ok(HtmlLayout::render(
                TwigParams::init()->get(TwigParams::DEF_LAYOUT_PARAMS, [
                    'top_menu_items' => [],
                    'side_menu_items' => [],
                    'content' => $content,
                ])
            ));
        }
    }
}
