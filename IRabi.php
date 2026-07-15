<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi {
    use PHPCraftdream\Garnet\Bundle\Framework;
    use PHPCraftdream\Garnet\Bundle\FrameworkCssGen;
    use PHPCraftdream\Garnet\Bundle\FrameworkJsGen;
    use PHPCraftdream\Garnet\Bundle\I18n\FwI18n;
    use PHPCraftdream\Garnet\Bundle\Middlewares\MaintenanceMiddleware;
    use PHPCraftdream\Garnet\Bundle\Middlewares\WorkerScopeMiddleware;
    use PHPCraftdream\Garnet\Bundle\Modules\Email\FwEmailQueueService;
    use PHPCraftdream\Garnet\Bundle\Modules\Idempotency\IdempotencyMiddleware;
    use PHPCraftdream\Garnet\Bundle\Modules\Invite\FwInviteTokenService;
    use PHPCraftdream\Garnet\Bundle\Modules\JsErrors\Controllers\FwJsErrorLogController;
    use PHPCraftdream\Garnet\Bundle\Utils\HtmlLayout;
    use PHPCraftdream\Garnet\Bundle\Utils\RenderIsland;
    use PHPCraftdream\Garnet\Kernel\Core\AppInit\BaseAppInit;
    use PHPCraftdream\Garnet\Kernel\Core\FrameworkController;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\Account;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Migration\CMDMigration;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Session\Session;
    use PHPCraftdream\Garnet\Kernel\Interfaces\IGlobalReqParams;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Router\IRouterUriParams;
    use PHPCraftdream\Garnet\Kernel\Io\Command\CommandClasses;
    use PHPCraftdream\Garnet\Kernel\Io\Cron\CMDCron;
    use PHPCraftdream\Garnet\Kernel\Io\IniConfig\AppConfig;
    use PHPCraftdream\Garnet\Kernel\Io\IniConfig\IniConfig;
    use PHPCraftdream\Garnet\Kernel\Io\Logs\Logger;
    use PHPCraftdream\Garnet\Kernel\Io\Mailer\Mailer;
    use PHPCraftdream\Garnet\Kernel\Io\Router\ControllerTools;
    use PHPCraftdream\Garnet\Kernel\Io\Router\Router;
    use PHPCraftdream\Garnet\Kernel\Io\Router\RouterUriParams;
    use PHPCraftdream\Garnet\Kernel\Io\Twig\TwigParams;
    use PHPCraftdream\IRabi\Common\Commands\CMDClearLogs;
    use PHPCraftdream\IRabi\Common\Commands\CMDClearUser;
    use PHPCraftdream\IRabi\Common\Commands\CMDLogTail;
    use PHPCraftdream\IRabi\Common\Commands\CMDRemoteCache;
    use PHPCraftdream\IRabi\Common\Commands\CMDRemoteClearLogs;
    use PHPCraftdream\IRabi\Common\Commands\CMDRemoteClearUser;
    use PHPCraftdream\IRabi\Common\Commands\CMDRemoteLogTail;
    use PHPCraftdream\IRabi\Common\Commands\CMDRemoteMigrateStatus;
    use PHPCraftdream\IRabi\Common\Commands\CMDRemoteMigration;
    use PHPCraftdream\IRabi\Common\Commands\CMDRemoteSql;
    use PHPCraftdream\IRabi\Common\Commands\CMDRemoteTestMode;
    use PHPCraftdream\IRabi\Common\Commands\CMDSeed;
    use PHPCraftdream\IRabi\Common\Commands\CMDTestMode;
    use PHPCraftdream\IRabi\Common\Commands\CMDTestProvision;
    use PHPCraftdream\IRabi\Common\Commands\CMDTestTeardown;
    use PHPCraftdream\IRabi\Common\Mail\AppMailer;
    use PHPCraftdream\IRabi\Common\Services\AppCronService;
    use PHPCraftdream\IRabi\Common\Services\StaticPagesService;
    use PHPCraftdream\IRabi\Common\Tables\AccountBalance;
    use PHPCraftdream\IRabi\Common\Tables\EmailAttempts;
    use PHPCraftdream\IRabi\Common\Tables\EmailQueue;
    use PHPCraftdream\IRabi\Common\Tables\IdempotencyKeys;
    use PHPCraftdream\IRabi\Common\Tables\InviteRegistrations;
    use PHPCraftdream\IRabi\Common\Tables\InviteTokens;
    use PHPCraftdream\IRabi\Common\Tables\JsErrors;
    use PHPCraftdream\IRabi\Common\Tables\SupportTickets;
    use PHPCraftdream\IRabi\Dashboard\Controllers\DashboardBalancesController;
    use PHPCraftdream\IRabi\Dashboard\Controllers\DashboardBookingsController;
    use PHPCraftdream\IRabi\Dashboard\Controllers\DashboardCancellationsController;
    use PHPCraftdream\IRabi\Dashboard\Controllers\DashboardCommentsController;
    use PHPCraftdream\IRabi\Dashboard\Controllers\DashboardEntityHistoryController;
    use PHPCraftdream\IRabi\Dashboard\Controllers\DashboardFinanceController;
    use PHPCraftdream\IRabi\Dashboard\Controllers\DashboardInviteTokensController;
    use PHPCraftdream\IRabi\Dashboard\Controllers\DashboardLogsController;
    use PHPCraftdream\IRabi\Dashboard\Controllers\DashboardMailLogController;
    use PHPCraftdream\IRabi\Dashboard\Controllers\DashboardMainController;
    use PHPCraftdream\IRabi\Dashboard\Controllers\DashboardRequestLogController;
    use PHPCraftdream\IRabi\Dashboard\Controllers\DashboardStaticPagesController;
    use PHPCraftdream\IRabi\Dashboard\Controllers\DashboardSupportController;
    use PHPCraftdream\IRabi\Dashboard\Controllers\DashboardSystemController;
    use PHPCraftdream\IRabi\Dashboard\Controllers\DashboardUsersController;
    use PHPCraftdream\IRabi\Foreground\Controllers\BalanceController;
    use PHPCraftdream\IRabi\Foreground\Controllers\BookingsController;
    use PHPCraftdream\IRabi\Foreground\Controllers\CommentsController;
    use PHPCraftdream\IRabi\Foreground\Controllers\DevLoginController;
    use PHPCraftdream\IRabi\Foreground\Controllers\ExpertController;
    use PHPCraftdream\IRabi\Foreground\Controllers\ExpertPanelController;
    use PHPCraftdream\IRabi\Foreground\Controllers\ExternalController;
    use PHPCraftdream\IRabi\Foreground\Controllers\ImController;
    use PHPCraftdream\IRabi\Foreground\Controllers\MainController;
    use PHPCraftdream\IRabi\Foreground\Controllers\NewsController;
    use PHPCraftdream\IRabi\Foreground\Controllers\RegisterController;
    use PHPCraftdream\IRabi\Foreground\Controllers\SlotsController;
    use PHPCraftdream\IRabi\Foreground\Controllers\StaticPagesController;
    use PHPCraftdream\IRabi\Foreground\Controllers\SupportController;
    use PHPCraftdream\IRabi\Foreground\Controllers\SysLogController;
    use PHPCraftdream\IRabi\Foreground\Controllers\SysOpcacheResetController;
    use PHPCraftdream\IRabi\Foreground\Controllers\UserProfileController;
    use PHPCraftdream\IRabi\Foreground\Controllers\UsersController;
    use PHPCraftdream\IRabi\Foreground\Foreground;
    use PHPCraftdream\IRabi\Foreground\ForegroundCssGen;
    use PHPCraftdream\IRabi\Foreground\ForegroundJsGen;
    use PHPCraftdream\IRabi\Foreground\I18n\ForegroundI18n;
    use PHPCraftdream\IRabi\Foreground\Middlewares\IrabiAuthMiddleware;
    use PHPCraftdream\IRabi\Foreground\Middlewares\UserDataMiddleware;
    use PHPCraftdream\IRabi\Migrations\AppMigration;
    use Psr\Http\Message\ResponseInterface;
    use Throwable;

    if (!defined('DS')) {
        define('DS', DIRECTORY_SEPARATOR);
    }

    class IRabi extends BaseAppInit {
        /**
         * Route prefix for all app URLs. Set to '/system' to move the app under /system/*.
         * Empty string = no prefix (default).
         */
        public const ROUTE_PREFIX = '/system';

        /**
         * Generate a URL path with the right scope automatically applied.
         *
         * Default behaviour:
         *  - The path is checked against {@see RouterUriParams::isNoPrefixPath()}.
         *    If it matches a registered no-prefix path (e.g. /page) it is
         *    returned as-is — no /system prefix attached.
         *  - Otherwise the system prefix is prepended.
         *
         * Override:
         *  - Pass $noPrefix = true to force a "public" / no-prefix URL even
         *    if the path isn't normally registered as no-prefix.
         *
         * Examples:
         *   IRabi::url('/bookings')             → '/system/bookings'
         *   IRabi::url('/page/view~home')       → '/page/view~home'
         *   IRabi::url('/help', noPrefix: true) → '/help'
         */
        public static function url(string $path, bool $noPrefix = false): string {
            if ($noPrefix) {
                return $path;
            }
            if (RouterUriParams::isNoPrefixPath($path)) {
                return $path;
            }
            if ($path === '/') {
                return self::ROUTE_PREFIX . '/';
            }
            return self::ROUTE_PREFIX . $path;
        }

        public function getAppDir(): string {
            return __DIR__;
        }

        public function getFrontDir(): string {
            return dirname(__DIR__, 2) . DS . 'FrontBuilder' . DS;
        }

        public function runWebApp(IGlobalReqParams $globals, IRouterUriParams $uriParams): ResponseInterface|string|null {
            // Apply the test-worker prefix override BEFORE the landing page
            // (which reads static-page snippets directly from DB) and before
            // the router dispatches into the per-route middleware chain.
            // No-op outside dev. Idempotent: every request either sets a
            // fresh override or clears the previous one — no stale leakage
            // between requests in a long-lived PHP process.
            WorkerScopeMiddleware::process($globals, $uriParams);

            // Maintenance gate — GLOBAL, before the public-landing short-circuit
            // below, so `/` goes down too. (It's also wired per-route in
            // $common, but tryServeLanding() bypasses the router, so the bare
            // landing would otherwise stay up during maintenance.)
            $maintenanceResponse = MaintenanceMiddleware::process($globals, $uriParams);
            if ($maintenanceResponse !== null) {
                return $maintenanceResponse;
            }

            $landingResponse = $this->tryServeLanding($globals);
            if ($landingResponse !== null) {
                return $landingResponse;
            }

            $router = new Router(
                [FrameworkController::class, 'not_found_404'](...)
            );

            // Bind idempotency receipts to the IRabi-prefixed table once per request.
            // Web-only: idempotency wraps HTTP requests, not CLI commands.
            IdempotencyMiddleware::setTableClass(IdempotencyKeys::class);

            // JS-error reporter is also a web endpoint, no CLI usage.
            FwJsErrorLogController::setTableClass(JsErrors::class);

            // Services shared with CLI cron tasks (email queue, invite tokens):
            // wire them via the universal helper so both web and console boots
            // pin the table classes.
            static::wireSharedServiceTables();

            $common = [
                // Per-request DB prefix swap for parallel test workers.
                // No-op outside dev. Runs FIRST so every downstream
                // table read (auth lookups, account hydration, etc.)
                // already targets the worker-scoped tables.
                [WorkerScopeMiddleware::class, 'process'],
                [MaintenanceMiddleware::class, 'process'],
                [IrabiAuthMiddleware::class, 'authOnly'],
                // Deny gate for disabled accounts (security audit H-02): runs
                // immediately after auth, before any business/staff role check,
                // so a disabled account with a still-valid session can never
                // reach a mutating or protected route regardless of its type/
                // staff rank.
                [UserDataMiddleware::class, 'notDisabled'],
                [UserDataMiddleware::class, 'process'],
                // Idempotency comes after auth so account_id is known when the
                // key is reserved. Replays return immediately without re-running
                // the controller.
                [IdempotencyMiddleware::class, 'before'],
            ];

            $router->add(MainController::URL, MainController::class, $common);

            $router->add(ExpertPanelController::URL, ExpertPanelController::class, [
                ...$common,
                [UserDataMiddleware::class, 'expertOnly'],
            ]);

            $router->add(SlotsController::URL, SlotsController::class, $common);
            $router->add(UserProfileController::URL . '/{id}', UserProfileController::class, $common);
            $router->add(ExpertController::URL . '/{id}', ExpertController::class, $common);
            $router->add(BookingsController::URL, BookingsController::class, $common);
            $router->add(BookingsController::URL . '/{id}', BookingsController::class, $common);
            $router->add(BalanceController::URL, BalanceController::class, $common);
            $router->add(SupportController::URL, SupportController::class, $common);
            $router->add(CommentsController::URL, CommentsController::class, $common);
            $router->add(ImController::URL, ImController::class, $common);
            $router->add(NewsController::URL, NewsController::class, $common);
            $router->add(UsersController::URL, UsersController::class, $common);
            $router->add(ExternalController::URL, ExternalController::class, $common);
            // Public/no-auth chains still need WorkerScope so that test
            // requests land on the worker's tables (e.g. dev-login writes
            // sessions there, static pages read snippets from there).
            $maintenanceOnly = [
                [WorkerScopeMiddleware::class, 'process'],
                [MaintenanceMiddleware::class, 'process'],
            ];
            // JS error reporter — public endpoint, no auth (логирование клиентских ошибок).
            $router->add(FwJsErrorLogController::URL, FwJsErrorLogController::class, $maintenanceOnly);
            $router->add(SysLogController::URL, SysLogController::class, $maintenanceOnly);
            $router->add(SysOpcacheResetController::URL, SysOpcacheResetController::class, $maintenanceOnly);
            $router->add(RegisterController::URL . '/{token}', RegisterController::class, $maintenanceOnly);
            $router->add(StaticPagesController::URL . '/{view}', StaticPagesController::class, $maintenanceOnly);
            $router->add(DevLoginController::URL, DevLoginController::class, [
                [WorkerScopeMiddleware::class, 'process'],
            ]);

            $adminMiddleware = [
                ...$common,
                [UserDataMiddleware::class, 'moderatorOnly'],
            ];
            $router->add(DashboardMainController::URL, DashboardMainController::class, $adminMiddleware);
            $router->add(DashboardUsersController::URL, DashboardUsersController::class, $adminMiddleware);
            $router->add(DashboardBookingsController::URL, DashboardBookingsController::class, $adminMiddleware);
            $router->add(DashboardFinanceController::URL, DashboardFinanceController::class, $adminMiddleware);
            $router->add(DashboardBalancesController::URL, DashboardBalancesController::class, $adminMiddleware);
            $router->add(DashboardLogsController::URL, DashboardLogsController::class, $adminMiddleware);
            $router->add(DashboardCancellationsController::URL, DashboardCancellationsController::class, $adminMiddleware);
            $router->add(DashboardSupportController::URL, DashboardSupportController::class, $adminMiddleware);
            $router->add(DashboardCommentsController::URL, DashboardCommentsController::class, $adminMiddleware);
            $router->add(DashboardInviteTokensController::URL, DashboardInviteTokensController::class, $adminMiddleware);
            $router->add(DashboardEntityHistoryController::URL, DashboardEntityHistoryController::class, $adminMiddleware);
            $router->add(DashboardMailLogController::URL, DashboardMailLogController::class, $adminMiddleware);
            $router->add(DashboardRequestLogController::URL, DashboardRequestLogController::class, $adminMiddleware);
            $router->add(DashboardSystemController::URL, DashboardSystemController::class, [
                ...$common,
                [UserDataMiddleware::class, 'ownerOnly'],
            ]);
            $router->add(DashboardStaticPagesController::URL, DashboardStaticPagesController::class, [
                ...$common,
                [UserDataMiddleware::class, 'ownerOnly'],
            ]);

            $startMs = microtime(true);
            $method = $globals->httpMethod();
            $uri = $globals->getUri();
            $response = null;

            try {
                $response = $router->dispatch($globals, $uriParams);
                // Capture the controller's response into the idempotency-key
                // row that the before-middleware reserved for this request.
                // No-op when the request had no X-Idempotency-Key.
                IdempotencyMiddleware::finalize($response);
                return $response;
            } finally {
                try {
                    $this->logRouteRequest($globals, $method, $uri, $response, $startMs);
                } catch (Throwable) {
                    // never let logging break the request
                }
            }
        }

        private function logRouteRequest(
            IGlobalReqParams $globals,
            string $method,
            string $uri,
            mixed $response,
            float $startMs,
        ): void {
            // Skip static / upload paths and favicon
            $path = parse_url($uri, PHP_URL_PATH) ?: $uri;
            if (str_starts_with($path, '/assets/') || str_starts_with($path, '/upload/') || $path === '/favicon.ico') {
                return;
            }

            // Skip high-frequency background monitoring/polling endpoints — the
            // nav-badge counters are polled every 20s from every open tab and
            // would otherwise flood the request log.
            if (str_ends_with($path, '/~counts')) {
                return;
            }

            // Skip Playwright traffic — see same guard in run_web.php.
            if (($_SERVER['HTTP_X_TEST_WORKER'] ?? '') !== '') {
                return;
            }

            $status = 200;
            if ($response instanceof ResponseInterface) {
                $status = $response->getStatusCode();
            } elseif ($response === null) {
                $status = 200;
            }

            $accountId = null;
            try {
                $acc = Account::fromSession();
                if ($acc && $acc->id()) {
                    $accountId = $acc->id();
                }
            } catch (Throwable) {
                $accountId = null;
            }

            $ua = (string)($globals->readServerValue('HTTP_USER_AGENT', '') ?? '');
            if (strlen($ua) > 200) {
                $ua = substr($ua, 0, 200);
            }

            $payload = [
                'ts' => date('c'),
                'method' => $method,
                'uri' => $uri,
                'status' => $status,
                'duration_ms' => (int)round((microtime(true) - $startMs) * 1000),
                'account_id' => $accountId,
                'ip' => $globals->ip(),
                'ua' => $ua,
            ];

            $line = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            if ($line === false) {
                return;
            }

            Logger::silentGet(Logger::ROUTE_LOGGER)?->append('requests', $line);
        }

        /**
         * When ROUTE_PREFIX is active, serve a static "home" page at bare /.
         * Returns null if prefix is off, or no landing page exists.
         */
        private function tryServeLanding(IGlobalReqParams $globals): ?ResponseInterface {
            if ($globals->isPost()) {
                return null;
            }

            $rawUri = parse_url($globals->getUri(), PHP_URL_PATH) ?: '/';
            if ('/' . trim($rawUri, '/') !== '/') {
                return null;
            }

            try {
                // Public home page is shown to ALL visitors, including
                // authenticated ones. No automatic redirect to /system/ —
                // the user opens the app from a header/footer link or by
                // typing it directly. (Earlier version forced a redirect;
                // removed by request to keep "/" as a real public page.)
                $sessionAcc = Account::fromSession();
                $isLoggedIn = (bool)($sessionAcc && $sessionAcc->id());

                $page = StaticPagesService::getPublishedPageBySlug('home');
                if (!$page) {
                    return ControllerTools::notFound(FrameworkController::render404Fallback());
                }
                $isMod = $isLoggedIn && ($sessionAcc->isAdmin() || $sessionAcc->isOwner() || $sessionAcc->isModerator());
                $blocksHtml = StaticPagesService::renderBlocksToHtml($page['blocks'] ?? [], $isLoggedIn, $isMod);

                $body = StaticPagesService::renderPageBody($page, $blocksHtml);
                $content = StaticPagesService::renderPageShell($page, $body);

                $layoutParams = TwigParams::init()->get(TwigParams::DEF_LAYOUT_PARAMS, [
                    'content' => $content,
                    'top_menu_items' => [],
                    'side_menu_items' => [],
                ]);
                $layoutParams['tz_banner'] = false;
                $layoutParams['bare_main'] = true;
                $layoutParams = array_merge($layoutParams, StaticPagesService::seoLayoutParams($page));

                return ControllerTools::ok(HtmlLayout::render($layoutParams));
            } catch (Throwable) {
                return null;
            }
        }

        protected function defineBundles(): void {
            // Register route prefix before any URI parsing
            RouterUriParams::setRoutePrefix(self::ROUTE_PREFIX);

            // No-prefix paths (public scope): served at clean URLs even when
            // the rest of the app sits under /system. Register here so that
            // IRabi::url() and the URI dispatcher both see the list before
            // any route is resolved.
            RouterUriParams::registerNoPrefixPath(StaticPagesController::URL); // /page

            $this->bundles = [
                new Framework($this->workDir, $this),
                new Foreground($this->workDir, $this),
            ];
        }

        private function buildUtilityData(): ?array {
            try {
                $account = Account::fromSession();
                if (!$account || !$account->id()) {
                    return null;
                }

                $tt = ForegroundI18n::getInstance();

                $tf = FwI18n::getInstance();

                return [
                    'unreadMessages' => Common\Tables\ImReadStatus::getUnreadCountForUser($account->id()),
                    'unreadSupport' => SupportTickets::getUnreadCountForUser($account->id()),
                    'balance' => AccountBalance::getBalance($account->id()),
                    'messagesUrl' => self::url(ImController::URL),
                    'supportUrl' => self::url(SupportController::URL),
                    'balanceUrl' => self::url(BalanceController::URL),
                    'profileUrl' => self::url('/~profile'),
                    'messagesLabel' => $tt->Menu_Messages(),
                    'supportLabel' => $tt->Menu_Support(),
                    'balanceLabel' => $tt->Menu_Balance(),
                    'profileLabel' => $tf->Profile(),
                ];
            } catch (Throwable) {
                return null;
            }
        }

        private function buildSupportWidget(): string {
            try {
                $account = Account::fromSession();
                if (!$account || !$account->id()) {
                    return '';
                }

                $unreadSupport = SupportTickets::getUnreadCountForUser($account->id());
                $unreadIm = Common\Tables\ImReadStatus::getUnreadCountForUser($account->id());

                return RenderIsland::render('support-widget', [
                    'unreadCount' => $unreadSupport + $unreadIm,
                    'unreadSupport' => $unreadSupport,
                    'unreadIm' => $unreadIm,
                    'ticketsUrl' => self::url(SupportController::URL . '~tickets'),
                    'messagesUrl' => self::url(SupportController::URL . '~messages'),
                    'createUrl' => self::url(SupportController::URL . '~createTicket'),
                    'replyUrl' => self::url(SupportController::URL . '~reply'),
                    'pageUrl' => self::url(SupportController::URL),
                    'imPageUrl' => self::url(ImController::URL),
                ]);
            } catch (Throwable) {
                return '';
            }
        }

        protected function defineMigrationClass(): void {
            CMDMigration::setMigrationClass(AppMigration::class);
            CMDCron::setCronServiceClass(AppCronService::class);
            CommandClasses::set('seed', CMDSeed::class);
            CommandClasses::set('test:provision', CMDTestProvision::class);
            CommandClasses::set('test:teardown', CMDTestTeardown::class);
            CommandClasses::set('test-mode', CMDTestMode::class);
            CommandClasses::set('clear-user', CMDClearUser::class);
            CommandClasses::set('clear-logs', CMDClearLogs::class);
            CommandClasses::set('log-tail', CMDLogTail::class);
            CommandClasses::set('remote-log-tail', CMDRemoteLogTail::class);
            CommandClasses::set('remote-test-mode', CMDRemoteTestMode::class);
            CommandClasses::set('remote-clear-user', CMDRemoteClearUser::class);
            CommandClasses::set('remote-clear-logs', CMDRemoteClearLogs::class);
            CommandClasses::set('remote-cache', CMDRemoteCache::class);
            CommandClasses::set('remote-sql', CMDRemoteSql::class);
            CommandClasses::set('remote-migration', CMDRemoteMigration::class);
            CommandClasses::set('remote-migrate:status', CMDRemoteMigrateStatus::class);

            // Pin table classes for services that CLI tasks use (e.g. cron),
            // mirroring the wiring done per-request in `runWebApp`. Without
            // this, `php garnet cron` (and any other CLI entry point) throws
            // `setTableClasses() must be called before use` from the services.
            static::wireSharedServiceTables();
        }

        /**
         * Services whose table classes are needed from BOTH the web router
         * AND CLI commands. Idempotent — calling twice just re-pins the same
         * class names on the static service holders.
         */
        public static function wireSharedServiceTables(): void {
            FwInviteTokenService::setTableClasses(InviteTokens::class, InviteRegistrations::class);
            FwEmailQueueService::setTableClasses(EmailQueue::class, EmailAttempts::class);
        }

        protected function defineTwigParams(): void {
            Mailer::setInstance(new AppMailer(Mailer::get()));

            $lang = 'RU';
            FwI18n::getInstance()->setLang($lang);
            ForegroundI18n::getInstance()->setLang($lang);

            // Custom 404: render static page with slug "404" if it exists
            FrameworkController::setCustom404Handler(function ($globals, $params) {
                try {
                    $page = StaticPagesService::getPublishedPageBySlug('404');
                    if ($page) {
                        $sessionAcc = Account::fromSession();
                        $isLoggedIn = (bool)($sessionAcc && $sessionAcc->id());
                        $isMod = $isLoggedIn && ($sessionAcc->isAdmin() || $sessionAcc->isOwner() || $sessionAcc->isModerator());
                        $blocksHtml = StaticPagesService::renderBlocksToHtml($page['blocks'] ?? [], $isLoggedIn, $isMod);
                        $body = StaticPagesService::renderPageBody($page, $blocksHtml);
                    } else {
                        // No dedicated "404" page — show the default 404 body, but
                        // still wrapped in the site chrome (header + footer) borrowed
                        // from the home page so the page never looks bare.
                        $page = StaticPagesService::getPublishedPageBySlug('home') ?? [];
                        $body = StaticPagesService::renderNotFoundBody();
                    }

                    $content = StaticPagesService::renderPageShell($page, $body);

                    $layoutParams = TwigParams::init()->get(TwigParams::DEF_LAYOUT_PARAMS, [
                        'content' => $content,
                        'top_menu_items' => [],
                        'side_menu_items' => [],
                    ]);
                    $layoutParams['tz_banner'] = false;
                    $layoutParams['bare_main'] = true;

                    $html = HtmlLayout::render($layoutParams);
                    return ControllerTools::notFound($html);
                } catch (Throwable) {
                    return null;
                }
            });

            $twigParams = TwigParams::init();

            $twigParams->set(TwigParams::DEF_LAYOUT_PARAMS, function (): array {
                $appConf = AppConfig::get(IniConfig::ENV_APP);

                $sessionAccount = Account::fromSession();
                $userTimezone = $sessionAccount?->readParam('time_zone') ?? '';
                $userName = $sessionAccount?->readData('name') ?? '';

                // Site-wide SEO/OG defaults (per-page values override these;
                // HtmlLayout absolutises og_image and falls back to the favicon).
                $seo = Common\System\AppSettings::seoDefaults();
                $baseUrl = rtrim($appConf->baseUrl(), '/');
                $reqPath = parse_url((string)($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH) ?: '/';
                $currentUrl = $baseUrl . $reqPath;
                $ogLocale = strtoupper(FwI18n::getInstance()->getLang()) === 'RU' ? 'ru_RU' : 'en_US';

                return [
                    'lang' => FwI18n::getInstance()->getLang(),
                    'base_url' => $appConf->baseUrl(),
                    // SEO/OG defaults — back-fill every page; static pages override.
                    'description' => $seo['description'],
                    'og_site_name' => $appConf->paramString('title'),
                    'og_image' => $seo['ogImage'],
                    'og_url' => $currentUrl,
                    'canonical' => $currentUrl,
                    'og_locale' => $ogLocale,
                    'twitter_site' => $seo['twitterSite'],
                    'upload_dir' => $this->publicUploadWebPath,
                    'csrf' => Session::peekCSRF_(),
                    'account_id' => $sessionAccount?->id() ?? 0,
                    // Build identifier: derived from the hashed entry-bundle URLs,
                    // so it changes on every frontend build. The client compares it
                    // across SPA navigations and hard-reloads on a mismatch (avoids
                    // a stale bundle calling i18n keys that don't exist yet).
                    'build_id' => substr(md5(
                        (string)ForegroundJsGen::foreground() . '|' . (string)FrameworkJsGen::framework()
                    ), 0, 12),
                    'route_prefix' => self::ROUTE_PREFIX,
                    'user_timezone' => $userTimezone,
                    'user_name' => $userName,
                    'title' => $appConf->paramString('title'),
                    'styles_assets' => array_filter([
                        FrameworkCssGen::framework(),
                        // App-level styles (button variants, badges, calendar, etc.)
                        // built from Apps/IRabi/Front/Styles/common.less. Without
                        // this only the bare framework reset is loaded and
                        // app-specific button skins fall back to browser defaults.
                        ForegroundCssGen::common(),
                    ]),
                    'vendor_js_assets' => array_filter([
                        FrameworkJsGen::vendor_react(),
                        FrameworkJsGen::vendor_other(),
                    ]),
                    'js_assets' => array_filter([
                        FrameworkJsGen::framework(),
                        ForegroundJsGen::foreground(),
                    ]),
                    // Numbered async chunks rspack splits out — prefetched in
                    // <head> for cold-cache navigation warmup. List is baked
                    // into ForegroundJsGen at build time, zero runtime I/O.
                    'prefetch_js_assets' => ForegroundJsGen::commonChunks(),
                    'side_menu_items' => [],
                    'top_menu_items' => [],
                    'utility' => $this->buildUtilityData(),
                    'support_widget' => $this->buildSupportWidget(),
                    'counts_url' => self::url('/~counts'),
                    'support_email' => Common\System\AppSettings::supportContacts()['email'],
                    'support_contact_label' => ForegroundI18n::getInstance()->Footer_Contact(),
                ];
            });

            $twigParams->set(TwigParams::DEF_EMAIL_PARAMS, function (): array {
                $appConf = IniConfig::app();

                return [
                    'content_align' => 'left',
                    'head_align' => 'left',
                    'block_title_align' => 'left',
                    'bottom_align' => 'center',
                    'head' => $appConf->paramString('title'),
                ];
            });
        }
    }
}
