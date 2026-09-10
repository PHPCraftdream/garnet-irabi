<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Foreground\Controllers {
    use Aura\SqlQuery\Common\SelectInterface;
    use PHPCraftdream\Garnet\Bundle\Modules\Messaging\Controllers\FwImController;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\Account;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\DbAccount;
    use PHPCraftdream\Garnet\Kernel\Interfaces\IGlobalReqParams;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Router\IRouterUriParams;
    use PHPCraftdream\Garnet\Kernel\Io\Router\ControllerTools;
    use PHPCraftdream\IRabi\Common\Services\AccountDisplay;
    use PHPCraftdream\IRabi\Common\Services\EmailNotifications;
    use PHPCraftdream\IRabi\Common\Services\NewsService;
    use PHPCraftdream\IRabi\Common\Tables\Bookings;
    use PHPCraftdream\IRabi\Common\Tables\ImAttachments;
    use PHPCraftdream\IRabi\Common\Tables\ImConversations;
    use PHPCraftdream\IRabi\Common\Tables\ImMessages;
    use PHPCraftdream\IRabi\Common\Tables\ImReadStatus;
    use PHPCraftdream\IRabi\Common\Tables\TimeSlots;
    use PHPCraftdream\IRabi\Foreground\Params\Menu;
    use PHPCraftdream\IRabi\Foreground\Params\UserEntityConfig;
    use PHPCraftdream\IRabi\IRabi;

    class ImController extends FwImController {
        public const URL = '/im/';

        // -- Table factories (IRabi-specific table names) -------------------------

        protected static function conversationsTable(): string {
            return ImConversations::class;
        }

        protected static function messagesTable(): string {
            return ImMessages::class;
        }

        protected static function attachmentsTable(): string {
            return ImAttachments::class;
        }

        protected static function readStatusTable(): string {
            return ImReadStatus::class;
        }

        // -- Abstract implementations ---------------------------------------------

        protected static function getUploadDir(): string {
            return IRabi::getInstance()->uploadDir;
        }

        protected static function getSideMenu(string $url): array {
            return Menu::side($url);
        }

        protected static function getMainMenu(string $url): array {
            return Menu::main($url);
        }

        protected static function isModeratorCheck(): bool {
            return UserEntityConfig::isModerator();
        }

        public static function get__main(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            return parent::get__main($globals, $params);
        }

        /**
         * D-161: opening a conversation marks it read in the messaging
         * module (parent::post__messages already calls ImReadStatus::markRead)
         * but never touched the "new message" news item the same message
         * spawned — the feed kept insisting an already-read conversation was
         * still unread. Clear it here, same request, for the actual partner
         * of this conversation.
         */
        public static function post__messages(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            $result = parent::post__messages($globals, $params);

            if ($result->getStatusCode() !== 200) {
                return $result;
            }

            $account = Account::fromSession();
            if ($account) {
                $conversationId = (int)$globals->readPostValue('conversation_id', '0');
                if ($conversationId > 0) {
                    $conv = ImConversations::get()->selectOneByField('id', $conversationId);
                    if ($conv) {
                        $senderId = ImConversations::getPartnerId($conv, $account->id());
                        NewsService::markMessagesRead($account->id(), $senderId);
                    }
                }
            }

            return $result;
        }

        /**
         * Enrich conversation with IRabi-specific fields.
         * Adds partner_has_expert_profile flag.
         */
        protected static function enrichConversation(array &$conv, int $accountId): void {
            $partnerId = (int)$conv['partner_id'];
            // «Собеседник — преподаватель» решает аккаунт. Раньше признаком
            // была строка в `expert_profiles`, которая появлялась у любого, кто
            // хоть раз завёл слот, и жила дальше своей жизнью.
            $conv['partner_has_expert_profile'] = UserEntityConfig::isApprovedExpertAccount($partnerId);

            // Resolve the partner's current display name (expert display_name ->
            // accounts.name -> "#id") so dialogs never show an empty/"#id" name.
            $names = NewsService::resolveDisplayNames([$partnerId]);
            $conv['partner_name'] = $names[$partnerId] ?? ('#' . $partnerId);

            $partnerRow = DbAccount::get()->selectOneByField('id', $partnerId);
            $conv['partner_avatar'] = $partnerRow ? UserEntityConfig::avatarUrl([
                'photo' => $partnerRow['photo'] ?? null,
                'photo_cropped' => $partnerRow['photo_cropped'] ?? null,
                'token16' => $partnerRow['token16'] ?? null,
            ]) : null;

            $conv['partner_is_disabled'] = AccountDisplay::isDisabled($partnerId);
            if ($conv['partner_is_disabled']) {
                $conv['partner_avatar'] = null;
            }
        }

        /**
         * Moderators, owners and admins are unrestricted in this module.
         *
         * Lives in one place because both halves of the rule need it: the
         * permission check AND the recipient list. They used to answer
         * differently — canMessage() let a moderator write to a student the
         * search would not offer him.
         */
        protected static function isStaffAccount(int $accountId): bool {
            $rows = Account::getAccounts(
                selectCallback: static function (SelectInterface $select) use ($accountId): void {
                    $select->resetCols();
                    $select->cols(['id']);
                    $select->where('id = ?', [$accountId]);
                },
                accountDataFields: [Account::IS_MODERATOR, Account::IS_OWNER, Account::IS_ADMIN],
            );
            $row = $rows[0] ?? null;

            if (!$row) {
                return false;
            }

            return intval($row[Account::IS_MODERATOR] ?? 0) > 0
                || intval($row[Account::IS_OWNER] ?? 0) > 0
                || intval($row[Account::IS_ADMIN] ?? 0) > 0;
        }

        /**
         * Check whether $senderId is allowed to message $recipientId.
         *
         * Rules (mirrors searchRecipients):
         *  - moderators / owners / admins may message anyone;
         *  - experts may message their students (via bookings), moderators, owners;
         *  - regular users may message experts only;
         *  - existing conversation partners are always allowed (so ongoing
         *    conversations are never broken by subsequent business-rule changes).
         */
        protected static function canMessage(int $senderId, int $recipientId): bool {
            if (static::isStaffAccount($senderId)) {
                return true;
            }

            // Existing conversation — always allowed
            $convs = ImConversations::get()->selectAll(function (SelectInterface $q) use ($senderId, $recipientId): void {
                $q->where(
                    '(participant_a = ? AND participant_b = ?) OR (participant_a = ? AND participant_b = ?)',
                    [$senderId, $recipientId, $recipientId, $senderId],
                );
            });
            if (!empty($convs)) {
                return true;
            }

            // Преподаватель ли отправитель. Аудит M-02: признаком когда-то
            // была строка в отдельной таблице профилей, которая не знала ни о
            // разжаловании, ни об отключении. Условие — то же, что проверяет
            // бронирование.
            $senderIsActiveExpert = UserEntityConfig::isApprovedActiveExpert($senderId);

            if ($senderIsActiveExpert) {
                // Expert may message: their students (via bookings), moderators, owners
                $recipientAccount = Account::getAccounts(
                    selectCallback: static function (SelectInterface $select) use ($recipientId): void {
                        $select->resetCols();
                        $select->cols(['id']);
                        $select->where('id = ?', [$recipientId]);
                    },
                    accountDataFields: [Account::IS_MODERATOR, Account::IS_OWNER, Account::IS_ADMIN],
                );
                $recipRow = $recipientAccount[0] ?? null;
                if ($recipRow) {
                    $rMod = intval($recipRow[Account::IS_MODERATOR] ?? 0) > 0;
                    $rOwner = intval($recipRow[Account::IS_OWNER] ?? 0) > 0;
                    $rAdmin = intval($recipRow[Account::IS_ADMIN] ?? 0) > 0;
                    if ($rMod || $rOwner || $rAdmin) {
                        return true;
                    }
                }

                // Check if recipient is one of the expert's students
                $slots = TimeSlots::get()->selectAll(function (SelectInterface $q) use ($senderId): void {
                    $q->resetCols();
                    $q->cols(['id']);
                    $q->where('expert_id = ?', [$senderId]);
                });
                $slotIds = array_map(fn ($s) => (int)$s['id'], $slots);

                if (!empty($slotIds)) {
                    $bookings = Bookings::get()->selectAll(function (SelectInterface $q) use ($slotIds, $recipientId): void {
                        $q->resetCols();
                        $q->cols(['user_id']);
                        $q->where("bookable_type = 'time_slot'");
                        $q->where('bookable_id IN (?)', [$slotIds]);
                        $q->where('user_id = ?', [$recipientId]);
                    });
                    if (!empty($bookings)) {
                        return true;
                    }
                }

                return false;
            }

            // Обычный человек пишет только действующим преподавателям.
            // Аудит M-02: проверяем аккаунт, а не наличие строки профиля —
            // она не знала ни о разжаловании, ни об отключении.
            return UserEntityConfig::isApprovedActiveExpert($recipientId);
        }

        /**
         * Override send to enforce recipient allow-list and add news event.
         */
        public static function post__send(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            // Enforce recipient authorization before delegating to framework
            $account = Account::fromSession();
            if ($account) {
                $recipientId = (int)$globals->readPostValue('recipient_id', '0');
                if ($recipientId > 0 && !static::canMessage((int)$account->id(), $recipientId)) {
                    return ControllerTools::JSON(['error' => 'You are not allowed to message this user'], status: 403);
                }
            }

            $result = parent::post__send($globals, $params);

            if ($result->getStatusCode() !== 200) {
                return $result;
            }

            // After successful send, create throttled news event
            $account = Account::fromSession();
            if ($account) {
                $recipientId = (int)$globals->readPostValue('recipient_id', '0');
                if ($recipientId > 0) {
                    $senderName = $account->readParam('name') ?: ('#' . $account->id());
                    NewsService::createMessageEvent($account->id(), $recipientId, [
                        'sender_id' => $account->id(),
                        'name' => $senderName,
                    ]);
                    $messageText = trim((string)$globals->readPostValue('message', ''));
                    EmailNotifications::newMessage($recipientId, $account->id(), mb_substr($messageText, 0, 100));
                }
            }

            return $result;
        }

        /**
         * Search for users to message. Role-aware:
         * - Experts see their users (via bookings) + moderators + owners
         * - Users see experts + moderators + owners (default)
         * - Always includes existing conversation partners
         */
        protected static function searchRecipients(int $accountId, string $query): array {
            // Преподаватель ли тот, кто ищет. Аудит M-02: условие то же, что
            // проверяет бронирование, — по аккаунту, а не по наличию строки
            // профиля, которая не знала о разжаловании и отключении.
            $isCurrentUserExpert = UserEntityConfig::isApprovedActiveExpert($accountId);

            // Staff may message anyone — canMessage() has always said so, and
            // this list did not. A moderator was told "no recipients found"
            // for a user he was in fact allowed to write to: two halves of one
            // rule, disagreeing.
            $isCurrentUserStaff = static::isStaffAccount($accountId);

            // Fetch all accounts (excluding self) with moderator/owner flags
            $accs = Account::getAccounts(
                selectCallback: static function (SelectInterface $select) use ($accountId): void {
                    $select->resetCols();
                    $select->cols(['id', 'name']);
                    $select->where('id != ?', [$accountId]);
                },
                accountDataFields: [Account::IS_MODERATOR, Account::IS_OWNER],
            );

            // Все одобренные и не отключённые преподаватели — одним запросом.
            //
            // Раньше здесь сначала собирали кандидатов из `expert_profiles`, а
            // потом отсеивали их по аккаунту, потому что строка профиля не
            // отражала ни разжалование, ни отключение (аудит M-02). Теперь
            // спрашиваем сразу того, кто знает ответ, и лишний проход исчез
            // вместе с таблицей. Батч, а не вызов на каждого: поимённая
            // проверка стоила двух запросов на кандидата (F-03).
            $expertIds = [];
            $expertAccounts = Account::getAccounts(
                selectCallback: static function (SelectInterface $select): void {
                    $select->resetCols();
                    $select->cols(['id', 'type']);
                    $select->where('type = ?', ['expert']);
                },
                accountDataFields: [Account::IS_APPROVED, Account::IS_DISABLED],
            );

            foreach ($expertAccounts as $a) {
                $isApprovedActive = intval($a[Account::IS_APPROVED] ?? 0) > 0
                    && intval($a[Account::IS_DISABLED] ?? 0) < 1;

                if ($isApprovedActive) {
                    $expertIds[] = (int)$a['id'];
                }
            }

            // For experts: find their users via bookings on their time_slots
            $userIds = [];
            if ($isCurrentUserExpert) {
                $slots = TimeSlots::get()->selectAll(function (SelectInterface $q) use ($accountId): void {
                    $q->resetCols();
                    $q->cols(['id']);
                    $q->where('expert_id = ?', [$accountId]);
                });
                $slotIds = array_map(fn ($s) => (int)$s['id'], $slots);

                if (!empty($slotIds)) {
                    $bookings = Bookings::get()->selectAll(function (SelectInterface $q) use ($slotIds): void {
                        $q->resetCols();
                        $q->cols(['user_id']);
                        $q->where("bookable_type = 'time_slot'");
                        $q->where('bookable_id IN (?)', [$slotIds]);
                    });
                    $userIds = array_unique(array_map(fn ($b) => (int)$b['user_id'], $bookings));
                }
            }

            // Also include existing conversation partners
            $conversationPartnerIds = [];
            $convs = ImConversations::get()->selectAll(function (SelectInterface $q) use ($accountId): void {
                $q->where('participant_a = ? OR participant_b = ?', [$accountId, $accountId]);
            });
            foreach ($convs as $conv) {
                $conversationPartnerIds[] = ImConversations::getPartnerId($conv, $accountId);
            }
            $conversationPartnerIds = array_unique($conversationPartnerIds);

            // Filter accounts based on role
            $results = [];
            foreach ($accs as $a) {
                $id = (int)$a['id'];
                $isExpert = in_array($id, $expertIds, true);
                $isModerator = intval($a[Account::IS_MODERATOR] ?? 0) > 0;
                $isOwner = intval($a[Account::IS_OWNER] ?? 0) > 0;
                $isUser = in_array($id, $userIds, true);
                $isConversationPartner = in_array($id, $conversationPartnerIds, true);

                if ($isConversationPartner || $isCurrentUserStaff) {
                    // Existing partners are always included; staff see everyone,
                    // matching what canMessage() permits.
                } elseif ($isCurrentUserExpert) {
                    // Experts see: their users + moderators + owners
                    if (!$isUser && !$isModerator && !$isOwner) {
                        continue;
                    }
                } else {
                    // Users see: only experts
                    if (!$isExpert) {
                        continue;
                    }
                }

                // Apply search filter if provided
                if ($query !== '') {
                    $lower = mb_strtolower($query);
                    $matchName = mb_strtolower($a['name'] ?? '');
                    if (mb_strpos($matchName, $lower) === false) {
                        continue;
                    }
                }

                $role = $isOwner ? 'owner' : ($isModerator ? 'moderator' : ($isExpert ? 'expert' : 'user'));
                $results[] = [
                    'id' => $id,
                    'name' => $a['name'] ?? '',
                    'role' => $role,
                ];
            }

            $disabled = AccountDisplay::disabledIds(array_column($results, 'id'));
            foreach ($results as &$row) {
                if (isset($disabled[$row['id']])) {
                    $row['name'] = AccountDisplay::disabledName($row['id']);
                }
            }
            unset($row);

            return $results;
        }
    }
}
