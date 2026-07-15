<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Migrations\Items {
    use Aura\Cli\Stdio;
    use PHPCraftdream\Garnet\Kernel\Db\Link\DbPool;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Migration\IMigrationItem;
    use PHPCraftdream\IRabi\Common\Tables\Bookings;
    use PHPCraftdream\IRabi\Common\Tables\TimeSlots;

    /**
     * Add time_slots.booked_count — the atomic capacity-reservation counter
     * backing TimeSlots::reserveSeat()/releaseSeat() (security audit H-01:
     * concurrent bookings on the same slot could exceed max_users because
     * the old code checked capacity via a non-atomic COUNT(*) before INSERT).
     *
     * Backfills existing rows from the real COUNT(*) of currently active
     * (pending/confirmed) bookings per slot, so live data starts consistent
     * with the new atomic gate instead of 0.
     *
     * Idempotent — skips if the column already exists.
     */
    class M_0012 implements IMigrationItem {
        public static function update(Stdio $stdio): void {
            $pool = DbPool::get();
            $slotsTable = TimeSlots::get()->getTableName();
            $bookingsTable = Bookings::get()->getTableName();

            $exists = $pool->query("SHOW COLUMNS FROM `{$slotsTable}` LIKE 'booked_count'");
            if (!empty($exists)) {
                $stdio->outln("M_0012: {$slotsTable}.booked_count already exists, skipped");
                return;
            }

            $pool->query(
                "ALTER TABLE `{$slotsTable}` ADD COLUMN booked_count INT(11) NOT NULL DEFAULT 0"
            );

            // Backfill from the real source of truth: active booking rows per slot.
            $pool->query(
                "UPDATE `{$slotsTable}` ts
                 SET ts.booked_count = (
                     SELECT COUNT(*) FROM `{$bookingsTable}` b
                     WHERE b.bookable_type = 'time_slot'
                       AND b.bookable_id = ts.id
                       AND b.status IN ('pending', 'confirmed')
                 )"
            );

            $stdio->outln("M_0012: added {$slotsTable}.booked_count and backfilled from active bookings");
        }
    }
}
