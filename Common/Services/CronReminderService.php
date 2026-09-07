<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Services;

use Aura\SqlQuery\Common\SelectInterface;
use PHPCraftdream\IRabi\Common\Tables\Bookings;
use PHPCraftdream\IRabi\Common\Tables\TimeSlots;

/**
 * Напоминания о занятии — за сутки и за два часа до начала.
 *
 * Ученику пишем по каждой его подтверждённой брони, преподавателю — по слоту
 * целиком: записавшихся может быть несколько, а занятие у него одно.
 *
 * Отметки об отправке лежат в колонках (`reminded_1d_at`, `reminded_2h_at`) у
 * брони и у слота соответственно. Помечаем ДО отправки: письмо кладётся в
 * очередь, у которой свои повторы, и повторно разослать уже поставленное в
 * очередь хуже, чем в редком случае потерять одно напоминание — человек,
 * получивший одно и то же письмо трижды, перестаёт читать все письма разом.
 */
class CronReminderService {
    /** За сколько до начала шлём напоминания. Порядок важен: от дальнего к ближнему. */
    private const LEADS = [
        '1d' => ['column' => 'reminded_1d_at', 'seconds' => 86400],
        '2h' => ['column' => 'reminded_2h_at', 'seconds' => 7200],
    ];

    /**
     * Окно, в котором напоминание ещё уместно отправить.
     *
     * Крон может не отработать вовремя (хост лежал, задача упала), и тогда
     * занятие окажется ближе, чем срок напоминания. Слать суточное за десять
     * минут до начала бессмысленно и выглядит поломкой, поэтому у каждого
     * срока есть нижняя граница: суточное отправляется, пока до занятия
     * больше двух часов, двухчасовое — пока занятие не началось.
     */
    private const FLOOR = ['1d' => 7200, '2h' => 0];

    /**
     * @return array{students: int, experts: int}
     */
    public static function sendDue(int $limit = 500): array {
        $stats = ['students' => 0, 'experts' => 0];
        $now = time();

        foreach (self::LEADS as $lead => $cfg) {
            $until = $now + $cfg['seconds'];
            $floor = $now + self::FLOOR[$lead];

            $slots = TimeSlots::get()->selectAll(
                static function (SelectInterface $q) use ($until, $floor, $limit): void {
                    $q->where('start_at > ?', [$floor])
                        ->where('start_at <= ?', [$until])
                        ->where("status NOT IN ('cancelled', 'completed')")
                        ->limit($limit);
                }
            );

            foreach ($slots as $slot) {
                $stats['students'] += self::remindStudents($slot, $lead, $cfg['column'], $now);
                $stats['experts'] += self::remindExpert($slot, $lead, $cfg['column'], $now);
            }
        }

        return $stats;
    }

    /**
     * @param array<string, mixed> $slot
     */
    private static function remindStudents(array $slot, string $lead, string $column, int $now): int {
        $slotId = (int)$slot['id'];

        $bookings = Bookings::get()->selectAll(
            static function (SelectInterface $q) use ($slotId, $column): void {
                $q->where("status = 'confirmed'")
                    ->where("bookable_type = 'time_slot'")
                    ->where('bookable_id = ?', [$slotId])
                    ->where("{$column} IS NULL");
            }
        );

        $sent = 0;

        foreach ($bookings as $booking) {
            Bookings::get()->updateById([$column => $now], (int)$booking['id']);

            EmailNotifications::bookingReminder(
                (int)$booking['user_id'],
                (int)$slot['start_at'],
                (int)($slot['duration_min'] ?? 0),
                (int)($slot['expert_id'] ?? 0),
                $lead,
            );
            $sent++;
        }

        return $sent;
    }

    /**
     * @param array<string, mixed> $slot
     */
    private static function remindExpert(array $slot, string $lead, string $column, int $now): int {
        if (!empty($slot[$column]) || empty($slot['expert_id'])) {
            return 0;
        }
        $slotId = (int)$slot['id'];

        $bookings = Bookings::get()->selectAll(
            static function (SelectInterface $q) use ($slotId): void {
                $q->where("status = 'confirmed'")
                    ->where("bookable_type = 'time_slot'")
                    ->where('bookable_id = ?', [$slotId]);
            }
        );

        // Никто не записался — напоминать преподавателю не о чем. Отметку при
        // этом не ставим: если человек запишется позже, но до занятия, письмо
        // всё ещё должно уйти.
        if (empty($bookings)) {
            return 0;
        }
        TimeSlots::get()->updateById([$column => $now], $slotId);

        $names = [];

        foreach ($bookings as $booking) {
            $names[] = EmailNotifications::accountDisplayName((int)$booking['user_id']);
        }

        EmailNotifications::slotReminder(
            (int)$slot['expert_id'],
            (int)$slot['start_at'],
            (int)($slot['duration_min'] ?? 0),
            $lead,
            implode(', ', array_filter($names)),
        );

        return 1;
    }
}
