<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Commands {
    use Aura\Cli\Context;
    use Aura\Cli\Stdio;
    use PHPCraftdream\Garnet\Kernel\Interfaces\ICommand;
    use PHPCraftdream\IRabi\Common\System\TestMode;

    /**
     * `php garnet test-mode [on|off|status]` — toggle the `.test-mode` gate.
     *
     * While ON, destructive maintenance commands (e.g. `clear-user`) are
     * unlocked. With no argument (or `status`) it just prints the current state.
     */
    class CMDTestMode implements ICommand {
        public static function description(): string {
            return 'Toggle test mode (.test-mode file) — unlocks clear-user';
        }

        public static function help(array $args, Context $context, Stdio $stdio): void {
            $stdio->outln('Usage: php garnet test-mode [on|off|status]');
            $stdio->outln('');
            $stdio->outln('  on      Create the .test-mode marker (enables clear-user).');
            $stdio->outln('  off     Remove the marker (disables clear-user).');
            $stdio->outln('  status  Show the current state (default).');
        }

        public static function run(array $args, Context $context, Stdio $stdio): void {
            $action = strtolower(trim((string)($args[0] ?? 'status')));

            switch ($action) {
                case 'on':
                    if (!TestMode::enable()) {
                        $stdio->errln('ERROR: could not create the .test-mode file.');
                        exit(1);
                    }
                    $stdio->outln('Test mode: ON  (' . TestMode::filePath() . ')');
                    break;

                case 'off':
                    if (!TestMode::disable()) {
                        $stdio->errln('ERROR: could not remove the .test-mode file.');
                        exit(1);
                    }
                    $stdio->outln('Test mode: OFF');
                    break;

                case 'status':
                    $stdio->outln('Test mode: ' . (TestMode::isActive() ? 'ON' : 'OFF'));
                    break;

                default:
                    $stdio->errln("Unknown action: {$action}");
                    self::help($args, $context, $stdio);
                    exit(1);
            }
        }
    }
}
