<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Commands {
    use Aura\Cli\Context;
    use Aura\Cli\Stdio;
    use PHPCraftdream\Garnet\Kernel\Interfaces\ICommand;
    use PHPCraftdream\IRabi\Common\Services\ClearUserService;
    use PHPCraftdream\IRabi\Common\System\TestMode;

    /**
     * `php garnet clear-user <email>` — hard-delete every trace of an account.
     *
     * Destructive and irreversible, so it is gated behind test mode: it refuses
     * to run unless `.test-mode` is present (toggle with `php garnet test-mode
     * on`). Intended for resetting a test account between QA runs.
     */
    class CMDClearUser implements ICommand {
        public static function description(): string {
            return 'Delete every record tied to a user by email (TEST MODE ONLY)';
        }

        public static function help(array $args, Context $context, Stdio $stdio): void {
            $stdio->outln('Usage: php garnet clear-user <login@email>');
            $stdio->outln('');
            $stdio->outln('  Removes bookings, slots, messages, tickets, balances, logs,');
            $stdio->outln('  news, sessions, params, uploads and the account row itself.');
            $stdio->outln('  Requires test mode: php garnet test-mode on');
        }

        public static function run(array $args, Context $context, Stdio $stdio): void {
            if (!TestMode::isActive()) {
                $stdio->errln('ERROR: clear-user is available in TEST MODE only.');
                $stdio->errln('       Enable it with: php garnet test-mode on');
                exit(1);
            }

            $email = trim((string)($args[0] ?? ''));
            if ($email === '' || !str_contains($email, '@')) {
                $stdio->errln('ERROR: a valid <login@email> argument is required.');
                self::help($args, $context, $stdio);
                exit(1);
            }

            $result = ClearUserService::clearByEmail($email);

            if (!$result['found']) {
                $stdio->outln("No account found for: {$email}");
            } else {
                $stdio->outln("Cleared account #{$result['accountId']} ({$email}):");
            }

            if (empty($result['deleted'])) {
                $stdio->outln('  nothing to delete.');
            } else {
                ksort($result['deleted']);
                foreach ($result['deleted'] as $label => $count) {
                    $stdio->outln(sprintf('  %-28s %d', $label, $count));
                }
                $stdio->outln(sprintf('  %-28s %d', '— total rows —', $result['total']));
            }
        }
    }
}
