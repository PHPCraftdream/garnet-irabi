<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Services\DevSeed {
    use Aura\SqlQuery\Common\SelectInterface;
    use PHPCraftdream\IRabi\Common\Tables\TimeSlots;

    /**
     * Слоты: расписание эксперта, время, длительность, цена, формат.
     *
     * Разнообразие здесь не украшение: на однородных данных не видно ни
     * плотных дней, ни пустых недель, а именно они ломали календарь.
     */
    trait DevSeedSlotsTrait {
        // ── Slot generation ───────────────────────────────────────────────

        /**
         * Generate ~30+ slots for an expert across the next 90 days.
         * Approximate cadence: 1 slot every ~3 days, with some clustering.
         *
         * @param array{login: string, name: string, tz: string, spec: string, schedule: string, basePrice: int, location: string, meetUrl: string} $cfg
         * @return list<int> created slot ids
         */
        private static function generateSlotsForExpert(int $expertId, array $cfg): array {
            $created = [];
            $base = static::daysFromNow(0);

            // Step ~2-3 days; with 90 days that yields 30-45 slots per expert.
            $day = 1;
            $counter = 0;
            while ($day <= 90) {
                $hour = static::pickHourForSchedule($cfg['schedule'], $counter);
                $minute = [0, 15, 30, 45][random_int(0, 3)];
                $startAt = $base + $day * 86400 + $hour * 3600 + $minute * 60;

                // Skip slots that would land in the past (e.g. tz quirks)
                if ($startAt <= time() + 1800) {
                    $day += random_int(2, 3);
                    continue;
                }

                [$duration, $cost] = static::pickDurationAndCost($cfg['basePrice'], $counter);
                [$isOnline, $location] = static::pickFormatAndLocation($cfg, $counter);

                $slotId = static::slot($expertId, $startAt, $duration, $cost, $isOnline, $location, 'free');
                $created[] = $slotId;

                $day += random_int(2, 3);
                $counter++;
            }

            return $created;
        }

        private static function pickHourForSchedule(string $schedule, int $counter): int {
            return match ($schedule) {
                'morning' => [8, 9, 10, 11][$counter % 4],
                'afternoon' => [12, 13, 14, 15, 16, 17][$counter % 6],
                'evening' => [18, 19, 20, 21][$counter % 4],
                default => [9, 11, 14, 16, 18, 20][$counter % 6], // mixed
            };
        }

        /** @return array{0: int, 1: int} duration_min, cost */
        private static function pickDurationAndCost(int $basePrice, int $counter): array {
            // Cycle through variants for predictable variety.
            $variants = [
                [30, max(500, (int)round($basePrice * 0.4))],
                [45, max(800, (int)round($basePrice * 0.7))],
                [60, $basePrice],
                [60, $basePrice],
                [90, (int)round($basePrice * 1.5)],
                [60, (int)round($basePrice * 1.25)],
            ];
            return $variants[$counter % count($variants)];
        }

        /**
         * @param array{login: string, name: string, tz: string, spec: string, schedule: string, basePrice: int, location: string, meetUrl: string} $cfg
         * @return array{0: bool, 1: string} isOnline, location
         */
        private static function pickFormatAndLocation(array $cfg, int $counter): array {
            // ~70% online, 30% offline — counter%10 gives stable distribution.
            $online = ($counter % 10) < 7;
            if ($online) {
                $url = $cfg['meetUrl'] . '/' . dechex($counter + 100);
                return [true, $url];
            }
            return [false, $cfg['location']];
        }

        // ── Primitive helpers ──────────────────────────────────────────────

        private static function countFutureSlots(): int {
            $rows = TimeSlots::get()->selectAll(function (SelectInterface $query): void {
                $query->cols(['id'])->where('start_at > UNIX_TIMESTAMP()');
            });
            return count($rows);
        }

        private static function slot(
            int $expertId,
            int $startAt,
            int $durationMin,
            int $cost,
            bool $isOnline,
            string $location,
            string $status,
        ): int {
            return (int)TimeSlots::get()->insert([
                'expert_id' => $expertId,
                'start_at' => $startAt,
                'end_at' => $startAt + $durationMin * 60,
                'duration_min' => $durationMin,
                'cost' => $cost,
                'is_online' => $isOnline ? 1 : 0,
                'location' => $location ?: null,
                'max_users' => 1,
                'status' => $status,
                'uid' => TimeSlots::generateUid(),
                'created_at' => time(),
            ]);
        }

        private static function daysFromNow(int $days): int {
            return strtotime("today +$days days");
        }
    }
}
