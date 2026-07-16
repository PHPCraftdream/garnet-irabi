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
    use PHPCraftdream\IRabi\Common\Tables\Bookings;
    use PHPCraftdream\IRabi\Common\Tables\ExpertProfiles;
    use PHPCraftdream\IRabi\Common\Tables\TimeSlots;
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

        /**
         * Security audit M-03: /user/id~N exposed any authenticated actor's
         * name and booking/cancellation counters for ANY other regular user
         * with no restriction. Policy (confirmed): visible to the profile's
         * own owner, staff (moderator+), or an expert who has actually had a
         * booking from this user (a real counterparty) — everyone else gets
         * a 404, matching the "don't confirm existence" pattern already used
         * elsewhere in this controller.
         */
        private static function canViewProfile(?Account $viewer, int $userId): bool {
            if (!$viewer) {
                return false;
            }
            if ($viewer->id() === $userId) {
                return true;
            }
            if (UserEntityConfig::isModerator()) {
                return true;
            }

            // Counterparty: viewer is an active approved expert who has had
            // at least one booking from this user on one of their slots.
            if (!UserEntityConfig::isApprovedActiveExpert($viewer->id())) {
                return false;
            }
            $slotIds = array_column(
                TimeSlots::get()->selectByField('expert_id', $viewer->id()),
                'id'
            );
            if (empty($slotIds)) {
                return false;
            }
            $bookings = Bookings::get()->selectAll(function (SelectInterface $q) use ($slotIds, $userId): void {
                $q->resetCols()->cols(['id']);
                $q->where("bookable_type = 'time_slot'");
                $q->where('bookable_id IN (?)', [array_map('intval', $slotIds)]);
                $q->where('user_id = ?', [$userId]);
                $q->limit(1);
            });

            return !empty($bookings);
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

            $currentAccount = Account::fromSession();
            if (!static::canViewProfile($currentAccount, $userId)) {
                return ControllerTools::notFound('User not found');
            }

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

            $content = RenderIsland::render('user-profile', [
                'user' => [
                    'id' => (int)$row['id'],
                    'name' => $row['name'] ?? '',
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
