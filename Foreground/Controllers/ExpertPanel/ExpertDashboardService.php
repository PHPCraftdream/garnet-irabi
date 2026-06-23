<?php declare(strict_types=1);

/**
 * Сервис дашборда эксперта: статистика, предстоящие слоты, ожидающие бронирования.
 */

namespace PHPCraftdream\IRabi\Foreground\Controllers\ExpertPanel {
    use Aura\SqlQuery\Common\SelectInterface;
    use PHPCraftdream\Garnet\Bundle\Utils\RenderIsland;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\Account;
    use PHPCraftdream\Garnet\Kernel\Interfaces\IGlobalReqParams;
    use PHPCraftdream\IRabi\Common\System\DateUtils;
    use PHPCraftdream\IRabi\Common\Tables\BalanceLedger;
    use PHPCraftdream\IRabi\Common\Tables\Bookings;
    use PHPCraftdream\IRabi\Common\Tables\ExpertCancellations;
    use PHPCraftdream\IRabi\Common\Tables\TimeSlots;
    use PHPCraftdream\IRabi\Foreground\I18n\ForegroundI18n;

    class ExpertDashboardService {
        /**
         * Главная страница дашборда эксперта со статистикой и виджетами.
         *
         * @param callable(string): string $renderContent
         */
        public static function dashboard(IGlobalReqParams $globals, Account $account, callable $renderContent): mixed {
            $t = ForegroundI18n::getInstance();

            $expertId = $account->id();
            $expertTz = $account->readParam('time_zone') ?: 'UTC';
            $now = time();

            // Slots today
            $todayStart = DateUtils::startOfTodayForUser($expertTz);
            $todayEnd = DateUtils::startOfTomorrowForUser($expertTz);
            $slotsToday = count(TimeSlots::get()->selectAll(function (SelectInterface $query) use ($expertId, $todayStart, $todayEnd): void {
                $query->where('expert_id = ?', [$expertId])
                    ->where("status != 'cancelled'")
                    ->where('start_at >= ?', [$todayStart])
                    ->where('start_at < ?', [$todayEnd]);
            }));

            // Slots tomorrow
            $tomorrowStart = $todayEnd;
            $tomorrowEnd = DateUtils::startOfDayAfterTomorrowForUser($expertTz);
            $slotsTomorrow = count(TimeSlots::get()->selectAll(function (SelectInterface $query) use ($expertId, $tomorrowStart, $tomorrowEnd): void {
                $query->where('expert_id = ?', [$expertId])
                    ->where("status != 'cancelled'")
                    ->where('start_at >= ?', [$tomorrowStart])
                    ->where('start_at < ?', [$tomorrowEnd]);
            }));

            // Pending bookings (count + full list for widget)
            $allSlotIds = array_column(TimeSlots::get()->selectByField('expert_id', $expertId), 'id');
            $pendingBookings = 0;
            if (!empty($allSlotIds)) {
                $pendingRows = Bookings::get()->selectAll(function (SelectInterface $query) use ($allSlotIds): void {
                    $query->resetCols()->cols(['COUNT(*) as cnt'])
                        ->where('bookable_type = :btype', ['btype' => 'time_slot'])
                        ->where('status = :st', ['st' => 'pending'])
                        ->where('bookable_id IN (:slot_ids)', ['slot_ids' => array_map('intval', $allSlotIds)]);
                });
                $pendingBookings = (int)($pendingRows[0]['cnt'] ?? 0);
            }

            $pendingBookingsList = ExpertHelpers::buildPendingBookingsList($expertId);
            $confirmedBookingsList = ExpertHelpers::buildConfirmedBookingsList($expertId, $now);

            // Monthly stats
            $monthStart = DateUtils::startOfCurrentMonthForUser($expertTz);
            $monthlyBookings = [];
            if (!empty($allSlotIds)) {
                $monthlyBookings = Bookings::get()->selectAll(function (SelectInterface $query) use ($allSlotIds, $monthStart): void {
                    $query->where('bookable_type = ?', ['time_slot'])
                        ->where("status IN ('confirmed', 'completed')")
                        ->where('bookable_id IN (?)', [array_map('intval', $allSlotIds)])
                        ->where('created_at >= ?', [$monthStart]);
                });
            }
            $monthlyUsers = count(array_unique(array_column($monthlyBookings, 'user_id')));

            // Monthly earnings from ledger
            $earningsRows = BalanceLedger::get()->selectAll(function (SelectInterface $query) use ($expertId, $monthStart): void {
                $query->resetCols()->cols(['COALESCE(SUM(amount), 0) as total'])
                    ->where('account_id = ?', [$expertId])
                    ->where('is_credit = ?', [1])
                    ->where('created_at >= ?', [$monthStart]);
            });
            $monthlyEarnings = (int)($earningsRows[0]['total'] ?? 0);

            // Upcoming slots (next 5)
            $upcomingSlots = TimeSlots::get()->selectAll(function (SelectInterface $query) use ($expertId, $now): void {
                $query->where('expert_id = ?', [$expertId])
                    ->where("status != 'cancelled'")
                    ->where('start_at >= ?', [$now])
                    ->orderBy(['start_at ASC'])
                    ->limit(5);
            });

            $feedSlots = [];
            foreach ($upcomingSlots as $slot) {
                $slotId = (int)$slot['id'];
                $bookingsCount = count(Bookings::get()->selectAll(function (SelectInterface $q) use ($slotId): void {
                    $q->where('bookable_id = :bid', ['bid' => $slotId]);
                    $q->where('bookable_type = :btype', ['btype' => 'time_slot']);
                    $q->where("status IN ('pending','confirmed')");
                }));

                $feedSlots[] = [
                    'id' => $slotId,
                    'start_at' => (int)$slot['start_at'],
                    'duration_min' => (int)($slot['duration_min'] ?? 60),
                    'booked_count' => $bookingsCount,
                    'max_users' => (int)($slot['max_users'] ?? 1),
                    'label' => $t->Feed_Individual(),
                ];
            }

            // Cancellations & declines for this expert
            $cancelRows = ExpertCancellations::get()->selectAll(function (SelectInterface $query) use ($expertId): void {
                $query->resetCols()->cols(['COUNT(*) as cnt']);
                $query->where('expert_id = ? AND kind = ?', [$expertId, 'cancel']);
            });
            $cancellations = (int)($cancelRows[0]['cnt'] ?? 0);

            $declineRows = ExpertCancellations::get()->selectAll(function (SelectInterface $query) use ($expertId): void {
                $query->resetCols()->cols(['COUNT(*) as cnt']);
                $query->where('expert_id = ? AND kind = ?', [$expertId, 'decline']);
            });
            $declines = (int)($declineRows[0]['cnt'] ?? 0);

            $content = RenderIsland::render('expert-dashboard', [
                'slotsToday' => $slotsToday,
                'slotsTomorrow' => $slotsTomorrow,
                'pendingBookings' => $pendingBookings,
                'monthlyUsers' => $monthlyUsers,
                'monthlyEarnings' => $monthlyEarnings,
                'upcomingSlots' => $feedSlots,
                'pendingBookingsList' => $pendingBookingsList,
                'confirmedBookingsList' => $confirmedBookingsList,
                'cancellations' => $cancellations,
                'declines' => $declines,
            ]);

            return $renderContent($content);
        }
    }
}
