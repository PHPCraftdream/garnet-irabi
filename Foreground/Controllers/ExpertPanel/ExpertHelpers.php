<?php declare(strict_types=1);

/**
 * Общие хелперы для ExpertPanel: проверка пересечений, форматирование, валидация полей.
 */

namespace PHPCraftdream\IRabi\Foreground\Controllers\ExpertPanel {
    use Aura\SqlQuery\Common\SelectInterface;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\Account;
    use PHPCraftdream\IRabi\Common\System\DateUtils;
    use PHPCraftdream\IRabi\Common\Tables\Bookings;
    use PHPCraftdream\IRabi\Common\Tables\TimeSlots;
    use PHPCraftdream\IRabi\Foreground\I18n\ForegroundI18n;

    class ExpertHelpers {
        public static function findOverlap(int $expertId, int $startAt, int $endAt, ?int $excludeSlotId = null): ?array {
            $existingSlots = TimeSlots::get()->selectAll(function (SelectInterface $query) use ($expertId, $startAt, $endAt, $excludeSlotId): void {
                $query->where('expert_id = ?', [$expertId])
                    ->where("status != 'cancelled'")
                    ->where('start_at < ?', [$endAt])
                    ->where('end_at > ?', [$startAt]);
                if ($excludeSlotId !== null) {
                    $query->where('id != ?', [$excludeSlotId]);
                }
            });

            if (!empty($existingSlots)) {
                return ['type' => 'slot', 'start_at' => (int)$existingSlots[0]['start_at']];
            }

            return null;
        }

        public static function formatExistingItems(array $existing, ?string $expertTz = null): array {
            $items = [];

            foreach ($existing as $slot) {
                $ts = (int)$slot['start_at'];
                $item = [
                    'date' => DateUtils::formatForUser($ts, $expertTz, 'Y-m-d'),
                    'time' => DateUtils::formatForUser($ts, $expertTz, 'H:i'),
                    'duration_min' => (int)($slot['duration_min'] ?? 60),
                    'type' => 'slot',
                    'title' => '',
                ];
                $items[] = $item;
            }

            return $items;
        }

        /**
         * Build a list of pending bookings on slots owned by the given expert.
         * Each item contains: booking_id, user_id, user_name, slot_id, start_at,
         * duration_min, cost, created_at. Ordered by created_at DESC.
         *
         * @return list<array{
         *     booking_id:int, user_id:int, user_name:string, slot_id:int,
         *     start_at:int, duration_min:int, cost:int, created_at:int,
         * }>
         */
        public static function buildPendingBookingsList(int $expertId): array {
            $allSlotIds = array_column(
                TimeSlots::get()->selectByField('expert_id', $expertId),
                'id',
            );
            if (empty($allSlotIds)) {
                return [];
            }

            $rawBookings = Bookings::get()->selectAll(function (SelectInterface $query) use ($allSlotIds): void {
                $query->where('bookable_type = :btype', ['btype' => 'time_slot'])
                    ->where('status = :st', ['st' => 'pending'])
                    ->where('bookable_id IN (:slot_ids)', ['slot_ids' => array_map('intval', $allSlotIds)])
                    ->orderBy(['created_at DESC']);
            });

            return static::hydrateBookingsList($rawBookings);
        }

        /**
         * Build a list of confirmed (future) bookings on slots owned by the given expert,
         * ordered by slot start_at ASC.
         *
         * @return list<array{
         *     booking_id:int, user_id:int, user_name:string, slot_id:int,
         *     start_at:int, duration_min:int, cost:int, created_at:int,
         * }>
         */
        public static function buildConfirmedBookingsList(int $expertId, ?int $now = null): array {
            $now ??= time();
            $allSlotIds = array_column(
                TimeSlots::get()->selectByField('expert_id', $expertId),
                'id',
            );
            if (empty($allSlotIds)) {
                return [];
            }

            $rawBookings = Bookings::get()->selectAll(function (SelectInterface $query) use ($allSlotIds): void {
                $query->where('bookable_type = :btype', ['btype' => 'time_slot'])
                    ->where('status = :st', ['st' => 'confirmed'])
                    ->where('bookable_id IN (:slot_ids)', ['slot_ids' => array_map('intval', $allSlotIds)]);
            });

            $list = static::hydrateBookingsList($rawBookings, futureOnly: true, now: $now);

            usort($list, static fn ($a, $b) => $a['start_at'] <=> $b['start_at']);
            return $list;
        }

        /**
         * Hydrate raw booking rows with user_name and slot info.
         * If $futureOnly is true — drops bookings whose slot start_at < $now.
         *
         * @param  array<int, array<string, mixed>> $rawBookings
         * @return list<array{
         *     booking_id:int, user_id:int, user_name:string, slot_id:int,
         *     start_at:int, duration_min:int, cost:int, created_at:int,
         * }>
         */
        private static function hydrateBookingsList(array $rawBookings, bool $futureOnly = false, ?int $now = null): array {
            if (empty($rawBookings)) {
                return [];
            }

            $userIds = array_unique(array_filter(array_map(static fn ($b) => (int)$b['user_id'], $rawBookings)));
            $slotIds = array_unique(array_filter(array_map(static fn ($b) => (int)$b['bookable_id'], $rawBookings)));

            $usersMap = [];
            if (!empty($userIds)) {
                $accs = Account::getAccounts(
                    selectCallback: static function (SelectInterface $select) use ($userIds): void {
                        $select->resetCols();
                        $select->cols(['id', 'name', 'login']);
                        $select->where('id IN (?)', [array_map('intval', $userIds)]);
                    },
                );
                foreach ($accs as $a) {
                    $usersMap[(int)$a['id']] = $a;
                }
            }

            $slotsMap = [];
            if (!empty($slotIds)) {
                $slotRows = TimeSlots::get()->selectAll(function (SelectInterface $query) use ($slotIds): void {
                    $query->where('id IN (?)', [array_map('intval', $slotIds)]);
                });
                foreach ($slotRows as $s) {
                    $slotsMap[(int)$s['id']] = $s;
                }
            }

            $result = [];
            foreach ($rawBookings as $b) {
                $slotId = (int)$b['bookable_id'];
                $slot = $slotsMap[$slotId] ?? null;
                if ($slot === null) {
                    continue;
                }
                if ($futureOnly && (int)$slot['start_at'] < ($now ?? time())) {
                    continue;
                }
                $uid = (int)$b['user_id'];
                $acc = $usersMap[$uid] ?? null;
                $result[] = [
                    'booking_id' => (int)$b['id'],
                    'user_id' => $uid,
                    'user_name' => $acc ? ((string)($acc['name'] ?: $acc['login'])) : '',
                    'slot_id' => $slotId,
                    'start_at' => (int)$slot['start_at'],
                    'duration_min' => (int)($slot['duration_min'] ?? 60),
                    'cost' => (int)($slot['cost'] ?? 0),
                    'created_at' => (int)$b['created_at'],
                ];
            }

            return $result;
        }

        public static function slotFieldsInfo(): array {
            $t = ForegroundI18n::getInstance();
            return [
                'fields' => [
                    'date' => ['name' => $t->Slot_Date(), 'type' => 'string', 'validation' => ['required']],
                    'time' => ['name' => $t->Slot_Time(), 'type' => 'string', 'validation' => ['required']],
                    'duration' => ['name' => $t->Slot_Duration(), 'type' => 'string', 'validation' => ['required', 'int', 'minVal[15]', 'maxVal[480]']],
                    'cost' => ['name' => $t->Slot_Cost(), 'type' => 'string', 'validation' => ['required', 'int', 'minVal[0]']],
                    'max_users' => ['name' => $t->Slot_MaxUsers(), 'type' => 'string', 'validation' => ['required', 'int', 'minVal[1]', 'maxVal[100]']],
                    'cancellation_penalty_percent' => ['name' => $t->Slot_PenaltyPercent(), 'type' => 'string', 'validation' => ['int', 'minVal[0]', 'maxVal[100]']],
                ],
                'detailsFields' => ['date', 'time', 'duration', 'cost', 'max_users', 'cancellation_penalty_percent'],
            ];
        }
    }
}
