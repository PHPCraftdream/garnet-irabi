<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Services\DevSeed {
    use Aura\SqlQuery\Common\SelectInterface;
    use PHPCraftdream\IRabi\Common\Tables\Messaging\Comments;
    use PHPCraftdream\IRabi\Common\Tables\Messaging\ImAttachments;
    use PHPCraftdream\IRabi\Common\Tables\Messaging\ImConversations;
    use PHPCraftdream\IRabi\Common\Tables\Messaging\ImMessages;
    use PHPCraftdream\IRabi\Common\Tables\Messaging\ImReadStatus;
    use PHPCraftdream\IRabi\Common\Tables\Support\SupportAssignmentLog;
    use PHPCraftdream\IRabi\Common\Tables\Support\SupportAttachments;
    use PHPCraftdream\IRabi\Common\Tables\Support\SupportMessages;
    use PHPCraftdream\IRabi\Common\Tables\Support\SupportTickets;

    /**
     * Обращения в поддержку, сообщения и комментарии.
     */
    trait DevSeedSupportTrait {
        /**
         * @param list<int>          $userIds
         * @param array<string,int>  $staffIds
         */
        private static function seedSupportTickets(array $userIds, array $staffIds): void {
            if (count(SupportTickets::get()->selectAll(static fn (SelectInterface $q) => $q->cols(['id'])->limit(1))) > 0) {
                return;
            }
            if (empty($userIds)) {
                return;
            }

            $moderatorId = $staffIds['moderator'] ?? 0;
            $adminId = $staffIds['admin'] ?? 0;
            $assigneeCandidates = array_values(array_filter([$moderatorId, $adminId]));

            $statusMix = [
                ['open', 0],
                ['open', 0],
                ['open', 0],
                ['investigation', 1],
                ['investigation', 1],
                ['in_progress', 1],
                ['in_progress', 1],
                ['waiting_user', 1],
                ['waiting_support', 1],
                ['resolved', 0],
                ['resolved', 0],
                ['rejected', 0],
            ];

            $subjects = [
                'Не могу оплатить бронирование',
                'Эксперт не вышел на связь',
                'Ошибка при загрузке слота в календарь',
                'Не пришёл код подтверждения',
                'Возврат средств после отмены',
                'Не отображается история бронирований',
                'Проблема с фотографией профиля',
                'Не получается сменить часовой пояс',
                'Жалоба на поведение пользователя',
                'Уведомления приходят с задержкой',
                'Пропала запись из календаря',
                'Вопрос о комиссии платформы',
            ];

            $userMessages = [
                'Здравствуйте! Помогите, пожалуйста, разобраться с проблемой.',
                'Перепробовал всё, ничего не помогает. Прошу подсказать, что делать.',
                'Прикладываю скриншоты к обращению. Жду ответа.',
                'Уточняю детали — это происходит уже второй день подряд.',
            ];
            $staffMessages = [
                'Здравствуйте! Спасибо за обращение, мы изучаем вашу ситуацию.',
                'Передал коллегам из технической поддержки, ответим в ближайшее время.',
                'Проверьте, пожалуйста, ещё раз — мы внесли правки на стороне сервиса.',
                'Готово. Если повторится — напишите снова, мы оперативно отреагируем.',
            ];
            $internalNotes = [
                'Похоже на дубликат тикета #42 — связал с кейсом',
                'Эскалирую старшему модератору',
                'Согласовать с финансовым отделом',
            ];

            $now = time();
            $ticketCount = count($statusMix);
            for ($i = 0; $i < $ticketCount; $i++) {
                [$status, $assigned] = $statusMix[$i];
                $userId = $userIds[$i % count($userIds)];
                $assigneeId = $assigned && !empty($assigneeCandidates)
                    ? $assigneeCandidates[$i % count($assigneeCandidates)]
                    : null;

                $createdAt = $now - random_int(1, 30) * 86400 - random_int(0, 86399);
                $context = json_encode([
                    'url' => 'https://example.test/support/new',
                    'ua' => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0',
                    'viewport' => '1920x1080',
                ], JSON_UNESCAPED_UNICODE);

                $ticketId = (int)SupportTickets::get()->insert([
                    'account_id' => $userId,
                    'subject' => $subjects[$i % count($subjects)],
                    'status' => $status,
                    'assignee_id' => $assigneeId,
                    'unread_user' => $assigned ? 0 : ($i % 3 === 0 ? 1 : 0),
                    'unread_staff' => $i % 4 === 0 ? 1 : 0,
                    'context' => $context,
                    'created_at' => $createdAt,
                    'updated_at' => $createdAt + random_int(60, 86400),
                ]);

                $msgCount = random_int(1, 6);
                $msgTime = $createdAt;
                $messageIds = [];
                for ($m = 0; $m < $msgCount; $m++) {
                    $isUser = ($m % 2) === 0;
                    $isInternal = !$isUser && ($m === $msgCount - 1) && ($i % 5 === 0) ? 1 : 0;
                    $authorId = $isUser ? $userId : ($assigneeId ?? $moderatorId);
                    if ($authorId <= 0) {
                        $authorId = $userId;
                    }

                    $body = $isInternal
                        ? $internalNotes[$m % count($internalNotes)]
                        : ($isUser
                            ? $userMessages[$m % count($userMessages)]
                            : $staffMessages[$m % count($staffMessages)]);

                    $msgId = (int)SupportMessages::get()->insert([
                        'ticket_id' => $ticketId,
                        'author_id' => $authorId,
                        'body' => $body,
                        'is_internal' => $isInternal,
                        'msg_type' => $isUser ? 'user' : 'staff',
                        'created_at' => $msgTime,
                    ]);
                    $messageIds[] = $msgId;
                    $msgTime += random_int(600, 7200);
                }

                // Attach a stub file to the first message of every 4th ticket.
                if ($i % 4 === 0) {
                    SupportAttachments::get()->insert([
                        'message_id' => $messageIds[0],
                        'original_name' => 'photo.png',
                        'stored_name' => md5((string)mt_rand()) . '.png',
                        'mime_type' => 'image/png',
                        'size' => 12345,
                        'created_at' => $createdAt,
                    ]);
                }

                // Assignment log entries.
                if ($assigneeId !== null) {
                    SupportAssignmentLog::get()->insert([
                        'ticket_id' => $ticketId,
                        'actor_id' => $adminId ?: $moderatorId,
                        'from_id' => null,
                        'to_id' => $assigneeId,
                        'created_at' => $createdAt + 600,
                    ]);

                    // Reassignment for a couple of tickets.
                    if ($i % 5 === 0 && count($assigneeCandidates) > 1) {
                        $other = $assigneeCandidates[($i + 1) % count($assigneeCandidates)];
                        if ($other !== $assigneeId) {
                            SupportAssignmentLog::get()->insert([
                                'ticket_id' => $ticketId,
                                'actor_id' => $adminId ?: $moderatorId,
                                'from_id' => $assigneeId,
                                'to_id' => $other,
                                'created_at' => $createdAt + 7200,
                            ]);
                        }
                    }
                }
            }
        }

        /**
         * @param list<int> $userIds
         * @param list<int> $expertIds
         */
        private static function seedIm(array $userIds, array $expertIds): void {
            if (count(ImConversations::get()->selectAll(static fn (SelectInterface $q) => $q->cols(['id'])->limit(1))) > 0) {
                return;
            }
            if (empty($userIds) || empty($expertIds)) {
                return;
            }

            $userPhrases = [
                'Здравствуйте! Хотел уточнить детали по слоту.',
                'Спасибо, всё понятно. До встречи!',
                'Можно перенести встречу на час позже?',
                'У меня вопрос по материалам, можно прислать?',
                'Подскажите, что лучше подготовить заранее?',
            ];
            $expertPhrases = [
                'Здравствуйте! Конечно, отвечу на ваши вопросы.',
                'Готов перенести, без проблем.',
                'Пришлите, пожалуйста, я посмотрю.',
                'Подготовьте список вопросов и кратко опишите ситуацию.',
                'Хорошо, буду на связи в указанное время.',
            ];

            $now = time();
            $convCount = 6;
            for ($i = 0; $i < $convCount; $i++) {
                $userId = $userIds[$i % count($userIds)];
                $expertId = $expertIds[$i % count($expertIds)];

                $convId = ImConversations::findOrCreate($userId, $expertId);

                $msgCount = random_int(4, 10);
                $msgTime = $now - random_int(1, 30) * 86400;
                $lastMsgId = 0;
                $msgIds = [];

                for ($m = 0; $m < $msgCount; $m++) {
                    $senderIsUser = ($m % 2) === 0;
                    $senderId = $senderIsUser ? $userId : $expertId;
                    $body = $senderIsUser
                        ? $userPhrases[$m % count($userPhrases)]
                        : $expertPhrases[$m % count($expertPhrases)];

                    $msgId = (int)ImMessages::get()->insert([
                        'conversation_id' => $convId,
                        'sender_id' => $senderId,
                        'body' => $body,
                        'created_at' => $msgTime,
                    ]);
                    $msgIds[] = $msgId;
                    $lastMsgId = $msgId;
                    $msgTime += random_int(120, 7200);
                }

                ImConversations::get()->updateByField([
                    'last_message_at' => $msgTime,
                ], 'id', $convId);

                // Attachments on 2 conversations.
                if ($i < 2) {
                    ImAttachments::get()->insert([
                        'message_id' => $msgIds[0],
                        'original_name' => 'photo.png',
                        'stored_name' => md5((string)mt_rand()) . '.png',
                        'mime_type' => 'image/png',
                        'size' => 12345,
                        'created_at' => $now,
                    ]);
                }

                // Read status: 4 conversations fully-read by both, 2 leave one side unread.
                if ($i >= 2) {
                    // Both read all messages.
                    ImReadStatus::markRead($convId, $userId, $lastMsgId);
                    ImReadStatus::markRead($convId, $expertId, $lastMsgId);
                } else {
                    // User read all, expert is behind (or vice-versa).
                    if ($i === 0) {
                        ImReadStatus::markRead($convId, $userId, $lastMsgId);
                        if (count($msgIds) > 1) {
                            ImReadStatus::markRead($convId, $expertId, $msgIds[count($msgIds) - 2]);
                        }
                    } else {
                        ImReadStatus::markRead($convId, $expertId, $lastMsgId);
                        if (count($msgIds) > 1) {
                            ImReadStatus::markRead($convId, $userId, $msgIds[count($msgIds) - 2]);
                        }
                    }
                }
            }
        }

        /**
         * @param list<int> $userIds
         * @param list<int> $expertIds
         */
        private static function seedComments(array $userIds, array $expertIds): void {
            if (count(Comments::get()->selectAll(static fn (SelectInterface $q) => $q->cols(['id'])->limit(1))) > 0) {
                return;
            }
            if (empty($userIds) || empty($expertIds)) {
                return;
            }

            // NOTE: the schema only has body/author/entity — no rating, no parent_id chain.
            // Spec asked for ratings/replies but those columns are not present; emitting plain comments.
            $bodies = [
                'Отличный эксперт, всё разложил по полочкам. Рекомендую!',
                'Спасибо за встречу, было очень полезно.',
                'Подача материала на высоте, буду возвращаться.',
                'Профессионал своего дела, ответил на все вопросы.',
                'Понравилось, как структурно объясняет сложные вещи.',
                'Хорошее общение и реальная помощь.',
                'Слот прошёл продуктивно, спасибо!',
            ];

            $targetExperts = array_slice($expertIds, 0, 4);
            $now = time();
            $i = 0;
            foreach ($targetExperts as $expertId) {
                $count = random_int(3, 5);
                for ($k = 0; $k < $count; $k++) {
                    $authorId = $userIds[$i % count($userIds)];
                    $createdAt = $now - random_int(0, 60) * 86400 - random_int(0, 86399);
                    Comments::get()->insert([
                        'author_id' => $authorId,
                        'entity_type' => Comments::ENTITY_EXPERT,
                        'entity_id' => $expertId,
                        'body' => $bodies[$i % count($bodies)],
                        'created_at' => $createdAt,
                    ]);
                    $i++;
                }
            }
        }
    }
}
