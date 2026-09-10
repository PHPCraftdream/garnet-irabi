<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Services {
    use Aura\SqlQuery\Common\SelectInterface;
    use Closure;
    use PHPCraftdream\Garnet\Bundle\Modules\News\FwNewsService;
    use PHPCraftdream\Garnet\Bundle\Modules\News\Tables\FwNewsArchived;
    use PHPCraftdream\Garnet\Bundle\Modules\News\Tables\FwNewsEvents;
    use PHPCraftdream\Garnet\Bundle\Modules\News\Tables\FwNewsReads;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\DbAccount;
    use PHPCraftdream\IRabi\Common\Tables\NewsArchived;
    use PHPCraftdream\IRabi\Common\Tables\NewsEvents;
    use PHPCraftdream\IRabi\Common\Tables\NewsReads;
    use PHPCraftdream\IRabi\Foreground\Params\UserEntityConfig;

    class NewsService extends FwNewsService {
        // IRabi-specific event types
        public const TYPE_NEW_SLOT = 'new_slot';
        public const TYPE_SLOT_BOOKED = 'slot_booked';
        public const TYPE_BOOKING_CONFIRMED = 'booking_confirmed';
        public const TYPE_BOOKING_REJECTED = 'booking_rejected';
        public const TYPE_BOOKING_CANCELLED = 'booking_cancelled';
        public const TYPE_SLOT_CANCELLED = 'slot_cancelled';
        public const TYPE_SUPPORT_REPLY = 'support_reply';
        public const TYPE_NEW_MESSAGE = 'new_message';
        public const TYPE_COMMENT_APPROVED = 'comment_approved';

        protected static function eventsTable(): FwNewsEvents {
            return NewsEvents::get();
        }

        protected static function readsTable(): FwNewsReads {
            return NewsReads::get();
        }

        protected static function archivedTable(): FwNewsArchived {
            return NewsArchived::get();
        }

        /**
         * Фильтр ленты: бродкасты (исключая свои) + личные события.
         */
        protected static function feedWhereCallback(int $accountId, bool $includeArchived): Closure {
            $archivedTable = static::archivedTable()->getTableName();
            $ttlCutoff = time() - static::FEED_TTL_SEC;
            $hideNewSlot = UserEntityConfig::isExpert();

            return function (SelectInterface $q) use ($accountId, $includeArchived, $archivedTable, $ttlCutoff, $hideNewSlot): void {
                $q->where(
                    "((audience_type = 'broadcast' AND actor_id != :feed_account)"
                    . " OR (audience_type = 'personal' AND audience_id = :feed_account))",
                    [':feed_account' => $accountId]
                );

                $q->where('created_at > :feed_ttl', [':feed_ttl' => $ttlCutoff]);

                // Эксперты не должны видеть бродкаст «новый слот» от других экспертов — это анонсы конкурентов.
                if ($hideNewSlot) {
                    $q->where('event_type != ?', [self::TYPE_NEW_SLOT]);
                }

                if (!$includeArchived) {
                    $q->where(
                        "id NOT IN (SELECT event_id FROM {$archivedTable} WHERE account_id = :feed_archive_account)",
                        [':feed_archive_account' => $accountId]
                    );
                }
            };
        }

        /**
         * Событие нового сообщения с троттлингом (1 час).
         */
        public static function createMessageEvent(int $senderId, int $recipientId, array $payload): ?int {
            return static::createThrottledEvent(self::TYPE_NEW_MESSAGE, $senderId, $recipientId, $payload);
        }

        /**
         * D-161: открыв переписку, человек прочитал и сообщение, и — по любому
         * разумному ожиданию — новость о нём. Счётчик непрочитанного в чате
         * (`ImReadStatus`) и в «Новости» (`NewsReads`) — два независимых
         * журнала без общего ключа: `createMessageEvent` не передаёт
         * `target_key`, поэтому обычный `deleteByTargetKey` тут не подходит.
         * Вместо этого — прямая связь по паре (кто мне писал, кто я):
         * `event_type='new_message'` этого отправителя мне же и есть та самая
         * новость, что должна погаснуть вместе с чатом (нашла user-6).
         */
        public static function markMessagesRead(int $accountId, int $senderId): void {
            $eventIds = array_map(
                static fn (array $e): int => (int)$e['id'],
                static::eventsTable()->selectAll(function (SelectInterface $q) use ($accountId, $senderId): void {
                    $q->resetCols();
                    $q->cols(['id']);
                    $q->where('event_type = ?', [self::TYPE_NEW_MESSAGE])
                        ->where('audience_type = ?', [self::AUDIENCE_PERSONAL])
                        ->where('audience_id = ?', [$accountId])
                        ->where('actor_id = ?', [$senderId]);
                }),
            );

            static::markRead($accountId, $eventIds);
        }

        /**
         * Re-resolve the actor's CURRENT display name for every feed item, overriding
         * any stale or "#id" name captured in the payload at creation time. In every
         * IRabi news type the displayed person is the event actor, so resolving by
         * actor_id corrects both old and new events from a single source of truth.
         */
        protected static function decorateFeedItems(array $items): array {
            if (empty($items)) {
                return $items;
            }

            $actorIds = [];
            foreach ($items as $it) {
                $aid = (int)($it['actor_id'] ?? 0);
                if ($aid > 0) {
                    $actorIds[$aid] = true;
                }
            }

            $names = static::resolveDisplayNames(array_keys($actorIds));

            foreach ($items as &$it) {
                $aid = (int)($it['actor_id'] ?? 0);
                if ($aid > 0 && isset($names[$aid])) {
                    if (!isset($it['payload']) || !is_array($it['payload'])) {
                        $it['payload'] = [];
                    }
                    $it['payload']['name'] = $names[$aid];
                }
            }
            unset($it);

            return $items;
        }

        /**
         * Resolve the best current display name for each account id:
         * accounts.name -> "#id". Never falls back to login so e-mail addresses
         * are not leaked into feeds/conversations.
         *
         * @param int[] $accountIds
         * @return array<int, string> id => display name
         */
        public static function resolveDisplayNames(array $accountIds): array {
            $ids = array_values(array_unique(array_filter(array_map('intval', $accountIds))));
            if (empty($ids)) {
                return [];
            }

            $out = [];
            $accounts = DbAccount::get()->selectByIds($ids, function (SelectInterface $q): void {
                $q->resetCols();
                $q->cols(['id', 'name']);
            });
            foreach ($accounts as $a) {
                $id = (int)$a['id'];
                $name = trim((string)($a['name'] ?? ''));
                $out[$id] = $name !== '' ? $name : ('#' . $id);
            }

            // Any id with no account row at all (deleted) still gets a stable label.
            foreach ($ids as $id) {
                if (!isset($out[$id])) {
                    $out[$id] = '#' . $id;
                }
            }

            // Blocked accounts are anonymised in every user-facing view.
            foreach (AccountDisplay::disabledIds($ids) as $id => $_) {
                $out[$id] = AccountDisplay::disabledName($id);
            }

            return $out;
        }

        /**
         * Build a stable target key for slot-related events. All slot/booking lifecycle
         * events share the same `slot:{id}` key, so a single deleteByTargetKey purges
         * `new_slot`, `slot_booked`, `booking_*` and `slot_cancelled` for that slot.
         */
        public static function slotKey(int $slotId): string {
            return 'slot:' . $slotId;
        }

        /**
         * Вернуть событие из архива.
         *
         * Родительская реализация передаёт в `deleteBy` замыкание с параметром,
         * объявленным как `SelectInterface`, а `DbTable::deleteBy` отдаёт туда
         * построитель DELETE — TypeError и 500 на каждом вызове. Кнопка «Из
         * архива» не работала ни разу с момента появления (нашла user-8);
         * пользователь при этом видел «В архив» как безвозвратное удаление.
         *
         * Пишем запрос напрямую — тем же приёмом, что `deleteByTargetKey` в
         * родителе, и одним запросом на все идентификаторы вместо цикла.
         */
        public static function unarchive(int $accountId, array $eventIds): void {
            $ids = array_values(array_filter(
                array_map('intval', $eventIds),
                static fn (int $id): bool => $id > 0,
            ));

            if ($ids === []) {
                return;
            }

            $table = static::archivedTable();
            $placeholders = implode(',', array_fill(0, count($ids), '?'));

            $table->getQueryEx()->ex(
                'DELETE FROM ' . $table->getTableName() . " WHERE account_id = ? AND event_id IN ({$placeholders})",
                array_merge([$accountId], $ids),
            );
        }
    }
}
