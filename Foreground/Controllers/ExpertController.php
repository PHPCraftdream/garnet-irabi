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
    use PHPCraftdream\IRabi\Common\Services\ExpertDirectory;
    use PHPCraftdream\IRabi\Common\Services\MeetingPlatform;
    use PHPCraftdream\IRabi\Common\Tables\Bookings;
    use PHPCraftdream\IRabi\Common\Tables\ExpertCancellations;
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

            $expert = ExpertDirectory::one($expertId);

            // Кто такой преподаватель, решает аккаунт: тип плюс флаг
            // одобрения. Отдельная строка профиля этот вопрос когда-то тоже
            // решала — и разошлась с флагом, поэтому её больше нет.
            // IS_DISABLED разбирается ниже: страница остаётся доступной, но
            // обезличенной, как и везде — в ленте, в личке.
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

            // The row goes into island props as it comes out of the table, and
            // for an online slot `location` is the meeting link. On this page —
            // a profile any signed-in person can open — that link was readable
            // in the page source for lessons nobody had booked or paid for.
            // The catalogue already blanked it; this page did not.
            //
            // The platform behind the link is not a secret and is exactly what
            // people were asking their teacher about after paying (D-052), so
            // it takes the field's place.
            foreach ($slots as &$slot) {
                if ((int)($slot['is_online'] ?? 0)) {
                    $slot['platform'] = MeetingPlatform::publicName($slot['location'] ?? null);
                    $slot['location'] = '';
                } else {
                    $slot['platform'] = '';
                }
            }
            unset($slot);

            // D-121/consolidation: was four independent queries, duplicated
            // (with subtly different SQL) across the full profile, the mini
            // preview and the expert's own dashboard — the exact mismatch
            // ("мини-карточка говорила 6, полная страница — 4") that user-2
            // found once already. Bookings::expertOutcomeCounts() and
            // ExpertCancellations::countsFor() are now the one source both
            // read from.
            //
            // Счётчики отмен и отказов считают только то, что сделал сам
            // преподаватель, — это про него, а не про судьбу записей, и
            // смешивать в них ученические отмены нельзя. Поэтому вместо
            // суммы, которую нечем сойтись, показываем второе самостоятельное
            // число: сколько занятий впереди.
            $expertCancelCounts = ExpertCancellations::countsFor($expertId);
            $cancellationCount = $expertCancelCounts['cancellations'];
            $declineCount = $expertCancelCounts['declines'];

            $expertBookingCounts = Bookings::expertOutcomeCounts($expertId);
            $conductedCount = $expertBookingCounts['conducted'];
            $upcomingCount = $expertBookingCounts['upcoming'];
            $missedCount = $expertBookingCounts['missed'];

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
                $upcomingCount = 0;
                $missedCount = 0;
                // «О себе» — свободный текст, который человек писал о себе, и
                // из него его узнают вернее, чем по имени. Раньше оно ничем не
                // грозило, потому что всегда приходило пустым; теперь, когда
                // оно наполнилось, обезличивание обязано убирать и его.
                $expert['about'] = '';
            }

            $content = RenderIsland::render('expert-profile', [
                'expert' => [
                    'display_name' => $expert['display_name'],
                    // «О себе» человек пишет в своём профиле, и оно ложится в
                    // `accounts.about`. Карточка читала двойника из
                    // `expert_profiles`, которого не заполнял никто, и потому
                    // показывала пустоту. expert-4 сообщила это как «моё „О
                    // себе“ не отображается» и была права.
                    'bio' => $expert['about'],
                    'avatar' => $avatar,
                    'avatar_full' => $avatarFull,
                    'is_disabled' => $disabled,
                    'cancellation_count' => $cancellationCount,
                    'decline_count' => $declineCount,
                    'conducted_count' => $conductedCount,
                    'upcoming_count' => $upcomingCount,
                    'missed_count' => $missedCount,
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
                // D-173: форма отзыва раньше показывалась всем, кто не сам
                // эксперт, — писать могли и без единого занятия у него.
                'canReview' => !$isOwnProfile && $accountId > 0 && Bookings::hasCompletedBookingWith($accountId, $expertId),
            ]);

            return ControllerTools::ok(static::renderContent($content, $url));
        }
    }
}
