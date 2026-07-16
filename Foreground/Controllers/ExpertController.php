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
    use PHPCraftdream\IRabi\Common\Tables\ExpertCancellations;
    use PHPCraftdream\IRabi\Common\Tables\ExpertProfiles;
    use PHPCraftdream\IRabi\Common\Tables\TimeSlots;
    use PHPCraftdream\IRabi\Foreground\Params\Menu;
    use PHPCraftdream\IRabi\Foreground\Params\UserEntityConfig;
    use PHPCraftdream\IRabi\IRabi;

    /**
     * Публичный профиль эксперта (/expert/{id}).
     *
     * Доступен всем пользователям. Показывает имя, специализацию, био,
     * рейтинг, свободные слоты и комментарии выбранного эксперта.
     * Если залогиненный эксперт открывает свой собственный профиль —
     * происходит редирект в личный кабинет (/expert/).
     */
    class ExpertController extends FrameworkController {
        public const URL = '/expert';

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
            $expertId = (int)$params->getUriParam('id');

            $account = Account::fromSession();
            $accountId = $account?->id() ?? 0;
            $isOwnProfile = $accountId > 0 && $accountId === $expertId;

            $expert = ExpertProfiles::get()->selectOneByField('account_id', $expertId);

            // Security audit M-01: expert_profiles.is_approved alone doesn't
            // reflect account-level demotion — a moderator demoting an
            // expert or clearing account-level approval doesn't cascade-clear
            // this row. Gate on the same type+approved predicate the booking
            // path enforces. IS_DISABLED is handled separately below (the
            // profile stays reachable but anonymised, matching how disabled
            // accounts are shown elsewhere — news feed, IM partner name —
            // instead of 404).
            if (!$expert || !UserEntityConfig::isApprovedExpertAccount($expertId)) {
                return ControllerTools::notFound('Expert not found');
            }

            $slots = TimeSlots::get()->selectAll(function (SelectInterface $query) use ($expertId): void {
                $query->where('expert_id = :eid', ['eid' => $expertId])
                    ->where('status = :status', ['status' => 'free'])
                    ->where('start_at > UNIX_TIMESTAMP()')
                    ->orderBy(['start_at ASC'])
                    ->limit(30);
            });

            // Количество отмен эксперта (only kind='cancel')
            $cancellationRows = ExpertCancellations::get()->selectAll(function (SelectInterface $query) use ($expertId): void {
                $query->resetCols()->cols(['COUNT(*) as cnt']);
                $query->where('expert_id = ? AND kind = ?', [$expertId, 'cancel']);
            });
            $cancellationCount = (int)($cancellationRows[0]['cnt'] ?? 0);

            // Количество отказов эксперта (kind='decline')
            $declineRows = ExpertCancellations::get()->selectAll(function (SelectInterface $query) use ($expertId): void {
                $query->resetCols()->cols(['COUNT(*) as cnt']);
                $query->where('expert_id = ? AND kind = ?', [$expertId, 'decline']);
            });
            $declineCount = (int)($declineRows[0]['cnt'] ?? 0);

            // Сколько уроков провёл (завершённые брони на слоты этого эксперта)
            $tableSlots = TimeSlots::get()->getTableName();
            $tableBookings = Bookings::get()->getTableName();
            $conductedRows = Bookings::get()->selectAll(function (SelectInterface $query) use ($tableSlots, $tableBookings, $expertId): void {
                $query->resetCols()->cols(['COUNT(*) as cnt']);
                $query->join('INNER', $tableSlots, "{$tableSlots}.id = {$tableBookings}.bookable_id");
                $query->where("{$tableBookings}.bookable_type = ?", ['time_slot']);
                $query->where("{$tableBookings}.status = ?", ['completed']);
                $query->where("{$tableSlots}.expert_id = ?", [$expertId]);
            });
            $conductedCount = (int)($conductedRows[0]['cnt'] ?? 0);

            // Всего активных/прошедших уроков (брони со всеми статусами кроме отменённых)
            $totalRows = Bookings::get()->selectAll(function (SelectInterface $query) use ($tableSlots, $tableBookings, $expertId): void {
                $query->resetCols()->cols(['COUNT(*) as cnt']);
                $query->join('INNER', $tableSlots, "{$tableSlots}.id = {$tableBookings}.bookable_id");
                $query->where("{$tableBookings}.bookable_type = ?", ['time_slot']);
                $query->where("{$tableSlots}.expert_id = ?", [$expertId]);
            });
            $totalBookingsCount = (int)($totalRows[0]['cnt'] ?? 0);

            $expertAccount = DbAccount::get()->selectById($expertId);
            $avatar = UserEntityConfig::avatarUrl([
                'photo' => $expertAccount['photo'] ?? null,
                'photo_cropped' => $expertAccount['photo_cropped'] ?? null,
                'token16' => $expertAccount['token16'] ?? null,
            ]);
            // Full (uncropped) photo for the lightbox — omit photo_cropped so
            // avatarUrl falls back to the original upload.
            $avatarFull = UserEntityConfig::avatarUrl([
                'photo' => $expertAccount['photo'] ?? null,
                'token16' => $expertAccount['token16'] ?? null,
            ]);

            $disabled = AccountDisplay::isDisabled($expertId);
            if ($disabled) {
                $expert['display_name'] = AccountDisplay::disabledName($expertId);
                $avatar = null;
                $avatarFull = null;
                // Security audit M-01: a disabled expert's future free slots
                // and booking/decline counters must not leak through the
                // still-reachable anonymised profile page.
                $slots = [];
                $cancellationCount = 0;
                $declineCount = 0;
                $conductedCount = 0;
                $totalBookingsCount = 0;
            }

            $content = RenderIsland::render('expert-profile', [
                'expert' => [
                    'display_name' => $expert['display_name'],
                    'specialization' => $expert['specialization'] ?? '',
                    'bio' => $expert['bio'] ?? '',
                    'avatar' => $avatar,
                    'avatar_full' => $avatarFull,
                    'is_disabled' => $disabled,
                    'cancellation_count' => $cancellationCount,
                    'decline_count' => $declineCount,
                    'conducted_count' => $conductedCount,
                    'total_bookings' => $totalBookingsCount,
                ],
                'expertId' => $expertId,
                'slots' => array_values($slots),
                'commentsListUrl' => IRabi::url(CommentsController::URL . '~list'),
                'commentsCreateUrl' => IRabi::url(CommentsController::URL . '~create'),
                'commentsDeleteUrl' => IRabi::url(CommentsController::URL . '~delete'),
                'currentAccountId' => $accountId,
                'isModerator' => $account ? UserEntityConfig::isModerator() : false,
                'isOwnProfile' => $isOwnProfile,
                // Anyone signed in can book (own slots show an "your slot" label
                // instead of a book button via isOwnProfile).
                'canBook' => $account !== null,
            ]);

            return ControllerTools::ok(static::renderContent($content, $url));
        }
    }
}
