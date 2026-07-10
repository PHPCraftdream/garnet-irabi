<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Dashboard\Controllers {
    use Aura\SqlQuery\Common\SelectInterface;
    use Closure;
    use DateTime;
    use DateTimeZone;
    use PHPCraftdream\Garnet\Bundle\Utils\HtmlLayout;
    use PHPCraftdream\Garnet\Bundle\Utils\RenderIsland;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\Account;
    use PHPCraftdream\Garnet\Kernel\Interfaces\IGlobalReqParams;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Router\IRouterUriParams;
    use PHPCraftdream\Garnet\Kernel\Io\Router\ControllerTools;
    use PHPCraftdream\Garnet\Kernel\Io\Twig\TwigParams;
    use PHPCraftdream\IRabi\Common\PaginationHelper;
    use PHPCraftdream\IRabi\Common\Tables\Bookings;
    use PHPCraftdream\IRabi\Common\Tables\ExpertCancellations;
    use PHPCraftdream\IRabi\Common\Tables\TimeSlots;
    use PHPCraftdream\IRabi\Common\Tables\UserCancellations;
    use PHPCraftdream\IRabi\Foreground\I18n\ForegroundI18n;
    use PHPCraftdream\IRabi\IRabi;

    /**
     * Admin "Брони" page — three tabs: bookings (admin view of all bookings),
     * expert cancellations and user cancellations.
     *
     * Behind moderatorOnly middleware (registered in IRabi.php).
     */
    class DashboardBookingsController extends DashboardController {
        public const URL = '/admin/bookings/';

        private const TAB_SLOTS = 'slots';
        private const TAB_BOOKINGS = 'bookings';
        private const TAB_EXPERT_CANCELLATIONS = 'expert-cancellations';
        private const TAB_USER_CANCELLATIONS = 'user-cancellations';
        private const TABS = [self::TAB_SLOTS, self::TAB_BOOKINGS, self::TAB_EXPERT_CANCELLATIONS, self::TAB_USER_CANCELLATIONS];

        private const ALLOWED_BOOKING_STATUSES = ['pending', 'confirmed', 'cancelled', 'completed'];
        private const ALLOWED_SLOT_STATUSES = ['free', 'booked', 'completed', 'cancelled'];

        // ── Bookings tab — admin view of every booking ──────────────────────

        /**
         * Build WHERE callback for the bookings tab.
         *
         * Date range is matched against `created_at` (the moment the booking row was created),
         * not `slot.start_at`. We choose `created_at` because admins use this filter to spot
         * bookings made within a window (e.g. spike investigations) — slot timing is already
         * visible per-row.
         */
        private static function bookingsWhereCallback(
            string $search,
            string $status,
            int $expertId,
            int $userId,
            int $dateFrom,
            int $dateTo,
        ): Closure {
            $statusFilter = in_array($status, self::ALLOWED_BOOKING_STATUSES, true) ? $status : '';
            return function (SelectInterface $query) use ($search, $statusFilter, $expertId, $userId, $dateFrom, $dateTo): void {
                if ($statusFilter !== '') {
                    $query->where('status = :status_filter', ['status_filter' => $statusFilter]);
                }
                if ($search !== '') {
                    // Accept either a numeric booking id or a free-text needle that we
                    // resolve later when looking up users (see hydrateBookingRows).
                    if (ctype_digit($search)) {
                        $query->where('id = :sid OR user_id = :sid', ['sid' => (int)$search]);
                    }
                }
                if ($userId > 0) {
                    $query->where('user_id = :uid_filter', ['uid_filter' => $userId]);
                }
                if ($expertId > 0) {
                    $slotsTable = TimeSlots::get()->getTableName();
                    $query->where(
                        "bookable_type = 'time_slot' AND bookable_id IN (SELECT id FROM "
                        . $slotsTable . ' WHERE expert_id = :exp_filter)',
                        ['exp_filter' => $expertId],
                    );
                }
                if ($dateFrom > 0) {
                    $query->where('created_at >= :df_filter', ['df_filter' => $dateFrom]);
                }
                if ($dateTo > 0) {
                    $query->where('created_at <= :dt_filter', ['dt_filter' => $dateTo]);
                }
                $query->orderBy(['id DESC']);
            };
        }

        /**
         * Hydrate booking rows with user / expert names + slot start time.
         *
         * @param list<array<string, mixed>> $rows
         * @return list<array<string, mixed>>
         */
        private static function hydrateBookingRows(array $rows): array {
            // Resolve slot ids → expert ids
            $slotIds = [];
            foreach ($rows as $row) {
                if (($row['bookable_type'] ?? '') === 'time_slot') {
                    $slotIds[] = (int)$row['bookable_id'];
                }
            }
            $slotsMap = [];
            if (!empty($slotIds)) {
                foreach (TimeSlots::get()->selectByIds(array_values(array_unique($slotIds))) as $slot) {
                    $slotsMap[(int)$slot['id']] = $slot;
                }
            }

            $accountIds = [];
            foreach ($rows as $row) {
                $accountIds[] = (int)$row['user_id'];
                if (($row['bookable_type'] ?? '') === 'time_slot') {
                    $expertId = (int)($slotsMap[(int)$row['bookable_id']]['expert_id'] ?? 0);
                    if ($expertId > 0) {
                        $accountIds[] = $expertId;
                    }
                }
            }
            $accountIds = array_values(array_unique(array_filter($accountIds)));

            $accountInfo = [];
            if (!empty($accountIds)) {
                $accs = Account::getAccounts(
                    selectCallback: static function (SelectInterface $sel) use ($accountIds): void {
                        $sel->resetCols();
                        $sel->cols(['id', 'name', 'login', 'type']);
                        $sel->where('id IN (?)', [array_map('intval', $accountIds)]);
                    },
                );
                foreach ($accs as $a) {
                    $aid = (int)$a['id'];
                    $name = trim((string)($a['name'] ?? ''));
                    if ($name === '') {
                        $name = (string)($a['login'] ?? ('#' . $aid));
                    }
                    $accountInfo[$aid] = ['name' => $name, 'type' => (string)($a['type'] ?? '')];
                }
            }

            $out = [];
            foreach ($rows as $row) {
                $userId = (int)$row['user_id'];
                $slotId = ($row['bookable_type'] ?? '') === 'time_slot' ? (int)$row['bookable_id'] : 0;
                $expertId = $slotId > 0 ? (int)($slotsMap[$slotId]['expert_id'] ?? 0) : 0;
                $userInfo = $accountInfo[$userId] ?? null;
                $expertInfo = $accountInfo[$expertId] ?? null;
                $out[] = [
                    'id' => (int)$row['id'],
                    'user_id' => $userId,
                    'user_name' => $userInfo['name'] ?? ($userId ? '#' . $userId : '—'),
                    'expert_id' => $expertId,
                    'expert_name' => $expertInfo['name'] ?? ($expertId ? '#' . $expertId : '—'),
                    'expert_has_profile' => ($expertInfo['type'] ?? '') === 'expert',
                    'bookable_type' => (string)($row['bookable_type'] ?? ''),
                    'bookable_id' => (int)($row['bookable_id'] ?? 0),
                    'slot_time' => $slotId > 0 ? (int)($slotsMap[$slotId]['start_at'] ?? 0) : 0,
                    'status' => (string)($row['status'] ?? ''),
                    'created_at' => (int)($row['created_at'] ?? 0),
                ];
            }
            return $out;
        }

        /**
         * @return array<string, mixed>
         */
        private static function buildBookingsPayload(
            int $page,
            int $perPage,
            string $search,
            string $status,
            int $expertId = 0,
            int $userId = 0,
            int $dateFrom = 0,
            int $dateTo = 0,
        ): array {
            $where = static::bookingsWhereCallback($search, $status, $expertId, $userId, $dateFrom, $dateTo);
            $pageData = PaginationHelper::fetchPage(Bookings::get(), $page, $perPage, $where);
            $pageData->pageItems = static::hydrateBookingRows($pageData->pageItems);
            return PaginationHelper::toPageResponse($pageData);
        }

        // ── Slots tab — admin view of every time slot ──────────────────────

        private static function slotsWhereCallback(
            string $search,
            string $status,
            int $expertId,
            string $userQuery,
            int $dateFrom,
            int $dateTo,
        ): Closure {
            $statusFilter = in_array($status, self::ALLOWED_SLOT_STATUSES, true) ? $status : '';
            return function (SelectInterface $query) use ($search, $statusFilter, $expertId, $userQuery, $dateFrom, $dateTo): void {
                if ($statusFilter !== '') {
                    $query->where('status = :status_filter', ['status_filter' => $statusFilter]);
                }
                if ($search !== '' && ctype_digit($search)) {
                    $query->where('id = :sid OR expert_id = :sid', ['sid' => (int)$search]);
                }
                if ($expertId > 0) {
                    $query->where('expert_id = :exp', ['exp' => $expertId]);
                }
                if ($dateFrom > 0) {
                    $query->where('start_at >= :df', ['df' => $dateFrom]);
                }
                if ($dateTo > 0) {
                    $query->where('start_at <= :dt', ['dt' => $dateTo]);
                }
                if ($userQuery !== '') {
                    $userIds = static::resolveUserIdsByQuery($userQuery);
                    if (empty($userIds)) {
                        $query->where('1 = 0');
                    } else {
                        $idsCsv = implode(',', array_map('intval', $userIds));
                        $bookingsTable = Bookings::get()->getTableName();
                        $query->where(
                            'id IN (SELECT bookable_id FROM ' . $bookingsTable
                            . " WHERE bookable_type = 'time_slot' AND user_id IN (" . $idsCsv . '))',
                        );
                    }
                }
                $query->orderBy(['start_at DESC']);
            };
        }

        /**
         * Resolve users matching free-text query to a list of ids.
         * Numeric query → exact id match OR login/name LIKE.
         * Text query → only login/name LIKE.
         *
         * @return list<int>
         */
        private static function resolveUserIdsByQuery(string $query): array {
            $isNumeric = ctype_digit($query);
            $like = '%' . $query . '%';
            $accs = Account::getAccounts(
                selectCallback: static function (SelectInterface $sel) use ($query, $like, $isNumeric): void {
                    $sel->resetCols();
                    $sel->cols(['id']);
                    if ($isNumeric) {
                        $sel->where(
                            '(id = :uid) OR (login LIKE :ulike) OR (name LIKE :ulike)',
                            ['uid' => (int)$query, 'ulike' => $like],
                        );
                    } else {
                        $sel->where(
                            '(login LIKE :ulike) OR (name LIKE :ulike)',
                            ['ulike' => $like],
                        );
                    }
                    $sel->limit(500);
                },
            );
            $ids = [];
            foreach ($accs as $a) {
                $aid = (int)($a['id'] ?? 0);
                if ($aid > 0) {
                    $ids[] = $aid;
                }
            }
            return array_values(array_unique($ids));
        }

        /**
         * Hydrate slot rows with expert names + role flag.
         *
         * @param list<array<string, mixed>> $rows
         * @return list<array<string, mixed>>
         */
        private static function hydrateSlotRows(array $rows): array {
            $accountIds = [];
            foreach ($rows as $row) {
                $accountIds[] = (int)($row['expert_id'] ?? 0);
            }
            $accountIds = array_values(array_unique(array_filter($accountIds)));

            $accountInfo = [];
            if (!empty($accountIds)) {
                $accs = Account::getAccounts(
                    selectCallback: static function (SelectInterface $sel) use ($accountIds): void {
                        $sel->resetCols();
                        $sel->cols(['id', 'name', 'login', 'type']);
                        $sel->where('id IN (?)', [array_map('intval', $accountIds)]);
                    },
                );
                foreach ($accs as $a) {
                    $aid = (int)$a['id'];
                    $name = trim((string)($a['name'] ?? ''));
                    if ($name === '') {
                        $name = (string)($a['login'] ?? ('#' . $aid));
                    }
                    $accountInfo[$aid] = ['name' => $name, 'type' => (string)($a['type'] ?? '')];
                }
            }

            $out = [];
            foreach ($rows as $row) {
                $expertId = (int)($row['expert_id'] ?? 0);
                $expertInfo = $accountInfo[$expertId] ?? null;
                $out[] = [
                    'id' => (int)$row['id'],
                    'expert_id' => $expertId,
                    'expert_name' => $expertInfo['name'] ?? ($expertId ? '#' . $expertId : '—'),
                    'expert_has_profile' => ($expertInfo['type'] ?? '') === 'expert',
                    'start_at' => (int)($row['start_at'] ?? 0),
                    'end_at' => (int)($row['end_at'] ?? 0),
                    'duration_min' => (int)($row['duration_min'] ?? 0),
                    'cost' => (int)($row['cost'] ?? 0),
                    'is_online' => (bool)((int)($row['is_online'] ?? 0)),
                    'location' => (string)($row['location'] ?? ''),
                    'max_users' => (int)($row['max_users'] ?? 0),
                    'status' => (string)($row['status'] ?? ''),
                    'created_at' => (int)($row['created_at'] ?? 0),
                ];
            }
            return $out;
        }

        /**
         * @return array<string, mixed>
         */
        private static function buildSlotsPayload(
            int $page,
            int $perPage,
            string $search,
            string $status,
            int $expertId = 0,
            string $userQuery = '',
            int $dateFrom = 0,
            int $dateTo = 0,
        ): array {
            $where = static::slotsWhereCallback($search, $status, $expertId, $userQuery, $dateFrom, $dateTo);
            $pageData = PaginationHelper::fetchPage(TimeSlots::get(), $page, $perPage, $where);
            $pageData->pageItems = static::hydrateSlotRows($pageData->pageItems);
            return PaginationHelper::toPageResponse($pageData);
        }

        /**
         * Parse a YYYY-MM-DD input into a UTC unixtime; 'start' uses 00:00:00, 'end' uses 23:59:59.
         * Returns 0 if format is invalid.
         */
        private static function parseDateInput(string $val, string $kind): int {
            if ($val === '') {
                return 0;
            }
            $tz = new DateTimeZone('UTC');
            $dt = DateTime::createFromFormat('Y-m-d', $val, $tz);
            if ($dt === false) {
                return 0;
            }
            if ($kind === 'end') {
                $dt->setTime(23, 59, 59);
            } else {
                $dt->setTime(0, 0, 0);
            }
            return $dt->getTimestamp();
        }

        /**
         * @return list<array{id:int, name:string}>
         */
        private static function loadExperts(): array {
            $accs = Account::getAccounts(
                selectCallback: static function (SelectInterface $sel): void {
                    $sel->resetCols();
                    $sel->cols(['id', 'name', 'login']);
                    $sel->where("type = 'expert'");
                    $sel->orderBy(['name ASC', 'login ASC']);
                },
            );
            $out = [];
            foreach ($accs as $a) {
                $name = trim((string)($a['name'] ?? ''));
                if ($name === '') {
                    $name = (string)($a['login'] ?? ('#' . (int)($a['id'] ?? 0)));
                }
                $out[] = ['id' => (int)($a['id'] ?? 0), 'name' => $name];
            }
            return $out;
        }

        /**
         * Load all users (type = 'user') for the filter combobox. Combobox handles
         * client-side search, so we don't paginate here. If the list grows past a
         * few thousand we'd switch to a server-search endpoint, but for now a single
         * payload keeps the UX snappy with no extra round-trips.
         *
         * @return list<array{id:int, name:string}>
         */
        private static function loadUsersForFilter(): array {
            $accs = Account::getAccounts(
                selectCallback: static function (SelectInterface $sel): void {
                    $sel->resetCols();
                    $sel->cols(['id', 'name', 'login']);
                    $sel->where("type = 'user'");
                    $sel->orderBy(['name ASC', 'login ASC']);
                },
            );
            $out = [];
            foreach ($accs as $a) {
                $name = trim((string)($a['name'] ?? ''));
                if ($name === '') {
                    $name = (string)($a['login'] ?? ('#' . (int)($a['id'] ?? 0)));
                }
                $out[] = ['id' => (int)($a['id'] ?? 0), 'name' => $name];
            }
            return $out;
        }

        // ── Cancellations tabs (expert + user) ─────────────────────────────

        private static function cancellationsWhereCallback(
            string $search,
            int $dateFrom,
            int $dateTo,
            int $expertId,
            int $userId,
        ): Closure {
            return function (SelectInterface $query) use ($search, $dateFrom, $dateTo, $expertId, $userId): void {
                if ($dateFrom > 0) {
                    $query->where('created_at >= :date_from', ['date_from' => $dateFrom]);
                }
                if ($dateTo > 0) {
                    $query->where('created_at <= :date_to', ['date_to' => $dateTo]);
                }
                if ($search !== '') {
                    $query->where('reason LIKE :search', ['search' => '%' . $search . '%']);
                }
                if ($expertId > 0) {
                    $query->where('expert_id = :exp_filter', ['exp_filter' => $expertId]);
                }
                if ($userId > 0) {
                    $query->where('user_id = :uid_filter', ['uid_filter' => $userId]);
                }
                $query->orderBy(['id DESC']);
            };
        }

        /**
         * @param list<array<string, mixed>> $rows
         * @return list<array<string, mixed>>
         */
        private static function hydrateCancellationRows(array $rows): array {
            $accountIds = [];
            $slotIds = [];
            foreach ($rows as $row) {
                $accountIds[] = (int)$row['expert_id'];
                $accountIds[] = (int)$row['user_id'];
                $slotIds[] = (int)$row['slot_id'];
            }
            $accountIds = array_values(array_unique(array_filter($accountIds)));
            $slotIds = array_values(array_unique(array_filter($slotIds)));

            $accountNames = [];
            if (!empty($accountIds)) {
                $accs = Account::getAccounts(
                    selectCallback: static function (SelectInterface $sel) use ($accountIds): void {
                        $sel->resetCols();
                        $sel->cols(['id', 'name', 'login', 'type']);
                        $sel->where('id IN (?)', [array_map('intval', $accountIds)]);
                    },
                );
                foreach ($accs as $a) {
                    $aid = (int)$a['id'];
                    $name = trim((string)($a['name'] ?? ''));
                    if ($name === '') {
                        $name = (string)($a['login'] ?? ('#' . $aid));
                    }
                    $accountNames[$aid] = ['name' => $name, 'type' => (string)($a['type'] ?? '')];
                }
            }

            $slotTimes = [];
            if (!empty($slotIds)) {
                foreach (TimeSlots::get()->selectByIds($slotIds) as $slot) {
                    $slotTimes[(int)$slot['id']] = (int)$slot['start_at'];
                }
            }

            $out = [];
            foreach ($rows as $row) {
                $expertId = (int)$row['expert_id'];
                $userId = (int)$row['user_id'];
                $slotId = (int)$row['slot_id'];
                $expertInfo = $accountNames[$expertId] ?? null;
                $userInfo = $accountNames[$userId] ?? null;
                $out[] = [
                    'id' => (int)$row['id'],
                    'created_at' => (int)$row['created_at'],
                    'expert_id' => $expertId,
                    'expert_name' => $expertInfo['name'] ?? ($expertId ? '#' . $expertId : '—'),
                    'expert_has_profile' => ($expertInfo['type'] ?? '') === 'expert',
                    'user_id' => $userId,
                    'user_name' => $userInfo['name'] ?? ($userId ? '#' . $userId : '—'),
                    'slot_id' => $slotId,
                    'slot_time' => $slotTimes[$slotId] ?? 0,
                    'booking_id' => (int)($row['booking_id'] ?? 0),
                    'reason' => (string)($row['reason'] ?? ''),
                ];
            }
            return $out;
        }

        /**
         * @param 'expert'|'user' $kind
         * @return array<string, mixed>
         */
        private static function buildCancellationsPayload(
            string $kind,
            int $page,
            int $perPage,
            string $search,
            int $dateFrom,
            int $dateTo,
            int $expertId = 0,
            int $userId = 0,
        ): array {
            $table = $kind === 'expert' ? ExpertCancellations::get() : UserCancellations::get();
            $where = static::cancellationsWhereCallback($search, $dateFrom, $dateTo, $expertId, $userId);
            $pageData = PaginationHelper::fetchPage($table, $page, $perPage, $where);
            $pageData->pageItems = static::hydrateCancellationRows($pageData->pageItems);
            return PaginationHelper::toPageResponse($pageData);
        }

        /**
         * @return array{search:string, dateFrom:int, dateTo:int, expertId:int, userId:int}
         */
        private static function readCancellationsFilters(IGlobalReqParams $globals): array {
            $search = trim((string)$globals->readPostValue('search', ''));
            $rawFrom = (string)$globals->readPostValue('dateFrom', '');
            $rawTo = (string)$globals->readPostValue('dateTo', '');
            $dateFrom = $rawFrom === '' ? 0 : (ctype_digit($rawFrom) ? (int)$rawFrom : static::parseDateInput($rawFrom, 'start'));
            $dateTo = $rawTo === '' ? 0 : (ctype_digit($rawTo) ? (int)$rawTo : static::parseDateInput($rawTo, 'end'));
            $expertId = (int)$globals->readPostValue('expert_id', 0);
            $userId = (int)$globals->readPostValue('user_id', 0);
            return [
                'search' => $search,
                'dateFrom' => max(0, $dateFrom),
                'dateTo' => max(0, $dateTo),
                'expertId' => max(0, $expertId),
                'userId' => max(0, $userId),
            ];
        }

        // ── HTTP handlers ───────────────────────────────────────────────────

        public static function get__main(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            if (!static::isModerator()) {
                return ControllerTools::redirect(IRabi::url('/'));
            }

            $url = $globals->getUri();
            $t = ForegroundI18n::getInstance();

            $tabRequested = (string)$globals->readGetValue('tab', '');
            $activeTab = in_array($tabRequested, self::TABS, true) ? $tabRequested : self::TAB_SLOTS;

            $slotsPayload = null;
            $bookingsPayload = null;
            $expertCancellationsPayload = null;
            $userCancellationsPayload = null;

            $perPage = PaginationHelper::DEFAULT_PER_PAGE;
            if ($activeTab === self::TAB_SLOTS) {
                $slotsPayload = static::buildSlotsPayload(1, $perPage, '', '', 0, '', 0, 0);
            } elseif ($activeTab === self::TAB_BOOKINGS) {
                $bookingsPayload = static::buildBookingsPayload(1, $perPage, '', '');
            } elseif ($activeTab === self::TAB_EXPERT_CANCELLATIONS) {
                $expertCancellationsPayload = static::buildCancellationsPayload('expert', 1, $perPage, '', 0, 0);
            } elseif ($activeTab === self::TAB_USER_CANCELLATIONS) {
                $userCancellationsPayload = static::buildCancellationsPayload('user', 1, $perPage, '', 0, 0);
            }

            $experts = static::loadExperts();
            $users = static::loadUsersForFilter();

            $content = RenderIsland::render('admin-bookings', [
                'pageTitle' => $t->Admin_Slots(),
                'activeTab' => $activeTab,
                'tabs' => self::TABS,
                'experts' => $experts,
                'users' => $users,
                'tabLabels' => [
                    self::TAB_SLOTS => $t->Admin_Bookings_Tab_Slots(),
                    self::TAB_BOOKINGS => $t->Admin_Bookings_Tab_Bookings(),
                    self::TAB_EXPERT_CANCELLATIONS => $t->Admin_Bookings_Tab_ExpertCancellations(),
                    self::TAB_USER_CANCELLATIONS => $t->Admin_Bookings_Tab_UserCancellations(),
                ],
                'slotsPayload' => $slotsPayload,
                'slotsPageUrl' => IRabi::url(self::URL . '~slotsPage'),
                'bookingsPayload' => $bookingsPayload,
                'bookingsPageUrl' => IRabi::url(self::URL . '~bookingsPage'),
                'expertCancellationsPayload' => $expertCancellationsPayload,
                'expertCancellationsPageUrl' => IRabi::url(self::URL . '~expertCancellationsPage'),
                'userCancellationsPayload' => $userCancellationsPayload,
                'userCancellationsPageUrl' => IRabi::url(self::URL . '~userCancellationsPage'),
                'allowedStatuses' => self::ALLOWED_BOOKING_STATUSES,
                'allowedSlotStatuses' => self::ALLOWED_SLOT_STATUSES,
            ]);

            return ControllerTools::ok(HtmlLayout::render(
                TwigParams::init()->get(TwigParams::DEF_LAYOUT_PARAMS, [
                    'content' => $content,
                    'top_menu_items' => static::getMainMenu($url),
                    'side_menu_items' => static::getSideMenu($url),
                ])
            ));
        }

        public static function post__slotsPage(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            if (!static::isModerator()) {
                return ControllerTools::JSON(['error' => 'Access denied'], status: 403);
            }
            ['page' => $page, 'perPage' => $perPage] = PaginationHelper::readPageParams($globals);
            $search = trim((string)$globals->readPostValue('search', ''));
            $status = (string)$globals->readPostValue('status', '');
            $expertId = (int)$globals->readPostValue('expert_id', 0);
            $userQuery = trim((string)$globals->readPostValue('user_q', ''));
            $dateFromRaw = trim((string)$globals->readPostValue('date_from', ''));
            $dateToRaw = trim((string)$globals->readPostValue('date_to', ''));
            $dateFrom = static::parseDateInput($dateFromRaw, 'start');
            $dateTo = static::parseDateInput($dateToRaw, 'end');
            $payload = static::buildSlotsPayload(
                $page, $perPage, $search, $status, $expertId, $userQuery, $dateFrom, $dateTo,
            );
            return ControllerTools::JSON($payload);
        }

        public static function post__bookingsPage(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            if (!static::isModerator()) {
                return ControllerTools::JSON(['error' => 'Access denied'], status: 403);
            }
            ['page' => $page, 'perPage' => $perPage] = PaginationHelper::readPageParams($globals);
            $search = trim((string)$globals->readPostValue('search', ''));
            $status = (string)$globals->readPostValue('status', '');
            $expertId = (int)$globals->readPostValue('expert_id', 0);
            $userId = (int)$globals->readPostValue('user_id', 0);
            $dateFromRaw = trim((string)$globals->readPostValue('date_from', ''));
            $dateToRaw = trim((string)$globals->readPostValue('date_to', ''));
            $dateFrom = static::parseDateInput($dateFromRaw, 'start');
            $dateTo = static::parseDateInput($dateToRaw, 'end');
            $payload = static::buildBookingsPayload(
                $page, $perPage, $search, $status, $expertId, $userId, $dateFrom, $dateTo,
            );
            return ControllerTools::JSON($payload);
        }

        public static function post__expertCancellationsPage(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            if (!static::isModerator()) {
                return ControllerTools::JSON(['error' => 'Access denied'], status: 403);
            }
            ['page' => $page, 'perPage' => $perPage] = PaginationHelper::readPageParams($globals);
            $f = static::readCancellationsFilters($globals);
            $payload = static::buildCancellationsPayload(
                'expert', $page, $perPage, $f['search'], $f['dateFrom'], $f['dateTo'], $f['expertId'], $f['userId'],
            );
            return ControllerTools::JSON($payload);
        }

        public static function post__userCancellationsPage(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            if (!static::isModerator()) {
                return ControllerTools::JSON(['error' => 'Access denied'], status: 403);
            }
            ['page' => $page, 'perPage' => $perPage] = PaginationHelper::readPageParams($globals);
            $f = static::readCancellationsFilters($globals);
            $payload = static::buildCancellationsPayload(
                'user', $page, $perPage, $f['search'], $f['dateFrom'], $f['dateTo'], $f['expertId'], $f['userId'],
            );
            return ControllerTools::JSON($payload);
        }
    }
}
