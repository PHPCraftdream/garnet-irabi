<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Services {
    use PHPCraftdream\Garnet\Kernel\Db\Link\DbPool;
    use PHPCraftdream\IRabi\Common\Tables\SupportMessages;
    use PHPCraftdream\IRabi\Common\Tables\SupportTickets;

    /**
     * D-211: at the moment a ticket is created, the screen said nothing —
     * no ticket number, no sense of how long support usually takes. Support
     * was actually fast (2/6/12 minutes across the cycle's own measurements),
     * but the person sending the question had no way to know that.
     *
     * The median is real, not a number typed into a template: it's measured
     * from the tickets that actually got a first reply, over a recent
     * window. A hand-picked "мы отвечаем за 10 минут" would drift out of
     * date the moment response times change and nobody would notice.
     */
    class SupportResponseEta {
        /** Below this many samples, a "median" would just be noise dressed up as a promise. */
        private const MIN_SAMPLES = 5;
        private const SAMPLE_WINDOW = 200;

        /**
         * Median minutes from ticket creation to the first non-internal
         * staff reply, over the last `SAMPLE_WINDOW` tickets that got one.
         * Null when there isn't enough recent history to mean anything.
         */
        public static function medianFirstResponseMinutes(): ?int {
            $ticketsTbl = SupportTickets::get()->getTableName();
            $messagesTbl = SupportMessages::get()->getTableName();

            $rows = DbPool::get()->query(
                "SELECT t.created_at AS ticket_created, MIN(m.created_at) AS first_reply
                 FROM `{$ticketsTbl}` t
                 INNER JOIN `{$messagesTbl}` m
                     ON m.ticket_id = t.id AND m.msg_type = 'staff' AND m.is_internal = 0
                 GROUP BY t.id
                 ORDER BY t.created_at DESC
                 LIMIT " . self::SAMPLE_WINDOW
            );

            $minutes = [];
            foreach ($rows as $row) {
                $created = (int)($row['ticket_created'] ?? 0);
                $replied = (int)($row['first_reply'] ?? 0);
                if ($replied > $created) {
                    $minutes[] = (int)round(($replied - $created) / 60);
                }
            }

            if (count($minutes) < self::MIN_SAMPLES) {
                return null;
            }

            sort($minutes);
            $mid = intdiv(count($minutes), 2);
            $median = count($minutes) % 2 === 0
                ? (int)round(($minutes[$mid - 1] + $minutes[$mid]) / 2)
                : $minutes[$mid];

            // A median of 0 reads as "instant", which no honest support queue
            // promises — round up to the nearest minute worth stating.
            return max(1, $median);
        }
    }
}
