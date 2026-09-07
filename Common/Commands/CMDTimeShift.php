<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Commands {
    use Aura\Cli\Context;
    use Aura\Cli\Stdio;
    use PHPCraftdream\Garnet\Kernel\Interfaces\ICommand;
    use PHPCraftdream\IRabi\Common\Services\TimeShiftService;
    use PHPCraftdream\IRabi\Common\System\DateUtils;
    use RuntimeException;

    /**
     * `php garnet time-shift` — двигает тестовые занятия во времени.
     *
     * Нужен, чтобы увидеть поздние фазы брони, не дожидаясь их по-настоящему:
     * напоминание за сутки приходит за сутки, и проверять его, сидя и ожидая
     * сутки, — не проверка, а простой.
     *
     * Часы не подводятся. Двигаются метки конкретных строк, и только тех, чьи
     * участники — все до одного — живут в зоне `.test`. Расписание живого
     * преподавателя и деньги его учеников не двигаются ни при каких аргументах.
     */
    class CMDTimeShift implements ICommand {
        public static function description(): string {
            return 'Сдвинуть тестовые занятия во времени (только аккаунты в зоне .test)';
        }

        public static function help(array $args, Context $context, Stdio $stdio): void {
            $stdio->outln('Usage: php garnet time-shift --by=<длительность> [--slot=<id>|--slot=all]');
            $stdio->outln('       php garnet time-shift --list');
            $stdio->outln('');
            $stdio->outln('  --by=-2h     на сколько сдвинуть: 90m, -2h, +1d, 3600 (минус — в прошлое)');
            $stdio->outln('  --slot=14    какое занятие двигать; all — все разрешённые');
            $stdio->outln('  --list       показать, что вообще разрешено двигать, и не двигать');
            $stdio->outln('');
            $stdio->outln('  Сдвиг сам по себе писем не шлёт — их отправляет крон:');
            $stdio->outln('    php garnet cron booking-reminders');
            $stdio->outln('    php garnet cron complete-expired');
            $stdio->outln('');
            $stdio->outln('  Фазы и то, что читает время: docs/booking-time-phases.md');
        }

        public static function run(array $args, Context $context, Stdio $stdio): void {
            $options = static::readOptions($args);

            if (isset($options['list'])) {
                static::printShiftable($stdio);

                return;
            }

            $by = (string)($options['by'] ?? '');

            if ($by === '') {
                $stdio->errln('<<red>>Не сказано, на сколько двигать: --by=-2h<<reset>>');
                static::help($args, $context, $stdio);

                return;
            }

            $delta = TimeShiftService::parseDuration($by);

            if ($delta === null) {
                $stdio->errln("<<red>>Не понимаю длительность «{$by}». Ожидаю 90m, -2h, +1d или секунды.<<reset>>");

                return;
            }

            if ($delta === 0) {
                $stdio->outln('Нулевой сдвиг — делать нечего.');

                return;
            }

            $slotArg = (string)($options['slot'] ?? '');

            if ($slotArg === '') {
                $stdio->errln('<<red>>Не сказано, что двигать: --slot=<id> или --slot=all<<reset>>');

                return;
            }

            $slotIds = $slotArg === 'all'
                ? TimeShiftService::shiftableSlotIds()
                : [(int)$slotArg];

            if ($slotIds === []) {
                $stdio->outln('Двигать нечего: разрешённых занятий нет.');

                return;
            }

            $moved = 0;

            foreach ($slotIds as $slotId) {
                try {
                    $result = TimeShiftService::shiftSlot($slotId, $delta);
                } catch (RuntimeException $e) {
                    // Отказ по владельцу — не сбой команды: одно занятие чужое,
                    // остальные всё равно надо подвинуть. Поэтому пишем причину
                    // и идём дальше, а не роняем весь прогон.
                    $stdio->errln("<<yellow>>слот #{$slotId}: {$e->getMessage()}<<reset>>");

                    continue;
                }

                $when = DateUtils::formatForUser($result['start_at'], 'UTC', 'Y-m-d H:i');
                $stdio->outln(
                    "<<green>>слот #{$slotId}<<reset>> → {$when} UTC"
                    . ", броней затронуто: {$result['bookings']}"
                );
                $moved += 1;
            }

            if ($moved === 0) {
                return;
            }

            $stdio->outln('');
            $stdio->outln("Сдвинуто занятий: {$moved}. Отметки о напоминаниях сброшены.");
            $stdio->outln('Письма пойдут только после крона:');
            $stdio->outln('  php garnet cron booking-reminders');
        }

        /** Что разрешено двигать — с причинами отказа для остальных. */
        private static function printShiftable(Stdio $stdio): void {
            $allowed = TimeShiftService::shiftableSlotIds();

            if ($allowed === []) {
                $stdio->outln('Разрешённых занятий нет: ни одно не принадлежит целиком зоне .test.');

                return;
            }

            $stdio->outln('Разрешено двигать:');

            foreach ($allowed as $slotId) {
                $stdio->outln("  слот #{$slotId}");
            }
        }

        /**
         * @param list<string> $args
         * @return array<string, string|bool>
         */
        private static function readOptions(array $args): array {
            $options = [];

            foreach ($args as $arg) {
                if (!str_starts_with($arg, '--')) {
                    continue;
                }

                $body = substr($arg, 2);
                $eq = strpos($body, '=');

                if ($eq === false) {
                    $options[$body] = true;

                    continue;
                }

                $options[substr($body, 0, $eq)] = substr($body, $eq + 1);
            }

            return $options;
        }
    }
}
