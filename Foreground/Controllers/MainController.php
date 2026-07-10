<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Foreground\Controllers {
    use Aura\SqlQuery\Common\SelectInterface;
    use PHPCraftdream\Garnet\Bundle\I18n\FwI18n;
    use PHPCraftdream\Garnet\Bundle\Utils\HtmlLayout;
    use PHPCraftdream\Garnet\Bundle\Utils\RenderIsland;
    use PHPCraftdream\Garnet\Kernel\Core\FrameworkController;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\Account;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\DbAccount;
    use PHPCraftdream\Garnet\Kernel\Interfaces\IGlobalReqParams;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Router\IRouterUriParams;
    use PHPCraftdream\Garnet\Kernel\Io\Router\ControllerTools;
    use PHPCraftdream\Garnet\Kernel\Io\Twig\TwigParams;
    use PHPCraftdream\IRabi\Common\Services\AccountDisplay;
    use PHPCraftdream\IRabi\Common\Services\NewsService;
    use PHPCraftdream\IRabi\Common\System\DateUtils;
    use PHPCraftdream\IRabi\Common\System\ThirdPartyAssets;
    use PHPCraftdream\IRabi\Common\Tables\AccountBalance;
    use PHPCraftdream\IRabi\Common\Tables\BalanceLedger;
    use PHPCraftdream\IRabi\Common\Tables\Bookings;
    use PHPCraftdream\IRabi\Common\Tables\ExpertCancellations;
    use PHPCraftdream\IRabi\Common\Tables\ExpertProfiles;
    use PHPCraftdream\IRabi\Common\Tables\ImReadStatus;
    use PHPCraftdream\IRabi\Common\Tables\SupportTickets;
    use PHPCraftdream\IRabi\Common\Tables\TimeSlots;
    use PHPCraftdream\IRabi\Common\Tables\UserCancellations;
    use PHPCraftdream\IRabi\Foreground\Controllers\ExpertPanel\ExpertHelpers;
    use PHPCraftdream\IRabi\Foreground\I18n\ForegroundI18n;
    use PHPCraftdream\IRabi\Foreground\Middlewares\UserDataMiddleware;
    use PHPCraftdream\IRabi\Foreground\Params\Menu;
    use PHPCraftdream\IRabi\Foreground\Params\UserEntityConfig;
    use PHPCraftdream\IRabi\IRabi;

    class MainController extends FrameworkController {
        public static function getSideMenu(string $url): array {
            return Menu::side($url);
        }

        protected static function getMainMenu(string $url): array {
            return Menu::main($url);
        }

        public static function get__main(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            $url = $globals->getUri();

            $account = Account::fromSession();
            if (!$account || !$account->id()) {
                return ControllerTools::redirect(IRabi::url('/'));
            }

            $accountId = $account->id();
            $accountName = $account->readParam('name', '');
            $accountType = $account->readParam('type', 'user');
            // Business-rule "expert" — needs admin approval to appear in public
            // listings and accept bookings. Keep for downstream logic.
            $isExpert = $accountType === 'expert' && $account->isApproved();
            $isModerator = $account->isAdmin() || $account->isOwner() || $account->isModerator();
            $isOwner = $account->isAdmin() || $account->isOwner();

            // Determine display role. A freshly-registered expert who hasn't
            // been approved yet is still an expert to themselves — the role
            // badge in the welcome card must reflect the account type, not
            // the approval flag, or their own dashboard greets them as
            // "Пользователь", which is confusing right after registration.
            $role = 'user';
            if ($isOwner) {
                $role = 'owner';
            } elseif ($isModerator) {
                $role = 'moderator';
            } elseif ($accountType === 'expert') {
                $role = 'expert';
            }

            $balance = AccountBalance::getBalance($accountId);
            $unreadSupport = SupportTickets::getUnreadCountForUser($accountId);
            $unreadIm = ImReadStatus::getUnreadCountForUser($accountId);
            $now = time();

            // ── User data: upcoming bookings (limit 3) ──
            $upcomingBookings = [];
            $rawBookings = Bookings::get()->selectByField('user_id', $accountId, function (SelectInterface $q): void {
                $q->where('status IN (?)', [['pending', 'confirmed']]);
            });

            if (!empty($rawBookings)) {
                // Collect slot bookables only
                $slotBookables = [];
                foreach ($rawBookings as $b) {
                    if ($b['bookable_type'] === 'time_slot') {
                        $slotBookables[(int)$b['bookable_id']] = $b;
                    }
                }

                if (!empty($slotBookables)) {
                    $slotIds = array_keys($slotBookables);
                    $slots = TimeSlots::get()->selectByIds($slotIds);
                    $expertIds = array_unique(array_filter(array_column($slots, 'expert_id')));

                    $expertMap = [];
                    if (!empty($expertIds)) {
                        foreach (ExpertProfiles::get()->selectByField('account_id', $expertIds) as $tp) {
                            $expertMap[(int)$tp['account_id']] = $tp;
                        }
                    }

                    foreach ($slots as $slot) {
                        if ((int)$slot['start_at'] < $now) {
                            continue;
                        }
                        $booking = $slotBookables[(int)$slot['id']] ?? null;
                        if (!$booking) {
                            continue;
                        }

                        $label = ForegroundI18n::getInstance()->User_Individual();
                        $tid = (int)($slot['expert_id'] ?? 0);
                        $upcomingBookings[] = [
                            'id' => (int)$booking['id'],
                            'start_at' => (int)$slot['start_at'],
                            'expert_id' => $tid,
                            'expert_name' => $expertMap[$tid]['display_name'] ?? '',
                            'status' => $booking['status'],
                            'label' => $label,
                            'is_online' => (bool)($slot['is_online'] ?? false),
                            'location' => trim((string)($slot['location'] ?? '')),
                        ];
                    }
                }

                // Sort by start_at ASC, take 3
                usort($upcomingBookings, fn ($a, $b) => $a['start_at'] <=> $b['start_at']);
                $upcomingBookings = array_slice($upcomingBookings, 0, 3);
            }

            // ── User data: recommended slots (limit 3) ──
            $recommendedSlots = [];
            $approvedExpertIds = UserEntityConfig::getApprovedExpertIds();
            if (!empty($approvedExpertIds)) {
                $bookedSlotIds = array_column(
                    Bookings::get()->selectByField('user_id', $accountId, function (SelectInterface $q): void {
                        $q->where('bookable_type = ?', ['time_slot'])
                            ->where('status IN (?)', [['pending', 'confirmed', 'completed']]);
                    }),
                    'bookable_id'
                );

                $freeSlots = TimeSlots::get()->selectAll(function (SelectInterface $q) use ($bookedSlotIds, $approvedExpertIds, $accountId): void {
                    $q->where('status = :sf', ['sf' => 'free'])
                        ->where('start_at > UNIX_TIMESTAMP()')
                        ->where('expert_id <> ?', [$accountId]) // never recommend your own slot
                        ->orderBy(['start_at ASC'])
                        ->limit(3);
                    $q->where('expert_id IN (?)', [array_map('intval', $approvedExpertIds)]);
                    if (!empty($bookedSlotIds)) {
                        $q->where('id NOT IN (?)', [array_map('intval', $bookedSlotIds)]);
                    }
                });

                if (!empty($freeSlots)) {
                    $fsExpertIds = array_unique(array_filter(array_column($freeSlots, 'expert_id')));

                    $fsEMap = [];
                    if (!empty($fsExpertIds)) {
                        foreach (ExpertProfiles::get()->selectByField('account_id', $fsExpertIds) as $tp) {
                            $fsEMap[(int)$tp['account_id']] = $tp;
                        }
                    }

                    foreach ($freeSlots as $slot) {
                        $label = ForegroundI18n::getInstance()->User_Individual();
                        $tid = (int)($slot['expert_id'] ?? 0);
                        $recommendedSlots[] = [
                            'id' => (int)$slot['id'],
                            'start_at' => (int)$slot['start_at'],
                            'duration_min' => (int)($slot['duration_min'] ?? 60),
                            'cost' => (int)($slot['cost'] ?? 0),
                            'expert_id' => $tid,
                            'expert_name' => $fsEMap[$tid]['display_name'] ?? '',
                            'label' => $label,
                        ];
                    }
                }
            }

            // ── Expert data ──
            $expertSlots = [];
            $pendingBookings = 0;
            $usersThisMonth = 0;
            $earningsThisMonth = 0;
            $expertPendingBookingsList = [];
            $expertConfirmedBookingsList = [];

            if ($isExpert) {
                // Next 3 expert slots
                $eSlots = TimeSlots::get()->selectByField('expert_id', $accountId, function (SelectInterface $q): void {
                    $q->where('status IN (?)', [['free', 'booked']])
                        ->where('start_at > UNIX_TIMESTAMP()')
                        ->orderBy(['start_at ASC'])
                        ->limit(3);
                });

                foreach ($eSlots as $slot) {
                    $bookedCount = 0;
                    if (!empty($slot['id'])) {
                        $bRows = Bookings::get()->selectAll(function (SelectInterface $q) use ($slot): void {
                            $q->resetCols();
                            $q->cols(['COUNT(*) as cnt']);
                            $q->where('bookable_type = ?', ['time_slot'])
                                ->where('bookable_id = ?', [(int)$slot['id']])
                                ->where('status IN (?)', [['pending', 'confirmed']]);
                        });
                        $bookedCount = (int)($bRows[0]['cnt'] ?? 0);
                    }

                    $label = ForegroundI18n::getInstance()->User_Individual();

                    $expertSlots[] = [
                        'id' => (int)$slot['id'],
                        'start_at' => (int)$slot['start_at'],
                        'duration_min' => (int)($slot['duration_min'] ?? 60),
                        'booked_count' => $bookedCount,
                        'max_users' => (int)($slot['max_users'] ?? 1),
                        'label' => $label,
                    ];
                }

                // Pending bookings count (expert's slots with pending bookings)
                $expertSlotIds = array_column(
                    TimeSlots::get()->selectByField('expert_id', $accountId),
                    'id'
                );
                if (!empty($expertSlotIds)) {
                    $pbRows = Bookings::get()->selectAll(function (SelectInterface $q) use ($expertSlotIds): void {
                        $q->resetCols();
                        $q->cols(['COUNT(*) as cnt']);
                        $q->where('bookable_type = :btype', ['btype' => 'time_slot'])
                            ->where('bookable_id IN (:slot_ids)', ['slot_ids' => array_map('intval', $expertSlotIds)])
                            ->where('status = :st', ['st' => 'pending']);
                    });
                    $pendingBookings = (int)($pbRows[0]['cnt'] ?? 0);
                }

                // Monthly stats from BalanceLedger — month boundary in expert's tz
                $userTz = $account->readParam('time_zone') ?: 'UTC';
                $monthStart = DateUtils::startOfCurrentMonthForUser($userTz);
                $monthUsers = Bookings::get()->selectAll(function (SelectInterface $q) use ($expertSlotIds, $monthStart): void {
                    $q->resetCols();
                    $q->cols(['COUNT(DISTINCT user_id) as cnt']);
                    if (!empty($expertSlotIds)) {
                        $q->where('bookable_type = ?', ['time_slot'])
                            ->where('bookable_id IN (?)', [array_map('intval', $expertSlotIds)])
                            ->where('status IN (?)', [['confirmed', 'completed']])
                            ->where('created_at >= ?', [$monthStart]);
                    } else {
                        $q->where('1 = 0');
                    }
                });
                $usersThisMonth = (int)($monthUsers[0]['cnt'] ?? 0);

                $monthEarnings = BalanceLedger::get()->selectAll(function (SelectInterface $q) use ($accountId, $monthStart): void {
                    $q->resetCols();
                    $q->cols(['COALESCE(SUM(amount), 0) as total']);
                    $q->where('account_id = ?', [$accountId])
                        ->where('is_credit = 1')
                        ->where('entry_type IN (?)', [['booking_payment']])
                        ->where('created_at >= ?', [$monthStart]);
                });
                $earningsThisMonth = (int)($monthEarnings[0]['total'] ?? 0);

                // Decline (pre-confirmation) vs cancellation (post-confirmation) tallies.
                $expCancelRows = ExpertCancellations::get()->selectAll(function (SelectInterface $q) use ($accountId): void {
                    $q->resetCols()->cols(['COUNT(*) as cnt'])
                        ->where('expert_id = ? AND kind = ?', [$accountId, 'cancel']);
                });
                $expertCancelCount = (int)($expCancelRows[0]['cnt'] ?? 0);
                $expDeclineRows = ExpertCancellations::get()->selectAll(function (SelectInterface $q) use ($accountId): void {
                    $q->resetCols()->cols(['COUNT(*) as cnt'])
                        ->where('expert_id = ? AND kind = ?', [$accountId, 'decline']);
                });
                $expertDeclineCount = (int)($expDeclineRows[0]['cnt'] ?? 0);

                // Full lists for the dashboard widgets
                $expertPendingBookingsList = ExpertHelpers::buildPendingBookingsList($accountId);
                $expertConfirmedBookingsList = ExpertHelpers::buildConfirmedBookingsList($accountId, $now);
            }

            // ── Moderator data ──
            $openTickets = 0;
            $pendingApprovals = 0;
            $totalUsers = 0;
            $bookingsThisMonth = 0;

            if ($isModerator) {
                // Open support tickets
                $otRows = SupportTickets::get()->selectAll(function (SelectInterface $q): void {
                    $q->resetCols();
                    $q->cols(['COUNT(*) as cnt']);
                    $q->where('status NOT IN (?)', [['resolved', 'rejected']]);
                });
                $openTickets = (int)($otRows[0]['cnt'] ?? 0);

                // Pending approvals (experts not yet approved)
                $allExperts = Account::getAccounts(
                    selectCallback: static function (SelectInterface $s): void {
                        $s->resetCols();
                        $s->cols(['id']);
                        $s->where("type = 'expert'");
                    },
                    accountDataFields: [Account::IS_APPROVED, Account::IS_DISABLED],
                );
                $pendingApprovals = count(array_filter($allExperts, static function (array $a): bool {
                    return intval($a[Account::IS_APPROVED] ?? 0) < 1
                        && intval($a[Account::IS_DISABLED] ?? 0) < 1;
                }));

                // Total users
                $tuRows = Account::getAccounts(
                    selectCallback: static function (SelectInterface $s): void {
                        $s->resetCols();
                        $s->cols(['COUNT(*) as cnt']);
                    },
                );
                $totalUsers = (int)($tuRows[0]['cnt'] ?? 0);

                // Bookings this month — month boundary in viewing moderator's tz
                $monthStart ??= DateUtils::startOfCurrentMonthForUser($account->readParam('time_zone') ?: 'UTC');
                $bmRows = Bookings::get()->selectAll(function (SelectInterface $q) use ($monthStart): void {
                    $q->resetCols();
                    $q->cols(['COUNT(*) as cnt']);
                    $q->where('created_at >= ?', [$monthStart]);
                });
                $bookingsThisMonth = (int)($bmRows[0]['cnt'] ?? 0);
            }

            // ── Build props and render ──
            // ── News ──
            $unreadNews = NewsService::getUnreadCount($accountId);

            $avatarUrl = UserEntityConfig::avatarUrl([
                'photo' => $account->readParam('photo'),
                'photo_cropped' => $account->readParam('photo_cropped'),
                'token16' => $account->readParam('token16'),
            ]);
            $avatarFullUrl = UserEntityConfig::avatarUrl([
                'photo' => $account->readParam('photo'),
                'token16' => $account->readParam('token16'),
            ]);

            $props = [
                'name' => $accountName ?: ForegroundI18n::getInstance()->User_Anonymous(),
                'avatar' => $avatarUrl,
                'avatar_full' => $avatarFullUrl,
                'role' => $role,
                'isExpert' => $isExpert,
                'isModerator' => $isModerator,
                'balance' => $balance,
                'unreadSupport' => $unreadSupport,
                'unreadIm' => $unreadIm,
                'upcomingBookings' => array_values($upcomingBookings),
                'recommendedSlots' => array_values($recommendedSlots),
                'newsUrl' => IRabi::url(NewsController::URL),
                'unreadNews' => $unreadNews,
            ];

            if ($isExpert) {
                $props['expertSlots'] = $expertSlots;
                $props['pendingBookings'] = $pendingBookings;
                $props['expertPendingBookingsList'] = $expertPendingBookingsList;
                $props['expertConfirmedBookingsList'] = $expertConfirmedBookingsList;
                $props['usersThisMonth'] = $usersThisMonth;
                $props['earningsThisMonth'] = $earningsThisMonth;
                $props['declines'] = $expertDeclineCount;
                $props['cancellations'] = $expertCancelCount;
            }

            if ($isModerator) {
                $props['openTickets'] = $openTickets;
                $props['pendingApprovals'] = $pendingApprovals;
                $props['totalUsers'] = $totalUsers;
                $props['bookingsThisMonth'] = $bookingsThisMonth;
            }

            $content = RenderIsland::render('dashboard', $props);

            $render = HtmlLayout::render(TwigParams::init()->get(TwigParams::DEF_LAYOUT_PARAMS, [
                'content' => $content,
                'top_menu_items' => static::getMainMenu($url),
                'side_menu_items' => static::getSideMenu($url),
            ]));

            return ControllerTools::ok($render);
        }

        public static function get__profile(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            $url = $globals->getUri();

            $account = Account::fromSession();
            if (!$account) {
                return ControllerTools::redirect(IRabi::url('/'));
            }

            $userId = $account->id();

            $expertProfile = ExpertProfiles::get()->selectOneByField('account_id', $userId);
            if ($expertProfile && (int)($expertProfile['is_approved'] ?? 0)) {
                return ControllerTools::redirect(IRabi::url('/expert/id~' . $userId));
            }

            $row = DbAccount::get()->selectOneByField('id', $userId);

            $completedBookings = Bookings::get()->getCount(function (SelectInterface $q) use ($userId): void {
                $q->where('user_id = ? AND status = ?', [$userId, 'completed']);
            });
            $totalBookings = Bookings::get()->getCount(function (SelectInterface $q) use ($userId): void {
                $q->where('user_id = ?', [$userId]);
            });
            $userCancellations = UserCancellations::get()->getCount(function (SelectInterface $q) use ($userId): void {
                $q->where('user_id = ? AND kind = ?', [$userId, 'cancel']);
            });
            $userDeclines = UserCancellations::get()->getCount(function (SelectInterface $q) use ($userId): void {
                $q->where('user_id = ? AND kind = ?', [$userId, 'decline']);
            });

            $isModerator = UserEntityConfig::isModerator();

            $disabled = AccountDisplay::isDisabled($userId);
            $userName = $disabled ? AccountDisplay::disabledName($userId) : ($row['name'] ?? '');
            $userAvatar = $disabled ? null : UserEntityConfig::avatarUrl([
                'photo' => $row['photo'] ?? null,
                'photo_cropped' => $row['photo_cropped'] ?? null,
                'token16' => $row['token16'] ?? null,
            ]);
            $userAvatarFull = $disabled ? null : UserEntityConfig::avatarUrl([
                'photo' => $row['photo'] ?? null,
                'token16' => $row['token16'] ?? null,
            ]);

            $content = RenderIsland::render('user-profile', [
                'user' => [
                    'id' => (int)($row['id'] ?? $userId),
                    'name' => $userName,
                    'avatar' => $userAvatar,
                    'avatar_full' => $userAvatarFull,
                    'is_disabled' => $disabled,
                    'completedBookings' => $completedBookings,
                    'totalBookings' => $totalBookings,
                    'userCancellations' => $userCancellations,
                    'userDeclines' => $userDeclines,
                ],
                'isModerator' => $isModerator,
                'isOwnProfile' => true,
            ]);

            return ControllerTools::ok(HtmlLayout::render(
                TwigParams::init()->get(TwigParams::DEF_LAYOUT_PARAMS, [
                    'content' => $content,
                    'top_menu_items' => static::getMainMenu($url),
                    'side_menu_items' => static::getSideMenu($url),
                ])
            ));
        }

        public static function get__profile_edit(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            $tf = FwI18n::getInstance();
            $url = $globals->getUri();

            $config = UserEntityConfig::getEntityConfig();

            $account = Account::fromSession();
            $details = $account->readParams([...$config->editFields(), 'token16']);
            $config->patchItem($details);
            $detailsInfo = [
                'saveUrl' => null,
                'idColumn' => $config->idField(),
                'fields' => $config->getFieldsInfo(),
                'detailsFields' => $config->editFields(),
            ];

            // Never expose the numeric account ID in the personal edit form.
            if (isset($detailsInfo['fields']['id'])) {
                $detailsInfo['fields']['id']['hidden'] = true;
                $detailsInfo['fields']['id']['readOnly'] = true;
            }

            // Current per-category email-notification preferences (EAV JSON).
            $account->readDbAsync();
            $account->readDataAsyncPollFinishAll();
            $rawPrefs = $account->readData('email_notif_prefs');
            $decodedPrefs = $rawPrefs ? (json_decode($rawPrefs, true) ?: []) : [];
            $allowedFreq = ['off', 'each', 'hourly', 'daily'];
            $notifPrefs = [
                'messages' => in_array($decodedPrefs['messages'] ?? '', $allowedFreq, true) ? $decodedPrefs['messages'] : 'each',
                'support' => in_array($decodedPrefs['support'] ?? '', $allowedFreq, true) ? $decodedPrefs['support'] : 'each',
                'bookings' => in_array($decodedPrefs['bookings'] ?? '', $allowedFreq, true) ? $decodedPrefs['bookings'] : 'each',
            ];

            $params = TwigParams::init()->get(TwigParams::DEF_LAYOUT_PARAMS, [
                'content' => RenderIsland::render('registration-form', [
                    'detailsInfo' => $detailsInfo,
                    'details' => $details,
                    'action' => 'update_user',
                    'formTitle' => $tf->Profile_Page(),
                    'profileUrl' => IRabi::url('/~profile'),
                    'notifPrefs' => $notifPrefs,
                    'notifSaveUrl' => IRabi::url('/~saveNotifPrefs'),
                ]),
                'top_menu_items' => static::getMainMenu($url),
                'side_menu_items' => static::getSideMenu($url),
                'styles_assets' => array_filter([
                    ThirdPartyAssets::cropperStylesCss(),
                ]),
                'js_assets' => array_filter([
                    ThirdPartyAssets::cropperJs(),
                ])
            ]);

            $render = HtmlLayout::render($params);

            return ControllerTools::ok($render);
        }

        public static function post__profile_edit(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            if (!$globals->isPost()) {
                return ControllerTools::JSON('fail', status: 500);
            }

            if ($globals->readPostValue('action') !== 'update_user') {
                return ControllerTools::JSON('fail action', status: 500);
            }

            return UserDataMiddleware::processPost($globals);
        }

        /**
         * Persist the current user's per-category email-notification preferences.
         * Stored as a JSON blob in the `email_notif_prefs` account-data param and
         * honoured at send time by EmailNotifications::gate().
         */
        public static function post__saveNotifPrefs(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            if (!$globals->isPost()) {
                return ControllerTools::JSON(['error' => 'Method not allowed'], status: 405);
            }

            $account = Account::fromSession();
            if (!$account || !$account->id()) {
                return ControllerTools::JSON(['error' => 'Unauthorized'], status: 401);
            }

            $allowed = ['off', 'each', 'hourly', 'daily'];
            $pick = static function (string $v) use ($allowed): string {
                return in_array($v, $allowed, true) ? $v : 'each';
            };
            $prefs = [
                'messages' => $pick((string)$globals->readPostValue('messages', 'each')),
                'support' => $pick((string)$globals->readPostValue('support', 'each')),
                'bookings' => $pick((string)$globals->readPostValue('bookings', 'each')),
            ];

            $account->readDbAsync();
            $account->readDataAsyncPollFinishAll();
            $account->setData('email_notif_prefs', json_encode($prefs, JSON_UNESCAPED_UNICODE));
            $account->flush();
            $account->readDataAsyncPollFinishAll();

            return ControllerTools::JSON(['success' => true, 'prefs' => $prefs]);
        }

        /**
         * Live counters for the nav badges and the message widget, polled by the
         * client every ~20s. Returns the current pending-bookings count (experts),
         * unread IM messages and unread support replies for the session account.
         */
        public static function get__counts(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            $account = Account::fromSession();
            if (!$account || !$account->id()) {
                return ControllerTools::JSON(['bookingsPending' => 0, 'unreadIm' => 0, 'unreadSupport' => 0]);
            }

            $accountId = $account->id();

            return ControllerTools::JSON([
                'bookingsPending' => Menu::expertPendingBookingsCount(),
                'unreadIm' => ImReadStatus::getUnreadCountForUser($accountId),
                'unreadSupport' => SupportTickets::getUnreadCountForUser($accountId),
            ]);
        }
    }
}
