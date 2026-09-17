<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Services\DevSeed {
    use Aura\SqlQuery\Common\SelectInterface;
    use PHPCraftdream\IRabi\Common\Tables\AdminActionLog;
    use PHPCraftdream\IRabi\Common\Tables\Bookings;
    use PHPCraftdream\IRabi\Common\Tables\MailLog;
    use PHPCraftdream\IRabi\Common\Tables\MailLogRecipients;
    use PHPCraftdream\IRabi\Common\Tables\TimeSlots;

    /**
     * Служебные журналы: действия администраторов и отправленная почта.
     */
    trait DevSeedLogsTrait {
        // ── Auxiliary seeders ─────────────────────────────────────────────

        /**
         * @param array<string,int> $staffIds  ['admin'=>id,'owner'=>id,'moderator'=>id]
         * @param list<int>         $userIds
         * @param list<int>         $expertIds
         */
        private static function seedAdminActionLog(array $staffIds, array $userIds, array $expertIds): void {
            if (count(AdminActionLog::get()->selectAll(static fn (SelectInterface $q) => $q->cols(['id'])->limit(1))) > 0) {
                return;
            }

            $actorIds = array_values(array_filter([
                $staffIds['admin'] ?? 0, $staffIds['owner'] ?? 0, $staffIds['moderator'] ?? 0,
            ]));
            if (empty($actorIds)) {
                return;
            }

            $actorLoginByRole = [
                ($staffIds['admin'] ?? 0) => 'admin@dev.test',
                ($staffIds['owner'] ?? 0) => 'owner@dev.test',
                ($staffIds['moderator'] ?? 0) => 'moderator@dev.test',
            ];

            $bookings = Bookings::get()->selectAll(static function (SelectInterface $q): void {
                $q->cols(['id'])->orderBy(['id ASC'])->limit(20);
            });
            $slots = TimeSlots::get()->selectAll(static function (SelectInterface $q): void {
                $q->cols(['id'])->orderBy(['id ASC'])->limit(20);
            });
            $bookingIds = array_map(static fn (array $r) => (int)$r['id'], $bookings);
            $slotIds = array_map(static fn (array $r) => (int)$r['id'], $slots);

            $allTargets = array_merge($userIds, $expertIds);
            if (empty($allTargets)) {
                return;
            }

            $now = time();
            $actions = [
                ['user.approve',           ['0', '1']],
                ['user.disable',           ['0', '1']],
                ['user.flag_set',          ['0', '1']],
                ['slot.delete',            ['active', 'deleted']],
                ['booking.cancel',         ['confirmed', 'cancelled']],
                ['support.assign',         ['', 'moderator@dev.test']],
                ['support.status_change',  ['open', 'in_progress']],
                ['balance.adjust',         ['0', '500']],
            ];

            for ($i = 0; $i < 40; $i++) {
                [$action, $values] = $actions[$i % count($actions)];
                $actorId = $actorIds[$i % count($actorIds)];
                $actorLogin = $actorLoginByRole[$actorId] ?? 'staff@dev.test';

                if ($action === 'slot.delete') {
                    $targetId = !empty($slotIds) ? $slotIds[$i % count($slotIds)] : 0;
                    $targetLogin = 'slot#' . $targetId;
                } elseif ($action === 'booking.cancel') {
                    $targetId = !empty($bookingIds) ? $bookingIds[$i % count($bookingIds)] : 0;
                    $targetLogin = 'booking#' . $targetId;
                } else {
                    $targetId = $allTargets[$i % count($allTargets)];
                    $targetLogin = 'account#' . $targetId;
                }

                $createdAt = $now - random_int(0, 14) * 86400 - random_int(0, 86399);

                AdminActionLog::get()->insert([
                    'actor_id' => $actorId,
                    'actor_login' => $actorLogin,
                    'target_id' => $targetId,
                    'target_login' => $targetLogin,
                    'action' => $action,
                    'old_value' => $values[0],
                    'new_value' => $values[1],
                    'created_at' => $createdAt,
                ]);
            }
        }

        /**
         * @param list<int> $userIds
         * @param list<int> $expertIds
         */
        private static function seedMailLog(array $userIds, array $expertIds): void {
            if (count(MailLog::get()->selectAll(static fn (SelectInterface $q) => $q->cols(['id'])->limit(1))) > 0) {
                return;
            }

            $allIds = array_merge($userIds, $expertIds);
            if (empty($allIds)) {
                return;
            }

            $now = time();
            $types = [
                'auth_code' => 'Код входа на сервис',
                'booking_confirmed' => 'Ваше бронирование подтверждено',
                'booking_rejected' => 'Бронирование отклонено',
                'slot_cancelled' => 'Слот отменён экспертом',
                'support_reply' => 'Новый ответ в обращении в поддержку',
                'news_digest' => 'Свежие события на платформе',
            ];
            $typeKeys = array_keys($types);

            $errorMessages = [
                'SMTP timeout: 530 5.7.0 Authentication required',
                'Connection refused (10061)',
                'Recipient address rejected: User unknown',
                'Mailbox quota exceeded',
            ];

            // ~70% sent / ~15% failed / ~10% pending / ~5% bounced
            $statusMix = array_merge(
                array_fill(0, 28, 'sent'),
                array_fill(0, 6, 'failed'),
                array_fill(0, 4, 'pending'),
                array_fill(0, 2, 'bounced'),
            );
            shuffle($statusMix);

            foreach ($statusMix as $i => $status) {
                $type = $typeKeys[$i % count($typeKeys)];
                $subject = $types[$type];

                // Authcode emails: sometimes guests (no account_id).
                $isGuest = $type === 'auth_code' && ($i % 7 === 0);
                $accountId = $isGuest ? null : $allIds[$i % count($allIds)];

                $email = $isGuest
                    ? 'guest' . $i . '@example.com'
                    : static::loginByAccountId($accountId);

                $createdAt = $now - random_int(0, 30) * 86400 - random_int(0, 86399);
                $errorLog = $status === 'failed' ? $errorMessages[$i % count($errorMessages)] : null;

                $mailLogId = (int)MailLog::get()->insert([
                    'account_id' => $accountId,
                    'recipient_email' => $email,
                    'mail_type' => $type,
                    'subject' => $subject,
                    'body_html' => '<p>' . $subject . '. Это тестовое письмо seed-данных.</p>',
                    'status' => $status,
                    'error_log' => $errorLog,
                    'created_at' => $createdAt,
                ]);

                MailLogRecipients::get()->insert([
                    'mail_log_id' => $mailLogId,
                    'account_id' => $accountId,
                    'recipient_email' => $email,
                ]);
            }
        }
    }
}
