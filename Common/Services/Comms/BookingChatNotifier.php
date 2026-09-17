<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Services\Comms {
    use Aura\SqlQuery\Common\SelectInterface;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\DbAccount;
    use PHPCraftdream\IRabi\Common\Services\Booking\MeetingPlatform;
    use PHPCraftdream\IRabi\Common\System\DateUtils;
    use PHPCraftdream\IRabi\Common\Tables\Messaging\ImConversations;
    use PHPCraftdream\IRabi\Common\Tables\Messaging\ImMessages;
    use PHPCraftdream\IRabi\Foreground\I18n\ForegroundI18n;

    /**
     * Posts an automatic personal (IM) message from the expert to the user when
     * the expert acts on a booking (confirm / decline / cancel), so the user
     * sees a notice in their dialogs alongside the existing news + e-mail.
     */
    class BookingChatNotifier {
        /**
         * @param array{start_at?: int, duration_min?: int, cost?: int, is_online?: int, location?: string} $slot
         */
        public static function confirmed(int $expertId, int $userId, array $slot): void {
            static::send($expertId, $userId, sprintf(
                (string)ForegroundI18n::getInstance()->Booking_Chat_Confirmed(),
                static::when($userId, $slot),
            ));
        }

        /** @param array{start_at?: int, duration_min?: int, cost?: int, is_online?: int, location?: string} $slot */
        public static function declined(int $expertId, int $userId, array $slot): void {
            static::send($expertId, $userId, sprintf(
                (string)ForegroundI18n::getInstance()->Booking_Chat_Declined(),
                static::when($userId, $slot),
            ));
        }

        /** @param array{start_at?: int, duration_min?: int, cost?: int, is_online?: int, location?: string} $slot */
        public static function cancelled(int $expertId, int $userId, array $slot): void {
            static::send($expertId, $userId, sprintf(
                (string)ForegroundI18n::getInstance()->Booking_Chat_Cancelled(),
                static::when($userId, $slot),
            ));
        }

        /** @param array{start_at?: int, duration_min?: int, cost?: int, is_online?: int, location?: string} $slot */
        public static function locationChanged(int $expertId, int $userId, array $slot): void {
            static::send($expertId, $userId, sprintf(
                (string)ForegroundI18n::getInstance()->Booking_Chat_LocationChanged(),
                static::when($userId, $slot),
            ));
        }

        /**
         * Перенос занятия (D-193). Отличается от соседей отправителем: остальные
         * сообщения всегда идут от преподавателя, потому что и действие всегда
         * его. Перенести может любая из двух сторон, и сообщение должно быть
         * подписано тем, кто действительно перенёс, — иначе ученик получает от
         * себя же уведомление о собственном действии.
         *
         * Оба времени печатаются в поясе получателя и подписываются поясом —
         * тот же приём, что у соседей (D-157/D-166).
         */
        public static function rescheduled(int $senderId, int $recipientId, int $oldStartAt, int $newStartAt): void {
            static::send($senderId, $recipientId, sprintf(
                (string)ForegroundI18n::getInstance()->Booking_Chat_Rescheduled(),
                static::whenTime($recipientId, $oldStartAt),
                static::whenTime($recipientId, $newStartAt),
            ));
        }

        /**
         * "Cancel" when the booking was already confirmed, otherwise "decline".
         *
         * @param array{start_at?: int, duration_min?: int, cost?: int, is_online?: int, location?: string} $slot
         */
        public static function cancelledOrDeclined(int $expertId, int $userId, array $slot, string $prevStatus): void {
            if ($prevStatus === 'confirmed') {
                static::cancelled($expertId, $userId, $slot);
            } else {
                static::declined($expertId, $userId, $slot);
            }
        }

        /**
         * Часовой пояс ученика живёт КОЛОНКОЙ `accounts.time_zone`, а не
         * строкой в `accounts_data`.
         *
         * Здесь его искали во втором месте, где ключа `time_zone` нет ни у
         * кого — запрос всегда возвращал пусто, `$tz` всегда был null, и время
         * печаталось в UTC. Для профиля с московским поясом это ровно три часа
         * мимо: «Ваша бронь на 08:00 подтверждена» о занятии в 11:00.
         *
         * Ошибка была невидимой снаружи: подставлялось не «непонятно что», а
         * правдоподобное время, просто чужое. Заметил её преподаватель, у
         * которого ни одно из названных в чате времён ни разу не совпало с
         * настоящим.
         *
         * D-166: время здесь верно переводится в пояс ученика — но диалог
         * читают ДВОЕ, и эксперт видит ту же самую строку в СВОЁМ поясе,
         * который может отличаться. Без подписи пояса время выглядит как
         * рассинхрон/UTC, даже когда конвертация отработала правильно.
         * Подписываем пояс так же, как в письмах (`DateUtils::zoneLabel`).
         */
        private static function whenTime(int $userId, int $startAt): string {
            $rows = DbAccount::get()->selectAll(static function (SelectInterface $q) use ($userId): void {
                $q->resetCols();
                $q->cols(['time_zone']);
                $q->where('id = :aid', ['aid' => $userId]);
            });

            $tz = (isset($rows[0]['time_zone']) && is_string($rows[0]['time_zone']) && $rows[0]['time_zone'] !== '')
                ? $rows[0]['time_zone']
                : null;

            return DateUtils::formatForUser($startAt, $tz, 'd.m.Y, H:i') . ' (' . DateUtils::zoneLabel($startAt, $tz) . ')';
        }

        /**
         * D-202: дата/время сообщение уже называло, но не длительность, цену
         * и формат — тот же пробел, что закрыли в письмах (D-129/D-139).
         * Один диалог у преподавателя и ученика на ВСЕ их занятия, и когда в
         * нём подряд несколько «Ваша бронь на ... подтверждена», отличить их
         * друг от друга можно было только по дате — здесь же, в одной строке.
         *
         * Формат — тем же правилом, что и везде: онлайн называет платформу,
         * не ссылку (`MeetingPlatform::publicName`); очное — адрес, который
         * получателю в любом случае уже открыт как участнику этой брони.
         *
         * @param array{start_at?: int, duration_min?: int, cost?: int, is_online?: int, location?: string} $slot
         */
        private static function when(int $userId, array $slot): string {
            $startAt = (int)($slot['start_at'] ?? 0);
            $durationMin = (int)($slot['duration_min'] ?? 0);
            $cost = (int)($slot['cost'] ?? 0);
            $isOnline = (int)($slot['is_online'] ?? 0) === 1;
            $location = (string)($slot['location'] ?? '');
            $format = $isOnline ? MeetingPlatform::publicName($location) : $location;

            $parts = [static::whenTime($userId, $startAt)];
            if ($durationMin > 0) {
                $parts[] = $durationMin . ' ' . (string)ForegroundI18n::getInstance()->Slot_Duration_Min();
            }
            if ($cost > 0) {
                $parts[] = $cost . ' ' . "\u{20BD}";
            }
            if ($format !== '') {
                $parts[] = $format;
            }

            return implode(' · ', $parts);
        }

        /**
         * Отправитель здесь — параметр, а не «всегда преподаватель»: почти все
         * сообщения выше действительно от него, но перенос (D-193) может
         * сделать и ученик, и подписать его чужим именем нельзя.
         */
        private static function send(int $senderId, int $recipientId, string $body): void {
            if ($senderId <= 0 || $recipientId <= 0 || $senderId === $recipientId || $body === '') {
                return;
            }

            $convId = ImConversations::findOrCreate($senderId, $recipientId);
            $now = time();

            ImMessages::get()->insert([
                'conversation_id' => $convId,
                'sender_id' => $senderId,
                'body' => $body,
                'created_at' => $now,
            ]);
            ImConversations::get()->updateByField(['last_message_at' => $now], 'id', $convId);
        }
    }
}
