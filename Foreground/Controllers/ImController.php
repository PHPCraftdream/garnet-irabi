<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Foreground\Controllers {
    use Aura\SqlQuery\Common\SelectInterface;
    use PHPCraftdream\Garnet\Bundle\Modules\Messaging\Controllers\FwImController;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\Account;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\DbAccount;
    use PHPCraftdream\Garnet\Kernel\Interfaces\IGlobalReqParams;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Router\IRouterUriParams;
    use PHPCraftdream\IRabi\Common\Services\AccountDisplay;
    use PHPCraftdream\IRabi\Common\Services\EmailNotifications;
    use PHPCraftdream\IRabi\Common\Services\NewsService;
    use PHPCraftdream\IRabi\Common\Tables\Bookings;
    use PHPCraftdream\IRabi\Common\Tables\ExpertProfiles;
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
         * Enrich conversation with IRabi-specific fields.
         * Adds partner_has_expert_profile flag.
         */
        protected static function enrichConversation(array &$conv, int $accountId): void {
            $partnerId = (int)$conv['partner_id'];
            $expertRow = ExpertProfiles::get()->selectOneByField('account_id', $partnerId);
            $conv['partner_has_expert_profile'] = !empty($expertRow);

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
         * Override send to add news event with 1-hour throttle.
         */
        public static function post__send(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
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
            // Determine if current user is an expert
            $expertProfile = ExpertProfiles::get()->selectOneByField('account_id', $accountId);
            $isCurrentUserExpert = !empty($expertProfile);

            // Fetch all accounts (excluding self) with moderator/owner flags
            $accs = Account::getAccounts(
                selectCallback: static function (SelectInterface $select) use ($accountId): void {
                    $select->resetCols();
                    $select->cols(['id', 'name']);
                    $select->where('id != ?', [$accountId]);
                },
                accountDataFields: [Account::IS_MODERATOR, Account::IS_OWNER],
            );

            // Build a lookup of all expert account IDs
            $allExperts = ExpertProfiles::get()->selectAll(function (SelectInterface $q): void {
                $q->resetCols();
                $q->cols(['account_id']);
            });
            $expertIds = array_map('intval', array_column($allExperts, 'account_id'));

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

                if ($isConversationPartner) {
                    // Always include existing conversation partners
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
