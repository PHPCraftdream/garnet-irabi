<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Commands {
    use Aura\Cli\Context;
    use Aura\Cli\Stdio;
    use PHPCraftdream\Garnet\Kernel\Db\Link\DbPool;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Io\ICommand;
    use PHPCraftdream\IRabi\Common\System\TestMode;

    /**
     * `php garnet test:hold-lock <name> <seconds>` — GET_LOCK(name), sleep,
     * RELEASE_LOCK(name). Test-only: proves cross-connection MySQL named-lock
     * exclusivity (specs\framework-bundle\email-queue-cron-lock.spec.ts).
     *
     * Exists because a MySQL GET_LOCK() is session-scoped: it only holds for
     * the lifetime of the ONE connection that acquired it. ssh-bridge.ts
     * issues each remote SQL call as its own fresh process/connection, so a
     * lock "held" via ssh-bridge is already gone by the time a LATER ssh
     * round-trip runs the cron under test. This command and the cron under
     * test must run as two processes within the SAME remote shell invocation
     * (one backgrounded) so both hold real, concurrently-open connections —
     * see the spec's remote branch for how it's invoked.
     */
    class CMDTestHoldLock implements ICommand {
        public static function description(): string {
            return 'Test-only: GET_LOCK(name), sleep N seconds, RELEASE_LOCK(name)';
        }

        public static function help(array $args, Context $context, Stdio $stdio): void {
            $stdio->outln('Usage: php garnet test:hold-lock <name> <seconds>');
            $stdio->outln('  Requires test mode ON (php garnet test-mode on).');
        }

        public static function run(array $args, Context $context, Stdio $stdio): void {
            if (!TestMode::isActive()) {
                $stdio->errln('ERROR: test mode is OFF. Run: php garnet test-mode on');
                exit(1);
            }

            $name = (string)($args[0] ?? '');
            $seconds = (int)($args[1] ?? '0');

            if ($name === '' || $seconds <= 0) {
                $stdio->errln('ERROR: <name> and <seconds> (positive) are required.');
                exit(1);
            }

            $link = DbPool::get()->newLink();
            $got = $link->query('SELECT GET_LOCK(?, 5) AS got', [$name]);
            $acquired = is_array($got) && (int)($got[0]['got'] ?? 0) === 1;

            if (!$acquired) {
                $stdio->errln("ERROR: could not acquire lock '{$name}'.");
                exit(1);
            }
            $stdio->outln("HELD lock '{$name}'");
            sleep($seconds);
            $link->query('SELECT RELEASE_LOCK(?)', [$name]);
            $stdio->outln("RELEASED lock '{$name}'");
        }
    }
}
