<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Services {
    use Aura\SqlQuery\Common\SelectInterface;
    use PHPCraftdream\Garnet\Kernel\Core\Tools\StrTools;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\Account;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\DbAccount;
    use PHPCraftdream\IRabi\Common\Tables\AccountBalance;
    use PHPCraftdream\IRabi\Common\Tables\AdminActionLog;
    use PHPCraftdream\IRabi\Common\Tables\BalanceLedger;
    use PHPCraftdream\IRabi\Common\Tables\Bookings;
    use PHPCraftdream\IRabi\Common\Tables\Comments;
    use PHPCraftdream\IRabi\Common\Tables\ExpertCancellations;
    use PHPCraftdream\IRabi\Common\Tables\ExpertProfiles;
    use PHPCraftdream\IRabi\Common\Tables\ImAttachments;
    use PHPCraftdream\IRabi\Common\Tables\ImConversations;
    use PHPCraftdream\IRabi\Common\Tables\ImMessages;
    use PHPCraftdream\IRabi\Common\Tables\ImReadStatus;
    use PHPCraftdream\IRabi\Common\Tables\MailLog;
    use PHPCraftdream\IRabi\Common\Tables\MailLogRecipients;
    use PHPCraftdream\IRabi\Common\Tables\NewsArchived;
    use PHPCraftdream\IRabi\Common\Tables\NewsEvents;
    use PHPCraftdream\IRabi\Common\Tables\NewsReads;
    use PHPCraftdream\IRabi\Common\Tables\Payments;
    use PHPCraftdream\IRabi\Common\Tables\PaymentsLog;
    use PHPCraftdream\IRabi\Common\Tables\SupportAssignmentLog;
    use PHPCraftdream\IRabi\Common\Tables\SupportAttachments;
    use PHPCraftdream\IRabi\Common\Tables\SupportMessages;
    use PHPCraftdream\IRabi\Common\Tables\SupportTickets;
    use PHPCraftdream\IRabi\Common\Tables\TimeSlots;
    use PHPCraftdream\IRabi\Common\Tables\UserCancellations;
    use Throwable;

    /**
     * Seeds a rich set of dev test data (experts, users, slots, bookings). Idempotent.
     *
     * Generates ~30+ slots per expert across 90 days with varied times, durations,
     * prices, online/offline mix, and ~10% bookings in different statuses.
     */
    class DevSeedService {
        // ── Public entry point ─────────────────────────────────────────────

        /**
         * Threshold below which we re-generate dense slot data.
         * (~30 slots × 7 experts = ~210, so 150 leaves headroom for cancellations.)
         */
        private const DENSE_SLOT_THRESHOLD = 150;

        /** @var array<int, array{login: string, name: string, tz: string, spec: string, schedule: string, basePrice: int, location: string, meetUrl: string}> */
        private static array $expertConfigs = [];

        /** @var array<int, array{login: string, name: string, tz: string}> */
        private static array $userConfigs = [];

        /** @var array<int, array{login: string, name: string, tz: string, role: string}> */
        private static array $staffConfigs = [];

        public static function seed(): void {
            static::initConfigs();

            // Ensure all experts exist + setup
            $expertIds = [];
            foreach (static::$expertConfigs as $cfg) {
                $account = static::resolveAccount($cfg['login']);
                static::setupExpert($account, $cfg['name'], $cfg['tz'], $cfg['spec']);
                $expertIds[$cfg['login']] = (int)$account->readParam('id');
            }

            // Ensure all users exist + setup
            $userIds = [];
            foreach (static::$userConfigs as $cfg) {
                $account = static::resolveAccount($cfg['login']);
                static::setupUser($account, $cfg['name'], $cfg['tz']);
                $userIds[$cfg['login']] = (int)$account->readParam('id');
            }

            // Ensure staff accounts (admin/owner/moderator) exist + setup
            $staffIds = [];
            foreach (static::$staffConfigs as $cfg) {
                $account = static::resolveAccount($cfg['login']);
                static::setupStaff($account, $cfg['name'], $cfg['tz'], $cfg['role']);
                $staffIds[$cfg['role']] = (int)$account->readParam('id');
            }

            // Top-up user balances (if low)
            foreach ($userIds as $login => $sid) {
                $balance = AccountBalance::getBalance($sid);
                if ($balance < 5000) {
                    static::topUp($sid, 50000);
                }
            }

            // Idempotency: if we already have plenty of future slots, skip generation.
            $futureCount = static::countFutureSlots();
            if ($futureCount < static::DENSE_SLOT_THRESHOLD) {
                // Generate slots per expert based on their schedule
                $createdSlots = [];
                foreach (static::$expertConfigs as $cfg) {
                    $tid = $expertIds[$cfg['login']] ?? 0;
                    if ($tid <= 0) {
                        continue;
                    }
                    $slotIds = static::generateSlotsForExpert($tid, $cfg);
                    foreach ($slotIds as $sid) {
                        $createdSlots[] = $sid;
                    }
                }

                // Create bookings for ~10% of new slots
                static::seedBookings($createdSlots, array_values($userIds));
            }

            // Auxiliary data — every block is idempotent (skips if rows already exist).
            $expertIdList = array_values($expertIds);
            $userIdList = array_values($userIds);

            static::seedAdminActionLog($staffIds, $userIdList, $expertIdList);
            static::seedMailLog($userIdList, $expertIdList);
            static::seedSupportTickets($userIdList, $staffIds);
            static::seedNewsEvents($userIdList, $expertIdList);
            static::seedCancellations($userIdList);
            static::seedIm($userIdList, $expertIdList);
            static::seedPayments($userIdList);
            static::seedComments($userIdList, $expertIdList);
        }

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

        // ── Slot generation ───────────────────────────────────────────────

        /**
         * Generate ~30+ slots for an expert across the next 90 days.
         * Approximate cadence: 1 slot every ~3 days, with some clustering.
         *
         * @param array{login: string, name: string, tz: string, spec: string, schedule: string, basePrice: int, location: string, meetUrl: string} $cfg
         * @return list<int> created slot ids
         */
        private static function generateSlotsForExpert(int $expertId, array $cfg): array {
            $created = [];
            $base = static::daysFromNow(0);

            // Step ~2-3 days; with 90 days that yields 30-45 slots per expert.
            $day = 1;
            $counter = 0;
            while ($day <= 90) {
                $hour = static::pickHourForSchedule($cfg['schedule'], $counter);
                $minute = [0, 15, 30, 45][random_int(0, 3)];
                $startAt = $base + $day * 86400 + $hour * 3600 + $minute * 60;

                // Skip slots that would land in the past (e.g. tz quirks)
                if ($startAt <= time() + 1800) {
                    $day += random_int(2, 3);
                    continue;
                }

                [$duration, $cost] = static::pickDurationAndCost($cfg['basePrice'], $counter);
                [$isOnline, $location] = static::pickFormatAndLocation($cfg, $counter);

                $slotId = static::slot($expertId, $startAt, $duration, $cost, $isOnline, $location, 'free');
                $created[] = $slotId;

                $day += random_int(2, 3);
                $counter++;
            }

            return $created;
        }

        private static function pickHourForSchedule(string $schedule, int $counter): int {
            return match ($schedule) {
                'morning' => [8, 9, 10, 11][$counter % 4],
                'afternoon' => [12, 13, 14, 15, 16, 17][$counter % 6],
                'evening' => [18, 19, 20, 21][$counter % 4],
                default => [9, 11, 14, 16, 18, 20][$counter % 6], // mixed
            };
        }

        /** @return array{0: int, 1: int} duration_min, cost */
        private static function pickDurationAndCost(int $basePrice, int $counter): array {
            // Cycle through variants for predictable variety.
            $variants = [
                [30, max(500, (int)round($basePrice * 0.4))],
                [45, max(800, (int)round($basePrice * 0.7))],
                [60, $basePrice],
                [60, $basePrice],
                [90, (int)round($basePrice * 1.5)],
                [60, (int)round($basePrice * 1.25)],
            ];
            return $variants[$counter % count($variants)];
        }

        /**
         * @param array{login: string, name: string, tz: string, spec: string, schedule: string, basePrice: int, location: string, meetUrl: string} $cfg
         * @return array{0: bool, 1: string} isOnline, location
         */
        private static function pickFormatAndLocation(array $cfg, int $counter): array {
            // ~70% online, 30% offline — counter%10 gives stable distribution.
            $online = ($counter % 10) < 7;
            if ($online) {
                $url = $cfg['meetUrl'] . '/' . dechex($counter + 100);
                return [true, $url];
            }
            return [false, $cfg['location']];
        }

        // ── Bookings ──────────────────────────────────────────────────────

        /**
         * Book ~10% of newly created slots, distributed among users
         * with statuses: 60% confirmed, 30% pending, 10% cancelled.
         *
         * @param list<int> $slotIds
         * @param list<int> $userIds
         */
        private static function seedBookings(array $slotIds, array $userIds): void {
            if (empty($slotIds) || empty($userIds)) {
                return;
            }

            $targetCount = (int)max(1, round(count($slotIds) * 0.10));
            // Shuffle deterministically-ish via array_slice on randomized keys.
            $candidates = $slotIds;
            shuffle($candidates);
            $picked = array_slice($candidates, 0, $targetCount);

            // Preload slots (expert_id, cost) for picked ids.
            $slotsMap = [];
            $slotRows = TimeSlots::get()->selectAll(function (SelectInterface $q) use ($picked): void {
                $q->where('id IN (?)', [array_map('intval', $picked)]);
            });
            foreach ($slotRows as $sr) {
                $slotsMap[(int)$sr['id']] = $sr;
            }

            $now = time();
            $i = 0;
            foreach ($picked as $slotId) {
                $userId = $userIds[$i % count($userIds)];
                $i++;

                $slotRow = $slotsMap[(int)$slotId] ?? null;
                if ($slotRow === null) {
                    continue;
                }
                $expertId = (int)$slotRow['expert_id'];
                $cost = (int)$slotRow['cost'];

                // Status distribution: 6 confirmed, 3 pending, 1 cancelled per 10.
                $bucket = $i % 10;
                if ($bucket < 6) {
                    $status = 'confirmed';
                } elseif ($bucket < 9) {
                    $status = 'pending';
                } else {
                    $status = 'cancelled';
                }

                // For cancelled bookings, the slot remains free.
                // For active (pending/confirmed), mark slot as booked.
                $slotStatus = $status === 'cancelled' ? 'free' : 'booked';
                TimeSlots::get()->updateById(['status' => $slotStatus], $slotId);

                $bookingData = [
                    'user_id' => $userId,
                    'bookable_type' => 'time_slot',
                    'bookable_id' => $slotId,
                    'status' => $status,
                    'created_at' => $now,
                    'confirmed_at' => $status === 'confirmed' ? $now : null,
                    'cancelled_at' => $status === 'cancelled' ? $now : null,
                ];

                try {
                    $bookingId = (int)Bookings::get()->insert($bookingData);
                } catch (Throwable $e) {
                    // Unique constraint on active_dup_key may block duplicates — ignore.
                    continue;
                }

                if ($bookingId <= 0 || $cost <= 0 || $expertId <= 0) {
                    continue;
                }

                // Always book invoice + payment (so even cancelled has a history).
                BalanceLedger::addEntry($userId,   false, $cost, 'booking_invoice', 'booking', $bookingId, 'Счёт #' . $bookingId);
                BalanceLedger::addEntry($expertId, true,  $cost, 'booking_payment', 'booking', $bookingId, 'Оплата #' . $bookingId);

                if ($status === 'cancelled') {
                    // Refund: expert debited, user credited.
                    BalanceLedger::addEntry($expertId, false, $cost, 'booking_refund', 'booking', $bookingId, 'Возврат #' . $bookingId);
                    BalanceLedger::addEntry($userId,   true,  $cost, 'booking_refund', 'booking', $bookingId, 'Возврат #' . $bookingId);
                }
            }
        }

        // ── Primitive helpers ──────────────────────────────────────────────

        private static function countFutureSlots(): int {
            $rows = TimeSlots::get()->selectAll(function (SelectInterface $query): void {
                $query->cols(['id'])->where('start_at > UNIX_TIMESTAMP()');
            });
            return count($rows);
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

            $tid = (int)$account->readParam('id');
            if (!ExpertProfiles::get()->selectOneByField('account_id', $tid)) {
                ExpertProfiles::get()->insert([
                    'account_id' => $tid,
                    'display_name' => $name,
                    'bio' => 'Опытный эксперт с многолетним стажем в области «' . $specialization . '».',
                    'specialization' => $specialization,
                    'photo' => null,
                    'is_approved' => 1,
                ]);
            }
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

        private static function slot(
            int $expertId,
            int $startAt,
            int $durationMin,
            int $cost,
            bool $isOnline,
            string $location,
            string $status,
        ): int {
            return (int)TimeSlots::get()->insert([
                'expert_id' => $expertId,
                'start_at' => $startAt,
                'end_at' => $startAt + $durationMin * 60,
                'duration_min' => $durationMin,
                'cost' => $cost,
                'is_online' => $isOnline ? 1 : 0,
                'location' => $location ?: null,
                'max_users' => 1,
                'status' => $status,
                'uid' => TimeSlots::generateUid(),
                'created_at' => time(),
            ]);
        }

        private static function topUp(int $accountId, int $amount): void {
            BalanceLedger::addEntry($accountId, true, $amount, 'top_up', '', 0, 'Пополнение баланса');
        }

        private static function daysFromNow(int $days): int {
            return strtotime("today +$days days");
        }

        // ── Auxiliary seeders ─────────────────────────────────────────────

        /**
         * @param array<string,int> $staffIds  ['admin'=>id,'owner'=>id,'moderator'=>id]
         * @param list<int>         $userIds
         * @param list<int>         $expertIds
         */
        private static function seedAdminActionLog(array $staffIds, array $userIds, array $expertIds): void {
            if (count(AdminActionLog::get()->selectAll(static fn (SelectInterface $q) => $q->cols(['id'])->limit(1))) > 0) {
                return;
            }

            $actorIds = array_values(array_filter([
                $staffIds['admin'] ?? 0, $staffIds['owner'] ?? 0, $staffIds['moderator'] ?? 0,
            ]));
            if (empty($actorIds)) {
                return;
            }

            $actorLoginByRole = [
                ($staffIds['admin'] ?? 0) => 'admin@dev.test',
                ($staffIds['owner'] ?? 0) => 'owner@dev.test',
                ($staffIds['moderator'] ?? 0) => 'moderator@dev.test',
            ];

            $bookings = Bookings::get()->selectAll(static function (SelectInterface $q): void {
                $q->cols(['id'])->orderBy(['id ASC'])->limit(20);
            });
            $slots = TimeSlots::get()->selectAll(static function (SelectInterface $q): void {
                $q->cols(['id'])->orderBy(['id ASC'])->limit(20);
            });
            $bookingIds = array_map(static fn (array $r) => (int)$r['id'], $bookings);
            $slotIds = array_map(static fn (array $r) => (int)$r['id'], $slots);

            $allTargets = array_merge($userIds, $expertIds);
            if (empty($allTargets)) {
                return;
            }

            $now = time();
            $actions = [
                ['user.approve',           ['0', '1']],
                ['user.disable',           ['0', '1']],
                ['user.flag_set',          ['0', '1']],
                ['slot.delete',            ['active', 'deleted']],
                ['booking.cancel',         ['confirmed', 'cancelled']],
                ['support.assign',         ['', 'moderator@dev.test']],
                ['support.status_change',  ['open', 'in_progress']],
                ['balance.adjust',         ['0', '500']],
            ];

            for ($i = 0; $i < 40; $i++) {
                [$action, $values] = $actions[$i % count($actions)];
                $actorId = $actorIds[$i % count($actorIds)];
                $actorLogin = $actorLoginByRole[$actorId] ?? 'staff@dev.test';

                if ($action === 'slot.delete') {
                    $targetId = !empty($slotIds) ? $slotIds[$i % count($slotIds)] : 0;
                    $targetLogin = 'slot#' . $targetId;
                } elseif ($action === 'booking.cancel') {
                    $targetId = !empty($bookingIds) ? $bookingIds[$i % count($bookingIds)] : 0;
                    $targetLogin = 'booking#' . $targetId;
                } else {
                    $targetId = $allTargets[$i % count($allTargets)];
                    $targetLogin = 'account#' . $targetId;
                }

                $createdAt = $now - random_int(0, 14) * 86400 - random_int(0, 86399);

                AdminActionLog::get()->insert([
                    'actor_id' => $actorId,
                    'actor_login' => $actorLogin,
                    'target_id' => $targetId,
                    'target_login' => $targetLogin,
                    'action' => $action,
                    'old_value' => $values[0],
                    'new_value' => $values[1],
                    'created_at' => $createdAt,
                ]);
            }
        }

        /**
         * @param list<int> $userIds
         * @param list<int> $expertIds
         */
        private static function seedMailLog(array $userIds, array $expertIds): void {
            if (count(MailLog::get()->selectAll(static fn (SelectInterface $q) => $q->cols(['id'])->limit(1))) > 0) {
                return;
            }

            $allIds = array_merge($userIds, $expertIds);
            if (empty($allIds)) {
                return;
            }

            $now = time();
            $types = [
                'auth_code' => 'Код входа на сервис',
                'booking_confirmed' => 'Ваше бронирование подтверждено',
                'booking_rejected' => 'Бронирование отклонено',
                'slot_cancelled' => 'Слот отменён экспертом',
                'support_reply' => 'Новый ответ в обращении в поддержку',
                'news_digest' => 'Свежие события на платформе',
            ];
            $typeKeys = array_keys($types);

            $errorMessages = [
                'SMTP timeout: 530 5.7.0 Authentication required',
                'Connection refused (10061)',
                'Recipient address rejected: User unknown',
                'Mailbox quota exceeded',
            ];

            // ~70% sent / ~15% failed / ~10% pending / ~5% bounced
            $statusMix = array_merge(
                array_fill(0, 28, 'sent'),
                array_fill(0, 6, 'failed'),
                array_fill(0, 4, 'pending'),
                array_fill(0, 2, 'bounced'),
            );
            shuffle($statusMix);

            foreach ($statusMix as $i => $status) {
                $type = $typeKeys[$i % count($typeKeys)];
                $subject = $types[$type];

                // Authcode emails: sometimes guests (no account_id).
                $isGuest = $type === 'auth_code' && ($i % 7 === 0);
                $accountId = $isGuest ? null : $allIds[$i % count($allIds)];

                $email = $isGuest
                    ? 'guest' . $i . '@example.com'
                    : static::loginByAccountId($accountId);

                $createdAt = $now - random_int(0, 30) * 86400 - random_int(0, 86399);
                $errorLog = $status === 'failed' ? $errorMessages[$i % count($errorMessages)] : null;

                $mailLogId = (int)MailLog::get()->insert([
                    'account_id' => $accountId,
                    'recipient_email' => $email,
                    'mail_type' => $type,
                    'subject' => $subject,
                    'body_html' => '<p>' . $subject . '. Это тестовое письмо seed-данных.</p>',
                    'status' => $status,
                    'error_log' => $errorLog,
                    'created_at' => $createdAt,
                ]);

                MailLogRecipients::get()->insert([
                    'mail_log_id' => $mailLogId,
                    'account_id' => $accountId,
                    'recipient_email' => $email,
                ]);
            }
        }

        /**
         * @param list<int>          $userIds
         * @param array<string,int>  $staffIds
         */
        private static function seedSupportTickets(array $userIds, array $staffIds): void {
            if (count(SupportTickets::get()->selectAll(static fn (SelectInterface $q) => $q->cols(['id'])->limit(1))) > 0) {
                return;
            }
            if (empty($userIds)) {
                return;
            }

            $moderatorId = $staffIds['moderator'] ?? 0;
            $adminId = $staffIds['admin'] ?? 0;
            $assigneeCandidates = array_values(array_filter([$moderatorId, $adminId]));

            $statusMix = [
                ['open', 0],
                ['open', 0],
                ['open', 0],
                ['investigation', 1],
                ['investigation', 1],
                ['in_progress', 1],
                ['in_progress', 1],
                ['waiting_user', 1],
                ['waiting_support', 1],
                ['resolved', 0],
                ['resolved', 0],
                ['rejected', 0],
            ];

            $subjects = [
                'Не могу оплатить бронирование',
                'Эксперт не вышел на связь',
                'Ошибка при загрузке слота в календарь',
                'Не пришёл код подтверждения',
                'Возврат средств после отмены',
                'Не отображается история бронирований',
                'Проблема с фотографией профиля',
                'Не получается сменить часовой пояс',
                'Жалоба на поведение пользователя',
                'Уведомления приходят с задержкой',
                'Пропала запись из календаря',
                'Вопрос о комиссии платформы',
            ];

            $userMessages = [
                'Здравствуйте! Помогите, пожалуйста, разобраться с проблемой.',
                'Перепробовал всё, ничего не помогает. Прошу подсказать, что делать.',
                'Прикладываю скриншоты к обращению. Жду ответа.',
                'Уточняю детали — это происходит уже второй день подряд.',
            ];
            $staffMessages = [
                'Здравствуйте! Спасибо за обращение, мы изучаем вашу ситуацию.',
                'Передал коллегам из технической поддержки, ответим в ближайшее время.',
                'Проверьте, пожалуйста, ещё раз — мы внесли правки на стороне сервиса.',
                'Готово. Если повторится — напишите снова, мы оперативно отреагируем.',
            ];
            $internalNotes = [
                'Похоже на дубликат тикета #42 — связал с кейсом',
                'Эскалирую старшему модератору',
                'Согласовать с финансовым отделом',
            ];

            $now = time();
            $ticketCount = count($statusMix);
            for ($i = 0; $i < $ticketCount; $i++) {
                [$status, $assigned] = $statusMix[$i];
                $userId = $userIds[$i % count($userIds)];
                $assigneeId = $assigned && !empty($assigneeCandidates)
                    ? $assigneeCandidates[$i % count($assigneeCandidates)]
                    : null;

                $createdAt = $now - random_int(1, 30) * 86400 - random_int(0, 86399);
                $context = json_encode([
                    'url' => 'https://example.test/support/new',
                    'ua' => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0',
                    'viewport' => '1920x1080',
                ], JSON_UNESCAPED_UNICODE);

                $ticketId = (int)SupportTickets::get()->insert([
                    'account_id' => $userId,
                    'subject' => $subjects[$i % count($subjects)],
                    'status' => $status,
                    'assignee_id' => $assigneeId,
                    'unread_user' => $assigned ? 0 : ($i % 3 === 0 ? 1 : 0),
                    'unread_staff' => $i % 4 === 0 ? 1 : 0,
                    'context' => $context,
                    'created_at' => $createdAt,
                    'updated_at' => $createdAt + random_int(60, 86400),
                ]);

                $msgCount = random_int(1, 6);
                $msgTime = $createdAt;
                $messageIds = [];
                for ($m = 0; $m < $msgCount; $m++) {
                    $isUser = ($m % 2) === 0;
                    $isInternal = !$isUser && ($m === $msgCount - 1) && ($i % 5 === 0) ? 1 : 0;
                    $authorId = $isUser ? $userId : ($assigneeId ?? $moderatorId);
                    if ($authorId <= 0) {
                        $authorId = $userId;
                    }

                    $body = $isInternal
                        ? $internalNotes[$m % count($internalNotes)]
                        : ($isUser
                            ? $userMessages[$m % count($userMessages)]
                            : $staffMessages[$m % count($staffMessages)]);

                    $msgId = (int)SupportMessages::get()->insert([
                        'ticket_id' => $ticketId,
                        'author_id' => $authorId,
                        'body' => $body,
                        'is_internal' => $isInternal,
                        'msg_type' => $isUser ? 'user' : 'staff',
                        'created_at' => $msgTime,
                    ]);
                    $messageIds[] = $msgId;
                    $msgTime += random_int(600, 7200);
                }

                // Attach a stub file to the first message of every 4th ticket.
                if ($i % 4 === 0) {
                    SupportAttachments::get()->insert([
                        'message_id' => $messageIds[0],
                        'original_name' => 'photo.png',
                        'stored_name' => md5((string)mt_rand()) . '.png',
                        'mime_type' => 'image/png',
                        'size' => 12345,
                        'created_at' => $createdAt,
                    ]);
                }

                // Assignment log entries.
                if ($assigneeId !== null) {
                    SupportAssignmentLog::get()->insert([
                        'ticket_id' => $ticketId,
                        'actor_id' => $adminId ?: $moderatorId,
                        'from_id' => null,
                        'to_id' => $assigneeId,
                        'created_at' => $createdAt + 600,
                    ]);

                    // Reassignment for a couple of tickets.
                    if ($i % 5 === 0 && count($assigneeCandidates) > 1) {
                        $other = $assigneeCandidates[($i + 1) % count($assigneeCandidates)];
                        if ($other !== $assigneeId) {
                            SupportAssignmentLog::get()->insert([
                                'ticket_id' => $ticketId,
                                'actor_id' => $adminId ?: $moderatorId,
                                'from_id' => $assigneeId,
                                'to_id' => $other,
                                'created_at' => $createdAt + 7200,
                            ]);
                        }
                    }
                }
            }
        }

        /**
         * @param list<int> $userIds
         * @param list<int> $expertIds
         */
        private static function seedNewsEvents(array $userIds, array $expertIds): void {
            if (count(NewsEvents::get()->selectAll(static fn (SelectInterface $q) => $q->cols(['id'])->limit(1))) > 0) {
                return;
            }
            if (empty($userIds) || empty($expertIds)) {
                return;
            }

            $now = time();
            $eventIds = [];

            // Resolve display names so news links render with proper labels.
            $allIds = array_values(array_unique(array_merge($userIds, $expertIds)));
            $names = [];
            $accs = Account::getAccounts(
                selectCallback: static function (SelectInterface $q) use ($allIds): void {
                    $q->resetCols();
                    $q->cols(['id', 'name', 'login']);
                    $q->where('id IN (:ids)', ['ids' => array_map('intval', $allIds)]);
                },
            );
            foreach ($accs as $a) {
                $aid = (int)$a['id'];
                $names[$aid] = trim((string)($a['name'] ?? '')) ?: (string)($a['login'] ?? ('#' . $aid));
            }
            $nameOf = static fn (int $id): string => $names[$id] ?? ('#' . $id);

            $insert = static function (string $type, string $audienceType, ?int $audienceId, int $actorId, ?string $targetKey, array $payload, int $createdAt) use (&$eventIds): void {
                $eventIds[] = (int)NewsEvents::get()->insert([
                    'event_type' => $type,
                    'audience_type' => $audienceType,
                    'audience_id' => $audienceId,
                    'actor_id' => $actorId,
                    'target_key' => $targetKey,
                    'payload' => json_encode($payload, JSON_UNESCAPED_UNICODE),
                    'created_at' => $createdAt,
                ]);
            };

            // new_slot (broadcast) — link to REAL free future slots so the
            // "новый слот" link actually opens the booking modal instead of
            // 404-ing on a placeholder id.
            $freeSlots = TimeSlots::get()->selectAll(static function (SelectInterface $q): void {
                $q->resetCols();
                $q->cols(['id', 'expert_id', 'cost', 'start_at']);
                $q->where('status = :st', ['st' => 'free'])
                    ->where('start_at > UNIX_TIMESTAMP()')
                    ->orderBy(['start_at ASC'])
                    ->limit(20);
            });
            foreach ($freeSlots as $slot) {
                $expertId = (int)($slot['expert_id'] ?? 0);
                if ($expertId <= 0) {
                    continue;
                }
                $insert(
                    NewsService::TYPE_NEW_SLOT,
                    'broadcast',
                    null,
                    $expertId,
                    'slot:' . (int)$slot['id'],
                    [
                        'slot_id' => (int)$slot['id'],
                        'expert_id' => $expertId,
                        'name' => $nameOf($expertId),
                        'cost' => (int)($slot['cost'] ?? 0),
                    ],
                    $now - random_int(0, 14) * 86400 - random_int(0, 86399),
                );
            }

            // 10 slot_booked (personal-to-expert)
            for ($i = 0; $i < 10; $i++) {
                $expertId = $expertIds[$i % count($expertIds)];
                $userId = $userIds[$i % count($userIds)];
                $insert(
                    NewsService::TYPE_SLOT_BOOKED,
                    'personal',
                    $expertId,
                    $userId,
                    'slot:' . (2000 + $i),
                    [
                        'slot_id' => 2000 + $i,
                        'user_id' => $userId,
                        'name' => $nameOf($userId),
                    ],
                    $now - random_int(0, 14) * 86400 - random_int(0, 86399),
                );
            }

            // 5 booking_confirmed (personal-to-user)
            for ($i = 0; $i < 5; $i++) {
                $userId = $userIds[$i % count($userIds)];
                $expertId = $expertIds[$i % count($expertIds)];
                $insert(
                    NewsService::TYPE_BOOKING_CONFIRMED,
                    'personal',
                    $userId,
                    $expertId,
                    'slot:' . (3000 + $i),
                    [
                        'slot_id' => 3000 + $i,
                        'expert_id' => $expertId,
                        'name' => $nameOf($expertId),
                    ],
                    $now - random_int(0, 14) * 86400 - random_int(0, 86399),
                );
            }

            // 3 booking_rejected (personal-to-user)
            for ($i = 0; $i < 3; $i++) {
                $userId = $userIds[$i % count($userIds)];
                $expertId = $expertIds[$i % count($expertIds)];
                $insert(
                    NewsService::TYPE_BOOKING_REJECTED,
                    'personal',
                    $userId,
                    $expertId,
                    'slot:' . (3500 + $i),
                    [
                        'slot_id' => 3500 + $i,
                        'expert_id' => $expertId,
                        'name' => $nameOf($expertId),
                        'reason' => 'Не подошло время',
                    ],
                    $now - random_int(0, 14) * 86400 - random_int(0, 86399),
                );
            }

            // 5 support_reply (personal-to-user)
            for ($i = 0; $i < 5; $i++) {
                $userId = $userIds[$i % count($userIds)];
                $insert(
                    NewsService::TYPE_SUPPORT_REPLY,
                    'personal',
                    $userId,
                    1,
                    'ticket:' . (100 + $i),
                    ['ticket_id' => 100 + $i, 'subject' => 'Ответ службы поддержки'],
                    $now - random_int(0, 14) * 86400 - random_int(0, 86399),
                );
            }

            // 7 new_message (personal). NB: throttle ignored on seed.
            for ($i = 0; $i < 7; $i++) {
                $expertId = $expertIds[$i % count($expertIds)];
                $userId = $userIds[$i % count($userIds)];
                $sender = ($i % 2 === 0) ? $userId : $expertId;
                $recipient = ($i % 2 === 0) ? $expertId : $userId;
                $insert(
                    NewsService::TYPE_NEW_MESSAGE,
                    'personal',
                    $recipient,
                    $sender,
                    'msg:' . $sender . '-' . $recipient,
                    [
                        'sender_id' => $sender,
                        'name' => $nameOf($sender),
                        'preview' => 'Новое сообщение',
                    ],
                    $now - random_int(0, 14) * 86400 - random_int(0, 86399),
                );
            }

            // Reads (~30%) and Archived (~10%) for each user.
            $allUsers = array_merge($userIds, $expertIds);
            $eventCount = count($eventIds);
            $readShare = (int)round($eventCount * 0.3);
            $archiveShare = (int)round($eventCount * 0.1);

            foreach ($allUsers as $aid) {
                $shuffled = $eventIds;
                shuffle($shuffled);
                $reads = array_slice($shuffled, 0, $readShare);
                foreach ($reads as $evId) {
                    try {
                        NewsReads::get()->insert([
                            'account_id' => $aid,
                            'event_id' => $evId,
                            'read_at' => $now - random_int(0, 14 * 86400),
                        ]);
                    } catch (Throwable) {
                        // unique constraint — skip
                    }
                }
                $archives = array_slice($shuffled, $readShare, $archiveShare);
                foreach ($archives as $evId) {
                    try {
                        NewsArchived::get()->insert([
                            'account_id' => $aid,
                            'event_id' => $evId,
                            'archived_at' => $now - random_int(0, 14 * 86400),
                        ]);
                    } catch (Throwable) {
                        // unique constraint — skip
                    }
                }
            }
        }

        /**
         * @param list<int> $userIds
         */
        private static function seedCancellations(array $userIds): void {
            if (
                count(UserCancellations::get()->selectAll(static fn (SelectInterface $q) => $q->cols(['id'])->limit(1))) > 0
                || count(ExpertCancellations::get()->selectAll(static fn (SelectInterface $q) => $q->cols(['id'])->limit(1))) > 0
            ) {
                return;
            }

            // Promote a handful of confirmed bookings to "cancelled" so that the
            // user/expert cancellation tables have realistic seed volume (~14 records).
            $needed = 14;
            $existing = Bookings::get()->selectAll(static function (SelectInterface $q): void {
                $q->where('status = ?', ['cancelled']);
                $q->cols(['id']);
            });
            $deficit = $needed - count($existing);
            if ($deficit > 0) {
                $confirmed = Bookings::get()->selectAll(static function (SelectInterface $q) use ($deficit): void {
                    $q->where('status = ?', ['confirmed']);
                    $q->orderBy(['id ASC']);
                    $q->limit($deficit);
                });
                $now = time();
                foreach ($confirmed as $b) {
                    $bId = (int)$b['id'];
                    $cancelTs = $now - random_int(1, 30) * 86400;
                    Bookings::get()->updateById([
                        'status' => 'cancelled',
                        'cancelled_at' => $cancelTs,
                    ], $bId);
                }
            }

            // Find cancelled bookings (with their slots).
            $cancelled = Bookings::get()->selectAll(static function (SelectInterface $q): void {
                $q->where('status = ?', ['cancelled']);
                $q->orderBy(['id ASC']);
                $q->limit(20);
            });
            if (empty($cancelled)) {
                return;
            }

            $slotIds = array_unique(array_map(static fn (array $b) => (int)$b['bookable_id'], $cancelled));
            $slots = TimeSlots::get()->selectAll(static function (SelectInterface $q) use ($slotIds): void {
                $q->where('id IN (?)', [array_map('intval', $slotIds)]);
            });
            $slotMap = [];
            foreach ($slots as $s) {
                $slotMap[(int)$s['id']] = $s;
            }

            $userReasons = [
                'Изменились планы',
                'Заболел',
                'Конфликт расписания',
                'Не успеваю подготовиться',
            ];
            $expertReasons = [
                'Заболел',
                'Командировка',
                'Технические проблемы',
                'Семейные обстоятельства',
            ];

            $now = time();
            $userMax = 8;
            $expertMax = 6;
            $userCount = 0;
            $expertCount = 0;

            foreach ($cancelled as $i => $b) {
                $slotId = (int)$b['bookable_id'];
                $slot = $slotMap[$slotId] ?? null;
                if ($slot === null) {
                    continue;
                }
                $userId = (int)$b['user_id'];
                $expertId = (int)$slot['expert_id'];
                $bookingId = (int)$b['id'];
                $createdAt = (int)($b['cancelled_at'] ?? $b['created_at'] ?? $now);

                if ($i % 2 === 0 && $userCount < $userMax) {
                    UserCancellations::get()->insert([
                        'user_id' => $userId,
                        'booking_id' => $bookingId,
                        'slot_id' => $slotId,
                        'expert_id' => $expertId,
                        'reason' => $userReasons[$i % count($userReasons)],
                        'created_at' => $createdAt,
                        'kind' => ($i % 3 === 0 ? 'decline' : 'cancel'),
                    ]);
                    $userCount++;
                } elseif ($expertCount < $expertMax) {
                    ExpertCancellations::get()->insert([
                        'expert_id' => $expertId,
                        'slot_id' => $slotId,
                        'booking_id' => $bookingId,
                        'user_id' => $userId,
                        'reason' => $expertReasons[$i % count($expertReasons)],
                        'created_at' => $createdAt,
                        'kind' => ($i % 3 === 0 ? 'decline' : 'cancel'),
                    ]);
                    $expertCount++;
                }
            }
        }

        /**
         * @param list<int> $userIds
         * @param list<int> $expertIds
         */
        private static function seedIm(array $userIds, array $expertIds): void {
            if (count(ImConversations::get()->selectAll(static fn (SelectInterface $q) => $q->cols(['id'])->limit(1))) > 0) {
                return;
            }
            if (empty($userIds) || empty($expertIds)) {
                return;
            }

            $userPhrases = [
                'Здравствуйте! Хотел уточнить детали по слоту.',
                'Спасибо, всё понятно. До встречи!',
                'Можно перенести встречу на час позже?',
                'У меня вопрос по материалам, можно прислать?',
                'Подскажите, что лучше подготовить заранее?',
            ];
            $expertPhrases = [
                'Здравствуйте! Конечно, отвечу на ваши вопросы.',
                'Готов перенести, без проблем.',
                'Пришлите, пожалуйста, я посмотрю.',
                'Подготовьте список вопросов и кратко опишите ситуацию.',
                'Хорошо, буду на связи в указанное время.',
            ];

            $now = time();
            $convCount = 6;
            for ($i = 0; $i < $convCount; $i++) {
                $userId = $userIds[$i % count($userIds)];
                $expertId = $expertIds[$i % count($expertIds)];

                $convId = ImConversations::findOrCreate($userId, $expertId);

                $msgCount = random_int(4, 10);
                $msgTime = $now - random_int(1, 30) * 86400;
                $lastMsgId = 0;
                $msgIds = [];

                for ($m = 0; $m < $msgCount; $m++) {
                    $senderIsUser = ($m % 2) === 0;
                    $senderId = $senderIsUser ? $userId : $expertId;
                    $body = $senderIsUser
                        ? $userPhrases[$m % count($userPhrases)]
                        : $expertPhrases[$m % count($expertPhrases)];

                    $msgId = (int)ImMessages::get()->insert([
                        'conversation_id' => $convId,
                        'sender_id' => $senderId,
                        'body' => $body,
                        'created_at' => $msgTime,
                    ]);
                    $msgIds[] = $msgId;
                    $lastMsgId = $msgId;
                    $msgTime += random_int(120, 7200);
                }

                ImConversations::get()->updateByField([
                    'last_message_at' => $msgTime,
                ], 'id', $convId);

                // Attachments on 2 conversations.
                if ($i < 2) {
                    ImAttachments::get()->insert([
                        'message_id' => $msgIds[0],
                        'original_name' => 'photo.png',
                        'stored_name' => md5((string)mt_rand()) . '.png',
                        'mime_type' => 'image/png',
                        'size' => 12345,
                        'created_at' => $now,
                    ]);
                }

                // Read status: 4 conversations fully-read by both, 2 leave one side unread.
                if ($i >= 2) {
                    // Both read all messages.
                    ImReadStatus::markRead($convId, $userId, $lastMsgId);
                    ImReadStatus::markRead($convId, $expertId, $lastMsgId);
                } else {
                    // User read all, expert is behind (or vice-versa).
                    if ($i === 0) {
                        ImReadStatus::markRead($convId, $userId, $lastMsgId);
                        if (count($msgIds) > 1) {
                            ImReadStatus::markRead($convId, $expertId, $msgIds[count($msgIds) - 2]);
                        }
                    } else {
                        ImReadStatus::markRead($convId, $expertId, $lastMsgId);
                        if (count($msgIds) > 1) {
                            ImReadStatus::markRead($convId, $userId, $msgIds[count($msgIds) - 2]);
                        }
                    }
                }
            }
        }

        /**
         * @param list<int> $userIds
         */
        private static function seedPayments(array $userIds): void {
            if (count(Payments::get()->selectAll(static fn (SelectInterface $q) => $q->cols(['id'])->limit(1))) > 0) {
                return;
            }
            if (empty($userIds)) {
                return;
            }

            // ~6 success / ~2 pending / ~2 failed
            $statusMix = array_merge(
                array_fill(0, 6, 'success'),
                array_fill(0, 2, 'pending'),
                array_fill(0, 2, 'failed'),
            );
            shuffle($statusMix);

            $now = time();
            foreach ($statusMix as $i => $status) {
                $userId = $userIds[$i % count($userIds)];
                $sum = (float)(500 * (1 + $i % 5)); // 500, 1000, ..., 2500
                $commission = round($sum * 0.05, 2);
                $createdAt = $now - random_int(0, 60) * 86400 - random_int(0, 86399);
                $paidAt = $status === 'success' ? $createdAt + random_int(60, 3600) : null;

                $paymentId = (int)Payments::get()->insert([
                    'account_id' => $userId,
                    'sum' => $sum,
                    'commission' => $commission,
                    'created_at' => $createdAt,
                    'paid_at' => $paidAt,
                    'timezone' => 'Europe/Moscow',
                ]);

                $log = static function (int $offset, string $action, array $info) use ($paymentId, $createdAt): void {
                    PaymentsLog::get()->insert([
                        'payment_id' => $paymentId,
                        'timezone' => 'Europe/Moscow',
                        'created_at' => $createdAt + $offset,
                        'action' => $action,
                        'info' => json_encode($info, JSON_UNESCAPED_UNICODE),
                    ]);
                };

                $log(0,   'init',     ['amount' => $sum]);
                $log(30,  'redirect', ['gateway' => 'fake-bank']);
                if ($status === 'success') {
                    $log(120, 'webhook', ['raw' => 'PAID']);
                    $log(125, 'success', ['paid_at' => $paidAt]);
                } elseif ($status === 'failed') {
                    $log(120, 'fail', ['reason' => 'Card declined']);
                }
                // pending — no further log entries beyond redirect.
            }
        }

        /**
         * @param list<int> $userIds
         * @param list<int> $expertIds
         */
        private static function seedComments(array $userIds, array $expertIds): void {
            if (count(Comments::get()->selectAll(static fn (SelectInterface $q) => $q->cols(['id'])->limit(1))) > 0) {
                return;
            }
            if (empty($userIds) || empty($expertIds)) {
                return;
            }

            // NOTE: the schema only has body/author/entity — no rating, no parent_id chain.
            // Spec asked for ratings/replies but those columns are not present; emitting plain comments.
            $bodies = [
                'Отличный эксперт, всё разложил по полочкам. Рекомендую!',
                'Спасибо за встречу, было очень полезно.',
                'Подача материала на высоте, буду возвращаться.',
                'Профессионал своего дела, ответил на все вопросы.',
                'Понравилось, как структурно объясняет сложные вещи.',
                'Хорошее общение и реальная помощь.',
                'Слот прошёл продуктивно, спасибо!',
            ];

            $targetExperts = array_slice($expertIds, 0, 4);
            $now = time();
            $i = 0;
            foreach ($targetExperts as $expertId) {
                $count = random_int(3, 5);
                for ($k = 0; $k < $count; $k++) {
                    $authorId = $userIds[$i % count($userIds)];
                    $createdAt = $now - random_int(0, 60) * 86400 - random_int(0, 86399);
                    Comments::get()->insert([
                        'author_id' => $authorId,
                        'entity_type' => Comments::ENTITY_EXPERT,
                        'entity_id' => $expertId,
                        'body' => $bodies[$i % count($bodies)],
                        'created_at' => $createdAt,
                    ]);
                    $i++;
                }
            }
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
