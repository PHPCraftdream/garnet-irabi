<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Services\DevSeed {
    use Aura\SqlQuery\Common\SelectInterface;
    use PHPCraftdream\IRabi\Common\Tables\Accounts\BalanceLedger;
    use PHPCraftdream\IRabi\Common\Tables\Booking\Bookings;
    use PHPCraftdream\IRabi\Common\Tables\Booking\ExpertCancellations;
    use PHPCraftdream\IRabi\Common\Tables\Booking\Payments;
    use PHPCraftdream\IRabi\Common\Tables\Booking\PaymentsLog;
    use PHPCraftdream\IRabi\Common\Tables\Booking\TimeSlots;
    use PHPCraftdream\IRabi\Common\Tables\Booking\UserCancellations;
    use Throwable;

    /**
     * Брони, отмены и платежи — всё, что двигает деньги.
     */
    trait DevSeedBookingsTrait {
        // ── Bookings ──────────────────────────────────────────────────────

        /**
         * Book ~10% of newly created slots, distributed among users
         * with statuses: 60% confirmed, 30% pending, 10% cancelled.
         *
         * @param list<int> $slotIds
         * @param list<int> $userIds
         */
        private static function seedBookings(array $slotIds, array $userIds): void {
            if (empty($slotIds) || empty($userIds)) {
                return;
            }

            $targetCount = (int)max(1, round(count($slotIds) * 0.10));
            // Shuffle deterministically-ish via array_slice on randomized keys.
            $candidates = $slotIds;
            shuffle($candidates);
            $picked = array_slice($candidates, 0, $targetCount);

            // Preload slots (expert_id, cost) for picked ids.
            $slotsMap = [];
            $slotRows = TimeSlots::get()->selectAll(function (SelectInterface $q) use ($picked): void {
                $q->where('id IN (?)', [array_map('intval', $picked)]);
            });
            foreach ($slotRows as $sr) {
                $slotsMap[(int)$sr['id']] = $sr;
            }

            $now = time();
            $i = 0;
            foreach ($picked as $slotId) {
                $userId = $userIds[$i % count($userIds)];
                $i++;

                $slotRow = $slotsMap[(int)$slotId] ?? null;
                if ($slotRow === null) {
                    continue;
                }
                $expertId = (int)$slotRow['expert_id'];
                $cost = (int)$slotRow['cost'];

                // Status distribution: 6 confirmed, 3 pending, 1 cancelled per 10.
                $bucket = $i % 10;
                if ($bucket < 6) {
                    $status = 'confirmed';
                } elseif ($bucket < 9) {
                    $status = 'pending';
                } else {
                    $status = 'cancelled';
                }

                // For cancelled bookings, the slot remains free.
                // For active (pending/confirmed), mark slot as booked.
                $slotStatus = $status === 'cancelled' ? 'free' : 'booked';
                TimeSlots::get()->updateById(['status' => $slotStatus], $slotId);

                $bookingData = [
                    'user_id' => $userId,
                    'bookable_type' => 'time_slot',
                    'bookable_id' => $slotId,
                    'status' => $status,
                    'created_at' => $now,
                    'confirmed_at' => $status === 'confirmed' ? $now : null,
                    'cancelled_at' => $status === 'cancelled' ? $now : null,
                ];

                try {
                    $bookingId = (int)Bookings::get()->insert($bookingData);
                } catch (Throwable $e) {
                    // Unique constraint on active_dup_key may block duplicates — ignore.
                    continue;
                }

                if ($bookingId <= 0 || $cost <= 0 || $expertId <= 0) {
                    continue;
                }

                // Always book invoice + payment (so even cancelled has a history).
                BalanceLedger::addEntry($userId,   false, $cost, 'booking_invoice', 'booking', $bookingId, 'Счёт #' . $bookingId);
                BalanceLedger::addEntry($expertId, true,  $cost, 'booking_payment', 'booking', $bookingId, 'Оплата #' . $bookingId);

                if ($status === 'cancelled') {
                    // Refund: expert debited, user credited.
                    BalanceLedger::addEntry($expertId, false, $cost, 'booking_refund', 'booking', $bookingId, 'Возврат #' . $bookingId);
                    BalanceLedger::addEntry($userId,   true,  $cost, 'booking_refund', 'booking', $bookingId, 'Возврат #' . $bookingId);
                }
            }
        }

        /**
         * @param list<int> $userIds
         */
        private static function seedCancellations(array $userIds): void {
            if (
                count(UserCancellations::get()->selectAll(static fn (SelectInterface $q) => $q->cols(['id'])->limit(1))) > 0
                || count(ExpertCancellations::get()->selectAll(static fn (SelectInterface $q) => $q->cols(['id'])->limit(1))) > 0
            ) {
                return;
            }

            // Promote a handful of confirmed bookings to "cancelled" so that the
            // user/expert cancellation tables have realistic seed volume (~14 records).
            $needed = 14;
            $existing = Bookings::get()->selectAll(static function (SelectInterface $q): void {
                $q->where('status = ?', ['cancelled']);
                $q->cols(['id']);
            });
            $deficit = $needed - count($existing);
            if ($deficit > 0) {
                $confirmed = Bookings::get()->selectAll(static function (SelectInterface $q) use ($deficit): void {
                    $q->where('status = ?', ['confirmed']);
                    $q->orderBy(['id ASC']);
                    $q->limit($deficit);
                });
                $now = time();
                foreach ($confirmed as $b) {
                    $bId = (int)$b['id'];
                    $cancelTs = $now - random_int(1, 30) * 86400;
                    Bookings::get()->updateById([
                        'status' => 'cancelled',
                        'cancelled_at' => $cancelTs,
                    ], $bId);
                }
            }

            // Find cancelled bookings (with their slots).
            $cancelled = Bookings::get()->selectAll(static function (SelectInterface $q): void {
                $q->where('status = ?', ['cancelled']);
                $q->orderBy(['id ASC']);
                $q->limit(20);
            });
            if (empty($cancelled)) {
                return;
            }

            $slotIds = array_unique(array_map(static fn (array $b) => (int)$b['bookable_id'], $cancelled));
            $slots = TimeSlots::get()->selectAll(static function (SelectInterface $q) use ($slotIds): void {
                $q->where('id IN (?)', [array_map('intval', $slotIds)]);
            });
            $slotMap = [];
            foreach ($slots as $s) {
                $slotMap[(int)$s['id']] = $s;
            }

            $userReasons = [
                'Изменились планы',
                'Заболел',
                'Конфликт расписания',
                'Не успеваю подготовиться',
            ];
            $expertReasons = [
                'Заболел',
                'Командировка',
                'Технические проблемы',
                'Семейные обстоятельства',
            ];

            $now = time();
            $userMax = 8;
            $expertMax = 6;
            $userCount = 0;
            $expertCount = 0;

            foreach ($cancelled as $i => $b) {
                $slotId = (int)$b['bookable_id'];
                $slot = $slotMap[$slotId] ?? null;
                if ($slot === null) {
                    continue;
                }
                $userId = (int)$b['user_id'];
                $expertId = (int)$slot['expert_id'];
                $bookingId = (int)$b['id'];
                $createdAt = (int)($b['cancelled_at'] ?? $b['created_at'] ?? $now);

                if ($i % 2 === 0 && $userCount < $userMax) {
                    UserCancellations::get()->insert([
                        'user_id' => $userId,
                        'booking_id' => $bookingId,
                        'slot_id' => $slotId,
                        'expert_id' => $expertId,
                        'reason' => $userReasons[$i % count($userReasons)],
                        'created_at' => $createdAt,
                        'kind' => ($i % 3 === 0 ? 'decline' : 'cancel'),
                    ]);
                    $userCount++;
                } elseif ($expertCount < $expertMax) {
                    ExpertCancellations::get()->insert([
                        'expert_id' => $expertId,
                        'slot_id' => $slotId,
                        'booking_id' => $bookingId,
                        'user_id' => $userId,
                        'reason' => $expertReasons[$i % count($expertReasons)],
                        'created_at' => $createdAt,
                        'kind' => ($i % 3 === 0 ? 'decline' : 'cancel'),
                    ]);
                    $expertCount++;
                }
            }
        }

        /**
         * @param list<int> $userIds
         */
        private static function seedPayments(array $userIds): void {
            if (count(Payments::get()->selectAll(static fn (SelectInterface $q) => $q->cols(['id'])->limit(1))) > 0) {
                return;
            }
            if (empty($userIds)) {
                return;
            }

            // ~6 success / ~2 pending / ~2 failed
            $statusMix = array_merge(
                array_fill(0, 6, 'success'),
                array_fill(0, 2, 'pending'),
                array_fill(0, 2, 'failed'),
            );
            shuffle($statusMix);

            $now = time();
            foreach ($statusMix as $i => $status) {
                $userId = $userIds[$i % count($userIds)];
                $sum = (float)(500 * (1 + $i % 5)); // 500, 1000, ..., 2500
                $commission = round($sum * 0.05, 2);
                $createdAt = $now - random_int(0, 60) * 86400 - random_int(0, 86399);
                $paidAt = $status === 'success' ? $createdAt + random_int(60, 3600) : null;

                $paymentId = (int)Payments::get()->insert([
                    'account_id' => $userId,
                    'sum' => $sum,
                    'commission' => $commission,
                    'created_at' => $createdAt,
                    'paid_at' => $paidAt,
                    'timezone' => 'Europe/Moscow',
                ]);

                $log = static function (int $offset, string $action, array $info) use ($paymentId, $createdAt): void {
                    PaymentsLog::get()->insert([
                        'payment_id' => $paymentId,
                        'timezone' => 'Europe/Moscow',
                        'created_at' => $createdAt + $offset,
                        'action' => $action,
                        'info' => json_encode($info, JSON_UNESCAPED_UNICODE),
                    ]);
                };

                $log(0,   'init',     ['amount' => $sum]);
                $log(30,  'redirect', ['gateway' => 'fake-bank']);
                if ($status === 'success') {
                    $log(120, 'webhook', ['raw' => 'PAID']);
                    $log(125, 'success', ['paid_at' => $paidAt]);
                } elseif ($status === 'failed') {
                    $log(120, 'fail', ['reason' => 'Card declined']);
                }
                // pending — no further log entries beyond redirect.
            }
        }
    }
}
