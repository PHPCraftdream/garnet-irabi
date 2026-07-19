<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Foreground\Middlewares {
    use PHPCraftdream\Garnet\Bundle\Modules\Auth\Middlewares\EmailAuthMiddleware;
    use PHPCraftdream\Garnet\Kernel\Core\Env\TestScope;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\Account;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Session\Session;
    use PHPCraftdream\Garnet\Kernel\Interfaces\IGlobalReqParams;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Router\IRouterUriParams;
    use PHPCraftdream\Garnet\Kernel\Io\IniConfig\IniConfig;
    use PHPCraftdream\Garnet\Kernel\Io\Logs\Logger;
    use PHPCraftdream\Garnet\Kernel\Io\Router\ControllerTools;
    use PHPCraftdream\IRabi\Common\Services\ConsentJournalService;
    use PHPCraftdream\IRabi\Common\Services\StaticPagesService;
    use Psr\Http\Message\ResponseInterface;
    use Throwable;

    class IrabiAuthMiddleware extends EmailAuthMiddleware {
        public static ?string $customTitle = null;

        protected static function renderPage(IGlobalReqParams $globals, array $applyParams = []): ResponseInterface {
            if (static::$customTitle !== null) {
                $applyParams['title'] = static::$customTitle;
            }
            // The site shell drawn by buildPageContent() already provides its
            // own header / footer plus a max-width body wrapper, so the host
            // layout's `<main class="p-4 lg:p-6">` would add an extra inset.
            // bare_main drops that — chrome reaches the viewport edges, like
            // the landing and 404 pages.
            $applyParams['bare_main'] = true;
            return parent::renderPage($globals, $applyParams);
        }

        protected static function buildPageContent(array $applyParams): string {
            return StaticPagesService::renderSiteShell(parent::buildPageContent($applyParams));
        }

        protected static function processPhaseNullPost(IGlobalReqParams $globals, IRouterUriParams $params): ResponseInterface {
            $authEmail = $globals->readPostValue('auth_email', null);
            $authEmailStr = $authEmail . '';

            $isDev = IniConfig::app()->paramString('env', 'prod') === 'dev';
            $isTestEmail = str_ends_with(strtolower($authEmailStr), '.test');

            // Auto-login for `.test` mailboxes — skips the email-code step so
            // the Playwright suite's auth helpers (loginAccount/registerAccount)
            // log in with a single POST. Enabled in local dev OR under an
            // authorized prod TestScope run (token file + matching header), so
            // the exact same suite runs against the external prod box without
            // touching real accounts: `.test` logins land in the test_worker_0
            // scope and never receive real email.
            if (($isDev || TestScope::isActive()) && $isTestEmail && mb_strlen($authEmailStr) > 5 && stripos($authEmailStr, '@') > 0) {
                // Auto-login for .test emails (dev / token-gated test scope)
                $session = Session::get();

                // Touch/create account
                Account::touchAccount($authEmailStr, 'email');

                // Set auth session
                $session->setValue(static::PHASE_KEY, static::PHASE_DONE);
                $session->setValue(Account::SESSION_AUTH_LOGIN, $authEmailStr);

                $account = Account::fromSession();
                $time = time();
                $account->setParam('last_auth_time', $time);
                $account->setParam('last_online_time', $time);

                // Persist the auth session to the DB BEFORE replying. setValue()
                // only stages changes; the normal flush happens at request
                // shutdown — which races the client's immediate next navigation
                // (it gets {success:true} and goes to /balance before the
                // session row is written, so that request reads an
                // unauthenticated session → the auth form reappears). Flushing
                // here makes the login durable the moment the client sees it.
                $session->flush();

                return ControllerTools::JSON(['success' => true], status: 200);
            }

            return parent::processPhaseNullPost($globals, $params);
        }

        /**
         * Extend the post-login hook to append consent events to the audit
         * trail (legal finding F-04). The framework's sendSuccessLogin sends
         * the "you logged in" email; right after it, this override reads the
         * consent timestamps staged in the session by processStartSession
         * (still present at this point — they are only ever read, never
         * unset, in processPhaseSentCodePost) and writes one consents row
         * per consent the user actually gave THIS login. Every repeat login
         * re-confirms the PD consent, so each produces its own audit row —
         * by design.
         *
         * Authorization must succeed even if the audit write fails, so the
         * whole thing is wrapped in try/catch(Throwable): a DB hiccup is
         * logged via the error logger but never blocks the login.
         */
        protected static function sendSuccessLogin(IGlobalReqParams $globals, string $authEmail): void {
            parent::sendSuccessLogin($globals, $authEmail);

            try {
                $session = Session::get();
                $ip = $globals->ip();
                $userAgent = (string)$globals->readServerValue('HTTP_USER_AGENT', '');

                $consentPdAt = $session->getValue('consent_pd_at', '');
                $consentMarketingAt = $session->getValue('consent_marketing_at', '');

                if ($consentPdAt === '' && $consentMarketingAt === '') {
                    return;
                }

                $accountId = Account::touchAccount($authEmail, 'email')->id();

                if ($consentPdAt !== '') {
                    ConsentJournalService::record(
                        $accountId,
                        ConsentJournalService::TYPE_PERSONAL_DATA,
                        ConsentJournalService::ACTION_GIVEN,
                        $ip,
                        $userAgent,
                    );
                }

                if ($consentMarketingAt !== '') {
                    ConsentJournalService::record(
                        $accountId,
                        ConsentJournalService::TYPE_MARKETING,
                        ConsentJournalService::ACTION_GIVEN,
                        $ip,
                        $userAgent,
                    );
                }
            } catch (Throwable $e) {
                try {
                    Logger::get(Logger::ERROR_LOGGER)->write('consent_journal', $e->getMessage());
                } catch (Throwable) {
                    // Logger unavailable — nothing more to do; never break login.
                }
            }
        }
    }
}
