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

        /**
         * Server-side deny gate for disabled accounts (security audit H-02).
         * Previously only UserEntityConfig::isApprovedActiveExpert() checked
         * IS_DISABLED, and only for the expert being booked — never for the
         * acting session account. A disabled account with a still-valid
         * session retained full access to every authenticated route
         * (booking, comments, support, IM, expert slot management, admin
         * panels for disabled staff), since isModerator()/isOwner()/isAdmin()/
         * isExpert()/isUser() never consider it. Wired into the shared
         * `$common` chain right after authOnly() so it runs before any
         * business-role or staff-rank gate, for every protected route.
         */
        public static function notDisabled(IGlobalReqParams $globals, IRouterUriParams $params): string|null {
            $account = Account::fromSession();
            if ($account && $account->isDisabled()) {
                return static::noAccess();
            }

            return null;
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
