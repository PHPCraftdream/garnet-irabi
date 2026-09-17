<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Foreground\Controllers\Booking {
    use Aura\SqlQuery\Common\SelectInterface;
    use PHPCraftdream\Garnet\Bundle\Support\Utils\HtmlLayout;
    use PHPCraftdream\Garnet\Bundle\Support\Utils\RenderIsland;
    use PHPCraftdream\Garnet\Kernel\Core\Runtime\FrameworkController;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\Account;
    use PHPCraftdream\Garnet\Kernel\Db\Link\CasUpdate;
    use PHPCraftdream\Garnet\Kernel\Exceptions\Db\DbException;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Core\IGlobalReqParams;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Web\Router\IRouterUriParams;
    use PHPCraftdream\Garnet\Kernel\Io\Http\Router\Controller\ControllerTools;
    use PHPCraftdream\Garnet\Kernel\Io\Render\Twig\TwigParams;
    use PHPCraftdream\IRabi\Common\Services\Accounts\AccountDisplay;
    use PHPCraftdream\IRabi\Common\Services\Accounts\ExpertDirectory;
    use PHPCraftdream\IRabi\Common\Services\Booking\SlotCardPayload;
    use PHPCraftdream\IRabi\Common\Services\Comms\EmailNotifications;
    use PHPCraftdream\IRabi\Common\Services\Content\NewsService;
    use PHPCraftdream\IRabi\Common\Tables\Booking\Bookings;
    use PHPCraftdream\IRabi\Common\Tables\Booking\TimeSlots;
    use PHPCraftdream\IRabi\Common\Tables\Booking\UserCancellations;
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
                // Второго фильтра по одобрению здесь нет. Чьи слоты попадут в
                // список, решено выше — `getApprovedExpertIds()` читает флаг
                // аккаунта, тот самый, что пишет одобрение и проверяет
                // бронирование.
                //
                // Раньше рядом жила копия этого флага в отдельной таблице
                // профилей, и она отставала. Фильтрация выборки ИМЁН по этой
                // копии могла только спрятать имя у слота, который и так уже
                // на странице. Так и вышло: карточки и окно бронирования стали
                // безымянными, люди записывались на занятие, не зная, кто его
                // ведёт, а фильтру по преподавателю некого было предложить.
                $experts = ExpertDirectory::byIds($expertIds);
            }

            // Anonymise disabled (IS_DISABLED) expert accounts.
            $disabled = AccountDisplay::disabledIds(array_map('intval', array_keys($experts)));
            foreach ($disabled as $disabledId => $_) {
                $experts[$disabledId]['display_name'] = AccountDisplay::disabledName($disabledId);
            }

            // Третье место, где собиралась карточка занятия, — и до этой
            // правки все три собирали её по-своему. Ссылка на онлайн-встречу
            // прячется за именем площадки там же, внутри: вопрос «как вообще
            // пройдёт занятие» человек задавал преподавателю уже после оплаты
            // (D-052), а сама ссылка наружу не идёт.
            $slots = SlotCardPayload::forViewerList($slots);

            $balance = \PHPCraftdream\IRabi\Common\Tables\Accounts\AccountBalance::getBalance($accountId);

            $content = RenderIsland::render('slots-calendar', [
                'slots' => $slots,
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
                // Their own slots are filtered out below; say so on the page,
                // otherwise an expert looking for them concludes the listing
                // is broken.
                'isExpertViewer' => $account !== null && $account->readParam('type') === 'expert',
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
        /**
         * Текущее состояние одного занятия — чтобы экран мог перечитать его
         * после своего же действия.
         *
         * D-198. После брони обновлялось то, что кто-то не забыл подключить:
         * кнопка, баланс, список своих броней. Сам слот приезжал в пропсах при
         * отрисовке страницы и не менялся уже никогда, поэтому остаток мест
         * оставался прежним до перезагрузки — человек видел результат
         * собственного действия наполовину. За один цикл это поймали в четырёх
         * местах, а точечно тот же класс уже чинили (D-133, баланс в шапке).
         *
         * Намеренно НЕ переиспользуется `~bookData`: тот отдаёт контекст
         * бронирования и отказывает, как только слот перестал быть свободным
         * (409) — то есть ровно в том случае, ради которого перечитывание и
         * нужно. Здесь никаких условий: это те же данные, что страница и так
         * показывает в каталоге, и ссылка на онлайн-встречу спрятана внутри
         * SlotCardPayload.
         */
        public static function post__slotCard(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            if (!Account::fromSession()) {
                return ControllerTools::JSON(['error' => 'Not authenticated'], status: 401);
            }

            $slotId = (int)$globals->readPostValue('slot_id', 0);
            if ($slotId <= 0) {
                return ControllerTools::JSON(['error' => 'slot_id required'], status: 400);
            }

            $slot = TimeSlots::get()->selectById($slotId);
            if (!$slot) {
                return ControllerTools::JSON(['error' => 'slot_unavailable'], status: 404);
            }

            return ControllerTools::JSON(['slot' => SlotCardPayload::forViewer($slot)]);
        }

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
                return ControllerTools::JSON(['error' => 'slot_unavailable'], status: 404);
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

            // Enforce the approval gate inside the transaction: a slot owned by an
            // unapproved/disabled expert is filtered out of the public listing but
            // must also be unbookable via a direct slot_id — see security audit.
            if (!UserEntityConfig::isApprovedActiveExpert((int)$slot['expert_id'])) {
                return ControllerTools::JSON(['error' => 'slot_unavailable', 'redirectUrl' => IRabi::url('/slots')], status: 409);
            }

            $expertId = (int)$slot['expert_id'];
            $expertDisplayName = ExpertDirectory::one($expertId)['display_name'] ?? '';

            $balance = \PHPCraftdream\IRabi\Common\Tables\Accounts\AccountBalance::getBalance($account->id());

            return ControllerTools::JSON([
                // Форма ответа общая со страницей преподавателя: пока каждая
                // витрина собирала её сама, они разошлись четыре раза подряд
                // (D-141, D-178, D-189, D-200).
                'slot' => SlotCardPayload::forViewer($slot),
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
                return ControllerTools::JSON(['error' => 'slot_unavailable'], status: 400);
            }
            if (!is_array($slotUids)) {
                $slotUids = [];
            }

            $accountId = $account->id();
            $slotIds = array_map('intval', $slotIds);
            $now = time();
            $t = ForegroundI18n::getInstance();

            // Validate slots and calculate total
            $totalCost = 0;
            $validSlots = [];
            foreach ($slotIds as $slotId) {
                $slot = TimeSlots::get()->selectOneByField('id', $slotId);
                if (!$slot || $slot['status'] !== 'free') {
                    return ControllerTools::JSON(['error' => 'slot_unavailable'], status: 400);
                }
                if ((int)($slot['expert_id'] ?? 0) === $accountId) {
                    return ControllerTools::JSON(['error' => 'self_slot'], status: 400);
                }
                if ((int)$slot['start_at'] <= $now) {
                    return ControllerTools::JSON(['error' => 'slot_in_past', 'redirectUrl' => IRabi::url('/slots')], status: 409);
                }
                // Approval gate inside the transaction: reject slots owned by an
                // unapproved/disabled expert even when reached via a direct id.
                if (!UserEntityConfig::isApprovedActiveExpert((int)($slot['expert_id'] ?? 0))) {
                    return ControllerTools::JSON(['error' => 'slot_unavailable'], status: 400);
                }
                // Concurrency guard: check id+uid pair
                $expectedUid = (string)($slotUids[(string)$slotId] ?? '');
                $actualUid = (string)($slot['uid'] ?? '');
                if ($expectedUid !== '' && $actualUid !== '' && $expectedUid !== $actualUid) {
                    return ControllerTools::JSON([
                        'error' => 'slot_rescheduled',
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
                    // D-177: was a raw human-readable string — bookErrorMessage()
                    // on the client only recognizes machine codes, so this fell
                    // into its generic "slot unavailable" fallback. Wrong for a
                    // group slot the user can still SEE as bookable by others —
                    // read as "nothing happened".
                    return ControllerTools::JSON(['error' => 'already_booked'], status: 400);
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

            // Per-account advisory lock across the whole money critical section
            // (CAS-debit → final buyer recalculate, including the try/finally
            // below), handover audit 03, finding H-1: a concurrent
            // recalculate() of the same account must not recompute the cache
            // from a ledger that still misses this transient debit. Released
            // in the outer finally at the end of the section.
            try {
                \PHPCraftdream\IRabi\Common\Tables\Accounts\AccountBalance::acquireAccountLock($accountId);
            } catch (\PHPCraftdream\IRabi\Common\Support\Exceptions\AccountLockAcquireException) {
                return ControllerTools::JSON(['error' => 'account_busy'], status: 503);
            }

            try {
                $balanceTbl = \PHPCraftdream\IRabi\Common\Tables\Accounts\AccountBalance::get()->getTableName();
                if ($totalCost > 0) {
                    $affected = CasUpdate::exec(
                        "UPDATE {$balanceTbl} SET balance = balance - ?, updated_at = ? WHERE account_id = ? AND balance >= ?",
                        [$totalCost, $now, $accountId, $totalCost]
                    );
                    if ($affected === 0) {
                        return ControllerTools::JSON(['error' => 'insufficient_balance'], status: 400);
                    }
                }
                $slotsTbl = TimeSlots::get()->getTableName();

                // 2) Create bookings; on duplicate-key (UNIQUE active_dup_key) we silently skip
            //    (slot already booked by this user — pre-flight check missed it due to race).
            //    Compensation: refund the proportional amount.
                $createdBookingIds = [];
                $createdSlotIds = []; // slot IDs for which INSERT actually succeeded (not duplicate-key skipped)
                $bookingIdBySlot = []; // D-154: TYPE_SLOT_BOOKED payload parity with BookingsController
                $refundedTotal = 0;
                $touchedExpertIds = [];
                try {
                    foreach ($validSlots as $slot) {
                        $slotId = (int)$slot['id'];
                        $slotCost = (int)$slot['cost'];
                        $expertId = (int)($slot['expert_id'] ?? 0);

                        // Atomic capacity reservation (security audit H-01) — the real
                        // concurrency boundary, must happen before the booking INSERT.
                        if (!TimeSlots::reserveSeat($slotId)) {
                            // Race-loss: slot filled up concurrently. Refund this slot's cost.
                            $refundedTotal += $slotCost;
                            continue;
                        }

                        try {
                            $bookingId = (int)Bookings::get()->insert([
                                'user_id' => $accountId,
                                'bookable_type' => 'time_slot',
                                'bookable_id' => $slotId,
                                'status' => 'pending',
                                'created_at' => $now,
                            ]);
                        } catch (DbException $e) {
                            TimeSlots::releaseSeat($slotId);
                            if (CasUpdate::isDuplicateKeyError($e)) {
                                // Race-loss: refund this slot's cost.
                                $refundedTotal += $slotCost;
                                continue;
                            }
                            throw $e;
                        }
                        $createdBookingIds[] = $bookingId;
                        $createdSlotIds[$slotId] = true;
                        $bookingIdBySlot[$slotId] = $bookingId;

                        if ($slotCost > 0) {
                            try {
                                \PHPCraftdream\IRabi\Common\Tables\Accounts\BalanceLedger::get()->insert([
                                    'account_id' => $accountId,
                                    'is_credit' => 0,
                                    'amount' => $slotCost,
                                    'entry_type' => 'booking_invoice',
                                    'ref_type' => 'booking',
                                    'ref_id' => $bookingId,
                                    'note' => $t->Ledger_Type_Invoice() . ' #' . $bookingId,
                                    'created_at' => $now,
                                ]);
                            } catch (DbException $e) {
                                if (!CasUpdate::isDuplicateKeyError($e)) {
                                    throw $e;
                                }
                            }

                            if ($expertId > 0) {
                                try {
                                    \PHPCraftdream\IRabi\Common\Tables\Accounts\BalanceLedger::get()->insert([
                                        'account_id' => $expertId,
                                        'is_credit' => 1,
                                        'amount' => $slotCost,
                                        'entry_type' => 'booking_payment',
                                        'ref_type' => 'booking',
                                        'ref_id' => $bookingId,
                                        'note' => $t->Ledger_Type_Payment() . ' #' . $bookingId,
                                        'created_at' => $now,
                                    ]);
                                } catch (DbException $e) {
                                    if (!CasUpdate::isDuplicateKeyError($e)) {
                                        throw $e;
                                    }
                                }
                            }
                        }

                        // Gated on the real (post-reservation) booked_count rather than a
                        // fresh COUNT(*) — always safe to attempt, idempotent/best-effort.
                        CasUpdate::exec(
                            "UPDATE {$slotsTbl} SET status = 'booked' WHERE id = ? AND status = 'free' AND booked_count >= max_users",
                            [$slotId]
                        );

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
                            \PHPCraftdream\IRabi\Common\Tables\Accounts\AccountBalance::recalculate($expertId);
                        } catch (Throwable) {
                        }
                    }
                    try {
                        \PHPCraftdream\IRabi\Common\Tables\Accounts\AccountBalance::recalculate($accountId);
                    } catch (Throwable) {
                    }
                }
            } finally {
                \PHPCraftdream\IRabi\Common\Tables\Accounts\AccountBalance::releaseAccountLock($accountId);
            }

            $userName = $account->readParam('name') ?: ('#' . $account->id());
            foreach ($validSlots as $slot) {
                $slotId = (int)$slot['id'];
                // Only notify/clean-up for bookings that were actually created (not duplicate-key skipped).
                if (!isset($createdSlotIds[$slotId])) {
                    continue;
                }
                $expertId = (int)($slot['expert_id'] ?? 0);
                if ($expertId > 0) {
                    try {
                        NewsService::createPersonal(
                            NewsService::TYPE_SLOT_BOOKED,
                            $accountId,
                            $expertId,
                            [
                                // D-154: BookingsController::post__book has always
                                // included booking_id here; this path never did —
                                // harmless today (the frontend doesn't read it yet)
                                // but kept the two producers of the same event type
                                // silently out of sync.
                                'booking_id' => $bookingIdBySlot[$slotId] ?? 0,
                                'slot_id' => $slotId,
                                'user_id' => $accountId,
                                'name' => $userName,
                                'time' => (int)$slot['start_at'],
                            ],
                            NewsService::slotKey($slotId),
                        );
                        EmailNotifications::bookingCreated($expertId, $accountId, (int)($slot['start_at'] ?? 0), (int)($slot['duration_min'] ?? 0), (int)($slot['max_users'] ?? 1));
                    } catch (Throwable) {
                    }
                }
                // D-154: was unconditional — every booking through this
                // (multi-select) path hid the "new group slot" announcement
                // after the FIRST seat taken, while BookingsController (single-
                // slot detail page) only hides it once the slot is actually
                // full. A group slot with two seats still open silently lost
                // its public announcement after one booking. Re-read the
                // slot's current status: the CAS above only flips it to
                // 'booked' once booked_count reaches max_users, so this now
                // matches the single-slot path's behaviour exactly.
                $freshSlot = TimeSlots::get()->selectOneByField('id', $slotId);
                if ($freshSlot && $freshSlot['status'] === 'booked') {
                    NewsService::deleteByTargetKey(NewsService::slotKey($slotId), NewsService::TYPE_NEW_SLOT);
                }
            }

            return ControllerTools::JSON([
                'success' => true,
                'booked_count' => count($createdBookingIds),
                'total_cost' => $totalCost,
                'new_balance' => \PHPCraftdream\IRabi\Common\Tables\Accounts\AccountBalance::getBalance($accountId),
            ]);
        }
    }
}
