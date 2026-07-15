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

            if (!in_array($booking['status'], ['pending', 'confirmed'], true)) {
                return ControllerTools::JSON(['error' => 'Only pending or confirmed bookings can be cancelled'], status: 400);
            }

            // A confirmed booking whose session has passed must not be refunded retroactively.
            // Pending bookings stay cancellable (the session never took place — refund the user).
            if ($booking['status'] === 'confirmed' && (int)($slot['start_at'] ?? 0) < time()) {
                return ControllerTools::JSON(['error' => 'Cannot cancel past slot'], status: 400);
            }

            $now = time();
            $affected = CasUpdate::exec(
                'UPDATE ' . Bookings::get()->getTableName() . " SET status = 'cancelled', cancelled_at = ? WHERE id = ? AND status IN ('pending', 'confirmed')",
                [$now, $bookingId]
            );

            if ($affected === 1) {
                $slotCost = (int)$slot['cost'];
                $userId = (int)$booking['user_id'];
                $expertId = (int)$slot['expert_id'];

                if ($slotCost > 0) {
                    static::tryInsertRefund($userId, true, $slotCost, $bookingId, 'Refund #' . $bookingId);
                    if ($expertId > 0) {
                        static::tryInsertRefund($expertId, false, $slotCost, $bookingId, 'Refund #' . $bookingId);
                    }
                }

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
                    EmailNotifications::bookingRejected((int)$booking['user_id'], (int)($slot['start_at'] ?? 0), (int)($slot['duration_min'] ?? 0), $account->id());
                    BookingChatNotifier::cancelledOrDeclined($account->id(), (int)$booking['user_id'], (int)$slot['start_at'], (string)$booking['status']);
                } catch (Throwable) {
                }
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
                        static::tryInsertRefund($userId, true, $slotCost, $bookingId, 'Expert cancellation refund #' . $bookingId);
                        if ($expertId > 0) {
                            static::tryInsertRefund($expertId, false, $slotCost, $bookingId, 'Expert cancellation refund #' . $bookingId);
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

            // Set slot status to cancelled
            TimeSlots::get()->updateByField(['status' => 'cancelled'], 'id', $slotId);

            return ControllerTools::JSON(['success' => true]);
        }

        /**
         * Отмена слота (free или booked) с возвратом средств по всем активным бронированиям.
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

            $activeBookings = Bookings::get()->selectAll(function (SelectInterface $query) use ($slotId): void {
                $query->where('bookable_id = :bid', ['bid' => $slotId]);
                $query->where('bookable_type = :btype', ['btype' => 'time_slot']);
                $query->where("status IN ('pending', 'confirmed')");
            });

            $slotCost = (int)$slot['cost'];
            $expertId = (int)$slot['expert_id'];

            $now = time();
            $slotStartAt = (int)($slot['start_at'] ?? 0);
            foreach ($activeBookings as $booking) {
                $bookingId = (int)$booking['id'];

                $affected = CasUpdate::exec(
                    'UPDATE ' . Bookings::get()->getTableName() . " SET status = 'cancelled', cancelled_at = ? WHERE id = ? AND status IN ('pending', 'confirmed')",
                    [$now, $bookingId]
                );

                if ($affected === 1) {
                    $userId = (int)$booking['user_id'];
                    if ($slotCost > 0) {
                        static::tryInsertRefund($userId, true, $slotCost, $bookingId, 'Refund #' . $bookingId);
                        if ($expertId > 0) {
                            static::tryInsertRefund($expertId, false, $slotCost, $bookingId, 'Refund #' . $bookingId);
                        }
                    }

                    ExpertCancellations::get()->insert([
                        'expert_id' => $expertId,
                        'slot_id' => $slotId,
                        'booking_id' => $bookingId,
                        'user_id' => $userId,
                        'reason' => '',
                        'created_at' => $now,
                        'kind' => ($booking['status'] === 'confirmed' ? 'cancel' : 'decline'),
                    ]);

                    // Notify the affected user that the expert cancelled their slot.
                    try {
                        NewsService::createPersonal(NewsService::TYPE_BOOKING_CANCELLED, $expertId, $userId, [
                            'booking_id' => $bookingId,
                            'slot_id' => $slotId,
                            'expert_id' => $expertId,
                            'time' => $slotStartAt,
                        ], NewsService::slotKey($slotId));
                        BookingChatNotifier::cancelledOrDeclined($expertId, $userId, $slotStartAt, (string)$booking['status']);
                    } catch (Throwable) {
                    }
                }
            }

            TimeSlots::get()->updateByField(['status' => 'cancelled'], 'id', $slotId);

            // Slot is gone — purge the new_slot announcement and any prior slot_booked events.
            // Per-user booking_cancelled events stay (they were just emitted above).
            NewsService::deleteByTargetKey(NewsService::slotKey($slotId), NewsService::TYPE_NEW_SLOT);
            NewsService::deleteByTargetKey(NewsService::slotKey($slotId), NewsService::TYPE_SLOT_BOOKED);

            return ControllerTools::JSON(['success' => true]);
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
