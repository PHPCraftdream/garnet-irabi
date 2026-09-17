<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Services\DevSeed {
    use Aura\SqlQuery\Common\SelectInterface;
    use PHPCraftdream\Garnet\Kernel\Core\Tools\StrTools;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\Account;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\DbAccount;
    use PHPCraftdream\IRabi\Common\Tables\BalanceLedger;

    /**
     * Аккаунты: описания персон, создание, роли и флаги, баланс.
     *
     * Здесь же выдача прав: владелец получает IS_OWNER и IS_MODERATOR и НЕ
     * получает IS_ADMIN — на этом различии стоят проверки прав, и путаница
     * здесь проявится не ошибкой сеяния, а массовым «нет доступа» в прогоне.
     */
    trait DevSeedAccountsTrait {
        // ── Configuration ─────────────────────────────────────────────────

        private static function initConfigs(): void {
            if (!empty(static::$expertConfigs)) {
                return;
            }

            // Schedules: which time-of-day windows the expert prefers (hours, 24h).
            // Format is a string keyword resolved in pickHourForSchedule().
            static::$expertConfigs = [
                [
                    'login' => 'expert1@dev.test',
                    'name' => 'Анна Иванова',
                    'tz' => 'Europe/Moscow',
                    'spec' => 'Программирование',
                    'schedule' => 'mixed',     // morning + afternoon
                    'basePrice' => 2000,
                    'location' => 'Москва, ул. Пушкина, д. 5',
                    'meetUrl' => 'https://meet.example.com/anna-ivanova',
                ],
                [
                    'login' => 'expert2@dev.test',
                    'name' => 'Борис Смирнов',
                    'tz' => 'Europe/Moscow',
                    'spec' => 'Математика и физика',
                    'schedule' => 'afternoon',
                    'basePrice' => 1500,
                    'location' => 'Москва, ул. Гагарина, 3',
                    'meetUrl' => 'https://meet.example.com/boris-smirnov',
                ],
                [
                    'login' => 'expert3@dev.test',
                    'name' => 'Вера Козлова',
                    'tz' => 'Europe/Berlin',
                    'spec' => 'Иностранные языки',
                    'schedule' => 'mixed',
                    'basePrice' => 2500,
                    'location' => 'Berlin, Friedrichstraße 10',
                    'meetUrl' => 'https://meet.example.com/vera-kozlova',
                ],
                [
                    'login' => 'expert4@dev.test',
                    'name' => 'Дмитрий Орлов',
                    'tz' => 'Europe/Moscow',
                    'spec' => 'Психология',
                    'schedule' => 'evening',
                    'basePrice' => 3000,
                    'location' => 'Санкт-Петербург, Невский пр., 28',
                    'meetUrl' => 'https://meet.example.com/dmitry-orlov',
                ],
                [
                    'login' => 'expert5@dev.test',
                    'name' => 'Мария Петрова',
                    'tz' => 'Europe/Moscow',
                    'spec' => 'Йога и медитация',
                    'schedule' => 'morning',
                    'basePrice' => 1800,
                    'location' => 'Москва, Ленинский пр., 42',
                    'meetUrl' => 'https://meet.example.com/maria-petrova',
                ],
                [
                    'login' => 'expert6@dev.test',
                    'name' => 'Сергей Лебедев',
                    'tz' => 'Europe/Moscow',
                    'spec' => 'Финансы и инвестиции',
                    'schedule' => 'afternoon',
                    'basePrice' => 3500,
                    'location' => 'Москва, Тверская ул., 15',
                    'meetUrl' => 'https://meet.example.com/sergey-lebedev',
                ],
                [
                    'login' => 'expert7@dev.test',
                    'name' => 'Ольга Кузнецова',
                    'tz' => 'Europe/Berlin',
                    'spec' => 'Дизайн интерфейсов',
                    'schedule' => 'afternoon',
                    'basePrice' => 2500,
                    'location' => 'Санкт-Петербург, Большой пр. ПС, 88',
                    'meetUrl' => 'https://meet.example.com/olga-kuznetsova',
                ],
            ];

            static::$userConfigs = [
                ['login' => 'user1@dev.test', 'name' => 'Михаил Петров', 'tz' => 'Europe/Moscow'],
                ['login' => 'user2@dev.test', 'name' => 'Елена Сидорова', 'tz' => 'Europe/Moscow'],
                ['login' => 'user3@dev.test', 'name' => 'Алексей Новиков', 'tz' => 'Europe/Berlin'],
            ];

            static::$staffConfigs = [
                ['login' => 'admin@dev.test',     'name' => 'Главный администратор', 'tz' => 'Europe/Moscow', 'role' => 'admin'],
                ['login' => 'owner@dev.test',     'name' => 'Владелец сервиса',      'tz' => 'Europe/Moscow', 'role' => 'owner'],
                ['login' => 'moderator@dev.test', 'name' => 'Модератор поддержки',   'tz' => 'Europe/Moscow', 'role' => 'moderator'],
            ];
        }

        private static function resolveAccount(string $login): Account {
            $account = Account::touchAccount($login, DbAccount::LOGIN_TYPE_USERNAME);
            $account->readDataAsyncPollFinishAll();
            return $account;
        }

        private static function setupExpert(Account $account, string $name, string $tz, string $specialization): void {
            $time = time();
            $account->setParam('name', $name);
            $account->setParam('time_zone', $tz);
            if (empty($account->readParam('token16'))) {
                $account->setParam('token16', StrTools::randomUtString(16));
                $account->setParam('token32', StrTools::randomUtString(32));
                $account->setParam('reg_time', $time - random_int(180, 365) * 86400);
                $account->setParam('last_auth_time', $time);
                $account->setParam('last_online_time', $time - random_int(0, 3) * 86400);
            }
            $account->setParam('type', 'expert');
            $account->setApproved(true);
            $account->flush();
            $account->readDataAsyncPollFinishAll();

            // «О себе» живёт в аккаунте — там же, куда его пишет форма
            // профиля. Отдельной строки профиля преподавателя больше нет.
            $account->setParam('about', 'Опытный эксперт с многолетним стажем в области «' . $specialization . '».');
            $account->flush();
        }

        private static function setupUser(Account $account, string $name, string $tz): void {
            $account->setParam('name', $name);
            $account->setParam('time_zone', $tz);
            $account->setParam('type', 'user');
            if (empty($account->readParam('token16'))) {
                $time = time();
                $account->setParam('token16', StrTools::randomUtString(16));
                $account->setParam('token32', StrTools::randomUtString(32));
                $account->setParam('reg_time', $time - random_int(30, 180) * 86400);
                $account->setParam('last_auth_time', $time);
                $account->setParam('last_online_time', $time - random_int(0, 2) * 86400);
            }
            $account->flush();
            $account->readDataAsyncPollFinishAll();
        }

        private static function setupStaff(Account $account, string $name, string $tz, string $role): void {
            $account->setParam('name', $name);
            $account->setParam('time_zone', $tz);
            if (empty($account->readParam('token16'))) {
                $time = time();
                $account->setParam('token16', StrTools::randomUtString(16));
                $account->setParam('token32', StrTools::randomUtString(32));
                $account->setParam('reg_time', $time - random_int(180, 540) * 86400);
                $account->setParam('last_auth_time', $time);
                $account->setParam('last_online_time', $time - random_int(0, 1) * 86400);
            }

            // Apply role flags. Admin and owner are always also moderators (matches DevLoginController).
            switch ($role) {
                case 'admin':
                    $account->setAdmin(true);
                    $account->setModerator(true);
                    $account->setApproved(true);
                    break;
                case 'owner':
                    $account->setOwner(true);
                    $account->setModerator(true);
                    $account->setApproved(true);
                    break;
                case 'moderator':
                    $account->setModerator(true);
                    $account->setApproved(true);
                    break;
            }

            $account->flush();
            $account->readDataAsyncPollFinishAll();
        }

        private static function topUp(int $accountId, int $amount): void {
            BalanceLedger::addEntry($accountId, true, $amount, 'top_up', '', 0, 'Пополнение баланса');
        }

        // ── Helpers for auxiliary seeders ─────────────────────────────────

        private static function loginByAccountId(?int $accountId): string {
            if ($accountId === null || $accountId <= 0) {
                return 'guest@example.com';
            }
            $rows = DbAccount::get()->selectAll(static function (SelectInterface $q) use ($accountId): void {
                $q->cols(['login'])->where('id = ?', [$accountId])->limit(1);
            });
            if (empty($rows)) {
                return 'unknown@example.com';
            }
            return (string)$rows[0]['login'];
        }
    }
}
