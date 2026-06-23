<?php declare(strict_types=1);

/**
 * Server-side date helpers — every time-bearing column in the database is
 * stored as INT unix timestamp. Use this helper anywhere the server renders
 * a timestamp into text that a *user* will read (emails, plain-text logs,
 * server-rendered HTML), so we can render the value in that user's
 * preferred timezone instead of the PHP server timezone.
 *
 * The frontend has its own equivalent in `Framework/Bundle/Front/Common/Utils/DateUtils.ts`.
 */

namespace PHPCraftdream\IRabi\Common\System {
    use DateTime;
    use DateTimeZone;
    use Throwable;

    final class DateUtils {
        /**
         * Format a unix timestamp in the given user's timezone.
         *
         * @param int         $ts     Unix seconds (UTC).
         * @param string|null $userTz IANA tz id (e.g. "Europe/Moscow"). Falls back to UTC when null/empty/invalid.
         * @param string      $format PHP DateTime format string (default: 'Y-m-d H:i').
         */
        public static function formatForUser(int $ts, ?string $userTz, string $format = 'Y-m-d H:i'): string {
            if ($ts <= 0) {
                return '';
            }

            try {
                $dt = (new DateTime('@' . $ts))->setTimezone(static::resolveZone($userTz));
            } catch (Throwable) {
                $dt = (new DateTime('@' . $ts))->setTimezone(new DateTimeZone('UTC'));
            }

            return $dt->format($format);
        }

        /**
         * Parse a `<input type=date>` + `<input type=time>` pair coming from
         * the browser into a unix timestamp, interpreting the wall-clock values
         * in the given user's timezone (NOT the PHP server's tz).
         *
         * Accepts `$time` either as `H:i` (e.g. "13:45") or `H:i:s`. Returns
         * 0 when the input cannot be parsed in either shape — callers should
         * treat 0 as "invalid", matching how `strtotime` returned `false`.
         *
         * @param string      $date   `Y-m-d`, as produced by `<input type=date>`.
         * @param string      $time   `H:i` or `H:i:s`, as produced by `<input type=time>`.
         * @param string|null $userTz IANA tz id (e.g. "Europe/Moscow"). Falls back to UTC when null/empty/invalid.
         */
        public static function parseUserDateTime(string $date, string $time, ?string $userTz): int {
            $tz = static::resolveZone($userTz);
            foreach (['Y-m-d H:i', 'Y-m-d H:i:s'] as $fmt) {
                $dt = DateTime::createFromFormat($fmt, "$date $time", $tz);
                if ($dt !== false) {
                    return $dt->getTimestamp();
                }
            }
            return 0;
        }

        /**
         * Parse a `<input type=datetime-local>` value (`YYYY-MM-DDTHH:mm` or
         * `YYYY-MM-DDTHH:mm:ss`) into a unix timestamp, interpreting the
         * wall-clock in the given user's timezone. Returns 0 on parse error.
         */
        public static function parseUserDateTimeLocal(string $value, ?string $userTz): int {
            if ($value === '') {
                return 0;
            }
            $tz = static::resolveZone($userTz);
            foreach (['Y-m-d\TH:i', 'Y-m-d\TH:i:s'] as $fmt) {
                $dt = DateTime::createFromFormat($fmt, $value, $tz);
                if ($dt !== false) {
                    return $dt->getTimestamp();
                }
            }
            return 0;
        }

        /**
         * Return the unix timestamp for "start of day (00:00:00)" for the
         * given Y-m-d date interpreted in the user's timezone. 0 on parse error.
         */
        public static function startOfDayForUser(string $date, ?string $userTz): int {
            $dt = DateTime::createFromFormat('Y-m-d H:i:s', "$date 00:00:00", static::resolveZone($userTz));
            return $dt === false ? 0 : $dt->getTimestamp();
        }

        /**
         * Return the unix timestamp for "end of day (23:59:59)" for the
         * given Y-m-d date interpreted in the user's timezone. 0 on parse error.
         */
        public static function endOfDayForUser(string $date, ?string $userTz): int {
            $dt = DateTime::createFromFormat('Y-m-d H:i:s', "$date 23:59:59", static::resolveZone($userTz));
            return $dt === false ? 0 : $dt->getTimestamp();
        }

        /**
         * Return the unix timestamp for "start of the current month" in the
         * given user's timezone. Used for per-user monthly metrics where the
         * month boundary must match what the user sees on their calendar.
         */
        public static function startOfCurrentMonthForUser(?string $userTz): int {
            $tz = static::resolveZone($userTz);
            return (new DateTime('first day of this month 00:00:00', $tz))->getTimestamp();
        }

        /**
         * Return the unix timestamp for "today at 00:00:00" in the user's tz.
         */
        public static function startOfTodayForUser(?string $userTz): int {
            $tz = static::resolveZone($userTz);
            return (new DateTime('today 00:00:00', $tz))->getTimestamp();
        }

        /**
         * Return the unix timestamp for "tomorrow at 00:00:00" in the user's tz.
         */
        public static function startOfTomorrowForUser(?string $userTz): int {
            $tz = static::resolveZone($userTz);
            return (new DateTime('tomorrow 00:00:00', $tz))->getTimestamp();
        }

        /**
         * Return the unix timestamp for "the day after tomorrow at 00:00:00"
         * in the user's tz. Used to bound a "tomorrow" window across DST
         * transitions where adding 86400 seconds would be off by ±1 hour.
         */
        public static function startOfDayAfterTomorrowForUser(?string $userTz): int {
            $tz = static::resolveZone($userTz);
            return (new DateTime('tomorrow +1 day 00:00:00', $tz))->getTimestamp();
        }

        /**
         * Resolve a tz id into a DateTimeZone, falling back to UTC for empty
         * or unknown values. Centralised so callers never have to swallow
         * DateTimeZone constructor exceptions themselves.
         */
        public static function resolveZone(?string $tz): DateTimeZone {
            if ($tz === null || $tz === '') {
                return new DateTimeZone('UTC');
            }
            try {
                return new DateTimeZone($tz);
            } catch (Throwable) {
                return new DateTimeZone('UTC');
            }
        }
    }
}
