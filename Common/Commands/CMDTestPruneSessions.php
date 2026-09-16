<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Commands {
    use Aura\Cli\Context;
    use Aura\Cli\Stdio;
    use PHPCraftdream\Garnet\Kernel\Interfaces\ICommand;
    use PHPCraftdream\IRabi\Common\Services\SessionRetentionService;
    use PHPCraftdream\IRabi\Common\System\TestMode;

    /**
     * `php garnet test:prune-sessions <fixedNow>` — invoke
     * SessionRetentionService::pruneSessions() with an injected clock.
     *
     * Exists only so specs\framework-bundle\session-retention-cron.spec.ts's
     * boundary-inclusive-cutoff test can run the same call remotely (via
     * runServerCommand/SSH) as locally — a raw local `php -r` always hit the
     * ORCHESTRATOR machine's own DB, not the worker-isolated scope the spec
     * seeds, under PW_PROD.
     */
    class CMDTestPruneSessions implements ICommand {
        public static function description(): string {
            return 'Test-only: SessionRetentionService::pruneSessions() with an injected clock';
        }

        public static function help(array $args, Context $context, Stdio $stdio): void {
            $stdio->outln('Usage: php garnet test:prune-sessions <fixedNowUnixTs>');
            $stdio->outln('  Requires test mode ON (php garnet test-mode on). Prints {"sessions_deleted":N,"session_data_deleted":N}.');
        }

        public static function run(array $args, Context $context, Stdio $stdio): void {
            if (!TestMode::isActive()) {
                $stdio->errln('ERROR: test mode is OFF. Run: php garnet test-mode on');
                exit(1);
            }

            $nowTs = (int)($args[0] ?? '0');

            if ($nowTs <= 0) {
                $stdio->errln('ERROR: <fixedNowUnixTs> must be a positive integer.');
                exit(1);
            }

            $result = SessionRetentionService::pruneSessions($nowTs);
            $stdio->outln(json_encode($result));
        }
    }
}
