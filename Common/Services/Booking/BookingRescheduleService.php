<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Services\Booking {
    use Aura\SqlQuery\Common\SelectInterface;
    use PHPCraftdream\Garnet\Kernel\Db\Link\CasUpdate;
    use PHPCraftdream\IRabi\Common\Services\Content\NewsService;
    use PHPCraftdream\IRabi\Common\Tables\Booking\Bookings;
    use PHPCraftdream\IRabi\Common\Tables\Booking\TimeSlots;
    use Throwable;

    /**
     * Перенос брони на другое время того же преподавателя (D-193).
     *
     * Появился из живого вопроса Анны Ковальской (тикет #19): как перенести
     * подтверждённое занятие, не потеряв деньги. До этого способа не было —
     * только отмена с удержанием неустойки и новая бронь, то есть за смену
     * времени платили.
     *
     * Ключевое свойство: операция НЕ создаёт новую бронь, а переставляет
     * `bookable_id` у существующей. Записи `balance_ledger` привязаны к брони
     * через `ref_type='booking'` + `ref_id`, поэтому при сохранении строки
     * брони все деньги остаются на месте буквально — этот класс не пишет в
     * реестр ни одной строки, и это проверяется тестом.
     *
     * Отсюда же ограничение: целевой слот обязан стоить столько же. Другая
     * цена — это доплата или частичный возврат, то есть ровно то движение
     * денег, которого обещано не будет. Лучше внятный отказ, чем тихий
     * пересчёт.
     *
     * Контракт целиком: docs/guides/design/2026-09-15-booking-reschedule.md
     */
    class BookingRescheduleService {
        public const ERR_NOT_FOUND = 'not_found';
        public const ERR_ACCESS = 'access_denied';
        public const ERR_STATUS = 'status_not_reschedulable';
        public const ERR_SOURCE_STARTED = 'source_started';
        public const ERR_TARGET_MISSING = 'target_missing';
        public const ERR_TARGET_PAST = 'target_past';
        public const ERR_TARGET_OTHER_EXPERT = 'target_other_expert';
        public const ERR_TARGET_OTHER_COST = 'target_other_cost';
        public const ERR_TARGET_SAME = 'target_same';
        public const ERR_TARGET_FULL = 'target_full';
        public const ERR_ALREADY_BOOKED = 'already_booked_there';
        public const ERR_RACED = 'raced';

        /**
         * @return array{ok: true, status: string, old_slot_id: int, new_slot_id: int}
         *       |  array{ok: false, error: string}
         */
        public static function reschedule(int $bookingId, int $targetSlotId, int $actorId): array {
            $booking = Bookings::get()->selectById($bookingId);
            if (!$booking || (string)$booking['bookable_type'] !== 'time_slot') {
                return ['ok' => false, 'error' => self::ERR_NOT_FOUND];
            }

            $oldSlotId = (int)$booking['bookable_id'];
            $oldSlot = TimeSlots::get()->selectById($oldSlotId);
            if (!$oldSlot) {
                return ['ok' => false, 'error' => self::ERR_NOT_FOUND];
            }

            $studentId = (int)$booking['user_id'];
            $expertId = (int)($oldSlot['expert_id'] ?? 0);
            $actorIsStudent = $actorId === $studentId;
            $actorIsExpert = $actorId === $expertId && $expertId > 0;
            if (!$actorIsStudent && !$actorIsExpert) {
                return ['ok' => false, 'error' => self::ERR_ACCESS];
            }

            $status = (string)$booking['status'];
            if (!in_array($status, ['pending', 'confirmed'], true)) {
                return ['ok' => false, 'error' => self::ERR_STATUS];
            }

            $now = time();
            if ((int)($oldSlot['start_at'] ?? 0) <= $now) {
                return ['ok' => false, 'error' => self::ERR_SOURCE_STARTED];
            }

            if ($targetSlotId === $oldSlotId) {
                return ['ok' => false, 'error' => self::ERR_TARGET_SAME];
            }

            $target = TimeSlots::get()->selectById($targetSlotId);
            if (!$target || (string)($target['status'] ?? '') !== 'free') {
                return ['ok' => false, 'error' => self::ERR_TARGET_MISSING];
            }
            if ((int)($target['start_at'] ?? 0) <= $now) {
                return ['ok' => false, 'error' => self::ERR_TARGET_PAST];
            }
            if ((int)($target['expert_id'] ?? 0) !== $expertId) {
                return ['ok' => false, 'error' => self::ERR_TARGET_OTHER_EXPERT];
            }
            if ((int)($target['cost'] ?? 0) !== (int)($oldSlot['cost'] ?? 0)) {
                return ['ok' => false, 'error' => self::ERR_TARGET_OTHER_COST];
            }

            if (self::hasActiveBooking($studentId, $targetSlotId)) {
                return ['ok' => false, 'error' => self::ERR_ALREADY_BOOKED];
            }

            // Единственная настоящая граница конкурентности — тот же CAS, что
            // держит вместимость при обычной брони (аудит H-01). Место в новом
            // слоте занимается ДО того, как освобождается старое: иначе между
            // двумя шагами ученик оказывается без места нигде, и достаточно
            // одного параллельного бронирующего, чтобы он туда не вернулся.
            if (!TimeSlots::reserveSeat($targetSlotId)) {
                return ['ok' => false, 'error' => self::ERR_TARGET_FULL];
            }

            // Подтверждение — это обещание преподавателя про КОНКРЕТНОЕ время.
            // Меняет время ученик — обещание нужно получить заново. Меняет сам
            // преподаватель — переподтверждать нечего.
            //
            // `confirmed_at` сбрасывается вместе со статусом не для красоты: по
            // нему счётчики отличают «сняла заявку до подтверждения» от
            // «отменили подтверждённую бронь» (D-191) и по нему же считаются
            // пропущенные заявки преподавателя (D-190). Оставить его от
            // прошлого слота значило бы соврать обоим.
            $newStatus = ($actorIsStudent && $status === 'confirmed') ? 'pending' : $status;

            $bookingsTbl = Bookings::get()->getTableName();
            $affected = CasUpdate::exec(
                "UPDATE {$bookingsTbl} SET bookable_id = ?, status = ?, confirmed_at = ? WHERE id = ? AND bookable_id = ? AND status IN ('pending', 'confirmed')",
                [
                    $targetSlotId,
                    $newStatus,
                    $newStatus === 'confirmed' ? ($booking['confirmed_at'] ?? null) : null,
                    $bookingId,
                    $oldSlotId,
                ],
            );

            if ($affected !== 1) {
                // Бронь увели или отменили между чтением и этим UPDATE.
                // Компенсируем занятое место — иначе целевой слот навсегда
                // потеряет одно место ни за что.
                TimeSlots::releaseSeat($targetSlotId);
                return ['ok' => false, 'error' => self::ERR_RACED];
            }

            TimeSlots::releaseSeat($oldSlotId);

            self::syncSlotState($oldSlotId);
            self::syncSlotState($targetSlotId);

            return [
                'ok' => true,
                'status' => $newStatus,
                'old_slot_id' => $oldSlotId,
                'new_slot_id' => $targetSlotId,
            ];
        }

        /**
         * Статус слота и публичный анонс — следствие одного факта: сколько мест
         * занято. Считаем его в одном месте и для покинутого, и для принявшего
         * слота, вместо двух зеркальных кусков по месту вызова: расхождение
         * двух копий одного счёта — это D-121/D-146/D-150/D-151 подряд.
         */
        private static function syncSlotState(int $slotId): void {
            $slot = TimeSlots::get()->selectById($slotId);
            if (!$slot) {
                return;
            }

            $maxUsers = max(1, (int)($slot['max_users'] ?? 1));
            $active = count(Bookings::get()->selectAll(function (SelectInterface $q) use ($slotId): void {
                $q->where('bookable_type = :btype', ['btype' => 'time_slot'])
                    ->where('bookable_id = :bid', ['bid' => $slotId])
                    ->where("status IN ('pending', 'confirmed')");
            }));

            $slotsTbl = TimeSlots::get()->getTableName();

            if ($active >= $maxUsers) {
                CasUpdate::exec(
                    "UPDATE {$slotsTbl} SET status = 'booked' WHERE id = ? AND status = 'free'",
                    [$slotId],
                );
                // Слот заполнился — публичный анонс «открыт новый слот» больше
                // не правда ни для кого.
                try {
                    NewsService::deleteByTargetKey(NewsService::slotKey($slotId), NewsService::TYPE_NEW_SLOT);
                } catch (Throwable) {
                }
                return;
            }

            CasUpdate::exec(
                "UPDATE {$slotsTbl} SET status = 'free' WHERE id = ? AND status = 'booked'",
                [$slotId],
            );
            // Освободившееся место делает устаревшим уже разосланное
            // «на ваш слот записались» — оно указывает на бронь, которой здесь
            // больше нет.
            try {
                NewsService::deleteByTargetKey(NewsService::slotKey($slotId), NewsService::TYPE_SLOT_BOOKED);
            } catch (Throwable) {
            }
        }

        private static function hasActiveBooking(int $userId, int $slotId): bool {
            $rows = Bookings::get()->selectAll(function (SelectInterface $q) use ($userId, $slotId): void {
                $q->where('user_id = :uid', ['uid' => $userId])
                    ->where('bookable_type = :btype', ['btype' => 'time_slot'])
                    ->where('bookable_id = :bid', ['bid' => $slotId])
                    ->where("status IN ('pending', 'confirmed')")
                    ->limit(1);
            });

            return $rows !== [];
        }
    }
}
