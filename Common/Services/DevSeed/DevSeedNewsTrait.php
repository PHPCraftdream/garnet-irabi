<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Services\DevSeed {
    use Aura\SqlQuery\Common\SelectInterface;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\Account;
    use PHPCraftdream\IRabi\Common\Services\NewsService;
    use PHPCraftdream\IRabi\Common\Tables\NewsArchived;
    use PHPCraftdream\IRabi\Common\Tables\NewsEvents;
    use PHPCraftdream\IRabi\Common\Tables\NewsReads;
    use PHPCraftdream\IRabi\Common\Tables\TimeSlots;
    use Throwable;

    /**
     * Лента событий: что пользователь видит как «что произошло».
     */
    trait DevSeedNewsTrait {
        /**
         * @param list<int> $userIds
         * @param list<int> $expertIds
         */
        private static function seedNewsEvents(array $userIds, array $expertIds): void {
            if (count(NewsEvents::get()->selectAll(static fn (SelectInterface $q) => $q->cols(['id'])->limit(1))) > 0) {
                return;
            }
            if (empty($userIds) || empty($expertIds)) {
                return;
            }

            $now = time();
            $eventIds = [];

            // Resolve display names so news links render with proper labels.
            $allIds = array_values(array_unique(array_merge($userIds, $expertIds)));
            $names = [];
            $accs = Account::getAccounts(
                selectCallback: static function (SelectInterface $q) use ($allIds): void {
                    $q->resetCols();
                    $q->cols(['id', 'name', 'login']);
                    $q->where('id IN (:ids)', ['ids' => array_map('intval', $allIds)]);
                },
            );
            foreach ($accs as $a) {
                $aid = (int)$a['id'];
                $names[$aid] = trim((string)($a['name'] ?? '')) ?: (string)($a['login'] ?? ('#' . $aid));
            }
            $nameOf = static fn (int $id): string => $names[$id] ?? ('#' . $id);

            $insert = static function (string $type, string $audienceType, ?int $audienceId, int $actorId, ?string $targetKey, array $payload, int $createdAt) use (&$eventIds): void {
                $eventIds[] = (int)NewsEvents::get()->insert([
                    'event_type' => $type,
                    'audience_type' => $audienceType,
                    'audience_id' => $audienceId,
                    'actor_id' => $actorId,
                    'target_key' => $targetKey,
                    'payload' => json_encode($payload, JSON_UNESCAPED_UNICODE),
                    'created_at' => $createdAt,
                ]);
            };

            // new_slot (broadcast) — link to REAL free future slots so the
            // "новый слот" link actually opens the booking modal instead of
            // 404-ing on a placeholder id.
            $freeSlots = TimeSlots::get()->selectAll(static function (SelectInterface $q): void {
                $q->resetCols();
                $q->cols(['id', 'expert_id', 'cost', 'start_at']);
                $q->where('status = :st', ['st' => 'free'])
                    ->where('start_at > UNIX_TIMESTAMP()')
                    ->orderBy(['start_at ASC'])
                    ->limit(20);
            });
            foreach ($freeSlots as $slot) {
                $expertId = (int)($slot['expert_id'] ?? 0);
                if ($expertId <= 0) {
                    continue;
                }
                $insert(
                    NewsService::TYPE_NEW_SLOT,
                    'broadcast',
                    null,
                    $expertId,
                    'slot:' . (int)$slot['id'],
                    [
                        'slot_id' => (int)$slot['id'],
                        'expert_id' => $expertId,
                        'name' => $nameOf($expertId),
                        'cost' => (int)($slot['cost'] ?? 0),
                    ],
                    $now - random_int(0, 14) * 86400 - random_int(0, 86399),
                );
            }

            // 10 slot_booked (personal-to-expert)
            for ($i = 0; $i < 10; $i++) {
                $expertId = $expertIds[$i % count($expertIds)];
                $userId = $userIds[$i % count($userIds)];
                $insert(
                    NewsService::TYPE_SLOT_BOOKED,
                    'personal',
                    $expertId,
                    $userId,
                    'slot:' . (2000 + $i),
                    [
                        'slot_id' => 2000 + $i,
                        'user_id' => $userId,
                        'name' => $nameOf($userId),
                    ],
                    $now - random_int(0, 14) * 86400 - random_int(0, 86399),
                );
            }

            // 5 booking_confirmed (personal-to-user)
            for ($i = 0; $i < 5; $i++) {
                $userId = $userIds[$i % count($userIds)];
                $expertId = $expertIds[$i % count($expertIds)];
                $insert(
                    NewsService::TYPE_BOOKING_CONFIRMED,
                    'personal',
                    $userId,
                    $expertId,
                    'slot:' . (3000 + $i),
                    [
                        'slot_id' => 3000 + $i,
                        'expert_id' => $expertId,
                        'name' => $nameOf($expertId),
                    ],
                    $now - random_int(0, 14) * 86400 - random_int(0, 86399),
                );
            }

            // 3 booking_rejected (personal-to-user)
            for ($i = 0; $i < 3; $i++) {
                $userId = $userIds[$i % count($userIds)];
                $expertId = $expertIds[$i % count($expertIds)];
                $insert(
                    NewsService::TYPE_BOOKING_REJECTED,
                    'personal',
                    $userId,
                    $expertId,
                    'slot:' . (3500 + $i),
                    [
                        'slot_id' => 3500 + $i,
                        'expert_id' => $expertId,
                        'name' => $nameOf($expertId),
                        'reason' => 'Не подошло время',
                    ],
                    $now - random_int(0, 14) * 86400 - random_int(0, 86399),
                );
            }

            // 5 support_reply (personal-to-user)
            for ($i = 0; $i < 5; $i++) {
                $userId = $userIds[$i % count($userIds)];
                $insert(
                    NewsService::TYPE_SUPPORT_REPLY,
                    'personal',
                    $userId,
                    1,
                    'ticket:' . (100 + $i),
                    ['ticket_id' => 100 + $i, 'subject' => 'Ответ службы поддержки'],
                    $now - random_int(0, 14) * 86400 - random_int(0, 86399),
                );
            }

            // 7 new_message (personal). NB: throttle ignored on seed.
            for ($i = 0; $i < 7; $i++) {
                $expertId = $expertIds[$i % count($expertIds)];
                $userId = $userIds[$i % count($userIds)];
                $sender = ($i % 2 === 0) ? $userId : $expertId;
                $recipient = ($i % 2 === 0) ? $expertId : $userId;
                $insert(
                    NewsService::TYPE_NEW_MESSAGE,
                    'personal',
                    $recipient,
                    $sender,
                    'msg:' . $sender . '-' . $recipient,
                    [
                        'sender_id' => $sender,
                        'name' => $nameOf($sender),
                        'preview' => 'Новое сообщение',
                    ],
                    $now - random_int(0, 14) * 86400 - random_int(0, 86399),
                );
            }

            // Reads (~30%) and Archived (~10%) for each user.
            $allUsers = array_merge($userIds, $expertIds);
            $eventCount = count($eventIds);
            $readShare = (int)round($eventCount * 0.3);
            $archiveShare = (int)round($eventCount * 0.1);

            foreach ($allUsers as $aid) {
                $shuffled = $eventIds;
                shuffle($shuffled);
                $reads = array_slice($shuffled, 0, $readShare);
                foreach ($reads as $evId) {
                    try {
                        NewsReads::get()->insert([
                            'account_id' => $aid,
                            'event_id' => $evId,
                            'read_at' => $now - random_int(0, 14 * 86400),
                        ]);
                    } catch (Throwable) {
                        // unique constraint — skip
                    }
                }
                $archives = array_slice($shuffled, $readShare, $archiveShare);
                foreach ($archives as $evId) {
                    try {
                        NewsArchived::get()->insert([
                            'account_id' => $aid,
                            'event_id' => $evId,
                            'archived_at' => $now - random_int(0, 14 * 86400),
                        ]);
                    } catch (Throwable) {
                        // unique constraint — skip
                    }
                }
            }
        }
    }
}
