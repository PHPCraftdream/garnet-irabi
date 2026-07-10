<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Commands {
    use Aura\Cli\Context;
    use Aura\Cli\Stdio;
    use PHPCraftdream\Garnet\Kernel\Core\Benchmark\BenchmarkLog;
    use PHPCraftdream\Garnet\Kernel\Core\Env\Env;
    use PHPCraftdream\Garnet\Kernel\Db\Query\QueryEx;
    use PHPCraftdream\Garnet\Kernel\Interfaces\ICommand;
    use PHPCraftdream\Garnet\Kernel\Io\IniConfig\IniConfig;
    use PHPCraftdream\IRabi\Common\Services\DevSeedService;

    /**
     * `php garnet seed` — wipe app data + repopulate dev DB with experts/users/slots/bookings.
     * Dev environment only. Without --force prompts for confirmation.
     *
     * Tables are listed by their bundle-relative names (without the `db_`
     * framework prefix) so test-isolation runs that override the prefix
     * via DB_PREFIX_OVERRIDE land their TRUNCATE on the worker's tables,
     * not the live `db_*` set.
     */
    class CMDSeed implements ICommand {
        private const TABLES = [
            'balance_ledger',
            'account_balance',
            'admin_action_log',
            'bookings',
            'time_slots',
            'expert_profiles',
            'payments',
            'payments_log',
            'expert_cancellations',
            'user_cancellations',
            'support_tickets',
            'support_messages',
            'support_assignment_log',
            'support_attachments',
            'im_conversations',
            'im_messages',
            'im_attachments',
            'im_read_status',
            'comments',
            'news_events',
            'news_reads',
            'news_archived',
            'mail_log',
            'mail_log_recipients',
            'email_queue',
            'email_attempts',
        ];

        private static function prefixed(string $bundleTable): string {
            $prefix = (string)IniConfig::db()->paramString('prefix', 'db');
            return $prefix === '' ? $bundleTable : "{$prefix}_{$bundleTable}";
        }

        public static function description(): string {
            return 'Wipe + repopulate dev DB with seed data (dev only)';
        }

        public static function help(array $args, Context $context, Stdio $stdio): void {
            $stdio->outln('Usage: php garnet seed [--force]');
            $stdio->outln('');
            $stdio->outln('  Truncates app data tables and removes *@*.test accounts,');
            $stdio->outln('  then repopulates with experts/users/slots/bookings.');
            $stdio->outln('  Without --force prompts for confirmation.');
        }

        public static function run(array $args, Context $context, Stdio $stdio): void {
            if (!Env::isDevDir()) {
                $stdio->errln('ERROR: seed can only run in a development environment.');
                exit(1);
            }

            $force = in_array('--force', $args, true);

            if (!$force) {
                $stdio->out("This will DELETE ALL APP DATA and re-seed. Type 'yes' to continue: ");
                $answer = trim((string)fgets(STDIN));
                if ($answer !== 'yes') {
                    $stdio->outln('Aborted.');
                    exit(0);
                }
            }

            BenchmarkLog::init('seed');

            $stdio->outln('Clearing app data...');

            $qx = QueryEx::get();
            $qx->ex('SET FOREIGN_KEY_CHECKS = 0');
            foreach (self::TABLES as $bundleTable) {
                $qx->ex('TRUNCATE TABLE `' . self::prefixed($bundleTable) . '`');
            }
            $accounts = self::prefixed('accounts');
            $accountsData = self::prefixed('accounts_data');
            $qx->ex("DELETE FROM `{$accountsData}` WHERE account_id IN (SELECT id FROM `{$accounts}` WHERE login LIKE '%@%.test')");
            $qx->ex("DELETE FROM `{$accounts}` WHERE login LIKE '%@%.test'");
            $qx->ex('SET FOREIGN_KEY_CHECKS = 1');

            $stdio->outln('Seeding...');
            DevSeedService::seed();

            $stdio->outln('Done.');
        }
    }
}
