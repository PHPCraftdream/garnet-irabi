<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Foreground\Middlewares {
    use PHPCraftdream\Garnet\Bundle\I18n\FwI18n;
    use PHPCraftdream\Garnet\Bundle\Modules\Auth\Middlewares\RegMiddleware;
    use PHPCraftdream\Garnet\Bundle\Utils\HtmlLayout;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\Account;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Db\IEntityConfig;
    use PHPCraftdream\Garnet\Kernel\Interfaces\IGlobalReqParams;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Router\IRouterUriParams;
    use PHPCraftdream\Garnet\Kernel\Io\Twig\Twig;
    use PHPCraftdream\Garnet\Kernel\Io\Twig\TwigParams;
    use PHPCraftdream\IRabi\Common\Services\StaticPagesService;
    use PHPCraftdream\IRabi\Foreground\Params\Menu;
    use PHPCraftdream\IRabi\Foreground\Params\UserEntityConfig;
    use PHPCraftdream\IRabi\IRabi;

    class UserDataMiddleware extends RegMiddleware {
        protected static function publicDir(): string {
            return IRabi::getInstance()->publicDir;
        }

        protected static function wrapPageContent(string $content): string {
            return StaticPagesService::renderSiteShell($content);
        }

        protected static function getEntityConfig(): IEntityConfig {
            return UserEntityConfig::getEntityConfig();
        }

        /**
         * Default fresh accounts to type='user'. Otherwise type=NULL leaves them in a
         * state where they cannot book slots (UserEntityConfig::isUser() returns false).
         * Type can later be promoted to 'expert' by an admin.
         */
        /**
         * Default fresh accounts to type='user' only when nothing else has
         * picked a value. Invite-flow registrations have already written
         * the token's account_type via `RegisterController` during the
         * auth step, so we must NOT overwrite it here.
         */
        protected static function initialAccountParams(): array {
            $base = parent::initialAccountParams();
            $account = Account::fromSession();
            $existing = $account?->readParam('type');
            if (empty($existing)) {
                $base['type'] = 'user';
            }
            return $base;
        }

        protected static function noAccess(): string {
            $tf = FwI18n::getInstance();

            $content = Twig::get()->render('Foreground/NoAccessHeading.twig', [
                'heading' => $tf->No_Access(),
            ]);

            return HtmlLayout::render(TwigParams::init()->get(TwigParams::DEF_LAYOUT_PARAMS, [
                'side_menu_items' => [],
                'top_menu_items' => Menu::main(''),
                'content' => $content,
            ]));
        }

        public static function expertOnly(IGlobalReqParams $globals, IRouterUriParams $params): string|null {
            if (UserEntityConfig::isExpert()) {
                return null;
            }

            return static::noAccess();
        }

        public static function moderatorOnly(IGlobalReqParams $globals, IRouterUriParams $params): string|null {
            if (UserEntityConfig::isModerator()) {
                return null;
            }

            return static::noAccess();
        }

        public static function adminOnly(IGlobalReqParams $globals, IRouterUriParams $params): string|null {
            if (UserEntityConfig::isAdmin()) {
                return null;
            }

            return static::noAccess();
        }

        public static function ownerOnly(IGlobalReqParams $globals, IRouterUriParams $params): string|null {
            if (UserEntityConfig::isOwner()) {
                return null;
            }

            return static::noAccess();
        }
    }
}
