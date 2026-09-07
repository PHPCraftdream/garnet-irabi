<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Commands {
    use Aura\Cli\Context;
    use Aura\Cli\Stdio;
    use PHPCraftdream\Garnet\Kernel\Interfaces\ICommand;
    use PHPCraftdream\IRabi\Common\Services\CronCompletionService;
    use PHPCraftdream\IRabi\Common\Services\CronReminderService;
    use PHPCraftdream\IRabi\Common\Services\TimeShiftService;
    use PHPCraftdream\IRabi\Common\System\DateUtils;
    use PHPCraftdream\IRabi\Common\System\LessonPhase;
    use PHPCraftdream\IRabi\Common\System\TestMode;
    use PHPCraftdream\IRabi\Common\Tables\TimeSlots;
    use RuntimeException;

    /**
     * `php garnet time-shift` — переносит тестовое занятие в нужную фазу.
     *
     * Нужен, чтобы увидеть поздние фазы брони, не дожидаясь их по-настоящему:
     * напоминание за сутки приходит за сутки, и проверять его ожиданием —
     * не проверка, а простой.
     *
     * Двойной затвор. Первый — режим тестирования (`.test-mode`): без него
     * команды нет вовсе, как у `clear-user`. Второй — зона `.test` у всех
     * участников занятия: даже во включённом режиме чужое расписание не
     * двигается.
     */
    class CMDTimeShift implements ICommand {
        public static function description(): string {
            return 'Перенести тестовое занятие в нужную фазу (только в режиме тестирования)';
        }

        public static function help(array $args, Context $context, Stdio $stdio): void {
            $phases = implode(' | ', LessonPhase::names());

            $stdio->outln('Usage: php garnet time-shift --slot=<id> --to=<фаза>');
            $stdio->outln('       php garnet time-shift --slot=<id> --by=<длительность>');
            $stdio->outln('       php garnet time-shift --list');
            $stdio->outln('');
            $stdio->outln("  --to=<фаза>   куда поставить: {$phases}");
            $stdio->outln('                инструмент сам посчитает, на сколько двигать');
            $stdio->outln('  --by=-2h      сдвинуть на столько: 90m, -2h, +1d, секунды');
            $stdio->outln('  --slot=14     какое занятие; для --by допустим all');
            $stdio->outln('  --list        что разрешено двигать и где оно сейчас стоит');
            $stdio->outln('  --no-cron     не применять последствия (по умолчанию применяются)');
            $stdio->outln('');
            $stdio->outln('  Требует режима тестирования: php garnet test-mode on');
            $stdio->outln('  Фазы и то, что читает время: docs/booking-time-phases.md');
        }

        public static function run(array $args, Context $context, Stdio $stdio): void {
            if (!TestMode::isActive()) {
                $stdio->errln('ERROR: time-shift доступен только в режиме тестирования.');
                $stdio->errln('       Включить: php garnet test-mode on');
                exit(1);
            }

            $options = static::readOptions($args);

            if (isset($options['list'])) {
                static::printShiftable($stdio);

                return;
            }

            $slotArg = (string)($options['slot'] ?? '');

            if ($slotArg === '') {
                $stdio->errln('ERROR: не сказано, что двигать: --slot=<id>');
                static::help($args, $context, $stdio);

                return;
            }

            $to = (string)($options['to'] ?? '');
            $by = (string)($options['by'] ?? '');

            if (($to === '') === ($by === '')) {
                $stdio->errln('ERROR: нужен ровно один из --to=<фаза> и --by=<длительность>.');

                return;
            }

            $now = time();
            $results = $to !== ''
                ? static::runToPhase($slotArg, $to, $now, $stdio)
                : static::runByDelta($slotArg, $by, $now, $stdio);

            if ($results === []) {
                return;
            }

            static::report($results, $stdio);

            if (isset($options['no-cron'])) {
                $stdio->outln('');
                $stdio->outln('Последствия не применялись (--no-cron): фаза стоит, но крон ещё не отработал.');

                return;
            }

            static::applyConsequences(array_column($results, 'slot'), $stdio);
        }

        /**
         * @return list<array<string, mixed>>
         */
        private static function runToPhase(string $slotArg, string $to, int $now, Stdio $stdio): array {
            $phase = LessonPhase::tryFrom($to);

            if ($phase === null) {
                $names = implode(', ', LessonPhase::names());
                $stdio->errln("ERROR: нет фазы «{$to}». Есть: {$names}");

                return [];
            }

            if ($slotArg === 'all') {
                // Все занятия на один якорь — это гарантированное наложение у
                // любого преподавателя, у которого их больше одного. `all`
                // осмыслен только со сдвигом, где взаимный порядок сохраняется.
                $stdio->errln('ERROR: --slot=all работает только с --by: одна фаза для всех сразу дала бы наложение.');

                return [];
            }

            try {
                return [TimeShiftService::moveToPhase((int)$slotArg, $phase, $now)];
            } catch (RuntimeException $e) {
                $stdio->errln('ERROR: ' . $e->getMessage());

                return [];
            }
        }

        /**
         * @return list<array<string, mixed>>
         */
        private static function runByDelta(string $slotArg, string $by, int $now, Stdio $stdio): array {
            $delta = TimeShiftService::parseDuration($by);

            if ($delta === null) {
                $stdio->errln("ERROR: не понимаю длительность «{$by}». Ожидаю 90m, -2h, +1d или секунды.");

                return [];
            }

            if ($delta === 0) {
                $stdio->outln('Нулевой сдвиг — делать нечего.');

                return [];
            }

            $slotIds = $slotArg === 'all'
                ? TimeShiftService::shiftableSlotIds()
                : [(int)$slotArg];

            $results = [];

            foreach ($slotIds as $slotId) {
                try {
                    $results[] = TimeShiftService::shiftSlot($slotId, $delta, $now);
                } catch (RuntimeException $e) {
                    // Отказ по одному занятию — не сбой всей команды: остальные
                    // всё равно надо подвинуть.
                    $stdio->errln("<<yellow>>занятие #{$slotId}: {$e->getMessage()}<<reset>>");
                }
            }

            return $results;
        }

        /**
         * @param list<array<string, mixed>> $results
         */
        private static function report(array $results, Stdio $stdio): void {
            foreach ($results as $r) {
                $when = DateUtils::formatForUser((int)$r['start_at'], 'UTC', 'Y-m-d H:i');
                $cleared = $r['cleared'] === []
                    ? 'отметки сохранены'
                    : 'сняты отметки: ' . implode(', ', $r['cleared']);

                $stdio->outln(
                    "<<green>>занятие #{$r['slot']}<<reset>> {$r['from']} → {$r['to']}"
                    . ", начало {$when} UTC, броней {$r['bookings']}, {$cleared}"
                );
            }
        }

        /**
         * Последствия применяются сразу и только к названным занятиям.
         *
         * Глобальный тик отсюда был бы неправ трижды: он оставил бы в журнале
         * запись, будто это был настоящий тик; он тронул бы строки живых
         * пользователей; и он мог бы, наложившись на тик хоста, отправить
         * живому человеку второе письмо — в рассылке ученикам нет CAS.
         *
         * @param list<int> $slotIds
         */
        private static function applyConsequences(array $slotIds, Stdio $stdio): void {
            $completed = CronCompletionService::completeExpired(500, $slotIds);
            $reminders = CronReminderService::sendDue(500, $slotIds);

            $stdio->outln('');
            $stdio->outln(
                'Завершено занятий: ' . $completed['slots']
                . ', броней: ' . $completed['bookings']
                . ', отменено неподтверждённых: ' . $completed['pending_expired']
            );
            $stdio->outln(
                'Напоминаний поставлено в очередь: ученикам ' . $reminders['students']
                . ', преподавателям ' . $reminders['experts']
            );

            if ($reminders['students'] === 0 && $reminders['experts'] === 0) {
                // Иначе ноль читается как сбой инструмента, хотя чаще всего это
                // просто «некому»: без подтверждённых броней напоминать нечего.
                $stdio->outln('  (ноль — это «некому»: напоминания идут только по подтверждённым броням)');
            }

            $stdio->outln('Письма уйдут с ближайшим тиком очереди: php garnet cron email-queue');
        }

        /** Что разрешено двигать и где оно сейчас стоит. */
        private static function printShiftable(Stdio $stdio): void {
            $allowed = TimeShiftService::shiftableSlotIds();

            if ($allowed === []) {
                $stdio->outln('Разрешённых занятий нет: ни одно не принадлежит целиком зоне .test.');

                return;
            }

            $now = time();
            $stdio->outln('Разрешено двигать:');

            foreach ($allowed as $slotId) {
                $slot = TimeSlots::get()->selectById($slotId);

                if (!$slot) {
                    continue;
                }

                $phase = LessonPhase::of((int)$slot['start_at'], (int)$slot['end_at'], $now);
                $when = DateUtils::formatForUser((int)$slot['start_at'], 'UTC', 'Y-m-d H:i');
                $status = (string)($slot['status'] ?? '');

                $stdio->outln("  занятие #{$slotId}: {$phase->value}, начало {$when} UTC, статус {$status}");
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
