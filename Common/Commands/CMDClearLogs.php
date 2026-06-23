<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Commands {
    use Aura\Cli\Context;
    use Aura\Cli\Stdio;
    use PHPCraftdream\Garnet\Kernel\Interfaces\ICommand;
    use PHPCraftdream\IRabi\Common\Services\ClearLogsService;
    use PHPCraftdream\IRabi\Common\System\TestMode;

    /**
     * `php garnet clear-logs` — wipe all operational logs (file journals +
     * log DB tables). Financial records are not touched.
     *
     * Destructive, so it is gated behind test mode: refuses to run unless
     * `.test-mode` is present (toggle with `php garnet test-mode on`).
     */
    class CMDClearLogs implements ICommand {
        public static function description(): string {
            return 'Wipe all logs — file journals + log tables (TEST MODE ONLY)';
        }

        public static function help(array $args, Context $context, Stdio $stdio): void {
            $stdio->outln('Usage: php garnet clear-logs');
            $stdio->outln('');
            $stdio->outln('  Clears LogJournal files (Errors / System / Routes) and the log');
            $stdio->outln('  tables (mail, admin actions, cron, support assignments, entity');
            $stdio->outln('  history). Financial records (payments log) are NOT touched.');
            $stdio->outln('  Requires test mode: php garnet test-mode on');
        }

        public static function run(array $args, Context $context, Stdio $stdio): void {
            if (!TestMode::isActive()) {
                $stdio->errln('ERROR: clear-logs is available in TEST MODE only.');
                $stdio->errln('       Enable it with: php garnet test-mode on');
                exit(1);
            }

            $result = ClearLogsService::clear();

            $stdio->outln('Cleared logs:');
            ksort($result['deleted']);
            foreach ($result['deleted'] as $label => $count) {
                $stdio->outln(sprintf('  %-28s %d', $label, $count));
            }
            $stdio->outln(sprintf('  %-28s %d', '— total —', $result['total']));
        }
    }
}
