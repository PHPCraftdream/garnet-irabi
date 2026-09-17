<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Services\Booking {
    use Aura\SqlQuery\Common\SelectInterface;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\DbAccount;
    use PHPCraftdream\IRabi\Common\System\LessonPhase;
    use PHPCraftdream\IRabi\Common\Tables\Booking\Bookings;
    use PHPCraftdream\IRabi\Common\Tables\Booking\TimeSlots;
    use PHPCraftdream\IRabi\Foreground\Controllers\Expert\ExpertPanel\ExpertHelpers;
    use RuntimeException;

    /**
     * Двигает тестовые занятия во времени, чтобы можно было увидеть их поздние
     * фазы, не дожидаясь этих фаз по-настоящему.
     *
     * Часы системы не трогаются: единственное «сейчас» — это `time()` и
     * `UNIX_TIMESTAMP()`, и подводить их на боевом сайте значило бы менять
     * поведение для настоящих людей. Двигаются метки самих строк — тогда
     * сдвиг затрагивает ровно то занятие, которое назвали.
     *
     * Границы фаз и якоря живут в {@see LessonPhase}; здесь только запись и
     * проверки. Что читает время — `docs/guides/operations/booking-time-phases.md`.
     */
    class TimeShiftService {
        /**
         * Домен, ниже которого сдвиг разрешён.
         *
         * `.test` зарезервирован RFC 2606 и не маршрутизируется — адрес в этой
         * зоне не может принадлежать живому человеку. Это надёжнее, чем список
         * конкретных адресов в конфиге: список забывают обновить, а гарантия
         * стандарта не протухает.
         */
        public const TEST_SUFFIX = '.test';

        /**
         * Кому принадлежит занятие — преподавателю слота и всем, кто на него
         * записался. Достаточно одного нетестового участника, чтобы сдвиг был
         * запрещён: чужое расписание и чужие деньги не двигают ради удобства
         * проверки.
         *
         * @return list<string> причины отказа; пустой список — можно двигать
         */
        public static function refusalsFor(int $slotId): array {
            $slot = TimeSlots::get()->selectById($slotId);

            if (!$slot) {
                return ["занятия #{$slotId} нет"];
            }

            $reasons = [];
            $expertId = (int)($slot['expert_id'] ?? 0);

            if (!static::isTestAccount($expertId)) {
                $reasons[] = "занятие #{$slotId} ведёт не тестовый преподаватель (#{$expertId})";
            }

            foreach (static::bookingsOf($slotId) as $booking) {
                $userId = (int)($booking['user_id'] ?? 0);

                if (!static::isTestAccount($userId)) {
                    $reasons[] = "на занятие #{$slotId} записан не тестовый ученик (#{$userId})";
                }
            }

            return $reasons;
        }

        /**
         * Всё, что мешает поставить занятие на новое место.
         *
         * Проверяется до первой записи и целиком: половина сдвига хуже отказа —
         * данные остаются в состоянии, которого система сама породить не может,
         * и наблюдать на нём поведение бессмысленно.
         *
         * @return list<string> причины отказа; пустой список — можно
         */
        public static function refusalsForMove(int $slotId, int $newStartAt, int $newEndAt): array {
            $reasons = static::refusalsFor($slotId);

            if ($reasons !== []) {
                return $reasons;
            }

            $slot = TimeSlots::get()->selectById($slotId);
            $status = (string)($slot['status'] ?? '');

            // Необратимость формализуется здесь, и читается она из данных, а не
            // из имени фазы. Крон завершения уже переписал статусы и, возможно,
            // вернул деньги; вернуть занятие в будущее можно, расколдовать
            // статусы — нет. Раньше инструмент такое занятие охотно «двигал» и
            // рапортовал об успехе.
            if (!in_array($status, ['free', 'booked'], true)) {
                $reasons[] = "занятие #{$slotId} уже в состоянии «{$status}» — обратного пути нет, нужно новое";
            }

            $completed = array_filter(
                static::bookingsOf($slotId),
                static fn (array $b): bool => (string)($b['status'] ?? '') === 'completed',
            );

            if ($completed !== []) {
                $reasons[] = "у занятия #{$slotId} есть завершённые брони — их не отменить";
            }

            if ($newEndAt <= $newStartAt) {
                $reasons[] = "конец занятия #{$slotId} оказался бы не позже начала";
            }

            // Тот же запрет, что и на путях записи: два занятия одного
            // преподавателя внахлёст система сама создать не даёт.
            $overlap = ExpertHelpers::findOverlap(
                (int)($slot['expert_id'] ?? 0),
                $newStartAt,
                $newEndAt,
                $slotId,
            );

            if ($overlap !== null) {
                $reasons[] = "занятие #{$slotId} наложилось бы на другое занятие того же преподавателя";
            }

            return $reasons;
        }

        /**
         * Ставит занятие туда, где оно окажется в нужной фазе.
         *
         * @return array{slot:int, bookings:int, from:string, to:string, start_at:int, end_at:int, cleared:list<string>}
         * @throws RuntimeException если так поставить нельзя
         */
        public static function moveToPhase(int $slotId, LessonPhase $phase, ?int $now = null): array {
            $now ??= time();
            $slot = TimeSlots::get()->selectById($slotId);

            if (!$slot) {
                throw new RuntimeException("занятия #{$slotId} нет");
            }

            $duration = (int)$slot['end_at'] - (int)$slot['start_at'];
            $newStart = $phase->anchorStart($now, $duration);

            return static::applyMove($slotId, $newStart, $newStart + $duration, $now);
        }

        /**
         * Сдвигает занятие на заданное число секунд; минус — в прошлое.
         *
         * @return array{slot:int, bookings:int, from:string, to:string, start_at:int, end_at:int, cleared:list<string>}
         * @throws RuntimeException если так поставить нельзя
         */
        public static function shiftSlot(int $slotId, int $deltaSec, ?int $now = null): array {
            $now ??= time();
            $slot = TimeSlots::get()->selectById($slotId);

            if (!$slot) {
                throw new RuntimeException("занятия #{$slotId} нет");
            }

            return static::applyMove(
                $slotId,
                (int)$slot['start_at'] + $deltaSec,
                (int)$slot['end_at'] + $deltaSec,
                $now,
            );
        }

        /**
         * Идентификаторы занятий, которые вообще разрешено двигать.
         *
         * @return list<int>
         */
        public static function shiftableSlotIds(): array {
            $ids = [];

            foreach (TimeSlots::get()->selectAll() as $slot) {
                $slotId = (int)$slot['id'];

                if (static::refusalsFor($slotId) === []) {
                    $ids[] = $slotId;
                }
            }

            return $ids;
        }

        /**
         * Разбирает человеческую длительность: `90m`, `-2h`, `+1d`, `3600`.
         */
        public static function parseDuration(string $text): ?int {
            $text = trim($text);

            if (!preg_match('/^([+-]?)(\d+)([smhd]?)$/i', $text, $m)) {
                return null;
            }

            $unit = strtolower($m[3]) ?: 's';
            $multiplier = ['s' => 1, 'm' => 60, 'h' => 3600, 'd' => 86400][$unit];
            $value = (int)$m[2] * $multiplier;

            return $m[1] === '-' ? -$value : $value;
        }

        /**
         * Общая запись для обоих способов адресации.
         *
         * @return array{slot:int, bookings:int, from:string, to:string, start_at:int, end_at:int, cleared:list<string>}
         * @throws RuntimeException
         */
        private static function applyMove(int $slotId, int $newStart, int $newEnd, int $now): array {
            $refusals = static::refusalsForMove($slotId, $newStart, $newEnd);

            if ($refusals !== []) {
                throw new RuntimeException(implode('; ', $refusals));
            }

            $slot = TimeSlots::get()->selectById($slotId);
            $from = LessonPhase::of((int)$slot['start_at'], (int)$slot['end_at'], $now);
            $to = LessonPhase::of($newStart, $newEnd, $now);

            $update = ['start_at' => $newStart, 'end_at' => $newEnd];
            $cleared = [];

            // Отметку снимаем только там, где окно этого срока ещё впереди: в
            // новой фазе занятие честно «не получало» такого письма. Стирать
            // всё подряд значило бы терять историю — вопрос «суточное уже
            // отправляли?» становится неотвечаемым.
            foreach (LessonPhase::LEADS as $lead => $cfg) {
                if ($to->resetsMark($lead, $newStart, $now)) {
                    $update[$cfg['column']] = null;
                    $cleared[] = $lead;
                }
            }

            TimeSlots::get()->updateById($update, $slotId);

            $bookingIds = array_map(
                static fn (array $b): int => (int)$b['id'],
                static::bookingsOf($slotId),
            );

            if ($bookingIds !== [] && $cleared !== []) {
                $bookingUpdate = [];

                foreach ($cleared as $lead) {
                    $bookingUpdate[LessonPhase::LEADS[$lead]['column']] = null;
                }

                Bookings::get()->updateById($bookingUpdate, $bookingIds);
            }

            return [
                'slot' => $slotId,
                'bookings' => count($bookingIds),
                'from' => $from->value,
                'to' => $to->value,
                'start_at' => $newStart,
                'end_at' => $newEnd,
                'cleared' => $cleared,
            ];
        }

        /** @return list<array<string, mixed>> */
        private static function bookingsOf(int $slotId): array {
            return Bookings::get()->selectAll(
                static function (SelectInterface $q) use ($slotId): void {
                    $q->where(
                        'bookable_type = :type AND bookable_id = :slot_id',
                        ['type' => 'time_slot', 'slot_id' => $slotId]
                    );
                }
            );
        }

        /** Аккаунт существует и живёт в зарезервированной тестовой зоне. */
        private static function isTestAccount(int $accountId): bool {
            if ($accountId <= 0) {
                return false;
            }

            $account = DbAccount::get()->selectById($accountId);

            if (!$account) {
                return false;
            }

            $login = strtolower((string)($account['login'] ?? ''));

            return $login !== '' && str_ends_with($login, static::TEST_SUFFIX);
        }
    }
}
