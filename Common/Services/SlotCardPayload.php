<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Services {
    /**
     * Единственный источник того, как занятие выглядит снаружи.
     *
     * Появился после четвёртого подряд случая одного класса: признак живёт на
     * слоте, но каждая витрина решала сама, показывать его или нет, и
     * очередная отставала. «Групповое» терялось на главной (D-141), на
     * странице преподавателя (D-178) и на карточке брони (D-189); остаток
     * мест появился в каталоге и не появился на странице преподавателя
     * (D-200) — там в контроллере не было даже поля booked_count.
     *
     * Патчить пятый экран значило бы забыть шестой, поэтому форма ответа
     * теперь одна на всех читателей витрины.
     *
     * Отдельно про `location`: у очного занятия это адрес, у онлайнового —
     * ссылка на встречу, и наружу она не идёт никогда. Раньше страница
     * преподавателя отдавала строку таблицы как есть, и ссылка на встречу
     * читалась в исходнике страницы для занятий, которые никто не оплачивал.
     * Здесь этот разбор один и обойти его нельзя.
     */
    class SlotCardPayload {
        /**
         * @param array<string, mixed> $slot строка таблицы time_slots как есть
         * @return array<string, mixed>
         */
        public static function forViewer(array $slot): array {
            $isOnline = (int)($slot['is_online'] ?? 0) === 1;

            return [
                'id' => (int)($slot['id'] ?? 0),
                'expert_id' => (int)($slot['expert_id'] ?? 0),
                'start_at' => (int)($slot['start_at'] ?? 0),
                'end_at' => (int)($slot['end_at'] ?? 0),
                'duration_min' => (int)($slot['duration_min'] ?? 60),
                'cost' => (int)($slot['cost'] ?? 0),
                'cancellation_penalty_percent' => (int)($slot['cancellation_penalty_percent'] ?? 0),
                'is_online' => $isOnline ? 1 : 0,
                'location' => $isOnline ? '' : (string)($slot['location'] ?? ''),
                'platform' => $isOnline ? MeetingPlatform::publicName($slot['location'] ?? null) : '',
                'max_users' => (int)($slot['max_users'] ?? 1),
                // Вместимость без занятости не отвечает на единственный вопрос,
                // который человек задаёт групповому занятию: успею ли я.
                'booked_count' => (int)($slot['booked_count'] ?? 0),
                'status' => (string)($slot['status'] ?? ''),
                'uid' => (string)($slot['uid'] ?? ''),
                'created_at' => (int)($slot['created_at'] ?? 0),
            ];
        }

        /**
         * @param array<int, array<string, mixed>> $slots
         * @return array<int, array<string, mixed>>
         */
        public static function forViewerList(array $slots): array {
            return array_values(array_map(static fn (array $s): array => self::forViewer($s), $slots));
        }
    }
}
