<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Services;

use Aura\SqlQuery\Common\SelectInterface;
use PHPCraftdream\IRabi\Common\Tables\Bookings;
use PHPCraftdream\IRabi\Common\Tables\TimeSlots;

class CronCompletionService {
    public static function completeExpired(int $limit = 500): array {
        $stats = ['slots' => 0, 'bookings' => 0];

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

        return $stats;
    }
}
