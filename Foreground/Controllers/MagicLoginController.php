<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Foreground\Controllers {
    use PHPCraftdream\Garnet\Bundle\Modules\Accounts\Auth\Controllers\FwMagicLoginController;
    use PHPCraftdream\Garnet\Bundle\Modules\Ops\SystemSettings\FwAppSettings;
    use PHPCraftdream\Garnet\Bundle\Support\I18n\FwI18n;
    use PHPCraftdream\Garnet\Bundle\Support\Utils\HtmlLayout;
    use PHPCraftdream\Garnet\Bundle\Support\Utils\RenderIsland;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Core\IGlobalReqParams;
    use PHPCraftdream\Garnet\Kernel\Io\Http\Router\Controller\ControllerTools;
    use PHPCraftdream\Garnet\Kernel\Io\Render\Twig\TwigParams;
    use PHPCraftdream\IRabi\Common\Services\StaticPagesService;
    use PHPCraftdream\IRabi\Foreground\I18n\ForegroundI18n;
    use PHPCraftdream\IRabi\Foreground\Middlewares\IrabiAuthMiddleware;

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

        /**
         * $returnUri comes from $globals->getUri() captured at code-request
         * time (see EmailAuthMiddleware::sendCode()), which is the RAW
         * incoming request URI — already carrying the /system route prefix
         * when present, exactly like the old hash-based link's $baseUrl . $uri
         * concatenation never re-prefixed it either. Routing this through
         * IRabi::url() (which ALWAYS prepends the prefix, meant for bare
         * Controller::URL constants) double-prefixes it, producing an
         * invalid /system/system/... redirect target that 404s.
         */
        protected static function buildRedirectUrl(string $returnUri): string {
            return $returnUri;
        }

        protected static function renderError(IGlobalReqParams $globals, string $reason): mixed {
            $t = ForegroundI18n::getInstance();
            $supportContacts = FwAppSettings::supportContacts();

            $reasonLabels = [
                'unknown' => FwI18n::t('Auth_MagicLink_Error_Unknown'),
                'expired' => FwI18n::t('Auth_MagicLink_Error_Expired'),
                'used' => FwI18n::t('Auth_MagicLink_Error_Used'),
            ];

            // Остров общий с приглашением, а тексты — свои: по ссылке из
            // письма приходит уже зарегистрированный человек, и заголовок
            // «Регистрация недоступна» отвечает не на его вопрос.
            $content = RenderIsland::render('invite-error', [
                'reason' => $reasonLabels[$reason] ?? $reasonLabels['unknown'],
                'title' => $t->MagicLink_Error_Title(),
                // Подсказка и приглашение к контактам — разные сообщения:
                // контакты поддержки на установке могут быть не заполнены, и
                // тогда блок с ними не рисуется целиком. Раньше вместе с ним
                // пропадало и единственное указание, что делать дальше.
                'guidance' => $t->MagicLink_Error_Guidance(),
                'contactMessage' => $t->MagicLink_Error_ContactSupport(),
                'supportContacts' => $supportContacts,
            ]);

            // Оборачиваем в публичную оболочку сайта — ту же, что у главной и
            // юридических страниц. Раньше здесь был голый экран: ни шапки, ни
            // подвала, только одиноко висящий баннер часового пояса, — человек
            // видел не сообщение об ошибке, а сломанный сайт, уйти с которого
            // некуда.
            //
            // Меню приложения (Menu::main) сюда не годится: по мёртвой ссылке
            // приходит неавторизованный, а оно показало бы ему «Обзор слотов»,
            // «Брони» и «Выйти». Публичная шапка сама покажет то, что нужно
            // гостю, — «Войти».
            $shell = StaticPagesService::renderSiteShell($content, '3xl');

            return ControllerTools::ok(HtmlLayout::render(
                TwigParams::init()->get(TwigParams::DEF_LAYOUT_PARAMS, [
                    'top_menu_items' => [],
                    'side_menu_items' => [],
                    'content' => $shell,
                ])
            ));
        }
    }
}
