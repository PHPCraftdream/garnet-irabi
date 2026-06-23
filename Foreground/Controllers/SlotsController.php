<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Foreground\Controllers {
    use Aura\SqlQuery\Common\SelectInterface;
    use PHPCraftdream\Garnet\Bundle\Utils\HtmlLayout;
    use PHPCraftdream\Garnet\Bundle\Utils\RenderIsland;
    use PHPCraftdream\Garnet\Kernel\Core\FrameworkController;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\Account;
    use PHPCraftdream\Garnet\Kernel\Db\Link\CasUpdate;
    use PHPCraftdream\Garnet\Kernel\Exceptions\DbException;
    use PHPCraftdream\Garnet\Kernel\Interfaces\IGlobalReqParams;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Router\IRouterUriParams;
    use PHPCraftdream\Garnet\Kernel\Io\Router\ControllerTools;
    use PHPCraftdream\Garnet\Kernel\Io\Twig\TwigParams;
    use PHPCraftdream\IRabi\Common\Services\AccountDisplay;
    use PHPCraftdream\IRabi\Common\Services\EmailNotifications;
    use PHPCraftdream\IRabi\Common\Services\NewsService;
    use PHPCraftdream\IRabi\Common\Tables\Bookings;
    use PHPCraftdream\IRabi\Common\Tables\ExpertProfiles;
    use PHPCraftdream\IRabi\Common\Tables\TimeSlots;
    use PHPCraftdream\IRabi\Common\Tables\UserCancellations;
    use PHPCraftdream\IRabi\Foreground\I18n\ForegroundI18n;
    use PHPCraftdream\IRabi\Foreground\Params\Menu;
    use PHPCraftdream\IRabi\Foreground\Params\UserEntityConfig;
    use PHPCraftdream\IRabi\IRabi;
    use Throwable;

    class SlotsController extends FrameworkController {
        public const URL = '/slots';

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

        public static function get__main(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            $url = $globals->getUri();
            $t = ForegroundI18n::getInstance();
            $account = Account::fromSession();
            $accountId = $account?->id() ?? 0;

            $approvedExpertIds = UserEntityConfig::getApprovedExpertIds();

            // Load 4 weeks of future slots for the calendar view (filtering is client-side)
            $maxTs = time() + 4 * 7 * 86400;

            // Get user's booked slot IDs with their booking statuses and booking IDs.
            // We pull ALL of the user's bookings (pending/confirmed/cancelled/completed) so the
            // calendar can show their full history — including past or cancelled bookings.
            $bookedSlotIds = [];
            $bookedSlotStatuses = [];
            $bookedSlotBookingIds = [];
            if ($accountId > 0) {
                $bookings = Bookings::get()->selectAll(function (SelectInterface $q) use ($accountId): void {
                    $q->where(
                        'user_id = ? AND bookable_type = ? AND status IN (?)',
                        [$accountId, 'time_slot', ['pending', 'confirmed', 'cancelled', 'completed']]
                    );
                });
                foreach ($bookings as $b) {
                    $slotId = (int)$b['bookable_id'];
                    $bookedSlotIds[] = $slotId;
                    $bookedSlotStatuses[$slotId] = $b['status'];
                    $bookedSlotBookingIds[$slotId] = (int)$b['id'];
                }
            }

            // Fetch cancellation reasons for cancelled bookings (if any)
            $cancelReasons = [];
            if ($accountId > 0) {
                $cancellations = UserCancellations::get()->selectAll(function (SelectInterface $q) use ($accountId): void {
                    $q->where('user_id = ?', [$accountId]);
                });
                foreach ($cancellations as $c) {
                    $cancelReasons[(int)$c['slot_id']] = $c['reason'];
                }
            }

            $slots = [];
            if (!empty($approvedExpertIds)) {
                $slots = TimeSlots::get()->selectAll(function (SelectInterface $query) use ($approvedExpertIds, $maxTs, $bookedSlotIds, $accountId): void {
                    // Show: free future slots inside the 4-week window that are NOT the
                    // viewer's own (you can't book yourself), OR any slot booked by the
                    // current user (regardless of status/time, so their cancelled/past
                    // bookings remain visible on the calendar).
                    if (!empty($bookedSlotIds)) {
                        $idList = implode(',', array_map('intval', $bookedSlotIds));
                        $query->where(
                            "((status = :status_free AND start_at > UNIX_TIMESTAMP() AND start_at < :max_ts AND expert_id <> :self_id) OR id IN ({$idList}))",
                            ['status_free' => 'free', 'max_ts' => $maxTs, 'self_id' => $accountId]
                        );
                    } else {
                        $query->where(
                            'status = :status_free AND start_at > UNIX_TIMESTAMP() AND start_at < :max_ts AND expert_id <> :self_id',
                            ['status_free' => 'free', 'max_ts' => $maxTs, 'self_id' => $accountId]
                        );
                    }
                    $query->orderBy(['start_at ASC']);
                    $query->where('expert_id IN (?)', [array_map('intval', $approvedExpertIds)]);
                });
            }

            $expertIds = array_unique(array_column($slots, 'expert_id'));
            $experts = [];
            if (!empty($expertIds)) {
                $expertsData = ExpertProfiles::get()->selectByField('account_id', $expertIds, function (SelectInterface $query): void {
                    $query->where('is_approved = ?', [1]);
                });
                foreach ($expertsData as $expert) {
                    $experts[$expert['account_id']] = $expert;
                }
            }

            // Anonymise disabled (IS_DISABLED) expert accounts.
            $disabled = AccountDisplay::disabledIds(array_map('intval', array_keys($experts)));
            foreach ($disabled as $disabledId => $_) {
                $experts[$disabledId]['display_name'] = AccountDisplay::disabledName($disabledId);
            }

            foreach ($slots as &$s) {
                // Hide online meeting link from public calendar view
                if ((int)($s['is_online'] ?? 0)) {
                    $s['location'] = '';
                }
            }
            unset($s);

            $balance = \PHPCraftdream\IRabi\Common\Tables\AccountBalance::getBalance($accountId);

            $content = RenderIsland::render('slots-calendar', [
                'slots' => array_values($slots),
                'experts' => (object)$experts,
                'title' => $t->Slots_Title(),
                'bookedSlotIds' => $bookedSlotIds,
                'bookedSlotStatuses' => (object)$bookedSlotStatuses,
                'bookedSlotBookingIds' => (object)$bookedSlotBookingIds,
                'csrf' => \PHPCraftdream\Garnet\Kernel\Db\Entity\Session\Session::touchCSRF_(),
                'balance' => $balance,
                'bookUrl' => IRabi::url(static::URL . '/~book'),
                'isModerator' => $account ? UserEntityConfig::isModerator() : false,
                // Anyone signed in can book — the only thing that's never
                // bookable is your own slot, and those are filtered out of the
                // listing below (expert_id <> self).
                'canBook' => $account !== null,
                'quickChatUrl' => IRabi::url('/im/~quickChat'),
                'sendUrl' => IRabi::url('/im/~send'),
                'currentAccountId' => $accountId,
                'cancelReasons' => (object)$cancelReasons,
            ]);

            return ControllerTools::ok(static::renderContent($content, $url));
        }

        /**
         * Fetch the data needed to render a BookingModal for a single slot —
         * used by the news feed to open the booking dialog without leaving the page.
         */
        public static function post__bookData(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            $account = Account::fromSession();
            if (!$account) {
                return ControllerTools::JSON(['error' => 'Not authenticated'], status: 401);
            }

            $slotId = (int)$globals->readPostValue('slot_id', 0);
            if ($slotId <= 0) {
                return ControllerTools::JSON(['error' => 'slot_id required'], status: 400);
            }

            $slot = TimeSlots::get()->selectById($slotId);
            if (!$slot) {
                return ControllerTools::JSON(['error' => 'Slot not found'], status: 404);
            }

            // Self-cannot-book guard: experts can't book their own slots
            if ((int)$slot['expert_id'] === $account->id()) {
                return ControllerTools::JSON(['error' => 'self_slot', 'redirectUrl' => IRabi::url('/expert/id~' . $account->id())], status: 403);
            }
            if ((string)$slot['status'] !== 'free') {
                return ControllerTools::JSON(['error' => 'slot_unavailable', 'redirectUrl' => IRabi::url('/slots')], status: 409);
            }
            if ((int)$slot['start_at'] <= time()) {
                return ControllerTools::JSON(['error' => 'slot_in_past', 'redirectUrl' => IRabi::url('/slots')], status: 409);
            }

            $expertId = (int)$slot['expert_id'];
            $expertProfile = ExpertProfiles::get()->selectOneByField('account_id', $expertId);
            $expertDisplayName = $expertProfile['display_name'] ?? '';

            $balance = \PHPCraftdream\IRabi\Common\Tables\AccountBalance::getBalance($account->id());

            $isOnline = (int)($slot['is_online'] ?? 0);

            return ControllerTools::JSON([
                'slot' => [
                    'id' => (int)$slot['id'],
                    'expert_id' => $expertId,
                    'start_at' => (int)$slot['start_at'],
                    'end_at' => (int)($slot['end_at'] ?? 0),
                    'duration_min' => (int)($slot['duration_min'] ?? 60),
                    'cost' => (int)$slot['cost'],
                    'cancellation_penalty_percent' => (int)($slot['cancellation_penalty_percent'] ?? 0),
                    'is_online' => $isOnline,
                    'location' => $isOnline ? '' : ($slot['location'] ?? ''),
                    'max_users' => (int)($slot['max_users'] ?? 1),
                    'status' => (string)$slot['status'],
                    'uid' => (string)($slot['uid'] ?? ''),
                    'created_at' => (int)($slot['created_at'] ?? 0),
                ],
                'expert' => [
                    'account_id' => $expertId,
                    'display_name' => $expertDisplayName,
                ],
                'balance' => $balance,
                'csrf' => \PHPCraftdream\Garnet\Kernel\Db\Entity\Session\Session::touchCSRF_(),
                'bookUrl' => IRabi::url(static::URL . '/~book'),
            ]);
        }

        /**
         * Book one or multiple slots via JS API.
         */
        public static function post__book(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            $account = Account::fromSession();
            if (!$account) {
                return ControllerTools::JSON(['error' => 'Not authenticated'], status: 401);
            }

            $postCsrf = $globals->readPostValue(\PHPCraftdream\Garnet\Kernel\Db\Entity\Session\Session::CSRF_TOKEN, '');
            if (!hash_equals(\PHPCraftdream\Garnet\Kernel\Db\Entity\Session\Session::touchCSRF_(), (string)$postCsrf)) {
                return ControllerTools::JSON(['error' => 'CSRF check failed'], status: 403);
            }

            $slotIds = $globals->readPostValue('slot_ids', []);
            $slotUids = $globals->readPostValue('slot_uids', []);
            if (!is_array($slotIds) || empty($slotIds)) {
                return ControllerTools::JSON(['error' => 'No slots selected'], status: 400);
            }
            if (!is_array($slotUids)) {
                $slotUids = [];
            }

            $accountId = $account->id();
            $slotIds = array_map('intval', $slotIds);
            $now = time();

            // Validate slots and calculate total
            $totalCost = 0;
            $validSlots = [];
            foreach ($slotIds as $slotId) {
                $slot = TimeSlots::get()->selectOneByField('id', $slotId);
                if (!$slot || $slot['status'] !== 'free') {
                    return ControllerTools::JSON(['error' => "Slot #{$slotId} is not available"], status: 400);
                }
                if ((int)($slot['expert_id'] ?? 0) === $accountId) {
                    return ControllerTools::JSON(['error' => "Cannot book your own slot #{$slotId}"], status: 400);
                }
                if ((int)$slot['start_at'] <= $now) {
                    return ControllerTools::JSON(['error' => 'slot_in_past', 'redirectUrl' => IRabi::url('/slots')], status: 409);
                }
                // Concurrency guard: check id+uid pair
                $expectedUid = (string)($slotUids[(string)$slotId] ?? '');
                $actualUid = (string)($slot['uid'] ?? '');
                if ($expectedUid !== '' && $actualUid !== '' && $expectedUid !== $actualUid) {
                    return ControllerTools::JSON([
                        'error' => 'Slot has been rescheduled. Please refresh the page.',
                        'stale' => true,
                    ], status: 409);
                }
                $totalCost += (int)$slot['cost'];
                $validSlots[] = $slot;

                $alreadyBooked = Bookings::get()->selectAll(function (SelectInterface $query) use ($accountId, $slotId): void {
                    $query->where('user_id = ?', [$accountId])
                        ->where('bookable_type = ?', ['time_slot'])
                        ->where('bookable_id = ?', [$slotId])
                        ->where("status IN ('pending', 'confirmed')");
                });
                if (!empty($alreadyBooked)) {
                    return ControllerTools::JSON(['error' => "Slot #{$slotId} already booked"], status: 400);
                }
            }

            // 1) CAS deduct total cost up front (single atomic check). If fail → no bookings created.
            //    No compensation needed on exception here — nothing has been inserted yet.
            //    NOTE: This direct UPDATE is a transient adjustment. The ledger is the source of
            //    truth: BalanceLedger receives a `booking_invoice` row for every successfully
            //    inserted booking below. The final AccountBalance::recalculate() rebuilds the
            //    balance from the ledger, so any direct UPDATE drift here is overwritten.
            //    The try/finally guarantees recalculate() runs even if an exception is thrown
            //    mid-loop — otherwise balance and ledger could remain out of sync.
            $balanceTbl = \PHPCraftdream\IRabi\Common\Tables\AccountBalance::get()->getTableName();
            if ($totalCost > 0) {
                $affected = CasUpdate::exec(
                    "UPDATE {$balanceTbl} SET balance = balance - ?, updated_at = ? WHERE account_id = ? AND balance >= ?",
                    [$totalCost, $now, $accountId, $totalCost]
                );
                if ($affected === 0) {
                    return ControllerTools::JSON(['error' => 'Insufficient balance'], status: 400);
                }
            }
            $slotsTbl = TimeSlots::get()->getTableName();

            // 2) Create bookings; on duplicate-key (UNIQUE active_dup_key) we silently skip
            //    (slot already booked by this user — pre-flight check missed it due to race).
            //    Compensation: refund the proportional amount.
            $createdBookingIds = [];
            $refundedTotal = 0;
            $touchedExpertIds = [];
            try {
                foreach ($validSlots as $slot) {
                    $slotId = (int)$slot['id'];
                    $slotCost = (int)$slot['cost'];
                    $expertId = (int)($slot['expert_id'] ?? 0);

                    try {
                        $bookingId = (int)Bookings::get()->insert([
                            'user_id' => $accountId,
                            'bookable_type' => 'time_slot',
                            'bookable_id' => $slotId,
                            'status' => 'pending',
                            'created_at' => $now,
                        ]);
                    } catch (DbException $e) {
                        if (CasUpdate::isDuplicateKeyError($e)) {
                            // Race-loss: refund this slot's cost.
                            $refundedTotal += $slotCost;
                            continue;
                        }
                        throw $e;
                    }
                    $createdBookingIds[] = $bookingId;

                    if ($slotCost > 0) {
                        try {
                            \PHPCraftdream\IRabi\Common\Tables\BalanceLedger::get()->insert([
                                'account_id' => $accountId,
                                'is_credit' => 0,
                                'amount' => $slotCost,
                                'entry_type' => 'booking_invoice',
                                'ref_type' => 'booking',
                                'ref_id' => $bookingId,
                                'note' => "\xD0\xA1\xD1\x87\xD1\x91\xD1\x82 #" . $bookingId,
                                'created_at' => $now,
                            ]);
                        } catch (DbException $e) {
                            if (!CasUpdate::isDuplicateKeyError($e)) {
                                throw $e;
                            }
                        }

                        if ($expertId > 0) {
                            try {
                                \PHPCraftdream\IRabi\Common\Tables\BalanceLedger::get()->insert([
                                    'account_id' => $expertId,
                                    'is_credit' => 1,
                                    'amount' => $slotCost,
                                    'entry_type' => 'booking_payment',
                                    'ref_type' => 'booking',
                                    'ref_id' => $bookingId,
                                    'note' => "\xD0\x9E\xD0\xBF\xD0\xBB\xD0\xB0\xD1\x82\xD0\xB0 #" . $bookingId,
                                    'created_at' => $now,
                                ]);
                            } catch (DbException $e) {
                                if (!CasUpdate::isDuplicateKeyError($e)) {
                                    throw $e;
                                }
                            }
                        }
                    }

                    $maxUsers = max(1, (int)($slot['max_users'] ?? 1));
                    $rowsCnt = Bookings::get()->selectAll(function (SelectInterface $q) use ($slotId): void {
                        $q->where("bookable_type = 'time_slot'")
                            ->where('bookable_id = ?', [$slotId])
                            ->where("status IN ('pending', 'confirmed')");
                    });
                    if (count($rowsCnt) >= $maxUsers) {
                        CasUpdate::exec(
                            "UPDATE {$slotsTbl} SET status = 'booked' WHERE id = ? AND status = 'free'",
                            [$slotId]
                        );
                    }

                    if ($expertId > 0) {
                        $touchedExpertIds[$expertId] = true;
                    }
                }

                // Compensate any race-lost bookings by re-crediting the user.
                // Like the initial deduct, this is a transient direct UPDATE — the final
                // recalculate() in finally rebuilds the balance from ledger truth anyway.
                if ($refundedTotal > 0) {
                    CasUpdate::exec(
                        "UPDATE {$balanceTbl} SET balance = balance + ?, updated_at = ? WHERE account_id = ?",
                        [$refundedTotal, $now, $accountId]
                    );
                }
            } finally {
                // Always reconcile balances from ledger, even if the loop above threw.
                // Ledger contains booking_invoice rows for every booking actually inserted,
                // so this is the authoritative final balance for both user and experts.
                foreach ($touchedExpertIds as $expertId => $_) {
                    try {
                        \PHPCraftdream\IRabi\Common\Tables\AccountBalance::recalculate($expertId);
                    } catch (Throwable) {
                    }
                }
                try {
                    \PHPCraftdream\IRabi\Common\Tables\AccountBalance::recalculate($accountId);
                } catch (Throwable) {
                }
            }

            $userName = $account->readParam('name') ?: ('#' . $account->id());
            foreach ($validSlots as $slot) {
                $expertId = (int)($slot['expert_id'] ?? 0);
                $slotId = (int)$slot['id'];
                if ($expertId > 0) {
                    try {
                        NewsService::createPersonal(
                            NewsService::TYPE_SLOT_BOOKED,
                            $accountId,
                            $expertId,
                            [
                                'slot_id' => $slotId,
                                'user_id' => $accountId,
                                'name' => $userName,
                                'time' => (int)$slot['start_at'],
                            ],
                            NewsService::slotKey($slotId),
                        );
                        EmailNotifications::bookingCreated($expertId, $accountId, (int)($slot['start_at'] ?? 0), (int)($slot['duration_min'] ?? 0));
                    } catch (Throwable) {
                    }
                }
                // Slot is now booked — drop the public new_slot announcement.
                NewsService::deleteByTargetKey(NewsService::slotKey($slotId), NewsService::TYPE_NEW_SLOT);
            }

            return ControllerTools::JSON([
                'success' => true,
                'booked_count' => count($validSlots),
                'total_cost' => $totalCost,
                'new_balance' => \PHPCraftdream\IRabi\Common\Tables\AccountBalance::getBalance($accountId),
            ]);
        }
    }
}
