<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Services {
    use Aura\SqlQuery\Common\SelectInterface;
    use PHPCraftdream\Garnet\Kernel\Core\Tools\StrTools;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\Account;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\DbAccount;
    use PHPCraftdream\IRabi\Common\Tables\AccountBalance;
    use PHPCraftdream\IRabi\Common\Tables\BalanceLedger;
    use PHPCraftdream\IRabi\Common\Tables\ExpertProfiles;
    use PHPCraftdream\IRabi\Common\Tables\TimeSlots;

    /**
     * Server-side port of the per-worker `registerSetupAccount` block in
     * `Framework/tests/helpers/isolation-setup.ts`. Creates the seven `testuser_setup_*
     * @irabi.test` role accounts that the Playwright suite logs into.
     *
     * Used by `test:provision` so the prod UI-test pipeline gets the same
     * role-bearing accounts the local isolation pipeline builds via direct
     * SQL — only here we go through the Account entity (the framework's
     * single source of truth for flags/EAV) instead of raw INSERTs, and we
     * run inside whatever DB prefix is active (pinned to `test_worker_0` by
     * the caller).
     *
     * Idempotent: every account is touched-or-created, flags re-applied,
     * balance topped up only when low, expert profile/slots inserted only
     * when missing.
     *
     * Roles mirror SETUP_ACCOUNTS in isolation-setup.ts exactly — keep the
     * two lists in lock-step when either side changes.
     */
    class TestScopeSeedService {
        /** Free future slots seeded per expert setup account. */
        private const EXPERT_SLOTS = 3;

        /** Starting balance handed to every setup account (kopecks/units). */
        private const SEED_BALANCE = 50000;

        /**
         * @var list<array{login: string, name: string, type: string, tz: string, flags: list<string>}>
         */
        private const ACCOUNTS = [
            ['login' => 'testuser_setup_admin@irabi.test',            'name' => 'Setup Admin',     'type' => 'user',   'tz' => 'UTC',           'flags' => ['IS_ADMIN', 'IS_MODERATOR']],
            ['login' => 'testuser_setup_expert@irabi.test',           'name' => 'Setup Expert',    'type' => 'expert', 'tz' => 'Europe/Moscow', 'flags' => ['IS_APPROVED']],
            ['login' => 'testuser_setup_user@irabi.test',             'name' => 'Setup User',      'type' => 'user',   'tz' => 'UTC',           'flags' => []],
            ['login' => 'testuser_setup_moderator@irabi.test',        'name' => 'Setup Moderator', 'type' => 'user',   'tz' => 'UTC',           'flags' => ['IS_MODERATOR']],
            ['login' => 'testuser_setup_owner@irabi.test',            'name' => 'Setup Owner',     'type' => 'user',   'tz' => 'UTC',           'flags' => ['IS_OWNER', 'IS_MODERATOR']],
            ['login' => 'testuser_setup_expert_moderator@irabi.test', 'name' => 'Setup Expert-Mod','type' => 'expert', 'tz' => 'Europe/Moscow', 'flags' => ['IS_APPROVED', 'IS_MODERATOR']],
            ['login' => 'testuser_setup_expert_admin@irabi.test',     'name' => 'Setup Expert-Adm','type' => 'expert', 'tz' => 'Europe/Moscow', 'flags' => ['IS_APPROVED', 'IS_ADMIN', 'IS_MODERATOR']],
        ];

        /**
         * Create / refresh every setup account in the active DB prefix.
         */
        public static function seedSetupAccounts(): void {
            foreach (self::ACCOUNTS as $cfg) {
                self::seedOne($cfg);
            }
        }

        /**
         * @param array{login: string, name: string, type: string, tz: string, flags: list<string>} $cfg
         */
        private static function seedOne(array $cfg): void {
            // login_type=email so the email-auth flow (Account::get / touchAccount
            // with 'email') resolves these as existing accounts and lets the
            // harness re-login without tripping the registration gate.
            $account = Account::touchAccount($cfg['login'], DbAccount::LOGIN_TYPE_EMAIL);
            $account->readDataAsyncPollFinishAll();

            $account->setParam('name', $cfg['name']);
            $account->setParam('time_zone', $cfg['tz']);
            $account->setParam('type', $cfg['type']);

            if (empty($account->readParam('token16'))) {
                $time = time();
                $account->setParam('token16', StrTools::randomUtString(16));
                $account->setParam('token32', StrTools::randomUtString(32));
                $account->setParam('reg_time', $time);
                $account->setParam('last_auth_time', $time);
                $account->setParam('last_online_time', $time);
            }

            foreach ($cfg['flags'] as $flag) {
                match ($flag) {
                    'IS_ADMIN' => $account->setAdmin(true),
                    'IS_OWNER' => $account->setOwner(true),
                    'IS_MODERATOR' => $account->setModerator(true),
                    'IS_APPROVED' => $account->setApproved(true),
                    default => null,
                };
            }

            $account->flush();
            $account->readDataAsyncPollFinishAll();

            $accountId = (int)$account->readParam('id');
            if ($accountId <= 0) {
                return;
            }

            // Seed a starting balance — the suite books paid slots through
            // these accounts and asserts a non-zero opening balance.
            if (AccountBalance::getBalance($accountId) < self::SEED_BALANCE) {
                BalanceLedger::addEntry($accountId, true, self::SEED_BALANCE, 'top_up', '', 0, 'Setup seed top-up');
            }

            if ($cfg['type'] === 'expert') {
                self::seedExpert($accountId, $cfg['name']);
            }
        }

        private static function seedExpert(int $accountId, string $name): void {
            if (!ExpertProfiles::get()->selectOneByField('account_id', $accountId)) {
                ExpertProfiles::get()->insert([
                    'account_id' => $accountId,
                    'display_name' => $name,
                    'bio' => 'Test expert bio',
                    'specialization' => 'Mathematics',
                    'photo' => null,
                    'is_approved' => 1,
                ]);
            }

            $futureSlots = count(TimeSlots::get()->selectAll(static function (SelectInterface $q) use ($accountId): void {
                $q->cols(['id'])
                    ->where('expert_id = ?', [$accountId])
                    ->where('start_at > UNIX_TIMESTAMP()');
            }));
            if ($futureSlots >= self::EXPERT_SLOTS) {
                return;
            }

            $now = time();
            $day = 86400;
            for ($i = 1; $i <= self::EXPERT_SLOTS; $i++) {
                $startAt = $now + $day * $i + 36000;
                TimeSlots::get()->insert([
                    'expert_id' => $accountId,
                    'start_at' => $startAt,
                    'end_at' => $startAt + 3600,
                    'duration_min' => 60,
                    'cost' => 500,
                    'is_online' => 1,
                    'location' => 'https://meet.example.com/test',
                    'max_users' => 1,
                    'status' => 'free',
                    'uid' => TimeSlots::generateUid(),
                    'created_at' => $now,
                ]);
            }
        }
    }
}
