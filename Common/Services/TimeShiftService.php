<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Services {
    use Aura\SqlQuery\Common\SelectInterface;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\DbAccount;
    use PHPCraftdream\IRabi\Common\Tables\Bookings;
    use PHPCraftdream\IRabi\Common\Tables\TimeSlots;
use RuntimeException;

    /**
     * Двигает занятия во времени, чтобы можно было увидеть их поздние фазы,
     * не дожидаясь этих фаз по-настоящему.
     *
     * Часы системы не трогаются: единственное «сейчас» — это `time()` и
     * `UNIX_TIMESTAMP()`, и подводить их на боевом сайте значило бы менять
     * поведение для настоящих людей. Вместо этого двигаются метки самих
     * строк — тогда сдвиг затрагивает ровно то занятие, которое назвали.
     *
     * Что именно читает время и что меняется на каждой границе фаз —
     * `docs/booking-time-phases.md`. Оттуда же три правила, которые здесь
     * соблюдаются:
     *
     *  - `start_at` и `end_at` двигаются одной дельтой: их читают разные
     *    проверки, и рассинхрон дал бы занятие, которое началось, но никогда
     *    не кончается;
     *  - отметки о напоминаниях сбрасываются вместе со сдвигом, иначе слот,
     *    однажды прошедший окно, вернётся в будущее уже помеченным и второго
     *    письма не пришлёт — сдвиг будет выглядеть неработающим;
     *  - сам сдвиг ничего не отправляет: письма идут из крона, и дёргать его
     *    приходится отдельно.
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
                return ["слота #{$slotId} нет"];
            }

            $reasons = [];
            $expertId = (int)($slot['expert_id'] ?? 0);

            if (!static::isTestAccount($expertId)) {
                $reasons[] = "слот #{$slotId} ведёт не тестовый преподаватель (#{$expertId})";
            }

            $bookings = Bookings::get()->selectAll(
                static function (SelectInterface $q) use ($slotId): void {
                    $q->where(
                        'bookable_type = :type AND bookable_id = :slot_id',
                        ['type' => 'time_slot', 'slot_id' => $slotId]
                    );
                }
            );

            foreach ($bookings as $booking) {
                $userId = (int)($booking['user_id'] ?? 0);

                if (!static::isTestAccount($userId)) {
                    $reasons[] = "на слот #{$slotId} записан не тестовый ученик (#{$userId})";
                }
            }

            return $reasons;
        }

        /**
         * Сдвигает одно занятие на $deltaSec секунд вместе с его бронями.
         *
         * Отрицательная дельта двигает в прошлое. Проверка владельца делается
         * здесь же, а не только в вызывающем коде: команда — не единственный
         * возможный вызов, а запрет должен держаться независимо от того, кто
         * попросил.
         *
         * @return array{slot:int, bookings:int, start_at:int, end_at:int}
         * @throws RuntimeException если занятие трогать нельзя
         */
        public static function shiftSlot(int $slotId, int $deltaSec): array {
            $refusals = static::refusalsFor($slotId);

            if ($refusals !== []) {
                throw new RuntimeException(implode('; ', $refusals));
            }

            $slot = TimeSlots::get()->selectById($slotId);
            $startAt = (int)($slot['start_at'] ?? 0) + $deltaSec;
            $endAt = (int)($slot['end_at'] ?? 0) + $deltaSec;

            TimeSlots::get()->updateById([
                'start_at' => $startAt,
                'end_at' => $endAt,
                // Слот «не получал» напоминаний в своей новой фазе.
                'reminded_1d_at' => null,
                'reminded_2h_at' => null,
            ], $slotId);

            $bookingIds = array_map(
                static fn (array $b): int => (int)$b['id'],
                Bookings::get()->selectAll(
                    static function (SelectInterface $q) use ($slotId): void {
                        $q->where(
                            'bookable_type = :type AND bookable_id = :slot_id',
                            ['type' => 'time_slot', 'slot_id' => $slotId]
                        );
                    }
                )
            );

            if ($bookingIds !== []) {
                Bookings::get()->updateById([
                    'reminded_1d_at' => null,
                    'reminded_2h_at' => null,
                ], $bookingIds);
            }

            return [
                'slot' => $slotId,
                'bookings' => count($bookingIds),
                'start_at' => $startAt,
                'end_at' => $endAt,
            ];
        }

        /**
         * Идентификаторы всех занятий, которые вообще разрешено двигать.
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
         *
         * Голые секунды тоже принимаются, но писать их руками неудобно и легко
         * ошибиться на порядок — а ошибка здесь двигает чужое занятие.
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
