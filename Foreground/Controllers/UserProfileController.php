<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Foreground\Controllers {
    use PHPCraftdream\Garnet\Bundle\Support\Utils\HtmlLayout;
    use PHPCraftdream\Garnet\Bundle\Support\Utils\RenderIsland;
    use PHPCraftdream\Garnet\Kernel\Core\Runtime\FrameworkController;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Core\IGlobalReqParams;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Web\Router\IRouterUriParams;
    use PHPCraftdream\Garnet\Kernel\Io\Http\Router\Controller\ControllerTools;
    use PHPCraftdream\Garnet\Kernel\Io\Render\Twig\TwigParams;
    use PHPCraftdream\IRabi\Common\Services\UserProfilePresenter;
    use PHPCraftdream\IRabi\Foreground\Params\Menu;
    use PHPCraftdream\IRabi\Foreground\Params\UserEntityConfig;
    use PHPCraftdream\IRabi\IRabi;

    class UserProfileController extends FrameworkController {
        public const URL = '/user';

        protected static function getMainMenu(string $url): array {
            return Menu::main($url);
        }

        public static function renderContent(string $content, string $url): string {
            return HtmlLayout::render(
                TwigParams::init()->get(TwigParams::DEF_LAYOUT_PARAMS, [
                    'content' => $content,
                    'top_menu_items' => static::getMainMenu($url),
                    'side_menu_items' => Menu::side($url),
                ])
            );
        }

        public static function get__main(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            $url = $globals->getUri();
            $userId = (int)$params->getUriParam('id');

            if (!$userId) {
                return ControllerTools::notFound('User not found');
            }

            // Check if this user is an expert — redirect to expert profile
            if (UserEntityConfig::isApprovedExpertAccount($userId)) {
                return ControllerTools::redirect(IRabi::url('/expert/id~' . $userId));
            }

            // A regular user profile is a public surface: name + aggregate
            // booking/cancellation counters are visible to any authenticated
            // account (security audit report 14 decision — these counters are
            // public everywhere, consistent with /users/~preview; the earlier
            // M-03 self/staff/counterparty gate was intentionally reverted to
            // keep the two profile surfaces consistent). Disabled accounts are
            // still anonymised uniformly, matching every other surface.
            $props = UserProfilePresenter::buildProps($userId);
            if (!$props) {
                return ControllerTools::notFound('User not found');
            }

            $content = RenderIsland::render('user-profile', $props);

            return ControllerTools::ok(static::renderContent($content, $url));
        }
    }
}
