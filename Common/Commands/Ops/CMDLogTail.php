<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Commands\Ops {
    use Aura\Cli\Context;
    use Aura\Cli\Stdio;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Io\ICommand;
    use PHPCraftdream\Garnet\Kernel\Io\Services\Logs\Logger;
    use PHPCraftdream\IRabi\IRabi;

    /**
     * `php garnet log-tail <cat> [N] [--channel=NAME]` — показать последние N
     * записей категории `<cat>` за сегодня (и за вчера, чтобы полночь не
     * прятала свежее).
     *
     * Каналов у логгера несколько, и живут они в РАЗНЫХ каталогах
     * (BaseAppInit: logSystemDir / logErrorDir / logRouteDir). Раньше эта
     * команда знала только SYSTEM_LOGGER, поэтому всё, что пишется в
     * ERROR_LOGGER, было для неё невидимо — а это как раз то, ради чего в лог
     * и смотрят: `balance_recalc_failed` (провал пересчёта баланса),
     * `account_lock_release` (лок украли или не отпустили), `run_controller`,
     * `Exception`. Читать их приходилось `ssh` + `cat` по маске.
     *
     * Имена файлов у каналов тоже разные, и это следствие двух способов
     * записи в Logger:
     *   - `append()` → `<КАНАЛ>-<cat>.log`, записи через пустую строку;
     *   - `write()`  → `<КАНАЛ>-<cat>-<md5(cat+сообщение)>.log`, ОДИН файл на
     *     уникальное сообщение (повторное write() того же текста не делает
     *     ничего — это и есть дедупликация).
     * Поэтому читаем оба вида: точное имя и маску с хешем.
     *
     * Use the `fe-` prefix to read entries posted from the frontend via
     * SysLogController (e.g. `fe-auth-magic`).
     */
    class CMDLogTail implements ICommand {
        /** Канал → каталог: у каждого канала свой корень. */
        public const CHANNELS = [
            Logger::SYSTEM_LOGGER => 'logSystemDir',
            Logger::ERROR_LOGGER => 'logErrorDir',
            Logger::ROUTE_LOGGER => 'logRouteDir',
        ];

        public static function description(): string {
            return 'Tail a logger channel for a category (auth, fe-auth-magic, balance_recalc_failed, …)';
        }

        public static function help(array $args, Context $context, Stdio $stdio): void {
            $stdio->outln('Usage: php garnet log-tail <cat> [N] [--channel=NAME]');
            $stdio->outln('');
            $stdio->outln('  <cat>       channel name — backend writes (e.g. "auth"), or "fe-<cat>"');
            $stdio->outln('              for frontend-side entries posted to /sys/log/~log.');
            $stdio->outln('  N           number of entries to show (default 50, max 1000).');
            $stdio->outln('  --channel=  ' . implode(' | ', array_keys(self::CHANNELS))
                . ' (default ' . Logger::SYSTEM_LOGGER . ').');
            $stdio->outln('');
            $stdio->outln('  Without <cat>: lists the categories present today/yesterday in that channel.');
        }

        public static function run(array $args, Context $context, Stdio $stdio): void {
            $channel = Logger::SYSTEM_LOGGER;
            $positional = [];

            foreach ($args as $arg) {
                $arg = (string)$arg;

                if (str_starts_with($arg, '--channel=')) {
                    $channel = strtoupper(substr($arg, 10));

                    continue;
                }
                $positional[] = $arg;
            }

            if (!isset(self::CHANNELS[$channel])) {
                $stdio->errln("ERROR: unknown channel '{$channel}'. Known: " . implode(', ', array_keys(self::CHANNELS)));
                exit(1);
            }

            $logDir = (string)IRabi::getInstance()->{self::CHANNELS[$channel]};
            $days = [date('Y-m-d'), date('Y-m-d', time() - 86400)];
            $cat = trim((string)($positional[0] ?? ''));

            // Без категории команда перестаёт быть угадайкой: печатаем, что
            // в этом канале вообще есть за сегодня и вчера.
            if ($cat === '') {
                static::listCategories($logDir, $channel, $days, $stdio);
                exit(0);
            }
            $n = max(1, min(1000, (int)($positional[1] ?? 50)));

            $entries = [];

            foreach ($days as $day) {
                foreach (static::filesFor($logDir, $channel, $cat, $day) as $file) {
                    $raw = trim((string)file_get_contents($file));

                    if ($raw === '') {
                        continue;
                    }
                    // append() разделяет записи пустой строкой; у write() в
                    // файле одна запись, и разбиение её не портит.
                    foreach (preg_split("~\n{2,}~", $raw) ?: [] as $block) {
                        $block = trim($block);

                        if ($block !== '') {
                            $entries[] = $block;
                        }
                    }
                }
            }

            if (empty($entries)) {
                $stdio->outln("(no entries for cat='{$cat}' in {$channel} for {$days[0]} or {$days[1]})");
                exit(0);
            }
            // Записи из разных файлов одного дня сами по себе не упорядочены
            // (имя файла у write() — хеш), а начинаются со «Y-m-d H:i:s: ».
            sort($entries);

            foreach (array_slice($entries, -$n) as $entry) {
                $stdio->outln($entry);
                $stdio->outln('');
            }
        }

        /**
         * Файлы категории за день: точное имя (append) и хешированные (write).
         *
         * @return list<string>
         */
        public static function filesFor(string $logDir, string $channel, string $cat, string $day): array {
            $dir = rtrim($logDir, '/\\') . DIRECTORY_SEPARATOR . $day . DIRECTORY_SEPARATOR;
            $exact = $dir . $channel . '-' . $cat . '.log';
            $found = is_file($exact) ? [$exact] : [];

            foreach (glob($dir . $channel . '-' . $cat . '-*.log') ?: [] as $file) {
                $found[] = $file;
            }

            return $found;
        }

        /** @param list<string> $days */
        private static function listCategories(string $logDir, string $channel, array $days, Stdio $stdio): void {
            $cats = [];

            foreach ($days as $day) {
                $dir = rtrim($logDir, '/\\') . DIRECTORY_SEPARATOR . $day . DIRECTORY_SEPARATOR;

                foreach (glob($dir . $channel . '-*.log') ?: [] as $file) {
                    $name = substr(basename($file, '.log'), strlen($channel) + 1);
                    // Отрезаем хеш write(): 32 hex-символа после последнего дефиса.
                    $cat = preg_replace('~-[0-9a-f]{32}$~', '', $name) ?? $name;
                    $cats[$cat] = ($cats[$cat] ?? 0) + 1;
                }
            }

            if (empty($cats)) {
                $stdio->outln("({$channel}: no entries for {$days[0]} or {$days[1]})");

                return;
            }
            ksort($cats);
            $stdio->outln("{$channel} — categories for {$days[0]} / {$days[1]}:");

            foreach ($cats as $cat => $files) {
                $stdio->outln(sprintf('  %-40s %d file(s)', $cat, $files));
            }
            $stdio->outln('');
            $stdio->outln("Read one: php garnet log-tail <cat> --channel={$channel}");
        }
    }
}
