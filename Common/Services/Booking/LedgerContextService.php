<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Services\Booking {
    use Aura\SqlQuery\Common\SelectInterface;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\Account;
    use PHPCraftdream\IRabi\Common\Tables\Booking\Bookings;
    use PHPCraftdream\IRabi\Common\Tables\Booking\TimeSlots;

    /**
     * Повод денежной операции: с кем и когда было занятие.
     *
     * Строка истории выглядела так: «+ Оплачен · +1200 ₽ · Оплачен #15». Ни
     * ученика, ни даты занятия, ни ссылки — только внутренний номер брони, по
     * которому человек не может сопоставить таблицу со своей жизнью. Нашла
     * expert-4, у которой была одна бронь; при пяти учениках история
     * превращается в список сумм без повода.
     *
     * Повод не дописывается в `note` при записи операции по двум причинам.
     * Во-первых, мест записи восемь (`BookingsController`, `SlotsController`,
     * `ExpertBookingsService`), и девятое появится незамеченным. Во-вторых,
     * `note` — застывший текст: уже накопленные строки так не вылечить, а
     * обогащение на чтении лечит и их.
     *
     * Дату отдаём числом, а не готовой строкой: время хранится в UTC и
     * переводится в пояс читателя на клиенте. Собрать строку здесь значило бы
     * подписать её поясом сервера.
     */
    class LedgerContextService {
        /**
         * Дописать каждой строке `context`: имя второй стороны и время занятия.
         *
         * @param array $items строки `balance_ledger`
         * @param int $accountId чья это история — от него зависит, кто «вторая сторона»
         * @return array те же строки, у подходящих добавлен `context`
         */
        public static function enrich(array $items, int $accountId): array {
            $bookingIds = [];

            foreach ($items as $row) {
                if (($row['ref_type'] ?? '') === 'booking' && (int)($row['ref_id'] ?? 0) > 0) {
                    $bookingIds[(int)$row['ref_id']] = true;
                }
            }

            if ($bookingIds === []) {
                return $items;
            }

            $bookings = static::fetchBookings(array_keys($bookingIds));

            if ($bookings === []) {
                return $items;
            }

            $slots = static::fetchSlots(array_column($bookings, 'bookable_id'));
            $names = static::resolveNames($bookings, $slots, $accountId);

            foreach ($items as &$row) {
                $bookingId = (int)($row['ref_id'] ?? 0);
                $booking = $bookings[$bookingId] ?? null;

                if (($row['ref_type'] ?? '') !== 'booking' || $booking === null) {
                    continue;
                }

                $slot = $slots[(int)$booking['bookable_id']] ?? null;

                // Вторая сторона — та, которой нет среди читателей этой строки:
                // ученику показываем преподавателя, преподавателю ученика.
                $otherId = (int)$booking['user_id'] === $accountId
                    ? (int)($slot['expert_id'] ?? 0)
                    : (int)$booking['user_id'];

                $row['context'] = [
                    'booking_id' => $bookingId,
                    'other_name' => $names[$otherId] ?? '',
                    'start_at' => (int)($slot['start_at'] ?? 0),
                    // Кто отменил — то же, что показывает карточка брони с
                    // D-094. В истории операций этого не было: строка возврата
                    // не говорила, почему вернули всю сумму, а не с
                    // удержанием, и чьё это было решение (нашёл owner-2,
                    // сверяя деньги площадки).
                    'cancel_role' => (string)($booking['cancelled_role'] ?? ''),
                    // С чьей стороны читают строку: у ученика и у преподавателя
                    // одна и та же роль означает разное — «вы отменили» против
                    // «отменил ученик».
                    'viewer_is_student' => (int)$booking['user_id'] === $accountId,
                    // Успела ли бронь стать подтверждённой. Без этого потеря
                    // неподтверждённой заявки называлась в истории «отменой»,
                    // хотя на кнопке и в окне стояло «снятие» (D-135).
                    // Отдельного столбца не потребовалось: подтверждение
                    // оставляет `confirmed_at`, и старые строки читаются
                    // правильно задним числом.
                    'was_confirmed' => !empty($booking['confirmed_at']),
                ];
            }
            unset($row);

            return $items;
        }

        /** @return array<int, array> бронь по её id */
        private static function fetchBookings(array $ids): array {
            $rows = Bookings::get()->selectAll(function (SelectInterface $q) use ($ids): void {
                $q->where('id IN (?)', [array_map('intval', $ids)]);
            });

            $byId = [];

            foreach ($rows as $row) {
                $byId[(int)$row['id']] = $row;
            }

            return $byId;
        }

        /** @return array<int, array> слот по его id */
        private static function fetchSlots(array $ids): array {
            $ids = array_values(array_filter(array_map('intval', $ids), static fn (int $id): bool => $id > 0));

            if ($ids === []) {
                return [];
            }

            $rows = TimeSlots::get()->selectAll(function (SelectInterface $q) use ($ids): void {
                $q->where('id IN (?)', [$ids]);
            });

            $byId = [];

            foreach ($rows as $row) {
                $byId[(int)$row['id']] = $row;
            }

            return $byId;
        }

        /** @return array<int, string> отображаемое имя по id аккаунта */
        private static function resolveNames(array $bookings, array $slots, int $accountId): array {
            $ids = [];

            foreach ($bookings as $booking) {
                $ids[(int)$booking['user_id']] = true;
            }

            foreach ($slots as $slot) {
                $ids[(int)$slot['expert_id']] = true;
            }

            unset($ids[$accountId], $ids[0]);

            if ($ids === []) {
                return [];
            }

            $accounts = Account::getAccounts(
                selectCallback: static function (SelectInterface $q) use ($ids): void {
                    $q->resetCols();
                    $q->cols(['id', 'name', 'login']);
                    $q->where('id IN (?)', [array_map('intval', array_keys($ids))]);
                },
            );

            $names = [];

            foreach ($accounts as $account) {
                $names[(int)$account['id']] = (string)($account['name'] ?: $account['login']);
            }

            return $names;
        }
    }
}
