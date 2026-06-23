<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Commands {
    use Aura\Cli\Context;
    use Aura\Cli\Stdio;
    use PHPCraftdream\Garnet\Kernel\Interfaces\ICommand;
    use PHPCraftdream\IRabi\IRabi;

    /**
     * `php garnet log-tail <cat> [N]` — tail the last N entries from the
     * SYSTEM_LOGGER channel `<cat>` for today (and yesterday's file as a
     * fallback so you can read across a midnight rollover).
     *
     * Use the `fe-` prefix to read entries posted from the frontend via
     * SysLogController (e.g. `fe-auth-magic`).
     */
    class CMDLogTail implements ICommand {
        public static function description(): string {
            return 'Tail the SYSTEM_LOGGER channel for a category (auth, fe-auth-magic, …)';
        }

        public static function help(array $args, Context $context, Stdio $stdio): void {
            $stdio->outln('Usage: php garnet log-tail <cat> [N]');
            $stdio->outln('');
            $stdio->outln('  <cat>  channel name — backend writes (e.g. "auth"), or "fe-<cat>"');
            $stdio->outln('         for frontend-side entries posted to /sys/log/~log.');
            $stdio->outln('  N      number of entries to show (default 50, max 1000).');
        }

        public static function run(array $args, Context $context, Stdio $stdio): void {
            $cat = trim((string)($args[0] ?? ''));
            if ($cat === '') {
                static::help($args, $context, $stdio);
                exit(1);
            }
            $n = max(1, min(1000, (int)($args[1] ?? 50)));

            $logDir = IRabi::getInstance()->logSystemDir;
            $today = date('Y-m-d');
            $yesterday = date('Y-m-d', time() - 86400);
            $candidates = [
                $logDir . $today . DIRECTORY_SEPARATOR . 'SYSTEM_LOGGER-' . $cat . '.log',
                $logDir . $yesterday . DIRECTORY_SEPARATOR . 'SYSTEM_LOGGER-' . $cat . '.log',
            ];

            $entries = [];
            foreach ($candidates as $file) {
                if (!is_file($file)) {
                    continue;
                }
                // Entries are separated by blank lines (Logger::append writes "\n\n" after each).
                $raw = (string)file_get_contents($file);
                if ($raw === '') {
                    continue;
                }
                $blocks = preg_split("~\n{2,}~", trim($raw)) ?: [];
                foreach ($blocks as $block) {
                    $block = trim($block);
                    if ($block !== '') {
                        $entries[] = $block;
                    }
                }
            }

            if (empty($entries)) {
                $stdio->outln("(no entries for cat='{$cat}' in {$today} or {$yesterday})");
                exit(0);
            }

            $tail = array_slice($entries, -$n);
            foreach ($tail as $entry) {
                $stdio->outln($entry);
                $stdio->outln('');
            }
        }
    }
}
