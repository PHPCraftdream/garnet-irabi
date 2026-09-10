<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Services;

use Aura\SqlQuery\Common\SelectInterface;
use PHPCraftdream\Garnet\Kernel\Db\Link\CasUpdate;
use PHPCraftdream\IRabi\Common\Tables\BalanceLedger;
use PHPCraftdream\IRabi\Common\Tables\Bookings;
use PHPCraftdream\IRabi\Common\Tables\TimeSlots;
use PHPCraftdream\IRabi\Common\Tables\UserCancellations;
use PHPCraftdream\IRabi\Foreground\I18n\ForegroundI18n;

class CronCompletionService {
    /**
     * @param list<int>|null $slotIds ограничить перечисленными занятиями;
     *                                null — все, как при обычном тике крона
     */
    public static function completeExpired(int $limit = 500, ?array $slotIds = null): array {
        $stats = ['slots' => 0, 'bookings' => 0, 'pending_expired' => 0];

        $now = time();

        // Пустой список — «ни одного», а не «все»: иначе вызов, которому
        // нечего завершать, завершил бы всё подряд.
        if ($slotIds !== null && $slotIds === []) {
            return $stats;
        }

        $slots = TimeSlots::get()->selectAll(function (SelectInterface $q) use ($now, $limit, $slotIds): void {
            $q->where("status = 'booked'")
                ->where('end_at > 0')
                ->where('end_at < ?', [$now])
                ->limit($limit);

            if ($slotIds !== null) {
                $q->where('id IN (?)', [$slotIds]);
            }
        });

        $completedSlotIds = [];
        foreach ($slots as $slot) {
            TimeSlots::get()->updateById(['status' => 'completed'], $slot['id']);
            $completedSlotIds[] = (int)$slot['id'];
        }
        $stats['slots'] = count($completedSlotIds);

        if (!empty($completedSlotIds)) {
            $slotBookings = Bookings::get()->selectAll(function (SelectInterface $q) use ($completedSlotIds): void {
                $q->where("status = 'confirmed'")
                    ->where("bookable_type = 'time_slot'")
                    ->where('bookable_id IN (?)', [$completedSlotIds]);
            });

            $slotBookingIds = array_map(fn (array $b): int => (int)$b['id'], $slotBookings);
            if (!empty($slotBookingIds)) {
                Bookings::get()->updateById(['status' => 'completed'], $slotBookingIds);
            }
            $stats['bookings'] += count($slotBookingIds);
        }

        // Complete confirmed bookings for slots that never filled up (status remained 'free')
        // but whose session time has passed. Without this, under-subscribed group slots leave
        // their confirmed bookings cancelable indefinitely with a full refund.
        // The 'booked' slots are already handled above, so exclude them here.
        $expiredOpenSlots = TimeSlots::get()->selectAll(function (SelectInterface $q) use ($now, $limit, $slotIds): void {
            $q->where('end_at > 0')
                ->where('end_at < ?', [$now])
                ->where("status NOT IN ('completed', 'cancelled', 'booked')")
                ->limit($limit);

            if ($slotIds !== null) {
                $q->where('id IN (?)', [$slotIds]);
            }
        });

        $expiredOpenSlotIds = array_map(fn (array $s): int => (int)$s['id'], $expiredOpenSlots);
        if (!empty($expiredOpenSlotIds)) {
            $orphanBookings = Bookings::get()->selectAll(function (SelectInterface $q) use ($expiredOpenSlotIds): void {
                $q->where("status = 'confirmed'")
                    ->where("bookable_type = 'time_slot'")
                    ->where('bookable_id IN (?)', [$expiredOpenSlotIds]);
            });

            $orphanBookingIds = array_map(fn (array $b): int => (int)$b['id'], $orphanBookings);
            if (!empty($orphanBookingIds)) {
                Bookings::get()->updateById(['status' => 'completed'], $orphanBookingIds);
                $stats['bookings'] += count($orphanBookingIds);

                // The bookings are done, but the slot itself (D-144) was left
                // at 'free' forever — the calendar kept showing it as still
                // open, Edit/Delete included, for a session that already happened.
                $orphanSlotIds = array_values(array_unique(
                    array_map(fn (array $b): int => (int)$b['bookable_id'], $orphanBookings),
                ));
                TimeSlots::get()->updateById(['status' => 'completed'], $orphanSlotIds);
                $stats['slots'] += count($orphanSlotIds);
            }
        }

        // Auto-cancel pending bookings whose slot has already passed without an
        // expert decision. A pending booking is already PAID at booking time
        // (booking_invoice debit on the user, booking_payment credit on the
        // expert — both inserted unconditionally by post__book), so leaving it
        // pending forever keeps the user's funds locked and the expert credited
        // for a session that never happened. Once end_at has passed on a slot
        // that is NOT itself cancelled, cancel the booking with a FULL refund
        // and notify the user. Slots already cancelled are skipped — their
        // bookings are cancelled by the slot-cancellation flow. Idempotent: a
        // re-run finds no status='pending' row and is a no-op.
        $expiredNotCancelledSlots = TimeSlots::get()->selectAll(function (SelectInterface $q) use ($now, $limit, $slotIds): void {
            $q->where('end_at > 0')
                ->where('end_at < ?', [$now])
                ->where("status != 'cancelled'")
                ->limit($limit);

            if ($slotIds !== null) {
                $q->where('id IN (?)', [$slotIds]);
            }
        });

        $expiredSlotIds = array_map(fn (array $s): int => (int)$s['id'], $expiredNotCancelledSlots);

        if (!empty($expiredSlotIds)) {
            $pendingBookings = Bookings::get()->selectAll(function (SelectInterface $q) use ($expiredSlotIds): void {
                $q->where("status = 'pending'")
                    ->where("bookable_type = 'time_slot'")
                    ->where('bookable_id IN (?)', [$expiredSlotIds]);
            });

            $bookingsTbl = Bookings::get()->getTableName();

            foreach ($pendingBookings as $pBooking) {
                $bookingId = (int)$pBooking['id'];
                $userId = (int)$pBooking['user_id'];

                // CAS pending → cancelled. Only a row still in 'pending' flips;
                // a parallel manual cancel (user or expert) makes affected=0 and
                // we skip the refund/email entirely. tryAddRefund() below is
                // also idempotent (UNIQUE(account_id, entry_type, ref_type,
                // ref_id)), but we avoid even attempting a duplicate refund.
                $affected = CasUpdate::exec(
                    "UPDATE {$bookingsTbl} SET status = 'cancelled', cancelled_at = ?, cancelled_role = ? WHERE id = ? AND status = 'pending'",
                    [$now, Bookings::CANCELLED_BY_SYSTEM, $bookingId]
                );
                if ($affected === 0) {
                    continue;
                }

                $slotId = (int)$pBooking['bookable_id'];
                $slot = TimeSlots::get()->selectById($slotId);
                if (!$slot) {
                    continue;
                }

                // Release the seat this pending booking held — counterpart to
                // reserveSeat() in post__book(), mirroring the manual cancel paths.
                TimeSlots::releaseSeat($slotId);

                $slotCost = (int)($slot['cost'] ?? 0);
                $expertId = (int)($slot['expert_id'] ?? 0);
                $startAt = (int)($slot['start_at'] ?? 0);
                $durationMin = (int)($slot['duration_min'] ?? 0);

                // D-146: this path flipped bookings.status but never wrote a
                // user_cancellations row — the only table the profile-page
                // counters (and the booking-card cause line) read from. A
                // pending booking auto-declined by the cron was invisible to
                // both "Снятий" and "Отмен", yet still counted in "Всего".
                $autoDeclineNote = ForegroundI18n::getInstance()->Ledger_Note_AutoCancel();
                UserCancellations::get()->insert([
                    'user_id' => $userId,
                    'booking_id' => $bookingId,
                    'slot_id' => $slotId,
                    'expert_id' => $expertId,
                    'reason' => $autoDeclineNote,
                    'created_at' => $now,
                    'kind' => 'decline', // always pending here, never confirmed
                ]);

                // Full refund: credit the user and debit the expert by the same
                // amount. addEntry() recalculates the cached balance internally
                // (under the per-account advisory lock).
                if ($slotCost > 0) {
                    // Примечание видно человеку в истории операций, и долгое
                    // время оно было единственным местом во всём продукте, где
                    // вообще называлась причина отмены, — да ещё по-английски
                    // посреди русского интерфейса.
                    $note = $autoDeclineNote . ' #' . $bookingId;

                    // D-155: addEntry() throws on a duplicate ledger row instead of
                    // no-oping — every other cancellation path uses tryAddRefund()
                    // for exactly that reason (a retried/raced cron tick must not
                    // crash on a refund that already landed).
                    BalanceLedger::tryAddRefund($userId, true, $slotCost, $bookingId, $note);
                    if ($expertId > 0) {
                        BalanceLedger::tryAddRefund($expertId, false, $slotCost, $bookingId, $note);
                    }
                }

                // Notify the user: their request was not accepted before the
                // session time. bookingRejected is the closest existing
                // template — it addresses the user and fills in the expert name.
                EmailNotifications::bookingRejected($userId, $startAt, $durationMin, $expertId, '', (int)($slot['max_users'] ?? 1));

                $stats['pending_expired']++;
            }
        }

        return $stats;
    }

    /**
     * D-163: `time_slots.booked_count` is a cached counter maintained by
     * paired reserveSeat()/releaseSeat() calls around every booking write.
     * A crash between reserveSeat() succeeding and the following
     * `bookings` INSERT (a killed worker, OOM — anything PHP's own
     * try/catch can't intercept, unlike every ordinary failure path in
     * BookingsController/SlotsController, which already compensate
     * correctly) leaves the counter incremented forever with no booking
     * row left to ever release it: the seat looks permanently taken, the
     * slot still shows `status='free'` everywhere (the CAS flip to
     * 'booked' only runs AFTER a successful insert, which never
     * happened), and nothing revisits booked_count again on its own. A
     * live incident (support ticket #3) traced back to exactly this: a
     * hung booking request, no charge, no booking created, and the
     * expert's own slot list never showed the seat as free again.
     *
     * Recompute booked_count from what actually holds a seat right now —
     * active (pending/confirmed) bookings — for every non-terminal slot,
     * and resync status to match. The CAS write only applies if
     * booked_count still matches what we just read, so a booking that
     * reserves a seat between our read and our write is left untouched —
     * same safety margin as every other CAS update in this codebase.
     * Idempotent; a tick with nothing to fix is a no-op.
     *
     * @return array{checked:int,fixed:int}
     */
    public static function reconcileSeats(int $limit = 500): array {
        $stats = ['checked' => 0, 'fixed' => 0];

        $slots = TimeSlots::get()->selectAll(function (SelectInterface $q) use ($limit): void {
            $q->where("status IN ('free', 'booked')")->limit($limit);
        });
        $stats['checked'] = count($slots);
        if (empty($slots)) {
            return $stats;
        }

        $slotIds = array_map(fn (array $s): int => (int)$s['id'], $slots);
        $counts = Bookings::get()->selectAll(function (SelectInterface $q) use ($slotIds): void {
            $q->resetCols();
            $q->cols(['bookable_id', 'COUNT(*) as cnt']);
            $q->where("bookable_type = 'time_slot'")
                ->where('bookable_id IN (?)', [$slotIds])
                ->where("status IN ('pending', 'confirmed')")
                ->groupBy(['bookable_id']);
        });
        $activeCountBySlot = [];
        foreach ($counts as $row) {
            $activeCountBySlot[(int)$row['bookable_id']] = (int)$row['cnt'];
        }

        $slotsTbl = TimeSlots::get()->getTableName();
        foreach ($slots as $slot) {
            $slotId = (int)$slot['id'];
            $cachedCount = (int)$slot['booked_count'];
            $trueCount = $activeCountBySlot[$slotId] ?? 0;
            if ($trueCount === $cachedCount) {
                continue;
            }

            $maxUsers = max(1, (int)($slot['max_users'] ?? 1));
            $newStatus = $trueCount >= $maxUsers ? 'booked' : 'free';

            $affected = CasUpdate::exec(
                "UPDATE {$slotsTbl} SET booked_count = ?, status = ? WHERE id = ? AND booked_count = ?",
                [$trueCount, $newStatus, $slotId, $cachedCount]
            );
            if ($affected === 1) {
                $stats['fixed']++;
            }
        }

        return $stats;
    }
}
