<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Calendar {
    use PHPCraftdream\Garnet\Kernel\Core\HCalendar\SlotDateFilter as FrameworkSlotDateFilter;
    use PHPCraftdream\IRabi\Foreground\I18n\ForegroundI18n;

    /**
     * Thin IRabi wrapper around the framework SlotDateFilter.
     * Localizes structured reason arrays into human-readable strings via ForegroundI18n.
     */
    class SlotDateFilterLocalized {
        /**
         * Analyze a date range — same as framework, but restricted entries
         * carry a localized 'reason' string instead of a structured array.
         */
        public static function analyzeDateRange(string $startDate, string $endDate): array {
            $result = FrameworkSlotDateFilter::analyzeDateRange($startDate, $endDate);

            foreach ($result['restricted'] as &$entry) {
                $entry['reason'] = static::localizeReason($entry['reason']);
            }
            unset($entry);

            return $result;
        }

        /**
         * Distribute by frequency — delegates directly to the framework (no reasons in output).
         */
        public static function distributeByFrequency(string $startDate, int $count, int $frequency): array {
            return FrameworkSlotDateFilter::distributeByFrequency($startDate, $count, $frequency);
        }

        /**
         * Distribute slots — delegates directly to the framework.
         */
        public static function distributeSlots(array $availableDates, int $count): array {
            return FrameworkSlotDateFilter::distributeSlots($availableDates, $count);
        }

        /**
         * Convert a structured reason array to a localized string.
         *
         * @param array{code: string, name: string|null} $reason
         */
        public static function localizeReason(array $reason): string {
            $i18n = ForegroundI18n::getInstance();
            $code = $reason['code'];
            $name = $reason['name'];

            return match ($code) {
                'shabbat' => $i18n->cal_shabbat(),
                'erev_shabbat' => $i18n->cal_erev_shabbat(),
                'yom_tov' => $name !== null
                    ? sprintf($i18n->cal_yom_tov_named(), $name)
                    : $i18n->cal_yom_tov(),
                'erev_yom_tov' => $i18n->cal_erev_yom_tov(),
                'fast' => $name !== null
                    ? sprintf($i18n->cal_fast_named(), $name)
                    : $i18n->cal_fast(),
                'erev_fast' => $i18n->cal_erev_fast(),
                'rosh_chodesh' => $i18n->cal_rosh_chodesh(),
                'erev_rosh_chodesh' => $i18n->cal_erev_rosh_chodesh(),
                default => $code,
            };
        }
    }
}
