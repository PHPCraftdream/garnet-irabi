<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Foreground\Controllers {
    use Aura\SqlQuery\Common\SelectInterface;
    use PHPCraftdream\Garnet\Bundle\Utils\HtmlLayout;
    use PHPCraftdream\Garnet\Bundle\Utils\RenderIsland;
    use PHPCraftdream\Garnet\Kernel\Core\FrameworkController;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\Account;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\DbAccount;
    use PHPCraftdream\Garnet\Kernel\Interfaces\IGlobalReqParams;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Router\IRouterUriParams;
    use PHPCraftdream\Garnet\Kernel\Io\Router\ControllerTools;
    use PHPCraftdream\Garnet\Kernel\Io\Twig\TwigParams;
    use PHPCraftdream\IRabi\Common\Services\AccountDisplay;
    use PHPCraftdream\IRabi\Common\Tables\Bookings;
    use PHPCraftdream\IRabi\Common\Tables\ExpertProfiles;
    use PHPCraftdream\IRabi\Common\Tables\UserCancellations;
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
            $expertProfile = ExpertProfiles::get()->selectOneByField('account_id', $userId);
            if ($expertProfile && (int)($expertProfile['is_approved'] ?? 0)) {
                return ControllerTools::redirect(IRabi::url('/expert/id~' . $userId));
            }

            // A regular user profile is a public surface: name + aggregate
            // booking/cancellation counters are visible to any authenticated
            // account (security audit report 14 decision — these counters are
            // public everywhere, consistent with /users/~preview; the earlier
            // M-03 self/staff/counterparty gate was intentionally reverted to
            // keep the two profile surfaces consistent). Disabled accounts are
            // still anonymised uniformly, matching every other surface.
            $currentAccount = Account::fromSession();

            // Load basic account info
            $row = DbAccount::get()->selectOneByField('id', $userId);

            if (!$row) {
                return ControllerTools::notFound('User not found');
            }

            // Count completed bookings
            $completedBookings = Bookings::get()->getCount(function (SelectInterface $q) use ($userId): void {
                $q->where('user_id = ? AND status = ?', [$userId, 'completed']);
            });

            // Count total bookings
            $totalBookings = Bookings::get()->getCount(function (SelectInterface $q) use ($userId): void {
                $q->where('user_id = ?', [$userId]);
            });

            // Count user cancellations (only kind='cancel')
            $userCancellations = UserCancellations::get()->getCount(function (SelectInterface $q) use ($userId): void {
                $q->where('user_id = ? AND kind = ?', [$userId, 'cancel']);
            });

            // Count user declines (kind='decline')
            $userDeclines = UserCancellations::get()->getCount(function (SelectInterface $q) use ($userId): void {
                $q->where('user_id = ? AND kind = ?', [$userId, 'decline']);
            });

            $isModerator = $currentAccount ? UserEntityConfig::isModerator() : false;
            $isOwnProfile = $currentAccount && $currentAccount->id() === $userId;

            $isDisabled = AccountDisplay::isDisabled($userId);
            $displayName = $isDisabled
                ? AccountDisplay::disabledName($userId)
                : (string)($row['name'] ?? '');

            $content = RenderIsland::render('user-profile', [
                'user' => [
                    'id' => (int)$row['id'],
                    'name' => $displayName,
                    'completedBookings' => $completedBookings,
                    'totalBookings' => $totalBookings,
                    'userCancellations' => $userCancellations,
                    'userDeclines' => $userDeclines,
                ],
                'isModerator' => $isModerator,
                'isOwnProfile' => $isOwnProfile,
            ]);

            return ControllerTools::ok(static::renderContent($content, $url));
        }
    }
}
