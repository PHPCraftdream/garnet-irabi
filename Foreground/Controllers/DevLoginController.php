<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Foreground\Controllers {
    use PHPCraftdream\Garnet\Kernel\Core\Env\Env;
    use PHPCraftdream\Garnet\Kernel\Core\FrameworkController;
    use PHPCraftdream\Garnet\Kernel\Core\Tools\StrTools;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\Account;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\DbAccount;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Session\Session;
    use PHPCraftdream\Garnet\Kernel\Db\Query\QueryEx;
    use PHPCraftdream\Garnet\Kernel\Interfaces\IGlobalReqParams;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Router\IRouterUriParams;
    use PHPCraftdream\Garnet\Kernel\Io\IniConfig\IniConfig;
    use PHPCraftdream\Garnet\Kernel\Io\Router\ControllerTools;
    use PHPCraftdream\IRabi\Common\Services\DevSeedService;
    use PHPCraftdream\IRabi\Foreground\Middlewares\IrabiAuthMiddleware;
    use PHPCraftdream\IRabi\IRabi;

    class DevLoginController extends FrameworkController {
        public const URL = '/dev-login';

        protected const VALID_ROLES = ['admin', 'owner', 'moderator', 'expert', 'user'];

        /**
         * Resolve a bundle-relative table name to its fully-qualified form
         * using the framework prefix active for THIS request. Mirrors
         * CMDSeed::prefixed() — the single source of truth for prefixing
         * raw-SQL table references so test-isolation prefix swaps are honored.
         */
        private static function prefixed(string $bundleTable): string {
            $prefix = (string)IniConfig::db()->paramString('prefix', 'db');
            return $prefix === '' ? $bundleTable : "{$prefix}_{$bundleTable}";
        }

        public static function post__main(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            // Two independent positive signals are required, mirroring
            // WorkerScopeMiddleware::isDevContext(): a stray .idea/.vscode
            // directory leaking into a prod deploy artifact must NOT be
            // enough on its own to grant this endpoint's no-password
            // admin/owner login + DB wipe (security-audit finding #1).
            if (!$globals->isDev() || !Env::isDevDir()) {
                return ControllerTools::JSON(['error' => 'Not available'], status: 403);
            }

            // Fast lane for the per-worker isolation pipeline: log in as an
            // already-registered `*.test` account (e.g. `testuser_setup_expert
            // @irabi.test`) without going through the OTP / role-mapping
            // machinery. Avoids the full UI auth flow during globalSetup —
            // saves ~1s × (workers × roles) Chromium round-trips, and lifts
            // the concurrency cap that 4 parallel browsers used to impose.
            //
            // Same dev-dir gate as the role path, plus a strict `.test` TLD
            // check so production data can never be touched through here.
            $loginParam = (string)$globals->readPostValue('login', '');
            if ($loginParam !== '') {
                $loginLower = strtolower($loginParam);
                if (!str_ends_with($loginLower, '.test')) {
                    return ControllerTools::JSON(['error' => 'Invalid login'], status: 400);
                }

                $account = Account::touchAccount($loginParam, DbAccount::LOGIN_TYPE_EMAIL);
                $account->readDataAsyncPollFinishAll();

                $session = Session::get();
                $session->setValue(IrabiAuthMiddleware::PHASE_KEY, IrabiAuthMiddleware::PHASE_DONE);
                $session->setValue(Account::SESSION_AUTH_LOGIN, $loginParam);
                $session->setValue(Account::SESSION_AUTH_LOGIN_TYPE, DbAccount::LOGIN_TYPE_EMAIL);
                // Mint the CSRF cookie inline with the auth so the response sets
                // both `session` and `CSRF_TOKEN`. The prod flow mints CSRF via
                // /<auth-page>/?action=start-session (consent gate); dev-login is
                // a UI shortcut that bypasses that gate, so without this every
                // post-login XHR (admin user detail, ledger, support, …) would
                // 403 with "CSRF token check failed".
                Session::touchCSRF_();

                return ControllerTools::JSON(['success' => true, 'login' => $loginParam]);
            }

            $role = $globals->readPostValue('role', '');

            if (!in_array($role, static::VALID_ROLES, true)) {
                return ControllerTools::JSON(['error' => 'Invalid role'], status: 400);
            }

            // Expert and user map to pre-seeded accounts so the user lands on a rich profile
            $login = match ($role) {
                'expert' => 'expert1@dev.test',
                'user' => 'user1@dev.test',
                default => $role . '@dev.test',
            };

            $account = Account::touchAccount($login, DbAccount::LOGIN_TYPE_EMAIL);
            $account->readDataAsyncPollFinishAll();

            $isNewAccount = empty($account->readParam('name'));
            if ($isNewAccount) {
                $time = time();
                $account->setParam('time_zone', 'UTC');
                $account->setParam('token16', StrTools::randomUtString(16));
                $account->setParam('token32', StrTools::randomUtString(32));
                $account->setParam('reg_time', $time);
                $account->setParam('last_auth_time', $time);
                $account->setParam('last_online_time', $time);
            }

            match ($role) {
                'admin' => (function () use ($account): void {
                    $account->setAdmin(true);
                    $account->setModerator(true);
                    $account->setApproved(true);
                })(),
                'owner' => (function () use ($account): void {
                    $account->setOwner(true);
                    $account->setModerator(true);
                    $account->setApproved(true);
                })(),
                'moderator' => (function () use ($account): void {
                    $account->setModerator(true);
                    $account->setApproved(true);
                })(),
                'expert' => (function () use ($account): void {
                    $account->setParam('type', 'expert');
                    $account->setApproved(true);
                })(),
                'user' => (function () use ($account): void {
                    $account->setParam('type', 'user');
                })(),
                default => null,
            };

            $account->flush();
            $account->readDataAsyncPollFinishAll();

            DevSeedService::seed();

            // Set fallback name after seed (seed names take priority)
            if ($isNewAccount && empty($account->readParam('name'))) {
                $account->setParam('name', 'Dev ' . ucfirst($role));
                $account->flush();
            }

            $session = Session::get();
            $session->setValue(IrabiAuthMiddleware::PHASE_KEY, IrabiAuthMiddleware::PHASE_DONE);
            $session->setValue(Account::SESSION_AUTH_LOGIN, $login);
            $session->setValue(Account::SESSION_AUTH_LOGIN_TYPE, DbAccount::LOGIN_TYPE_EMAIL);
            // Mint CSRF cookie so post-login XHRs don't 403 — see comment above.
            Session::touchCSRF_();

            // Land inside the app (dashboard under the /system prefix), not on
            // the public landing page — otherwise a dev-login looks like it
            // failed (the public `/` shows a "Войти" header for everyone).
            return ControllerTools::JSON(['success' => true, 'redirect' => IRabi::url('/')]);
        }

        public static function post__resetDb(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            // See post__main() — same two-signal gate (security-audit finding #1).
            if (!$globals->isDev() || !Env::isDevDir()) {
                return ControllerTools::JSON(['error' => 'Not available'], status: 403);
            }

            // Bundle-relative table names — the framework prefix is resolved
            // at call time via prefixed(), so a test-isolation run that swapped
            // the prefix (DB_PREFIX_OVERRIDE / X-Test-Worker) wipes the test
            // scope, never the live `db_ir_*` set. NEVER hardcode `db_ir_*` here.
            $tables = [
                'balance_ledger', 'account_balance', 'admin_action_log',
                'bookings', 'time_slots', 'expert_profiles',
                'payments', 'payments_log',
            ];

            $qx = QueryEx::get();
            $qx->ex('SET FOREIGN_KEY_CHECKS = 0');
            foreach ($tables as $table) {
                $qx->ex('TRUNCATE TABLE `' . self::prefixed($table) . '`');
            }
            $accounts = self::prefixed('accounts');
            $accountsData = self::prefixed('accounts_data');
            $qx->ex("DELETE FROM `{$accountsData}` WHERE account_id IN (SELECT id FROM `{$accounts}` WHERE login LIKE '%@%.test')");
            $qx->ex("DELETE FROM `{$accounts}` WHERE login LIKE '%@%.test'");
            $qx->ex('SET FOREIGN_KEY_CHECKS = 1');

            $session = Session::get();
            $session->unsetValue(Account::SESSION_AUTH_LOGIN);

            return ControllerTools::JSON(['success' => true]);
        }
    }
}
