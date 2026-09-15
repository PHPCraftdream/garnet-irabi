<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Foreground\Controllers {
    use Aura\SqlQuery\Common\SelectInterface;
    use PHPCraftdream\Garnet\Bundle\I18n\FwI18n;
    use PHPCraftdream\Garnet\Bundle\Utils\HtmlLayout;
    use PHPCraftdream\Garnet\Bundle\Utils\RenderIsland;
    use PHPCraftdream\Garnet\Kernel\Core\FrameworkController;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\Account;
    use PHPCraftdream\Garnet\Kernel\Interfaces\IGlobalReqParams;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Router\IRouterUriParams;
    use PHPCraftdream\Garnet\Kernel\Io\Logs\Logger;
    use PHPCraftdream\Garnet\Kernel\Io\Router\ControllerTools;
    use PHPCraftdream\Garnet\Kernel\Io\Twig\TwigParams;
    use PHPCraftdream\IRabi\Common\Services\ConsentJournalService;
    use PHPCraftdream\IRabi\Common\Services\ExpertDirectory;
    use PHPCraftdream\IRabi\Common\Services\NewsService;
    use PHPCraftdream\IRabi\Common\Services\UserProfilePresenter;
    use PHPCraftdream\IRabi\Common\System\DateUtils;
    use PHPCraftdream\IRabi\Common\System\ThirdPartyAssets;
    use PHPCraftdream\IRabi\Common\Tables\AccountBalance;
    use PHPCraftdream\IRabi\Common\Tables\Bookings;
    use PHPCraftdream\IRabi\Common\Tables\ImReadStatus;
    use PHPCraftdream\IRabi\Common\Tables\SupportTickets;
    use PHPCraftdream\IRabi\Common\Tables\TimeSlots;
    use PHPCraftdream\IRabi\Foreground\Controllers\ExpertPanel\ExpertHelpers;
    use PHPCraftdream\IRabi\Foreground\I18n\ForegroundI18n;
    use PHPCraftdream\IRabi\Foreground\Middlewares\UserDataMiddleware;
    use PHPCraftdream\IRabi\Foreground\Params\Menu;
    use PHPCraftdream\IRabi\Foreground\Params\UserEntityConfig;
    use PHPCraftdream\IRabi\IRabi;
    use Throwable;

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
                        $expertMap = ExpertDirectory::byIds($expertIds);
                    }

                    foreach ($slots as $slot) {
                        if ((int)$slot['start_at'] < $now) {
                            continue;
                        }
                        $booking = $slotBookables[(int)$slot['id']] ?? null;
                        if (!$booking) {
                            continue;
                        }

                        $t = ForegroundI18n::getInstance();
                        $label = (int)($slot['max_users'] ?? 1) > 1 ? $t->User_Group() : $t->User_Individual();
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
                        foreach (ExpertDirectory::byIds($fsExpertIds) as $tp) {
                            $fsEMap[(int)$tp['account_id']] = $tp;
                        }
                    }

                    foreach ($freeSlots as $slot) {
                        $trs = ForegroundI18n::getInstance();
                        $label = (int)($slot['max_users'] ?? 1) > 1 ? $trs->User_Group() : $trs->User_Individual();
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

                    $tes = ForegroundI18n::getInstance();
                    $maxUsers = (int)($slot['max_users'] ?? 1);
                    $label = $maxUsers > 1 ? $tes->User_Group() : $tes->User_Individual();

                    $expertSlots[] = [
                        'id' => (int)$slot['id'],
                        'start_at' => (int)$slot['start_at'],
                        'duration_min' => (int)($slot['duration_min'] ?? 60),
                        'booked_count' => $bookedCount,
                        'max_users' => (int)($slot['max_users'] ?? 1),
                        'label' => $label,
                    ];
                }

                // D-206: все шесть чисел шапки считаются в одном месте —
                // ExpertHelpers::dashboardStats(). Раньше они жили здесь и
                // уходили на клиент только вместе с HTML; теперь тот же расчёт
                // доступен точке ~expertStats, которую экран зовёт после
                // своего же действия. Две копии формул разошлись бы в первый
                // же раз, когда правку внесли бы в одну из них.
                $expertStats = ExpertHelpers::dashboardStats($account);
                $pendingBookings = $expertStats['pendingBookings'];
                $usersThisMonth = $expertStats['usersThisMonth'];
                $earningsThisMonth = $expertStats['earningsThisMonth'];
                $expertDeclineCount = $expertStats['declines'];
                $expertCancelCount = $expertStats['cancellations'];
                $expertMissedCount = $expertStats['missed'];

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
                $openTickets = SupportTickets::openCount();

                // Pending approvals (experts not yet approved) — D-153
                $pendingApprovals = count(UserEntityConfig::pendingExpertApprovals());

                // Total users
                $tuRows = Account::getAccounts(
                    selectCallback: static function (SelectInterface $s): void {
                        $s->resetCols();
                        $s->cols(['COUNT(*) as cnt']);
                    },
                );
                $totalUsers = (int)($tuRows[0]['cnt'] ?? 0);

                // Bookings this month — month boundary in viewing moderator's tz.
                // Было `??=`: значение подхватывалось из экспертного блока выше,
                // если смотрящий оказывался ещё и преподавателем. Связь была
                // невидимой и держалась только на порядке строк — стоило унести
                // экспертный расчёт в ExpertHelpers, как она порвалась.
                $monthStart = DateUtils::startOfCurrentMonthForUser($account->readParam('time_zone') ?: 'UTC');
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
                // Базовый адрес точек ленты, а не страница: сама лента живёт
                // на дашборде, а по этому адресу отвечают только `~feed`,
                // `~archive`, `~unarchive`. Имя `newsUrl` читалось как ссылка
                // на страницу, и user-8 пошла по нему в 404.
                'newsApiUrl' => IRabi::url(NewsController::URL),
                'unreadNews' => $unreadNews,
            ];

            if ($isExpert) {
                $props['expertSlots'] = $expertSlots;
                $props['pendingBookings'] = $pendingBookings;
                // D-206: адрес, по которому экран перечитывает свои числа
                // после собственного действия.
                $props['expertStatsUrl'] = IRabi::url('/~expertStats');
                $props['expertPendingBookingsList'] = $expertPendingBookingsList;
                $props['expertConfirmedBookingsList'] = $expertConfirmedBookingsList;
                $props['usersThisMonth'] = $usersThisMonth;
                $props['earningsThisMonth'] = $earningsThisMonth;
                $props['declines'] = $expertDeclineCount;
                $props['cancellations'] = $expertCancelCount;
                $props['missed'] = $expertMissedCount;
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

            // Одобрение живёт во флаге аккаунта. Копия в `expert_profiles`
            // успела разойтись с ним на боевом, и одобренный преподаватель не
            // попадал на свою же страницу.
            if (UserEntityConfig::isApprovedExpertAccount($userId)) {
                return ControllerTools::redirect(IRabi::url('/expert/id~' . $userId));
            }

            // D-150/D-152: was an independent copy of UserProfileController's
            // props (/user/id~X) — the two drifted (this copy lacked
            // myReviewsUrl, the other lacked avatar/is_disabled) and one
            // counter fix landed here late because nobody had noticed the
            // duplication. Single source now: UserProfilePresenter.
            $props = UserProfilePresenter::buildProps($userId);
            if (!$props) {
                return ControllerTools::redirect(IRabi::url('/'));
            }

            $content = RenderIsland::render('user-profile', $props);

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

            // Marketing consent is a separate concept from the per-category
            // email prefs above (legal finding F-06): it lives on the account
            // as consent_marketing_at / consent_marketing_withdrawn_at, not in
            // the email_notif_prefs JSON. Exposed here so the profile form can
            // render the current state and let the user grant/withdraw it.
            $marketingConsent = $account->hasConsentMarketing();

            $params = TwigParams::init()->get(TwigParams::DEF_LAYOUT_PARAMS, [
                'content' => RenderIsland::render('registration-form', [
                    'detailsInfo' => $detailsInfo,
                    'details' => $details,
                    'action' => 'update_user',
                    'formTitle' => $tf->Profile_Page(),
                    'profileUrl' => IRabi::url('/~profile'),
                    'notifPrefs' => $notifPrefs,
                    'notifSaveUrl' => IRabi::url('/~saveNotifPrefs'),
                    'marketingConsent' => $marketingConsent,
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
         *
         * Also applies the marketing-consent toggle shown alongside the prefs
         * (legal finding F-06(а)): grant sets a fresh consent_marketing_at +
         * journals ACTION_GIVEN; withdraw calls Account::withdrawMarketingConsent()
         * + journals ACTION_WITHDRAWN. Only a real state change (compared against
         * the current hasConsentMarketing()) is journaled, so re-saving the form
         * without toggling consent does not duplicate audit rows. Journal failures
         * are logged but never block the prefs save — same contract as the auth
         * path (IrabiAuthMiddleware::sendSuccessLogin).
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

            // Compare the checkbox state to the CURRENT consent BEFORE mutating
            // anything, so an unchanged toggle produces no journal row.
            $hadConsent = $account->hasConsentMarketing();
            $wantsConsent = (string)$globals->readPostValue('consent_marketing', '') === '1';
            $consentChanged = $wantsConsent !== $hadConsent;

            $account->setData('email_notif_prefs', json_encode($prefs, JSON_UNESCAPED_UNICODE));

            if ($consentChanged) {
                if ($wantsConsent) {
                    // A new grant: stamp a fresh timestamp newer than any prior
                    // withdrawal so hasConsentMarketing() flips back to true.
                    $account->setParam(Account::PARAM_CONSENT_MARKETING_AT, (string)time());
                } else {
                    $account->withdrawMarketingConsent();
                }
            }

            $account->flush();
            $account->readDataAsyncPollFinishAll();

            if ($consentChanged) {
                try {
                    ConsentJournalService::record(
                        $account->id(),
                        ConsentJournalService::TYPE_MARKETING,
                        $wantsConsent ? ConsentJournalService::ACTION_GIVEN : ConsentJournalService::ACTION_WITHDRAWN,
                        $globals->ip(),
                        (string)$globals->readServerValue('HTTP_USER_AGENT', ''),
                    );
                } catch (Throwable $e) {
                    try {
                        Logger::get(Logger::ERROR_LOGGER)->write('consent_journal', $e->getMessage());
                    } catch (Throwable) {
                        // Logger unavailable — nothing more to do; never block the save.
                    }
                }
            }

            return ControllerTools::JSON([
                'success' => true,
                'prefs' => $prefs,
                'marketingConsent' => $wantsConsent,
            ]);
        }

        /**
         * Live counters for the nav badges and the message widget, polled by the
         * client every ~20s. Returns the current pending-bookings count (experts),
         * unread IM messages and unread support replies for the session account.
         */
        /**
         * D-206: числа шапки преподавательского дашборда по запросу.
         *
         * Экран зовёт эту точку ровно в те моменты, когда его собственное
         * действие меняет то, что в этих числах показано: подтверждение заявки
         * и отклонение. Отклонение задевает сразу два — счётчик отклонений и
         * доход за месяц (из-за возврата), — и оба обязаны сойтись до рубля в
         * тот же момент, когда преподаватель принимает следующее решение.
         *
         * Не входит в ~counts: те счётчики опрашиваются каждые 20 секунд всеми
         * страницами подряд, а эти шесть чисел нужны одному экрану и только
         * после действия.
         */
        public static function get__expertStats(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            $account = Account::fromSession();
            // Та же проверка, по которой страница решает показывать эти числа
            // вообще: тип аккаунта плюс одобрение администратора. Неодобренный
            // преподаватель не ведёт занятий, и статистики у него нет.
            $isExpert = $account
                && $account->id()
                && $account->readParam('type', 'user') === 'expert'
                && $account->isApproved();

            if (!$isExpert) {
                return ControllerTools::JSON(['error' => 'Forbidden'], status: 403);
            }

            return ControllerTools::JSON(ExpertHelpers::dashboardStats($account));
        }

        public static function get__counts(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            $account = Account::fromSession();
            if (!$account || !$account->id()) {
                return ControllerTools::JSON(['primaryBadgeCount' => 0, 'unreadIm' => 0, 'unreadSupport' => 0]);
            }

            $accountId = $account->id();

            return ControllerTools::JSON([
                // Wire name is app-agnostic (see liveCounts.ts::LiveCounts) — for
                // IRabi the "primary" live-updated nav badge is pending bookings.
                'primaryBadgeCount' => Menu::expertPendingBookingsCount(),
                'unreadIm' => ImReadStatus::getUnreadCountForUser($accountId),
                'unreadSupport' => SupportTickets::getUnreadCountForUser($accountId),
                // The header's balance pill is rendered once with the page and
                // then goes stale: money moves on top-up, on booking, on
                // cancellation and on refund, none of which redraw the header.
                // People topped up and saw "0 ₽" still sitting above them.
                'balance' => AccountBalance::getBalance($accountId),
            ]);
        }
    }
}
