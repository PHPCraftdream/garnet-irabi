<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Services;

use Aura\SqlQuery\Common\SelectInterface;
use PHPCraftdream\Garnet\Kernel\Db\Link\CasUpdate;
use PHPCraftdream\IRabi\Common\Tables\BalanceLedger;
use PHPCraftdream\IRabi\Common\Tables\Bookings;
use PHPCraftdream\IRabi\Common\Tables\TimeSlots;

class CronCompletionService {
    public static function completeExpired(int $limit = 500): array {
        $stats = ['slots' => 0, 'bookings' => 0, 'pending_expired' => 0];

        $now = time();

        $slots = TimeSlots::get()->selectAll(function (SelectInterface $q) use ($now, $limit): void {
            $q->where("status = 'booked'")
                ->where('end_at > 0')
                ->where('end_at < ?', [$now])
                ->limit($limit);
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
        $expiredOpenSlots = TimeSlots::get()->selectAll(function (SelectInterface $q) use ($now, $limit): void {
            $q->where('end_at > 0')
                ->where('end_at < ?', [$now])
                ->where("status NOT IN ('completed', 'cancelled', 'booked')")
                ->limit($limit);
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
        $expiredNotCancelledSlots = TimeSlots::get()->selectAll(function (SelectInterface $q) use ($now, $limit): void {
            $q->where('end_at > 0')
                ->where('end_at < ?', [$now])
                ->where("status != 'cancelled'")
                ->limit($limit);
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
                // we skip the refund/email entirely. addEntry() is also
                // idempotent by UNIQUE(account_id, entry_type, ref_type, ref_id),
                // but we avoid even attempting a duplicate refund.
                $affected = CasUpdate::exec(
                    "UPDATE {$bookingsTbl} SET status = 'cancelled', cancelled_at = ? WHERE id = ? AND status = 'pending'",
                    [$now, $bookingId]
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

                // Full refund: credit the user and debit the expert by the same
                // amount. addEntry() recalculates the cached balance internally
                // (under the per-account advisory lock).
                if ($slotCost > 0) {
                    BalanceLedger::addEntry(
                        accountId: $userId,
                        isCredit: true,
                        amount: $slotCost,
                        entryType: 'booking_refund',
                        refType: 'booking',
                        refId: $bookingId,
                        note: 'Auto-cancel (slot expired) #' . $bookingId,
                    );
                    if ($expertId > 0) {
                        BalanceLedger::addEntry(
                            accountId: $expertId,
                            isCredit: false,
                            amount: $slotCost,
                            entryType: 'booking_refund',
                            refType: 'booking',
                            refId: $bookingId,
                            note: 'Auto-cancel (slot expired) #' . $bookingId,
                        );
                    }
                }

                // Notify the user: their request was not accepted before the
                // session time. bookingRejected is the closest existing
                // template — it addresses the user and fills in the expert name.
                EmailNotifications::bookingRejected($userId, $startAt, $durationMin, $expertId);

                $stats['pending_expired']++;
            }
        }

        return $stats;
    }
}
