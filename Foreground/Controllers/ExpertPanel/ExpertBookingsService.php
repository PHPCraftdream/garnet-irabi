<?php declare(strict_types=1);

/**
 * Сервис бронирований эксперта: список, подтверждение, отмена бронирований и слотов.
 */

namespace PHPCraftdream\IRabi\Foreground\Controllers\ExpertPanel {
    use Aura\SqlQuery\Common\SelectInterface;
    use PHPCraftdream\Garnet\Bundle\Utils\RenderIsland;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\Account;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Session\Session;
    use PHPCraftdream\Garnet\Kernel\Db\Link\CasUpdate;
    use PHPCraftdream\Garnet\Kernel\Exceptions\DbException;
    use PHPCraftdream\Garnet\Kernel\Interfaces\IGlobalReqParams;
    use PHPCraftdream\Garnet\Kernel\Io\Router\ControllerTools;
    use PHPCraftdream\IRabi\Common\Services\BookingChatNotifier;
    use PHPCraftdream\IRabi\Common\Services\EmailNotifications;
    use PHPCraftdream\IRabi\Common\Services\NewsService;
    use PHPCraftdream\IRabi\Common\Tables\AccountBalance;
    use PHPCraftdream\IRabi\Common\Tables\BalanceLedger;
    use PHPCraftdream\IRabi\Common\Tables\Bookings;
    use PHPCraftdream\IRabi\Common\Tables\ExpertCancellations;
    use PHPCraftdream\IRabi\Common\Tables\ExpertProfiles;
    use PHPCraftdream\IRabi\Common\Tables\TimeSlots;
    use PHPCraftdream\IRabi\Foreground\I18n\ForegroundI18n;
    use Throwable;

    class ExpertBookingsService {
        /**
         * Страница бронирований эксперта.
         *
         * @param callable(string): string $renderContent
         */
        public static function bookingsPage(IGlobalReqParams $globals, Account $account, callable $renderContent): mixed {
            $t = ForegroundI18n::getInstance();

            $expertSlots = TimeSlots::get()->selectByField('expert_id', $account->id());
            $slotIds = array_column($expertSlots, 'id');

            $bookings = [];
            if (!empty($slotIds)) {
                $bookings = Bookings::get()->selectAll(function (SelectInterface $query) use ($slotIds): void {
                    $query->where('bookable_id IN (?)', [array_map('intval', $slotIds)]);
                    $query->where('bookable_type = :btype', ['btype' => 'time_slot']);
                    $query->orderBy(['created_at DESC']);
                });
            }

            // Look up student names for bookings
            $userIds = array_values(array_unique(array_filter(array_map(fn ($b) => (int)$b['user_id'], $bookings))));
            $userNames = [];
            if (!empty($userIds)) {
                $accs = Account::getAccounts(
                    selectCallback: static function (SelectInterface $sel) use ($userIds): void {
                        $sel->resetCols();
                        $sel->cols(['id', 'name', 'login']);
                        $sel->where('id IN (?)', [array_map('intval', $userIds)]);
                    },
                );
                foreach ($accs as $a) {
                    $userNames[$a['id']] = $a['name'] ?: $a['login'];
                }
            }
            foreach ($bookings as &$booking) {
                $sid = (int)$booking['user_id'];
                $booking['user_name'] = $userNames[$sid] ?? '';
            }
            unset($booking);

            $slots = [];
            foreach ($expertSlots as $slot) {
                $slots[$slot['id']] = $slot;
            }

            $content = RenderIsland::render('expert-bookings', [
                'bookings' => array_values($bookings),
                'slots' => (object)$slots,
                'title' => $t->Teaching_Bookings_Title(),
                'csrf' => Session::touchCSRF_(),
            ]);

            return $renderContent($content);
        }

        /**
         * Подтверждение ожидающего бронирования.
         */
        public static function confirmBooking(IGlobalReqParams $globals, Account $account): mixed {
            $bookingId = (int)$globals->readPostValue('booking_id', '0');

            $booking = Bookings::get()->selectOneByField('id', $bookingId);
            if (!$booking) {
                return ControllerTools::JSON(['error' => 'Not found'], status: 404);
            }

            $slot = TimeSlots::get()->selectOneByField('id', (int)$booking['bookable_id']);
            if (!$slot || (int)$slot['expert_id'] !== $account->id()) {
                return ControllerTools::JSON(['error' => 'Access denied'], status: 403);
            }

            if ($slot['status'] === 'cancelled') {
                return ControllerTools::JSON(['error' => 'Slot was cancelled'], status: 400);
            }

            if ((int)$slot['start_at'] <= time()) {
                return ControllerTools::JSON(['error' => 'Cannot confirm past slot'], status: 400);
            }

            if ($booking['status'] !== 'pending') {
                return ControllerTools::JSON(['error' => 'Only pending bookings can be confirmed'], status: 400);
            }

            $now = time();
            $affected = CasUpdate::exec(
                'UPDATE ' . Bookings::get()->getTableName() . " SET status = 'confirmed', confirmed_at = ? WHERE id = ? AND status = 'pending'",
                [$now, $bookingId]
            );

            if ($affected === 0) {
                return ControllerTools::JSON(['error' => 'Booking is no longer pending (cancelled or already confirmed)'], status: 409);
            }

            try {
                $expertProfile = ExpertProfiles::get()->selectOneByField('account_id', $account->id());
                $expertName = ($expertProfile['display_name'] ?? '') ?: ($account->readParam('name') ?: ('#' . $account->id()));
                NewsService::createPersonal(NewsService::TYPE_BOOKING_CONFIRMED, $account->id(), (int)$booking['user_id'], [
                    'booking_id' => $bookingId,
                    'slot_id' => (int)$slot['id'],
                    'expert_id' => $account->id(),
                    'name' => $expertName,
                    'time' => (int)$slot['start_at'],
                ], NewsService::slotKey((int)$slot['id']));
                EmailNotifications::bookingConfirmed((int)$booking['user_id'], (int)($slot['start_at'] ?? 0), (int)($slot['duration_min'] ?? 0), $account->id());
                BookingChatNotifier::confirmed($account->id(), (int)$booking['user_id'], (int)$slot['start_at']);
            } catch (Throwable) {
            }

            return ControllerTools::JSON(['success' => true]);
        }

        /**
         * Отмена бронирования экспертом с возвратом средств.
         */
        public static function cancelBooking(IGlobalReqParams $globals, Account $account): mixed {
            $bookingId = (int)$globals->readPostValue('booking_id', '0');
            $reason = trim((string)$globals->readPostValue('reason', ''));

            $booking = Bookings::get()->selectOneByField('id', $bookingId);
            if (!$booking) {
                return ControllerTools::JSON(['error' => 'Not found'], status: 404);
            }

            $slot = TimeSlots::get()->selectOneByField('id', (int)$booking['bookable_id']);
            if (!$slot || (int)$slot['expert_id'] !== $account->id()) {
                return ControllerTools::JSON(['error' => 'Access denied'], status: 403);
            }

            $t = ForegroundI18n::getInstance();

            // ── Recover cancellation context (audit H-2) ──────────────────────
            // A booking already 'cancelled' may be missing its refund if the
            // original cancel crashed between the CAS transition and the ledger
            // insert. tryInsertRefund() is idempotent (ledger UNIQUE index), so
            // re-running the refund path is safe — a duplicate call is a no-op
            // and recalculate() recomputes the same sum.
            $currentStatus = (string)$booking['status'];
            $alreadyCancelled = $currentStatus === 'cancelled';

            if (!$alreadyCancelled) {
                if (!in_array($currentStatus, ['pending', 'confirmed'], true)) {
                    return ControllerTools::JSON(['error' => 'Only pending or confirmed bookings can be cancelled'], status: 400);
                }

                // A confirmed booking whose session has passed must not be refunded retroactively.
                // Pending bookings stay cancellable (the session never took place — refund the user).
                if ($currentStatus === 'confirmed' && (int)($slot['start_at'] ?? 0) < time()) {
                    return ControllerTools::JSON(['error' => 'Cannot cancel past slot'], status: 400);
                }
            }

            $performedCancelNow = false;
            $now = time();

            if (!$alreadyCancelled) {
                $affected = CasUpdate::exec(
                    'UPDATE ' . Bookings::get()->getTableName() . " SET status = 'cancelled', cancelled_at = ? WHERE id = ? AND status IN ('pending', 'confirmed')",
                    [$now, $bookingId]
                );
                if ($affected === 1) {
                    $performedCancelNow = true;
                } else {
                    // Raced: a concurrent request cancelled it between our read
                    // and the CAS. Fall through to the idempotent refund path.
                    $alreadyCancelled = true;
                }
            }

            $slotCost = (int)$slot['cost'];
            $userId = (int)$booking['user_id'];
            $expertId = (int)$slot['expert_id'];

            // Full refund (shared by normal + backfill paths; idempotent).
            // Expert-initiated cancellation is always 100% — no penalty branch.
            if ($slotCost > 0) {
                $note = $t->Ledger_Type_Refund() . ' #' . $bookingId;
                static::tryInsertRefund($userId, true, $slotCost, $bookingId, $note);
                if ($expertId > 0) {
                    static::tryInsertRefund($expertId, false, $slotCost, $bookingId, $note);
                }
            }

            // Side effects (normal path only — this request did the cancel).
            // On the backfill path the original attempt already emitted these;
            // re-running them would duplicate audit rows, emails and news.
            if ($performedCancelNow) {
                // Release the seat this booking held — counterpart to reserveSeat()
                // in BookingsController/SlotsController's post__book().
                TimeSlots::releaseSeat((int)$slot['id']);

                // Log expert-initiated cancellation for audit / admin views (parity with cancelBookedSlot/cancelSlot).
                ExpertCancellations::get()->insert([
                    'expert_id' => $expertId,
                    'slot_id' => (int)$slot['id'],
                    'booking_id' => $bookingId,
                    'user_id' => $userId,
                    'reason' => $reason,
                    'created_at' => $now,
                    'kind' => ($booking['status'] === 'confirmed' ? 'cancel' : 'decline'),
                ]);

                $slotIdForCount = (int)$slot['id'];
                $activeBookings = Bookings::get()->selectAll(function (SelectInterface $query) use ($slotIdForCount): void {
                    $query->where('bookable_id = :bid', ['bid' => $slotIdForCount]);
                    $query->where('bookable_type = :btype', ['btype' => 'time_slot']);
                    $query->where("status IN ('pending', 'confirmed')");
                });
                $maxUsers = (int)$slot['max_users'];

                if (count($activeBookings) < $maxUsers) {
                    TimeSlots::get()->updateByField(['status' => 'free'], 'id', (int)$slot['id']);
                }

                try {
                    $expertProfile = ExpertProfiles::get()->selectOneByField('account_id', $account->id());
                    $expertName = ($expertProfile['display_name'] ?? '') ?: ($account->readParam('name') ?: ('#' . $account->id()));
                    NewsService::createPersonal(NewsService::TYPE_BOOKING_REJECTED, $account->id(), (int)$booking['user_id'], [
                        'booking_id' => $bookingId,
                        'slot_id' => (int)$slot['id'],
                        'expert_id' => $account->id(),
                        'name' => $expertName,
                        'time' => (int)$slot['start_at'],
                    ], NewsService::slotKey((int)$slot['id']));
                    // Stale slot_booked event for this slot is no longer meaningful.
                    NewsService::deleteByTargetKey(NewsService::slotKey((int)$slot['id']), NewsService::TYPE_SLOT_BOOKED);
                    EmailNotifications::bookingRejected((int)$booking['user_id'], (int)($slot['start_at'] ?? 0), (int)($slot['duration_min'] ?? 0), $account->id(), $reason);
                    BookingChatNotifier::cancelledOrDeclined($account->id(), (int)$booking['user_id'], (int)$slot['start_at'], (string)$booking['status']);
                } catch (Throwable) {
                }
            }

            // Recalculate balances after refund (both paths — idempotent).
            AccountBalance::recalculate($userId);
            if ($expertId > 0) {
                AccountBalance::recalculate($expertId);
            }

            return ControllerTools::JSON(['success' => true]);
        }

        /**
         * Отмена забронированного слота (инициирована экспертом) с указанием причины и возвратом.
         */
        public static function cancelBookedSlot(IGlobalReqParams $globals, Account $account): mixed {
            $slotId = (int)$globals->readPostValue('slot_id', '0');
            $reason = trim((string)$globals->readPostValue('reason', ''));

            if (!$reason) {
                return ControllerTools::JSON(['error' => 'Reason is required'], status: 400);
            }

            $slot = TimeSlots::get()->selectOneByField('id', $slotId);
            if (!$slot || (int)$slot['expert_id'] !== $account->id()) {
                return ControllerTools::JSON(['error' => 'Access denied'], status: 403);
            }

            if ($slot['status'] !== 'booked') {
                return ControllerTools::JSON(['error' => 'Only booked slots can be cancelled this way'], status: 400);
            }

            if ((int)($slot['start_at'] ?? 0) < time()) {
                return ControllerTools::JSON(['error' => 'Cannot cancel past slot'], status: 400);
            }

            $t = ForegroundI18n::getInstance();

            // Find active bookings for this slot
            // Use selectAll with named params (selectByField + callback causes param binding conflicts)
            $activeBookings = Bookings::get()->selectAll(function (SelectInterface $query) use ($slotId): void {
                $query->where('bookable_id = :bid', ['bid' => $slotId]);
                $query->where('bookable_type = :btype', ['btype' => 'time_slot']);
                $query->where("status IN ('pending', 'confirmed')");
            });

            $slotCost = (int)$slot['cost'];
            $expertId = $account->id();
            $now = time();

            foreach ($activeBookings as $booking) {
                $bookingId = (int)$booking['id'];
                $userId = (int)$booking['user_id'];

                $affected = CasUpdate::exec(
                    'UPDATE ' . Bookings::get()->getTableName() . " SET status = 'cancelled', cancelled_at = ? WHERE id = ? AND status IN ('pending', 'confirmed')",
                    [$now, $bookingId]
                );

                if ($affected === 1) {
                    if ($slotCost > 0) {
                        $note = $t->Ledger_Type_Refund() . ' #' . $bookingId;
                        static::tryInsertRefund($userId, true, $slotCost, $bookingId, $note);
                        if ($expertId > 0) {
                            static::tryInsertRefund($expertId, false, $slotCost, $bookingId, $note);
                        }
                    }

                    ExpertCancellations::get()->insert([
                        'expert_id' => $expertId,
                        'slot_id' => $slotId,
                        'booking_id' => $bookingId,
                        'user_id' => $userId,
                        'reason' => $reason,
                        'created_at' => $now,
                        'kind' => ($booking['status'] === 'confirmed' ? 'cancel' : 'decline'),
                    ]);

                    try {
                        BookingChatNotifier::cancelledOrDeclined($expertId, $userId, (int)$slot['start_at'], (string)$booking['status']);
                    } catch (Throwable) {
                    }
                }
            }

            // Set slot status to cancelled and release its capacity reservation —
            // a cancelled slot is never bookable again, so booked_count resets to 0.
            TimeSlots::get()->updateByField(['status' => 'cancelled', 'booked_count' => 0], 'id', $slotId);

            return ControllerTools::JSON(['success' => true]);
        }

        /**
         * Отмена слота (free или booked) с возвратом средств по всем активным бронированиям.
         *
         * HTTP-эндпоинт для самого эксперта. Все доступовые и временные проверки
         * (403/400) относятся только к этому прямому вызову — каскадный путь
         * (cancelAllFutureSlotsForExpert) их не проходит, он сразу вызывает
         * cancelSlotInternal() для уже выбранных слотов.
         */
        public static function cancelSlot(IGlobalReqParams $globals, Account $account): mixed {
            $slotId = (int)$globals->readPostValue('slot_id', '0');

            $slot = TimeSlots::get()->selectOneByField('id', $slotId);
            if (!$slot || (int)$slot['expert_id'] !== $account->id()) {
                return ControllerTools::JSON(['error' => 'Access denied'], status: 403);
            }

            if ((int)$slot['start_at'] < time()) {
                return ControllerTools::JSON(['error' => 'Cannot cancel past slot'], status: 400);
            }

            if (!in_array($slot['status'], ['free', 'booked'], true)) {
                return ControllerTools::JSON(['error' => 'Slot cannot be cancelled in current status'], status: 400);
            }

            // Resolve the expert's display name for the "Cancelled by" email row.
            $expertProfile = ExpertProfiles::get()->selectOneByField('account_id', $account->id());
            $cancelledBy = ($expertProfile['display_name'] ?? '') ?: ($account->readParam('name') ?: ('#' . $account->id()));

            static::cancelSlotInternal($slot, null, $cancelledBy);

            return ControllerTools::JSON(['success' => true]);
        }

        /**
         * Общая логика отмены одного слота со всеми его активными бронированиями,
         * полным возвратом средств и уведомлениями. Используется и публичным
         * cancelSlot() (HTTP-эндпоинт эксперта), и каскадным
         * cancelAllFutureSlotsForExpert() (разжалование/блокировка модератором).
         *
         * Действия для каждой активной (pending/confirmed) брони слота:
         *  - атомарный (CAS) перевод в 'cancelled';
         *  - 100%-й возврат: кредит пользователю, дебет эксперту (идемпотентно);
         *  - аудит-запись в ExpertCancellations;
         *  - news TYPE_BOOKING_CANCELLED + чат + email bookingCancelled.
         * Затем слот → status='cancelled', booked_count=0, и чистятся объявления
         * new_slot / slot_booked.
         *
         * @param array       $slot         Строка time_slots (уже загружена вызывающим).
         * @param string|null $kind         Значение kind для ExpertCancellations.
         *                                  null — выводить по статусу брони ('cancel' для
         *                                  confirmed, 'decline' для pending), сохраняя
         *                                  исходное поведение cancelSlot(). Фиксированная
         *                                  строка (напр. 'admin_cancel') переопределяет.
         * @param string      $cancelledBy  Подпись для строки "Отменено:" в email.
         *
         * @return int Число броней, фактически переведённых в 'cancelled'.
         */
        private static function cancelSlotInternal(array $slot, ?string $kind = null, string $cancelledBy = ''): int {
            $slotId = (int)$slot['id'];
            $t = ForegroundI18n::getInstance();

            $activeBookings = Bookings::get()->selectAll(function (SelectInterface $query) use ($slotId): void {
                $query->where('bookable_id = :bid', ['bid' => $slotId]);
                $query->where('bookable_type = :btype', ['btype' => 'time_slot']);
                $query->where("status IN ('pending', 'confirmed')");
            });

            $slotCost = (int)$slot['cost'];
            $expertId = (int)$slot['expert_id'];

            $now = time();
            $slotStartAt = (int)($slot['start_at'] ?? 0);
            $durationMin = (int)($slot['duration_min'] ?? 0);
            $cancelled = 0;

            foreach ($activeBookings as $booking) {
                $bookingId = (int)$booking['id'];

                $affected = CasUpdate::exec(
                    'UPDATE ' . Bookings::get()->getTableName() . " SET status = 'cancelled', cancelled_at = ? WHERE id = ? AND status IN ('pending', 'confirmed')",
                    [$now, $bookingId]
                );

                if ($affected === 1) {
                    $cancelled++;
                    $userId = (int)$booking['user_id'];
                    if ($slotCost > 0) {
                        $note = $t->Ledger_Type_Refund() . ' #' . $bookingId;
                        static::tryInsertRefund($userId, true, $slotCost, $bookingId, $note);
                        if ($expertId > 0) {
                            static::tryInsertRefund($expertId, false, $slotCost, $bookingId, $note);
                        }
                    }

                    ExpertCancellations::get()->insert([
                        'expert_id' => $expertId,
                        'slot_id' => $slotId,
                        'booking_id' => $bookingId,
                        'user_id' => $userId,
                        'reason' => '',
                        'created_at' => $now,
                        'kind' => $kind ?? ($booking['status'] === 'confirmed' ? 'cancel' : 'decline'),
                    ]);

                    // Notify the affected user that their booking was cancelled
                    // (in-app news + chat + email). Wrapped so a notification
                    // failure can never break the cancellation transaction.
                    try {
                        NewsService::createPersonal(NewsService::TYPE_BOOKING_CANCELLED, $expertId, $userId, [
                            'booking_id' => $bookingId,
                            'slot_id' => $slotId,
                            'expert_id' => $expertId,
                            'time' => $slotStartAt,
                        ], NewsService::slotKey($slotId));
                        BookingChatNotifier::cancelledOrDeclined($expertId, $userId, $slotStartAt, (string)$booking['status']);
                        if ($cancelledBy !== '') {
                            EmailNotifications::bookingCancelled($userId, $slotStartAt, $durationMin, $cancelledBy);
                        }
                    } catch (Throwable) {
                    }
                }
            }

            // A cancelled slot is never bookable again — reset its capacity reservation.
            TimeSlots::get()->updateByField(['status' => 'cancelled', 'booked_count' => 0], 'id', $slotId);

            // Slot is gone — purge the new_slot announcement and any prior slot_booked events.
            // Per-user booking_cancelled events stay (they were just emitted above).
            NewsService::deleteByTargetKey(NewsService::slotKey($slotId), NewsService::TYPE_NEW_SLOT);
            NewsService::deleteByTargetKey(NewsService::slotKey($slotId), NewsService::TYPE_SLOT_BOOKED);

            return $cancelled;
        }

        /**
         * Каскадная отмена всех будущих слотов эксперта с полным возвратом и
         * уведомлениями пострадавшим пользователям. Вызывается при разжаловании
         * (IS_APPROVED → 0) или блокировке (IS_DISABLED → 1) модератором, чтобы
         * пользователь, оплативший бронь, не пришёл на занятие, которого не будет.
         *
         * Включая слоты со status='free' (аудит C-2): частично забронированный
         * мульти-слот может оставаться 'free', но иметь активные брони.
         *
         * @param int    $expertId  ID аккаунта эксперта.
         * @param string $kind      Метка для ExpertCancellations (по умолчанию 'admin_cancel',
         *                          чтобы отличать от обычных 'cancel'/'decline' в отчётах).
         *
         * @return int Число броней, фактически переведённых в 'cancelled'.
         */
        public static function cancelAllFutureSlotsForExpert(int $expertId, string $kind = 'admin_cancel'): int {
            $slots = TimeSlots::get()->selectByField('expert_id', $expertId, function (SelectInterface $q): void {
                $q->where('start_at > UNIX_TIMESTAMP()');
                $q->where("status IN ('free', 'booked')");
            });

            $cancelled = 0;
            $cancelledBy = ForegroundI18n::getInstance()->Admin_Role_Moderator();
            foreach ($slots as $slot) {
                $cancelled += static::cancelSlotInternal($slot, $kind, $cancelledBy);
            }

            return $cancelled;
        }

        /**
         * Insert a refund ledger entry and recalculate balance. Ignores duplicates (idempotent).
         */
        private static function tryInsertRefund(int $accountId, bool $isCredit, int $amount, int $bookingId, string $note): void {
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
    }
}
