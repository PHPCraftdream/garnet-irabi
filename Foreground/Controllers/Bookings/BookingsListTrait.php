<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Foreground\Controllers\Bookings {
    use Aura\SqlQuery\Common\SelectInterface;
    use Closure;
    use PHPCraftdream\Garnet\Bundle\Support\Utils\RenderIsland;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\Account;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Session\Session;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Core\IGlobalReqParams;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Web\Router\IRouterUriParams;
    use PHPCraftdream\Garnet\Kernel\Io\Http\Router\Controller\ControllerTools;
    use PHPCraftdream\IRabi\Common\PaginationHelper;
    use PHPCraftdream\IRabi\Common\Services\AccountDisplay;
    use PHPCraftdream\IRabi\Common\Services\ExpertDirectory;
    use PHPCraftdream\IRabi\Common\Services\MeetingPlatform;
    use PHPCraftdream\IRabi\Common\Tables\Bookings;
    use PHPCraftdream\IRabi\Common\Tables\TimeSlots;
    use PHPCraftdream\IRabi\Foreground\I18n\ForegroundI18n;
    use PHPCraftdream\IRabi\Foreground\Params\UserEntityConfig;
    use PHPCraftdream\IRabi\IRabi;

    /**
     * Список броней: фильтры, счётчики по статусам, вспомогательные
     * справочники и страница.
     *
     * Счётчики считаются отдельным запросом от самих строк: на странице
     * видно десять броней, а счётчик обязан говорить про все — иначе он
     * превращается в «сколько на этом экране», что человек читает как «сколько
     * всего».
     */
    trait BookingsListTrait {
        private static function bookingsWhereCallback(int $accountId, string $viewAs, string $status, bool $showPast): Closure {
            $slotsTbl = TimeSlots::get()->getTableName();
            $statusFilter = in_array($status, self::ALLOWED_STATUSES, true) ? $status : '';

            return function (SelectInterface $query) use ($accountId, $viewAs, $slotsTbl, $statusFilter, $showPast): void {
                // NB: named placeholders (`:name`) — chained `where()` calls with positional `?`
                // collide on Aura's positional bind keys and silently swap values.
                if ($viewAs === 'expert') {
                    $query->where(
                        "bookable_type = :bookable_type
                         AND bookable_id IN (SELECT id FROM {$slotsTbl} WHERE expert_id = :account_id)",
                        ['bookable_type' => 'time_slot', 'account_id' => $accountId]
                    );
                } else {
                    $query->where('user_id = :account_id', ['account_id' => $accountId]);
                }

                if ($statusFilter !== '') {
                    $query->where('status = :status_filter', ['status_filter' => $statusFilter]);
                }

                if (!$showPast) {
                    $query->where(
                        "(bookable_type <> 'time_slot'
                          OR bookable_id IN (SELECT id FROM {$slotsTbl} WHERE start_at >= :now_ts))",
                        ['now_ts' => time()]
                    );
                }

                $query->orderBy(['created_at DESC']);
            };
        }

        /**
         * Build a where callback that ignores the status filter — used to compute
         * per-status counts so each chip shows how many records match.
         */
        private static function bookingsCountWhereCallback(int $accountId, string $viewAs, bool $showPast): Closure {
            return static::bookingsWhereCallback($accountId, $viewAs, '', $showPast);
        }

        /**
         * @return array{all:int, pending:int, confirmed:int, cancelled:int, completed:int, past:int}
         */
        private static function computeCounts(int $accountId, string $viewAs, bool $showPast): array {
            $counts = [
                'all' => Bookings::get()->getCount(static::bookingsCountWhereCallback($accountId, $viewAs, $showPast)),
                'pending' => 0,
                'confirmed' => 0,
                'cancelled' => 0,
                'completed' => 0,
                // Past count is independent of status filter and reflects "currently hidden when toggle is off".
                'past' => Bookings::get()->getCount(
                    static::bookingsWhereCallback($accountId, $viewAs, '', true)
                ) - Bookings::get()->getCount(
                    static::bookingsWhereCallback($accountId, $viewAs, '', false)
                ),
            ];
            foreach (self::ALLOWED_STATUSES as $s) {
                $counts[$s] = Bookings::get()->getCount(
                    static::bookingsWhereCallback($accountId, $viewAs, $s, $showPast)
                );
            }
            return $counts;
        }

        /**
         * Build auxiliary maps (slots, experts/users) for a set of bookings.
         * Online meeting location is only included for confirmed bookings.
         *
         * For viewAs='user': returns experts map (slot.expert_id => display_name).
         * For viewAs='expert': returns users map (booking.user_id => name) instead.
         */
        private static function buildAuxMaps(array $bookings, string $viewAs = 'user'): array {
            $slotIds = [];
            // Track which slot IDs have a confirmed (or since-completed) booking
            $confirmedSlotIds = [];
            foreach ($bookings as $booking) {
                if ($booking['bookable_type'] === 'time_slot') {
                    $slotIds[] = (int)$booking['bookable_id'];
                    // D-147: a booking flips confirmed -> completed once the
                    // session's end_at passes (CronCompletionService). The
                    // meeting link was only ever shown while status stayed
                    // literally 'confirmed' — it vanished back to a bare
                    // platform name the moment the session ended, which is
                    // exactly the opposite of when a student most needs it
                    // (joining, or double-checking right after).
                    if (in_array($booking['status'], ['confirmed', 'completed'], true)) {
                        $confirmedSlotIds[(int)$booking['bookable_id']] = true;
                    }
                }
            }

            $slots = [];
            $expertIds = [];

            if (!empty($slotIds)) {
                foreach (TimeSlots::get()->selectByIds($slotIds) as $slot) {
                    $sid = (int)$slot['id'];
                    $isOnline = (int)($slot['is_online'] ?? 0);
                    // Show online meeting link only for confirmed bookings
                    $showLocation = !$isOnline || isset($confirmedSlotIds[$sid]);
                    $slots[$sid] = [
                        'start_at' => (int)$slot['start_at'],
                        'is_online' => $isOnline,
                        'location' => $showLocation ? ($slot['location'] ?? '') : '',
                        // Площадка публична и до подтверждения: человек, ждущий
                        // подтверждения, вправе знать, где пройдёт занятие, —
                        // ссылку он получит после, а название площадки нужно
                        // ему уже сейчас.
                        'platform' => $isOnline ? MeetingPlatform::publicName($slot['location'] ?? null) : '',
                        'expert_id' => (int)$slot['expert_id'],
                        'cost' => (int)($slot['cost'] ?? 0),
                        'cancellation_penalty_percent' => (int)($slot['cancellation_penalty_percent'] ?? 0),
                        // D-189/D-186: карточка брони не знала о занятии
                        // ничего группового, поэтому ученик, купивший место в
                        // группе, из своего списка не понимал, что придёт не
                        // один. Это третий экран с той же потерей признака
                        // (до него — D-141 и D-178), поэтому признак едет
                        // вместе со слотом, а не собирается на каждой витрине
                        // заново.
                        'max_users' => max(1, (int)($slot['max_users'] ?? 1)),
                        'booked_count' => (int)($slot['booked_count'] ?? 0),
                    ];
                    $expertIds[] = (int)$slot['expert_id'];
                }
            }

            $experts = [];
            $users = [];

            if ($viewAs === 'expert') {
                // Build users map for expert view (booking.user_id => name).
                $userIds = array_values(array_unique(array_filter(
                    array_map(static fn (array $b): int => (int)$b['user_id'], $bookings)
                )));
                if (!empty($userIds)) {
                    $accs = Account::getAccounts(
                        selectCallback: static function (SelectInterface $sel) use ($userIds): void {
                            $sel->resetCols();
                            $sel->cols(['id', 'name']);
                            $sel->where('id IN (?)', [array_map('intval', $userIds)]);
                        },
                    );
                    $disabledUserIds = AccountDisplay::disabledIds($userIds);
                    foreach ($accs as $a) {
                        $aid = (int)$a['id'];
                        if (isset($disabledUserIds[$aid])) {
                            $users[$aid] = ['name' => AccountDisplay::disabledName($aid)];
                        } else {
                            $name = trim((string)($a['name'] ?? ''));
                            $users[$aid] = [
                                'name' => $name !== '' ? $name : ('#' . $aid),
                            ];
                        }
                    }
                }
            } else {
                // Build experts map for user view (slot.expert_id => display_name).
                $expertIds = array_values(array_unique(array_filter($expertIds)));
                if (!empty($expertIds)) {
                    $disabledExpertIds = AccountDisplay::disabledIds($expertIds);
                    foreach (ExpertDirectory::byIds($expertIds) as $eid => $tp) {
                        if (isset($disabledExpertIds[$eid])) {
                            $experts[$eid] = ['display_name' => AccountDisplay::disabledName($eid)];
                        } else {
                            $experts[$eid] = ['display_name' => $tp['display_name']];
                        }
                    }
                }
            }

            return ['slots' => $slots, 'runs' => [], 'experts' => $experts, 'users' => $users];
        }

        /**
         * Чей список броней показывать: свои как ученика ('user') или
         * входящие заявки на свои слоты ('expert').
         *
         * D-184: раньше это решала одна строка `isExpert() ? 'expert' : 'user'`,
         * и выбора не было вовсе. Человек, который занимался, а потом сам стал
         * преподавать (совершенно обычный путь на такой площадке), терял из
         * навигации все свои ученические брони — включая активную, которую
         * поэтому нельзя было ни открыть, ни вовремя отменить. А отмена
         * завязана на сроки и неустойку, так что недоступность превращалась в
         * деньги. Данные при этом были на месте: профиль честно показывал
         * «1 в процессе», просто дороги к ним из раздела не существовало.
         *
         * Выбор вида доступен только преподавателю — ему есть что выбирать.
         * Для всех остальных 'expert' недопустим независимо от того, что
         * пришло в запросе: подставлять его бессмысленно (своих слотов нет,
         * список всё равно будет пуст), но полагаться на пустоту выборки
         * вместо явного запрета — плохая привычка.
         */
        private static function resolveViewAs(string $requested): string {
            if (!UserEntityConfig::isExpert()) {
                return 'user';
            }

            return $requested === 'user' ? 'user' : 'expert';
        }

        public static function get__main(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            $url = $globals->getUri();
            $t = ForegroundI18n::getInstance();

            $account = Account::fromSession();
            if (!$account) {
                return ControllerTools::redirect(IRabi::url('/'));
            }

            // Everyone authenticated (incl. admins/owners/moderators) may book and
            // therefore has a bookings list. Experts additionally see incoming
            // bookings on their own slots (viewAs = 'expert').
            $userId = $account->id();
            $viewAs = static::resolveViewAs((string)$globals->readGetValue('view', ''));

            $status = (string)$globals->readGetValue('status', '');
            $showPast = false;

            $pageData = PaginationHelper::fetchPage(
                Bookings::get(), 1, 20, static::bookingsWhereCallback($userId, $viewAs, $status, $showPast)
            );

            $auxMaps = static::buildAuxMaps($pageData->pageItems, $viewAs);
            $counts = static::computeCounts($userId, $viewAs, $showPast);

            $title = $viewAs === 'expert' ? $t->Bookings_IncomingTitle() : $t->Bookings_Title();

            $content = RenderIsland::render('bookings-list', [
                'bookingsPagination' => PaginationHelper::toPageResponse($pageData),
                'bookingsPageUrl' => IRabi::url('/bookings/~page'),
                'slots' => $auxMaps['slots'],
                'runs' => $auxMaps['runs'],
                'experts' => $auxMaps['experts'],
                'users' => $auxMaps['users'],
                'viewAs' => $viewAs,
                // D-184: преподаватель — это часто вчерашний ученик, и свои
                // занятия у него никуда не деваются. Раньше раздел просто
                // подменялся по роли, и собственные брони (включая активную)
                // становились недостижимы из меню вовсе.
                'canSwitchView' => UserEntityConfig::isExpert(),
                'confirmUrl' => IRabi::url('/expert/~confirmBooking'),
                'rejectUrl' => IRabi::url('/expert/~cancelBooking'),
                'title' => $title,
                'csrf' => Session::touchCSRF_(),
                'isModerator' => UserEntityConfig::isModerator(),
                'currentAccountId' => $userId,
                'initialStatus' => in_array($status, self::ALLOWED_STATUSES, true) ? $status : 'all',
                'initialShowPast' => $showPast,
                'initialCounts' => $counts,
            ]);

            return ControllerTools::ok(static::renderContent($content, $url));
        }

        public static function post__page(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            $account = Account::fromSession();
            if (!$account) {
                return ControllerTools::JSON(['error' => 'Not authenticated'], status: 401);
            }

            $userId = $account->id();
            $viewAs = static::resolveViewAs((string)$globals->readPostValue('view', ''));
            ['page' => $page, 'perPage' => $perPage] = PaginationHelper::readPageParams($globals);

            $status = (string)$globals->readPostValue('status', '');
            $showPast = (bool)$globals->readPostValue('showPast', false);

            $pageData = PaginationHelper::fetchPage(
                Bookings::get(), $page, $perPage, static::bookingsWhereCallback($userId, $viewAs, $status, $showPast)
            );

            $auxMaps = static::buildAuxMaps($pageData->pageItems, $viewAs);
            $counts = static::computeCounts($userId, $viewAs, $showPast);

            return ControllerTools::JSON(array_merge(
                PaginationHelper::toPageResponse($pageData),
                $auxMaps,
                ['counts' => $counts]
            ));
        }

        public static function get__book(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            $url = $globals->getUri();
            $slotId = (int)$params->getUriParam('id');

            $slot = TimeSlots::get()->selectById($slotId);

            if (!$slot) {
                return ControllerTools::notFound('Slot not found');
            }

            // Approval gate on the GET side as well: don't render the booking
            // form for a slot owned by an unapproved/disabled expert (the POST
            // handler also checks, but showing the form is misleading).
            if (!UserEntityConfig::isApprovedActiveExpert((int)$slot['expert_id'])) {
                return ControllerTools::notFound('Slot not found');
            }

            $expert = ExpertDirectory::one((int)$slot['expert_id']);

            $account = Account::fromSession();

            if (!$account) {
                return ControllerTools::redirect(IRabi::url('/'));
            }

            // Booking your own slot makes no sense — send experts to their profile.
            if ((int)$slot['expert_id'] === $account->id()) {
                return ControllerTools::redirect(IRabi::url('/expert/id~' . $account->id()));
            }

            $content = RenderIsland::render('booking-form', [
                'slot' => [
                    'id' => (int)$slot['id'],
                    'start_at' => $slot['start_at'],
                    'duration_min' => (int)($slot['duration_min'] ?? 60),
                    'cost' => (int)$slot['cost'],
                    'is_online' => (int)($slot['is_online'] ?? 1),
                    // Online meeting link is only shown after confirmed booking
                    'location' => (int)($slot['is_online'] ?? 0) ? '' : ($slot['location'] ?? ''),
                    'platform' => (int)($slot['is_online'] ?? 0) ? MeetingPlatform::publicName($slot['location'] ?? null) : '',
                    'expert_id' => (int)$slot['expert_id'],
                ],
                'expert' => $expert ? [
                    'display_name' => $expert['display_name'],
                ] : null,
                'csrf' => Session::touchCSRF_(),
                'isModerator' => UserEntityConfig::isModerator(),
            ]);

            return ControllerTools::ok(static::renderContent($content, $url));
        }
    }
}
