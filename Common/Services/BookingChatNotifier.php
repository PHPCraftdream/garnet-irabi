<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Services {
    use Aura\SqlQuery\Common\SelectInterface;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\DbAccount;
    use PHPCraftdream\IRabi\Common\System\DateUtils;
    use PHPCraftdream\IRabi\Common\Tables\ImConversations;
    use PHPCraftdream\IRabi\Common\Tables\ImMessages;
    use PHPCraftdream\IRabi\Foreground\I18n\ForegroundI18n;

    /**
     * Posts an automatic personal (IM) message from the expert to the user when
     * the expert acts on a booking (confirm / decline / cancel), so the user
     * sees a notice in their dialogs alongside the existing news + e-mail.
     */
    class BookingChatNotifier {
        public static function confirmed(int $expertId, int $userId, int $startAt): void {
            static::send($expertId, $userId, sprintf(
                (string)ForegroundI18n::getInstance()->Booking_Chat_Confirmed(),
                static::when($userId, $startAt),
            ));
        }

        public static function declined(int $expertId, int $userId, int $startAt): void {
            static::send($expertId, $userId, sprintf(
                (string)ForegroundI18n::getInstance()->Booking_Chat_Declined(),
                static::when($userId, $startAt),
            ));
        }

        public static function cancelled(int $expertId, int $userId, int $startAt): void {
            static::send($expertId, $userId, sprintf(
                (string)ForegroundI18n::getInstance()->Booking_Chat_Cancelled(),
                static::when($userId, $startAt),
            ));
        }

        public static function locationChanged(int $expertId, int $userId, int $startAt): void {
            static::send($expertId, $userId, sprintf(
                (string)ForegroundI18n::getInstance()->Booking_Chat_LocationChanged(),
                static::when($userId, $startAt),
            ));
        }

        /**
         * "Cancel" when the booking was already confirmed, otherwise "decline".
         */
        public static function cancelledOrDeclined(int $expertId, int $userId, int $startAt, string $prevStatus): void {
            if ($prevStatus === 'confirmed') {
                static::cancelled($expertId, $userId, $startAt);
            } else {
                static::declined($expertId, $userId, $startAt);
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
         */
        private static function when(int $userId, int $startAt): string {
            $rows = DbAccount::get()->selectAll(static function (SelectInterface $q) use ($userId): void {
                $q->resetCols();
                $q->cols(['time_zone']);
                $q->where('id = :aid', ['aid' => $userId]);
            });

            $tz = (isset($rows[0]['time_zone']) && is_string($rows[0]['time_zone']) && $rows[0]['time_zone'] !== '')
                ? $rows[0]['time_zone']
                : null;

            return DateUtils::formatForUser($startAt, $tz, 'd.m.Y, H:i');
        }

        private static function send(int $expertId, int $userId, string $body): void {
            if ($expertId <= 0 || $userId <= 0 || $expertId === $userId || $body === '') {
                return;
            }

            $convId = ImConversations::findOrCreate($expertId, $userId);
            $now = time();

            ImMessages::get()->insert([
                'conversation_id' => $convId,
                'sender_id' => $expertId,
                'body' => $body,
                'created_at' => $now,
            ]);
            ImConversations::get()->updateByField(['last_message_at' => $now], 'id', $convId);
        }
    }
}
