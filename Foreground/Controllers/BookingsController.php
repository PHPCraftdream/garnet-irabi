<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Foreground\Controllers {
    use Aura\SqlQuery\Common\SelectInterface;
    use Closure;
    use PHPCraftdream\Garnet\Bundle\Utils\HtmlLayout;
    use PHPCraftdream\Garnet\Bundle\Utils\RenderIsland;
    use PHPCraftdream\Garnet\Kernel\Core\FrameworkController;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\Account;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Session\Session;
    use PHPCraftdream\Garnet\Kernel\Db\Link\CasUpdate;
    use PHPCraftdream\Garnet\Kernel\Exceptions\DbException;
    use PHPCraftdream\Garnet\Kernel\Interfaces\IGlobalReqParams;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Router\IRouterUriParams;
    use PHPCraftdream\Garnet\Kernel\Io\Router\ControllerTools;
    use PHPCraftdream\Garnet\Kernel\Io\Twig\TwigParams;
    use PHPCraftdream\IRabi\Common\PaginationHelper;
    use PHPCraftdream\IRabi\Common\Services\AccountDisplay;
    use PHPCraftdream\IRabi\Common\Services\EmailNotifications;
    use PHPCraftdream\IRabi\Common\Services\NewsService;
    use PHPCraftdream\IRabi\Common\Tables\AccountBalance;
    use PHPCraftdream\IRabi\Common\Tables\BalanceLedger;
    use PHPCraftdream\IRabi\Common\Tables\Bookings;
    use PHPCraftdream\IRabi\Common\Tables\ExpertProfiles;
    use PHPCraftdream\IRabi\Common\Tables\TimeSlots;
    use PHPCraftdream\IRabi\Common\Tables\UserCancellations;
    use PHPCraftdream\IRabi\Foreground\I18n\ForegroundI18n;
    use PHPCraftdream\IRabi\Foreground\Params\Menu;
    use PHPCraftdream\IRabi\Foreground\Params\UserEntityConfig;
    use PHPCraftdream\IRabi\IRabi;
    use Throwable;

    class BookingsController extends FrameworkController {
        public const URL = '/bookings';

        protected static function getSideMenu(string $url): array {
            return Menu::side($url);
        }

        protected static function getMainMenu(string $url): array {
            return Menu::main($url);
        }

        public static function renderContent(string $content, string $url): string {
            return HtmlLayout::render(
                TwigParams::init()->get(TwigParams::DEF_LAYOUT_PARAMS, [
                    'content' => $content,
                    'top_menu_items' => static::getMainMenu($url),
                    'side_menu_items' => static::getSideMenu($url),
                ])
            );
        }

        private const ALLOWED_STATUSES = ['pending', 'confirmed', 'cancelled', 'completed'];

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
            // Track which slot IDs have a confirmed booking
            $confirmedSlotIds = [];
            foreach ($bookings as $booking) {
                if ($booking['bookable_type'] === 'time_slot') {
                    $slotIds[] = (int)$booking['bookable_id'];
                    if ($booking['status'] === 'confirmed') {
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
                        'expert_id' => (int)$slot['expert_id'],
                        'cost' => (int)($slot['cost'] ?? 0),
                        'cancellation_penalty_percent' => (int)($slot['cancellation_penalty_percent'] ?? 0),
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
                    foreach (ExpertProfiles::get()->selectByField('account_id', $expertIds) as $tp) {
                        $eid = (int)$tp['account_id'];
                        if (isset($disabledExpertIds[$eid])) {
                            $experts[$eid] = ['display_name' => AccountDisplay::disabledName($eid)];
                        } else {
                            $experts[$eid] = ['display_name' => $tp['display_name'] ?? ''];
                        }
                    }
                }
            }

            return ['slots' => $slots, 'runs' => [], 'experts' => $experts, 'users' => $users];
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
            $viewAs = UserEntityConfig::isExpert() ? 'expert' : 'user';

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
            $viewAs = UserEntityConfig::isExpert() ? 'expert' : 'user';
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

        public static function post__book(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            $account = Account::fromSession();
            if (!$account) {
                return ControllerTools::JSON(['error' => 'Not authenticated'], status: 401);
            }

            $postCsrf = $globals->readPostValue(Session::CSRF_TOKEN, '');
            if (!hash_equals(Session::touchCSRF_(), (string)$postCsrf)) {
                return ControllerTools::JSON(['error' => 'CSRF check failed'], status: 403);
            }

            $slotId = (int)$params->getUriParam('id');
            $slotArr = TimeSlots::get()->selectAll(function (SelectInterface $query) use ($slotId): void {
                $query->where('`id` = :slot_id', ['slot_id' => $slotId])
                    ->where('status = :status_free', ['status_free' => 'free'])
                    ->limit(1);
            });
            $slot = $slotArr[0] ?? null;

            if (!$slot) {
                return ControllerTools::JSON(['error' => 'Slot not found or not available'], status: 404);
            }

            if ((int)$slot['start_at'] <= time()) {
                return ControllerTools::JSON(['error' => 'Cannot book a past slot'], status: 400);
            }

            $maxUsers = max(1, (int)($slot['max_users'] ?? 1));

            $activeBookings = Bookings::get()->selectAll(function (SelectInterface $query) use ($slotId): void {
                $query->where('bookable_type = :btype', ['btype' => 'time_slot'])
                    ->where('bookable_id = :bid', ['bid' => $slotId])
                    ->where("status IN ('pending', 'confirmed')");
            });

            if (count($activeBookings) >= $maxUsers) {
                return ControllerTools::JSON(['error' => 'Slot is full'], status: 400);
            }

            $cost = (int)($slot['cost'] ?? 0);
            $expertId = (int)($slot['expert_id'] ?? 0);
            $now = time();

            if ($expertId === $account->id()) {
                return ControllerTools::JSON(['error' => 'Cannot book your own slot'], status: 400);
            }

            // Approval gate inside the transaction: a slot from an unapproved/
            // disabled expert is hidden from the public listing but must also be
            // unbookable via a direct slot id — see security audit.
            if (!UserEntityConfig::isApprovedActiveExpert($expertId)) {
                return ControllerTools::JSON(['error' => 'Slot not found or not available'], status: 404);
            }

            // 1) INSERT booking — UNIQUE(active_dup_key) handles duplicates atomically.
            try {
                $bookingId = (int)Bookings::get()->insert([
                    'user_id' => $account->id(),
                    'bookable_type' => 'time_slot',
                    'bookable_id' => $slotId,
                    'status' => 'pending',
                    'created_at' => $now,
                ]);
            } catch (DbException $e) {
                if (CasUpdate::isDuplicateKeyError($e)) {
                    return ControllerTools::JSON(['error' => 'Already booked'], status: 400);
                }
                throw $e;
            }

            // 2) CAS deduct + ledger entries (idempotent via UNIQUE(account_id, ref_type, ref_id, entry_type)).
            if ($cost > 0) {
                $balanceTbl = AccountBalance::get()->getTableName();
                try {
                    $affected = CasUpdate::exec(
                        "UPDATE {$balanceTbl} SET balance = balance - ?, updated_at = ? WHERE account_id = ? AND balance >= ?",
                        [$cost, $now, $account->id(), $cost]
                    );
                } catch (DbException $e) {
                    // Exception-aware compensation: roll back the booking insert before re-throwing.
                    Bookings::get()->deleteByField('id', $bookingId);
                    throw $e;
                }
                if ($affected === 0) {
                    // Compensate: roll back the booking insert.
                    Bookings::get()->deleteByField('id', $bookingId);
                    return ControllerTools::JSON(['error' => 'Insufficient balance'], status: 400);
                }

                try {
                    BalanceLedger::get()->insert([
                        'account_id' => $account->id(),
                        'is_credit' => 0,
                        'amount' => $cost,
                        'entry_type' => 'booking_invoice',
                        'ref_type' => 'booking',
                        'ref_id' => $bookingId,
                        'note' => 'Счёт #' . $bookingId,
                        'created_at' => $now,
                    ]);
                } catch (DbException $e) {
                    if (!CasUpdate::isDuplicateKeyError($e)) {
                        throw $e;
                    }
                }

                if ($expertId > 0) {
                    try {
                        BalanceLedger::get()->insert([
                            'account_id' => $expertId,
                            'is_credit' => 1,
                            'amount' => $cost,
                            'entry_type' => 'booking_payment',
                            'ref_type' => 'booking',
                            'ref_id' => $bookingId,
                            'note' => 'Оплата #' . $bookingId,
                            'created_at' => $now,
                        ]);
                    } catch (DbException $e) {
                        if (!CasUpdate::isDuplicateKeyError($e)) {
                            throw $e;
                        }
                    }
                }
            }

            // 3) CAS slot status update (only when capacity reached). No compensation needed
            //    if this fails — booking and ledger are already correctly recorded; status
            //    update is best-effort and idempotent.
            if (count($activeBookings) + 1 >= $maxUsers) {
                $slotsTbl = TimeSlots::get()->getTableName();
                CasUpdate::exec(
                    "UPDATE {$slotsTbl} SET status = 'booked' WHERE id = ? AND status = 'free'",
                    [$slotId]
                );
                // Slot is now full — purge the public new_slot announcement for everyone.
                NewsService::deleteByTargetKey(NewsService::slotKey($slotId), NewsService::TYPE_NEW_SLOT);
            }

            AccountBalance::recalculate($account->id());
            if ($expertId > 0) {
                AccountBalance::recalculate($expertId);
            }
            if ($expertId > 0) {
                try {
                    $userName = $account->readParam('name') ?: ('#' . $account->id());
                    NewsService::createPersonal(NewsService::TYPE_SLOT_BOOKED, $account->id(), $expertId, [
                        'booking_id' => (int)$bookingId,
                        'slot_id' => $slotId,
                        'user_id' => $account->id(),
                        'name' => $userName,
                        'time' => (int)$slot['start_at'],
                    ], NewsService::slotKey($slotId));
                    EmailNotifications::bookingCreated($expertId, $account->id(), (int)($slot['start_at'] ?? 0), (int)($slot['duration_min'] ?? 0));
                } catch (Throwable) {
                }
            }

            return ControllerTools::JSON(['success' => true, 'redirect' => '/bookings']);
        }

        public static function post__cancel(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            $account = Account::fromSession();
            if (!$account) {
                return ControllerTools::JSON(['error' => 'Not authenticated'], status: 401);
            }

            $postCsrf = $globals->readPostValue(Session::CSRF_TOKEN, '');
            if (!hash_equals(Session::touchCSRF_(), (string)$postCsrf)) {
                return ControllerTools::JSON(['error' => 'CSRF check failed'], status: 403);
            }

            $bookingId = (int)$params->getUriParam('id');
            $booking = Bookings::get()->selectById($bookingId);

            if (!$booking) {
                return ControllerTools::JSON(['error' => 'Booking not found'], status: 404);
            }

            $isOwner = (int)$booking['user_id'] === $account->id();
            $isModerator = $account->readData('IS_MODERATOR') === '1'
                || $account->readData('IS_OWNER') === '1'
                || $account->readData('IS_ADMIN') === '1';
            if (!$isOwner && !$isModerator) {
                return ControllerTools::JSON(['error' => 'Access denied'], status: 403);
            }

            $previousStatus = (string)$booking['status'];
            if (!in_array($previousStatus, ['pending', 'confirmed'], true)) {
                return ControllerTools::JSON(['error' => 'Booking cannot be cancelled'], status: 400);
            }

            // Disallow cancellation of a CONFIRMED booking once the session has started/passed
            // (the session took place — no retroactive refund). Pending bookings are still
            // cancellable past the slot time: the expert never confirmed, so the user must be
            // able to reclaim their funds.
            if ($previousStatus === 'confirmed' && $booking['bookable_type'] === 'time_slot') {
                $slotForTimeCheck = TimeSlots::get()->selectById((int)$booking['bookable_id']);
                if ($slotForTimeCheck && (int)$slotForTimeCheck['start_at'] <= time()) {
                    return ControllerTools::JSON(['error' => 'Cannot cancel a booking after the session has started'], status: 400);
                }
            }

            // User-initiated cancellation requires a reason
            $reason = trim((string)$globals->readPostValue('reason', ''));
            if ($isOwner && !$reason) {
                return ControllerTools::JSON(['error' => 'Reason is required'], status: 400);
            }

            // CAS cancel: only succeeds if booking is still pending/confirmed.
            $now = time();
            $bookingsTbl = Bookings::get()->getTableName();
            $affected = CasUpdate::exec(
                "UPDATE {$bookingsTbl} SET status = 'cancelled', cancelled_at = ? WHERE id = ? AND status IN ('pending', 'confirmed')",
                [$now, $bookingId]
            );

            if ($affected === 0) {
                // Already cancelled (idempotent) — return success.
                return ControllerTools::JSON(['success' => true]);
            }

            $slotId = 0;
            $expertId = 0;
            $bookingUserId = (int)$booking['user_id'];
            if ($booking['bookable_type'] === 'time_slot') {
                $slot2 = TimeSlots::get()->selectById((int)$booking['bookable_id']);
                $slotId = (int)$booking['bookable_id'];
                $cost = (int)($slot2['cost'] ?? 0);
                $expertId = (int)($slot2['expert_id'] ?? 0);
                $startAt = (int)($slot2['start_at'] ?? 0);
                $penaltyPct = (int)($slot2['cancellation_penalty_percent'] ?? 0);

                if ($cost > 0) {
                    [$userRefund, $expertDebit, $noteSuffix] = static::computeRefundAmounts(
                        cost: $cost,
                        previousStatus: $previousStatus,
                        startAt: $startAt,
                        penaltyPct: $penaltyPct,
                        byUser: $isOwner,
                        nowTs: $now,
                    );

                    if ($userRefund > 0) {
                        $t = ForegroundI18n::getInstance();
                        $note = $t->Ledger_Type_Refund() . ' #' . $bookingId . ($noteSuffix !== '' ? ' (' . $noteSuffix . ')' : '');
                        static::tryAddRefund($bookingUserId, true, $userRefund, $bookingId, $note);
                        if ($expertId && $expertDebit > 0) {
                            static::tryAddRefund($expertId, false, $expertDebit, $bookingId, $note);
                        }
                    }
                }
            }

            if ($isOwner) {
                UserCancellations::get()->insert([
                    'user_id' => $bookingUserId,
                    'booking_id' => $bookingId,
                    'slot_id' => $slotId,
                    'expert_id' => $expertId,
                    'reason' => $reason,
                    'created_at' => time(),
                    'kind' => ($previousStatus === 'confirmed' ? 'cancel' : 'decline'),
                ]);
            }

            if ($booking['bookable_type'] === 'time_slot') {
                $slotId = (int)$booking['bookable_id'];
                $slot = TimeSlots::get()->selectById($slotId);

                if ($slot && $slot['status'] === 'booked') {
                    $maxUsers = max(1, (int)($slot['max_users'] ?? 1));
                    $remaining = Bookings::get()->selectAll(function (SelectInterface $query) use ($slotId): void {
                        $query->where('bookable_type = :btype', ['btype' => 'time_slot'])
                            ->where('bookable_id = :bid', ['bid' => $slotId])
                            ->where("status IN ('pending', 'confirmed')");
                    });
                    if (count($remaining) < $maxUsers) {
                        // CAS slot status revert: only if currently booked (idempotent).
                        $slotsTbl = TimeSlots::get()->getTableName();
                        CasUpdate::exec(
                            "UPDATE {$slotsTbl} SET status = 'free' WHERE id = ? AND status = 'booked'",
                            [$slotId]
                        );
                    }
                }

                if ($slot) {
                    try {
                        $cancelledByName = $account->readParam('name') ?: ('#' . $account->id());
                        EmailNotifications::bookingCancelled((int)$slot['expert_id'], (int)($slot['start_at'] ?? 0), (int)($slot['duration_min'] ?? 0), $cancelledByName);
                    } catch (Throwable) {
                    }

                    $slotExpertId = (int)($slot['expert_id'] ?? 0);
                    // Notify expert that their slot's booking was cancelled by the user.
                    if ($slotExpertId > 0) {
                        try {
                            NewsService::createPersonal(NewsService::TYPE_BOOKING_CANCELLED, $account->id(), $slotExpertId, [
                                'booking_id' => $bookingId,
                                'slot_id' => $slotId,
                                'user_id' => $account->id(),
                                'name' => $cancelledByName ?? ('#' . $account->id()),
                                'time' => (int)($slot['start_at'] ?? 0),
                            ], NewsService::slotKey($slotId));
                        } catch (Throwable) {
                        }
                    }
                    // Purge the stale `slot_booked` announcement for this slot — it no longer holds.
                    NewsService::deleteByTargetKey(NewsService::slotKey($slotId), NewsService::TYPE_SLOT_BOOKED);
                }
            }

            // Recalculate balances after refund.
            AccountBalance::recalculate($bookingUserId);
            if ($expertId > 0) {
                AccountBalance::recalculate($expertId);
            }

            return ControllerTools::JSON(['success' => true]);
        }

        /**
         * Compute refund split for a booking cancellation.
         *
         * Partial-refund branch (penalty applies) ONLY when ALL hold:
         *   - cancellation initiated by the booking's owner ($byUser)
         *   - previous booking status was 'confirmed'
         *   - slot's start_at is in the future ($startAt > $nowTs)
         *
         * In that branch the user is refunded `cost - penalty` and the expert
         * is debited the same amount (the penalty stays with the expert as
         * part of the original `booking_payment` credit). When penalty == 100%
         * (refund == 0), no ledger movement is produced.
         *
         * In all other cases (pending bookings, past slots, expert-initiated),
         * a full refund is returned (cost on both sides).
         *
         * @return array{0:int,1:int,2:string} [userRefund, expertDebit, noteSuffix]
         */
        private static function computeRefundAmounts(
            int $cost,
            string $previousStatus,
            int $startAt,
            int $penaltyPct,
            bool $byUser,
            int $nowTs
        ): array {
            $partialApplies = $byUser
                && $previousStatus === 'confirmed'
                && $startAt > $nowTs;

            if (!$partialApplies) {
                return [$cost, $cost, ''];
            }

            $penaltyPct = max(0, min(100, $penaltyPct));
            $penalty = intdiv($cost * $penaltyPct, 100);
            $refund = $cost - $penalty;

            return [$refund, $refund, "penalty {$penaltyPct}%"];
        }

        /**
         * Add a refund ledger entry and recalculate balance. Ignores duplicates (idempotent).
         */
        private static function tryAddRefund(int $accountId, bool $isCredit, int $amount, int $bookingId, string $note): void {
            try {
                BalanceLedger::addEntry(
                    accountId: $accountId,
                    isCredit: $isCredit,
                    amount: $amount,
                    entryType: 'booking_refund',
                    refType: 'booking',
                    refId: $bookingId,
                    note: $note,
                );
            } catch (DbException $e) {
                if (!CasUpdate::isDuplicateKeyError($e)) {
                    throw $e;
                }
            }
        }

        public static function get__book(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            $url = $globals->getUri();
            $slotId = (int)$params->getUriParam('id');

            $slot = TimeSlots::get()->selectById($slotId);

            if (!$slot) {
                return ControllerTools::notFound('Slot not found');
            }

            $expert = ExpertProfiles::get()->selectOneByField('account_id', $slot['expert_id']);

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
                    'expert_id' => (int)$slot['expert_id'],
                ],
                'expert' => $expert ? [
                    'display_name' => $expert['display_name'],
                    'specialization' => $expert['specialization'] ?? '',
                ] : null,
                'csrf' => Session::touchCSRF_(),
                'isModerator' => UserEntityConfig::isModerator(),
            ]);

            return ControllerTools::ok(static::renderContent($content, $url));
        }
    }
}
