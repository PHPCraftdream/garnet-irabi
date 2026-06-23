<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Dashboard\Controllers {
    use Aura\SqlQuery\Common\SelectInterface;
    use PHPCraftdream\Garnet\Bundle\FrameworkAssetsGen;
    use PHPCraftdream\Garnet\Bundle\FrameworkJsGen;
    use PHPCraftdream\Garnet\Bundle\Modules\EntityHistory\EntityHistoryService;
    use PHPCraftdream\Garnet\Bundle\Utils\HtmlLayout;
    use PHPCraftdream\Garnet\Bundle\Utils\RenderIsland;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\Account;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\DbAccount;
    use PHPCraftdream\Garnet\Kernel\Interfaces\IGlobalReqParams;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Router\IRouterUriParams;
    use PHPCraftdream\Garnet\Kernel\Io\Router\ControllerTools;
    use PHPCraftdream\Garnet\Kernel\Io\Twig\TwigParams;
    use PHPCraftdream\IRabi\Common\PaginationHelper;
    use PHPCraftdream\IRabi\Common\Services\EmailNotifications;
    use PHPCraftdream\IRabi\Common\Services\NewsService;
    use PHPCraftdream\IRabi\Common\Tables\AccountBalance;
    use PHPCraftdream\IRabi\Common\Tables\AdminActionLog;
    use PHPCraftdream\IRabi\Common\Tables\BalanceLedger;
    use PHPCraftdream\IRabi\Common\Tables\Bookings;
    use PHPCraftdream\IRabi\Common\Tables\EntityHistory;
    use PHPCraftdream\IRabi\Common\Tables\ExpertCancellations;
    use PHPCraftdream\IRabi\Common\Tables\ExpertProfiles;
    use PHPCraftdream\IRabi\Common\Tables\SupportTickets;
    use PHPCraftdream\IRabi\Common\Tables\TimeSlots;
    use PHPCraftdream\IRabi\Common\Tables\UserCancellations;
    use PHPCraftdream\IRabi\Dashboard\GridConfig;
    use PHPCraftdream\IRabi\Foreground\I18n\ForegroundI18n;
    use PHPCraftdream\IRabi\Foreground\Params\UserEntityConfig;
    use PHPCraftdream\IRabi\IRabi;

    class DashboardUsersController extends DashboardController {
        public const URL = '/admin/';

        private static function fetchUsers(): array {
            $config = UserEntityConfig::getEntityConfig();

            $accounts = Account::getAccounts(
                selectCallback: static function (SelectInterface $select) use ($config): void {
                    $select->resetCols();
                    $select->cols($config->selectFields());
                    $select->orderBy(['id desc']);
                },
                accountDataFields: $config->dataFields(),
            );

            foreach ($accounts as &$account) {
                $config->patchItem($account);
            }

            return $accounts;
        }

        public static function post__setUserFlag(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            if (!static::isModerator()) {
                return ControllerTools::JSON(['error' => 'Access denied'], status: 403);
            }

            $userId = (int)$globals->readPostValue('user_id', '0');
            $flag = $globals->readPostValue('flag', '');
            $value = (int)$globals->readPostValue('value', '0');

            // Determine which flags the caller may set based on their role
            $callerIsAdmin = UserEntityConfig::isAdmin();
            $callerIsOwner = UserEntityConfig::isOwner(); // true for admin too

            $allowed = [Account::IS_APPROVED, Account::IS_DISABLED];
            if ($callerIsOwner) {
                $allowed[] = Account::IS_OWNER;
                $allowed[] = Account::IS_MODERATOR;
            }
            if ($callerIsAdmin) {
                $allowed[] = Account::IS_ADMIN;
            }

            if (!$userId || !in_array($flag, $allowed, true)) {
                return ControllerTools::JSON(['error' => 'Invalid params'], status: 400);
            }

            $account = Account::get((string)$userId);
            $account->readDbAsync();
            $account->readDataAsyncPollFinishAll();

            $oldValue = ($account->getData()[$flag] ?? null) ? '1' : '0';
            $newValue = $value ? '1' : '0';

            if ($value) {
                $account->setData($flag, 1);
            } else {
                $account->unsetData($flag);
            }
            $account->flush();
            $account->readDataAsyncPollFinishAll();

            // When approving/revoking an expert, cascade to their expert profile
            // and notify the expert by email (only on actual transitions of accounts of type=expert).
            if ($flag === Account::IS_APPROVED) {
                ExpertProfiles::get()->updateByField(
                    ['is_approved' => $value ? 1 : 0],
                    'account_id', $userId,
                );

                if ($oldValue !== $newValue) {
                    $accountRow = DbAccount::get()->selectById($userId);
                    if ($accountRow && (string)($accountRow['type'] ?? '') === 'expert') {
                        if ($value) {
                            EmailNotifications::expertApproved($userId);
                            static::announceFutureSlots($userId);
                        } else {
                            EmailNotifications::expertRejected($userId);
                        }
                    }
                }
            }

            $actor = Account::fromSession();
            AdminActionLog::get()->writeLog(
                actorId:     (int)$actor->readParam('id'),
                actorLogin:  (string)$actor->readParam('login'),
                targetId:    $userId,
                targetLogin: (string)$account->readParam('login'),
                action:      $flag,
                oldValue:    $oldValue,
                newValue:    $newValue,
            );

            if ($oldValue !== $newValue) {
                EntityHistoryService::record(
                    tableClass: EntityHistory::class,
                    entityType: 'account',
                    entityId:   $userId,
                    action:     'flag_change',
                    diff:       [$flag => ['old' => $oldValue, 'new' => $newValue]],
                );
            }

            return ControllerTools::JSON(['success' => true]);
        }

        /**
         * Promote / demote between 'user' and 'expert' account types. The default
         * registration flow only sets type via invite-token; this endpoint lets a
         * moderator+ flip it after the fact (e.g. a teacher who registered through
         * the regular link and needs to be turned into an expert).
         *
         * expert_profiles row is created lazily — when the expert first opens any
         * expert-only flow — so we don't pre-create it here. Demotion keeps the
         * existing row in place (re-used on a later re-promotion); the user just
         * stops appearing in public expert listings because every expert query
         * filters on `accounts.type = 'expert'`.
         */
        public static function post__setUserType(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            if (!static::isModerator()) {
                return ControllerTools::JSON(['error' => 'Access denied'], status: 403);
            }

            $userId = (int)$globals->readPostValue('user_id', '0');
            $newType = (string)$globals->readPostValue('type', '');

            if (!$userId || !in_array($newType, ['user', 'expert'], true)) {
                return ControllerTools::JSON(['error' => 'Invalid params'], status: 400);
            }

            $account = Account::get((string)$userId);
            if (!$account->id()) {
                return ControllerTools::JSON(['error' => 'User not found'], status: 404);
            }

            $oldType = (string)($account->readParam('type') ?? '');
            if ($oldType === $newType) {
                return ControllerTools::JSON(['success' => true, 'noop' => true]);
            }

            $account->setParam('type', $newType);
            $account->flush();
            $account->readDataAsyncPollFinishAll();

            $actor = Account::fromSession();
            AdminActionLog::get()->writeLog(
                actorId:     (int)$actor->readParam('id'),
                actorLogin:  (string)$actor->readParam('login'),
                targetId:    $userId,
                targetLogin: (string)$account->readParam('login'),
                action:      'set_type',
                oldValue:    $oldType,
                newValue:    $newType,
            );

            EntityHistoryService::record(
                tableClass: EntityHistory::class,
                entityType: 'account',
                entityId:   $userId,
                action:     'type_change',
                diff:       ['type' => ['old' => $oldType, 'new' => $newType]],
            );

            return ControllerTools::JSON(['success' => true]);
        }

        /**
         * Remove a user's profile photo. The file is NOT deleted from disk — it
         * is moved out of the public upload folder into a private app folder
         * (kept for audit), and the DB photo fields are cleared. The action is
         * recorded in the admin action log and the account's entity history.
         */
        public static function post__removeUserPhoto(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            if (!static::isModerator()) {
                return ControllerTools::JSON(['error' => 'Access denied'], status: 403);
            }

            $userId = (int)$globals->readPostValue('user_id', '0');
            if (!$userId) {
                return ControllerTools::JSON(['error' => 'Invalid params'], status: 400);
            }

            $account = Account::get((string)$userId);
            $account->readDbAsync();
            $account->readDataAsyncPollFinishAll();

            $photo = (string)$account->readParam('photo');
            $photoCropped = (string)$account->readParam('photo_cropped');
            $token16 = (string)$account->readParam('token16');

            if ($photo === '' && $photoCropped === '') {
                return ControllerTools::JSON(['error' => 'No photo'], status: 400);
            }

            // Move the files out of the web-accessible folder into a private app
            // folder. They stay on disk (audit), just no longer publicly served.
            $app = IRabi::getInstance();
            $ds = DIRECTORY_SEPARATOR;
            $publicBase = $app->publicUploadDir . 'f' . $ds . $token16 . $ds;
            $privateBase = $app->uploadDir . 'removed-avatars' . $ds . $token16 . $ds;

            if ($token16 !== '' && !is_dir($privateBase)) {
                mkdir($privateBase, 0o775, true);
            }

            $movedFiles = [];
            foreach (array_unique(array_filter([$photo, $photoCropped])) as $file) {
                $src = $publicBase . $file;
                $dst = $privateBase . $file;
                if (is_file($src)) {
                    @rename($src, $dst);
                    $movedFiles[] = $file;
                }
            }

            // Clear the DB fields.
            $account->setParams(['photo' => null, 'photo_cropped' => null, 'crop_info' => null]);
            $account->flush();
            $account->readDataAsyncPollFinishAll();

            $oldValue = $photoCropped !== '' ? $photoCropped : $photo;

            $actor = Account::fromSession();
            AdminActionLog::get()->writeLog(
                actorId:     (int)$actor->readParam('id'),
                actorLogin:  (string)$actor->readParam('login'),
                targetId:    $userId,
                targetLogin: (string)$account->readParam('login'),
                action:      'remove_photo',
                oldValue:    $oldValue,
                newValue:    '',
            );

            EntityHistoryService::record(
                tableClass: EntityHistory::class,
                entityType: 'account',
                entityId:   $userId,
                action:     'remove_photo',
                diff:       ['photo' => ['old' => $oldValue, 'new' => '']],
            );

            return ControllerTools::JSON(['success' => true, 'moved' => $movedFiles]);
        }

        public static function post__userDetail(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            if (!static::isModerator()) {
                return ControllerTools::JSON(['error' => 'Access denied'], status: 403);
            }

            $accountId = (int)$globals->readPostValue('account_id', '0');
            if (!$accountId) {
                return ControllerTools::JSON(['error' => 'Invalid params'], status: 400);
            }

            $config = UserEntityConfig::getEntityConfig();
            $accounts = Account::getAccounts(
                selectCallback: static function (SelectInterface $select) use ($accountId, $config): void {
                    $select->resetCols();
                    $select->cols($config->selectFields());
                    $select->where('id = ?', [$accountId]);
                },
                accountDataFields: $config->dataFields(),
            );

            if (empty($accounts)) {
                return ControllerTools::JSON(['error' => 'User not found'], status: 404);
            }

            $account = $accounts[0];
            $config->patchItem($account);
            $account['avatar'] = UserEntityConfig::avatarUrl([
                'photo' => $account['photo'] ?? null,
                'photo_cropped' => $account['photo_cropped'] ?? null,
                'token16' => $account['token16'] ?? null,
            ]);
            // Full (uncropped) photo for the lightbox.
            $account['avatar_full'] = UserEntityConfig::avatarUrl([
                'photo' => $account['photo'] ?? null,
                'token16' => $account['token16'] ?? null,
            ]);

            $isExpert = ($account['type'] ?? '') === 'expert';
            $expertProfile = $isExpert ? ExpertProfiles::get()->selectOneByField('account_id', $accountId) : null;

            $balance = AccountBalance::get()->selectOneByField('account_id', $accountId) ?: null;

            $ledger = BalanceLedger::get()->selectAll(function (SelectInterface $q) use ($accountId): void {
                $q->where('account_id = ?', [$accountId]);
                $q->orderBy(['id DESC']);
                $q->limit(PaginationHelper::DEFAULT_PER_PAGE);
            });

            // Resolve counterparty for booking-related ledger entries
            $ledgerRefBookingIds = array_values(array_unique(array_filter(array_map(
                fn ($e) => ($e['ref_type'] ?? '') === 'booking' ? (int)$e['ref_id'] : null,
                $ledger
            ))));
            $ledgerBookingsMap = [];
            if (!empty($ledgerRefBookingIds)) {
                foreach (Bookings::get()->selectByIds($ledgerRefBookingIds) as $bk) {
                    $ledgerBookingsMap[(int)$bk['id']] = $bk;
                }
            }
            // Collect counterparty account IDs (user or expert)
            $partyIds = [];
            foreach ($ledger as $e) {
                if (($e['ref_type'] ?? '') !== 'booking') {
                    continue;
                }
                $bk = $ledgerBookingsMap[(int)($e['ref_id'] ?? 0)] ?? null;
                if (!$bk) {
                    continue;
                }
                $userId = (int)($bk['user_id'] ?? 0);
                // If this user is the user, counterparty = expert (from slot/run)
                // If this user is the expert, counterparty = user
                if ($userId === $accountId) {
                    // Need expert_id from the bookable — will be resolved below
                } elseif ($userId > 0) {
                    $partyIds[$userId] = true;
                }
            }
            // Also need expert IDs from slot bookables for ledger
            $ledgerSlotIds = [];
            foreach ($ledger as $e) {
                if (($e['ref_type'] ?? '') !== 'booking') {
                    continue;
                }
                $bk = $ledgerBookingsMap[(int)($e['ref_id'] ?? 0)] ?? null;
                if (!$bk) {
                    continue;
                }
                if ((int)($bk['user_id'] ?? 0) !== $accountId) {
                    continue;
                }
                if ($bk['bookable_type'] === 'time_slot') {
                    $ledgerSlotIds[(int)$bk['bookable_id']] = true;
                }
            }
            $ledgerSlotsMap = [];
            if (!empty($ledgerSlotIds)) {
                foreach (TimeSlots::get()->selectByIds(array_keys($ledgerSlotIds), function (SelectInterface $q): void {
                    $q->resetCols();
                    $q->cols(['id', 'expert_id']);
                }) as $s) {
                    $ledgerSlotsMap[(int)$s['id']] = (int)$s['expert_id'];
                }
            }
            // Collect expert IDs as party IDs
            foreach ($ledger as $e) {
                if (($e['ref_type'] ?? '') !== 'booking') {
                    continue;
                }
                $bk = $ledgerBookingsMap[(int)($e['ref_id'] ?? 0)] ?? null;
                if (!$bk || (int)($bk['user_id'] ?? 0) !== $accountId) {
                    continue;
                }
                $tid = 0;
                if ($bk['bookable_type'] === 'time_slot') {
                    $tid = $ledgerSlotsMap[(int)$bk['bookable_id']] ?? 0;
                }
                if ($tid > 0) {
                    $partyIds[$tid] = true;
                }
            }
            // Resolve all party names
            $partyNames = [];
            if (!empty($partyIds)) {
                $pIds = array_keys($partyIds);
                $partyAccounts = DbAccount::get()->selectByIds($pIds, function (SelectInterface $q): void {
                    $q->resetCols();
                    $q->cols(['id', 'login', 'name']);
                });
                foreach ($partyAccounts as $pa) {
                    $partyNames[(int)$pa['id']] = $pa['name'] ?: $pa['login'];
                }
            }
            // Attach counterparty to each ledger entry
            foreach ($ledger as &$e) {
                $e['party_id'] = null;
                $e['party_name'] = null;
                if (($e['ref_type'] ?? '') !== 'booking') {
                    continue;
                }
                $bk = $ledgerBookingsMap[(int)($e['ref_id'] ?? 0)] ?? null;
                if (!$bk) {
                    continue;
                }
                $userId = (int)($bk['user_id'] ?? 0);
                if ($userId === $accountId) {
                    // Counterparty is expert (from slot)
                    $tid = $bk['bookable_type'] === 'time_slot'
                        ? ($ledgerSlotsMap[(int)$bk['bookable_id']] ?? 0)
                        : 0;
                    if ($tid > 0) {
                        $e['party_id'] = $tid;
                        $e['party_name'] = $partyNames[$tid] ?? null;
                    }
                } elseif ($userId > 0) {
                    $e['party_id'] = $userId;
                    $e['party_name'] = $partyNames[$userId] ?? null;
                }
            }
            unset($e);

            // Slots for experts
            $slots = [];
            if ($isExpert) {
                $slots = TimeSlots::get()->selectAll(function (SelectInterface $q) use ($accountId): void {
                    $q->where('expert_id = ?', [$accountId]);
                    $q->orderBy(['start_at DESC']);
                    $q->limit(PaginationHelper::DEFAULT_PER_PAGE);
                });
            }

            // Bookings for ALL users (experts can also be users)
            $bookingRows = Bookings::get()->selectAll(function (SelectInterface $q) use ($accountId): void {
                $q->where('user_id = ?', [$accountId]);
                $q->orderBy(['id DESC']);
                $q->limit(PaginationHelper::DEFAULT_PER_PAGE);
            });

            // Resolve time_slot bookings
            $slotIds = array_values(array_unique(array_filter(array_map(
                fn ($b) => $b['bookable_type'] === 'time_slot' ? (int)$b['bookable_id'] : null,
                $bookingRows
            ))));
            $slotsMap = [];
            if (!empty($slotIds)) {
                foreach (TimeSlots::get()->selectByIds($slotIds) as $s) {
                    $slotsMap[(int)$s['id']] = $s;
                }
            }

            // Collect all expert IDs from slots to resolve names
            $expertIds = [];
            foreach ($slotsMap as $s) {
                $tid = (int)($s['expert_id'] ?? 0);
                if ($tid > 0) {
                    $expertIds[$tid] = true;
                }
            }

            // Resolve expert account names
            $expertNames = [];
            if (!empty($expertIds)) {
                $tIds = array_keys($expertIds);
                $expertAccounts = DbAccount::get()->selectByIds($tIds, function (SelectInterface $q): void {
                    $q->resetCols();
                    $q->cols(['id', 'login', 'name']);
                });
                foreach ($expertAccounts as $ta) {
                    $expertNames[(int)$ta['id']] = $ta['name'] ?: $ta['login'];
                }
            }

            foreach ($bookingRows as &$b) {
                $slot = $b['bookable_type'] === 'time_slot' ? ($slotsMap[(int)$b['bookable_id']] ?? null) : null;
                $b['slot'] = $slot;
                $b['run'] = null;
                $tid = (int)($slot['expert_id'] ?? 0);
                $b['expert_id'] = $tid;
                $b['expert_name'] = $expertNames[$tid] ?? null;
            }
            unset($b);
            $bookings = $bookingRows;

            // Support tickets
            $tickets = SupportTickets::get()->selectAll(function (SelectInterface $q) use ($accountId): void {
                $q->where('account_id = ?', [$accountId]);
                $q->orderBy(['updated_at DESC']);
                $q->limit(PaginationHelper::DEFAULT_PER_PAGE);
            });

            // Cancellation full records
            $expertCancellations = [];
            $userCancellations = [];
            if ($isExpert) {
                $expertCancellations = ExpertCancellations::get()->selectByField('expert_id', $accountId, function (SelectInterface $q): void {
                    $q->orderBy(['created_at DESC']);
                });
            }
            $userCancellations = UserCancellations::get()->selectByField('user_id', $accountId, function (SelectInterface $q): void {
                $q->orderBy(['created_at DESC']);
            });

            // Resolve slot times for cancellations
            $cancelSlotIds = [];
            foreach ($expertCancellations as $tc) {
                $sid = (int)($tc['slot_id'] ?? 0);
                if ($sid > 0) {
                    $cancelSlotIds[$sid] = true;
                }
            }
            foreach ($userCancellations as $sc) {
                $sid = (int)($sc['slot_id'] ?? 0);
                if ($sid > 0) {
                    $cancelSlotIds[$sid] = true;
                }
            }
            $cancelSlotsMap = [];
            if (!empty($cancelSlotIds)) {
                foreach (TimeSlots::get()->selectByIds(array_keys($cancelSlotIds), function (SelectInterface $q): void {
                    $q->resetCols();
                    $q->cols(['id', 'start_at']);
                }) as $s) {
                    $cancelSlotsMap[(int)$s['id']] = (int)$s['start_at'];
                }
            }

            // Resolve counterparty names for cancellations
            $cancelPartyIds = [];
            foreach ($expertCancellations as $tc) {
                $sid = (int)($tc['user_id'] ?? 0);
                if ($sid > 0) {
                    $cancelPartyIds[$sid] = true;
                }
            }
            foreach ($userCancellations as $sc) {
                $tid = (int)($sc['expert_id'] ?? 0);
                if ($tid > 0) {
                    $cancelPartyIds[$tid] = true;
                }
            }
            $cancelPartyNames = [];
            if (!empty($cancelPartyIds)) {
                $cpAccounts = DbAccount::get()->selectByIds(array_keys($cancelPartyIds), function (SelectInterface $q): void {
                    $q->resetCols();
                    $q->cols(['id', 'login', 'name']);
                });
                foreach ($cpAccounts as $cpa) {
                    $cancelPartyNames[(int)$cpa['id']] = $cpa['name'] ?: $cpa['login'];
                }
            }

            // Attach resolved data to expert cancellations
            foreach ($expertCancellations as &$tc) {
                $tc['slot_start_at'] = $cancelSlotsMap[(int)($tc['slot_id'] ?? 0)] ?? null;
                $sid = (int)($tc['user_id'] ?? 0);
                $tc['user_name'] = $cancelPartyNames[$sid] ?? null;
            }
            unset($tc);

            // Attach resolved data to user cancellations
            foreach ($userCancellations as &$sc) {
                $sc['slot_start_at'] = $cancelSlotsMap[(int)($sc['slot_id'] ?? 0)] ?? null;
                $tid = (int)($sc['expert_id'] ?? 0);
                $sc['expert_name'] = $cancelPartyNames[$tid] ?? null;
            }
            unset($sc);

            $expertCancelCount = count(array_filter($expertCancellations, fn ($r) => ($r['kind'] ?? 'cancel') === 'cancel'));
            $expertDeclineCount = count(array_filter($expertCancellations, fn ($r) => ($r['kind'] ?? '') === 'decline'));
            $userCancelCount = count(array_filter($userCancellations, fn ($r) => ($r['kind'] ?? 'cancel') === 'cancel'));
            $userDeclineCount = count(array_filter($userCancellations, fn ($r) => ($r['kind'] ?? '') === 'decline'));

            return ControllerTools::JSON([
                'account' => $account,
                'expertProfile' => $expertProfile,
                'slots' => array_values($slots),
                'balance' => $balance,
                'ledger' => array_values($ledger),
                'bookings' => array_values($bookings),
                'tickets' => array_values($tickets),
                'expertCancelCount' => $expertCancelCount,
                'expertDeclineCount' => $expertDeclineCount,
                'userCancelCount' => $userCancelCount,
                'userDeclineCount' => $userDeclineCount,
                'expertCancellations' => array_values($expertCancellations),
                'userCancellations' => array_values($userCancellations),
            ]);
        }

        public static function get__main(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            if (!static::isModerator()) {
                return ControllerTools::redirect(IRabi::url('/'));
            }

            $url = $globals->getUri();
            $t = ForegroundI18n::getInstance();
            $users = static::fetchUsers();

            $callerIsAdmin = UserEntityConfig::isAdmin();
            $callerIsOwner = UserEntityConfig::isOwner(); // true for admin too

            $columns = [
                GridConfig::col('id',               'ID'),
                GridConfig::col('login',            'Login'),
                GridConfig::col('type',             $t->Reg_AccountType()),
                GridConfig::col('name',             'Name'),
                GridConfig::col('last_online_time', 'Online'),
                GridConfig::col('IS_APPROVED',      $t->User_Status_Approved(), shrink: true),
                GridConfig::col('IS_DISABLED',      $t->Admin_Activity(), shrink: true),
            ];
            if ($callerIsOwner) {
                $columns[] = GridConfig::col('IS_MODERATOR', $t->Admin_Role_Moderator(), shrink: true);
                $columns[] = GridConfig::col('IS_OWNER',     $t->Admin_Role_Owner(),     shrink: true);
            }
            if ($callerIsAdmin) {
                $columns[] = GridConfig::col('IS_ADMIN',     $t->Admin_Role_Admin(),     shrink: true);
            }

            // Comments tab data: combobox options always preloaded (light), grid data
            // is hydrated up-front only when ?tab=comments is the initial tab.
            $tabParam = (string)$globals->readGetValue('tab', '');
            $initialTab = match ($tabParam) {
                'comments' => 'comments',
                'tokens' => 'tokens',
                default => 'users',
            };
            $commentsInitialPayload = $initialTab === 'comments'
                ? DashboardCommentsController::initialCommentsPayload()
                : null;

            $content = RenderIsland::render('admin-panel', [
                'users' => $users,
                'setFlagUrl' => IRabi::url(static::URL . '~setUserFlag'),
                'setUserTypeUrl' => IRabi::url(static::URL . '~setUserType'),
                'userDetailUrl' => IRabi::url(static::URL . '~userDetail'),
                'createTicketUrl' => IRabi::url(DashboardSupportController::URL . '~createForUser'),
                'gridConfig' => GridConfig::make(
                    columns:      $columns,
                    searchFields: ['login', 'name'],
                    sortFields:   ['id', 'login', 'name', 'last_online_time'],
                    pageSize:     PaginationHelper::DEFAULT_PER_PAGE,
                ),
                'commentsPageUrl' => IRabi::url(DashboardCommentsController::URL . '~commentsPage'),
                'commentsHideUrl' => IRabi::url(DashboardCommentsController::URL . '~hide'),
                'commentsUnhideUrl' => IRabi::url(DashboardCommentsController::URL . '~unhide'),
                'commentsExperts' => DashboardCommentsController::loadExperts(),
                'commentsAuthors' => DashboardCommentsController::loadAuthors(),
                'commentsInitialPayload' => $commentsInitialPayload,
                'tokensListUrl' => IRabi::url(DashboardInviteTokensController::URL . '~list'),
                'tokensCreateUrl' => IRabi::url(DashboardInviteTokensController::URL . '~create'),
                'tokensDisableUrl' => IRabi::url(DashboardInviteTokensController::URL . '~disable'),
                'tokensEnableUrl' => IRabi::url(DashboardInviteTokensController::URL . '~enable'),
                'tokensDeleteUrl' => IRabi::url(DashboardInviteTokensController::URL . '~delete'),
                'tokensRegistrationsUrl' => IRabi::url(DashboardInviteTokensController::URL . '~registrations'),
                'tokensUpdateUrl' => IRabi::url(DashboardInviteTokensController::URL . '~update'),
                'initialTab' => $initialTab,
            ]);

            $render = HtmlLayout::render(
                TwigParams::init()->get(TwigParams::DEF_LAYOUT_PARAMS, [
                    'content' => $content,
                    'top_menu_items' => static::getMainMenu($url),
                    'side_menu_items' => static::getSideMenu($url),
                    'styles_assets' => [
                        FrameworkAssetsGen::gridjs_mermaid_min_css(),
                        FrameworkAssetsGen::cropper_cropper_styles_css(),
                    ],
                    'js_assets' => [
                        FrameworkJsGen::gridtable(),
                        FrameworkAssetsGen::cropper_cropper_min_js(),
                    ],
                ])
            );

            return ControllerTools::ok($render);
        }

        /**
         * On approval, broadcast a "new slot" news event for every future,
         * non-cancelled slot the expert had already created while unapproved
         * (those slots produced no news at creation time). Idempotent: clears
         * any existing new_slot event for the slot first.
         */
        private static function announceFutureSlots(int $expertId): void {
            $slots = TimeSlots::get()->selectByField('expert_id', $expertId, function (SelectInterface $q): void {
                $q->where('start_at > UNIX_TIMESTAMP()');
                $q->where("status != 'cancelled'");
            });
            if (empty($slots)) {
                return;
            }
            $profile = ExpertProfiles::get()->selectOneByField('account_id', $expertId);
            $accountRow = DbAccount::get()->selectById($expertId);
            $name = ($profile['display_name'] ?? '') ?: ($accountRow['name'] ?? '') ?: ($accountRow['login'] ?? '') ?: 'Expert';
            foreach ($slots as $slot) {
                $slotId = (int)$slot['id'];
                NewsService::deleteByTargetKey(NewsService::slotKey($slotId), NewsService::TYPE_NEW_SLOT);
                NewsService::createBroadcast(NewsService::TYPE_NEW_SLOT, $expertId, [
                    'slot_id' => $slotId,
                    'expert_id' => $expertId,
                    'name' => $name,
                    'time' => (int)$slot['start_at'],
                    'cost' => (int)$slot['cost'],
                ], NewsService::slotKey($slotId));
            }
        }
    }
}
