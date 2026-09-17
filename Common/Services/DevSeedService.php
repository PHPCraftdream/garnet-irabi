<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Services {
    use PHPCraftdream\IRabi\Common\Services\DevSeed\DevSeedAccountsTrait;
    use PHPCraftdream\IRabi\Common\Services\DevSeed\DevSeedBookingsTrait;
    use PHPCraftdream\IRabi\Common\Services\DevSeed\DevSeedLogsTrait;
    use PHPCraftdream\IRabi\Common\Services\DevSeed\DevSeedNewsTrait;
    use PHPCraftdream\IRabi\Common\Services\DevSeed\DevSeedSlotsTrait;
    use PHPCraftdream\IRabi\Common\Services\DevSeed\DevSeedSupportTrait;
    use PHPCraftdream\IRabi\Common\Tables\AccountBalance;
    use PHPCraftdream\IRabi\Common\Tables\Bookings;

    /**
     * Seeds a rich set of dev test data (experts, users, slots, bookings). Idempotent.
     *
     * Generates ~30+ slots per expert across 90 days with varied times, durations,
     * prices, online/offline mix, and ~10% bookings in different statuses.
     */
    class DevSeedService {
        use DevSeedAccountsTrait;
        use DevSeedSlotsTrait;
        use DevSeedBookingsTrait;
        use DevSeedSupportTrait;
        use DevSeedNewsTrait;
        use DevSeedLogsTrait;

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
    }
}
