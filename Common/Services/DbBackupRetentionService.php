<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Services;

/**
 * Prunes the WorkDir/Backups/ directory to a bounded retention window.
 *
 * The framework's GarnetDbBackupCommand creates one .sql.gz per run and
 * NEVER deletes anything — without this pruner, daily cron-driven backups
 * would fill the disk in a few months. This service is called from the
 * db-backup cron task immediately after a fresh backup is written, so the
 * newest file is always retained even on the very first run.
 *
 * Algorithm (7 daily + 4 weekly):
 *
 *   1. Parse every `backup_YYYYMMDD-HHMMSS_<reason>.sql.gz` filename in
 *      $dir, extracting the embedded timestamp. We parse from the NAME
 *      (not file mtime) because mtime drifts on `cp` / rsync / archive
 *      extraction — the filename is the framework's own creation stamp
 *      (see GarnetDbBackupCommand::autoPath) and is authoritative.
 *
 *   2. Sort timestamps descending (newest first).
 *
 *   3. Daily protected set = the 7 newest files overall. With a healthy
 *      daily cron this is "today + the last 6 days" and gives point-in-time
 *      recovery for the past week.
 *
 *   4. Weekly protected set = for each of the 4 most recent DISTINCT ISO
 *      year-week keys present in the file list, the single newest file in
 *      that week. This guarantees at least one restorable snapshot per
 *      week for a month of history beyond what daily covers.
 *
 *   5. Protected = union(daily, weekly). Files NOT in the protected set
 *      are deleted (unlink). The current week is normally represented in
 *      both sets — the union dedupes, so no extra file is kept for it.
 *
 * Why this shape and not "exactly 7 + exactly 4 = 11":
 *   - Real cron skips days (deploys, downtime, missed ticks). A hard "11"
 *     rule would either over-delete (drop a recent daily to make room for
 *     a weekly) or under-protect (skip a week that has only one file).
 *   - Daily-7 + weekly-4-as-distinct-weeks degrades gracefully: a week
 *     with no backup is simply absent from the weekly set, and the
 *     next-oldest week never sneaks in to "fill the slot" with stale data.
 *
 * Edge cases:
 *   - Total files <= 7: nothing is ever deleted (daily set covers them all).
 *   - A filename that does not match the dated pattern is left UNTOUCHED
 *     (it may be a manually-named dump we have no business deleting).
 *   - Empty/missing dir: no-op, returns [].
 *
 * Pure / side-effect-free apart from unlink(): no DB, no framework boot,
 * no IniConfig — takes a path string and an injectable $now for clock-free
 * testing. Returns the list of deleted absolute paths so callers can log
 * them.
 */
class DbBackupRetentionService {
    /** Default daily window — the N newest backups are always kept. */
    public const DEFAULT_DAILY = 7;

    /** Default weekly window — the newest backup of each of the N most recent weeks. */
    public const DEFAULT_WEEKLY = 4;

    /**
     * Filename pattern mirrored from GarnetDbBackupCommand::autoPath():
     *   backup_YYYYMMDD-HHMMSS_<reason>.sql.gz
     * The <reason> segment is slugified to [a-z0-9_-] by autoPath, so this
     * regex is permissive on that part (it only needs to anchor the date).
     */
    private const FILE_PATTERN = '/^backup_(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})_[a-z0-9_-]+\.sql\.gz$/i';

    /**
     * Prune the given backup directory to the retention window.
     *
     * @param string $dir          Absolute path to a backups directory
     *                              (typically WorkDir/Backups).
     * @param ?int   $now          Unix timestamp treated as "now" for ISO
     *                              week selection; null = time(). Inject a
     *                              fixed value in tests for determinism.
     * @param int    $dailyKeep    Daily-window size (default 7).
     * @param int    $weeklyKeep   Weekly-window size (default 4).
     *
     * @return list<string> Absolute paths of files deleted, in the order
     *                      they were unlinked. Empty when nothing matched.
     */
    public static function prune(
        string $dir,
        ?int $now = null,
        int $dailyKeep = self::DEFAULT_DAILY,
        int $weeklyKeep = self::DEFAULT_WEEKLY,
    ): array {
        if (!is_dir($dir)) {
            return [];
        }

        $entries = static::scanAndParse($dir);
        if (empty($entries)) {
            return [];
        }

        // Sort newest-first. Stable on the timestamp; ties broken by filename
        // so the result is deterministic for same-second collisions.
        usort($entries, static function (array $a, array $b): int {
            if ($a['ts'] === $b['ts']) {
                return strcmp($a['name'], $b['name']);
            }
            return $b['ts'] <=> $a['ts'];
        });

        $protected = static::selectProtected($entries, $now, $dailyKeep, $weeklyKeep);

        $deleted = [];
        foreach ($entries as $entry) {
            if (isset($protected[$entry['path']])) {
                continue;
            }
            if (@unlink($entry['path'])) {
                $deleted[] = $entry['path'];
            }
        }

        return $deleted;
    }

    /**
     * Read $dir, parse every matching filename into (path, name, ts, isoWeek).
     *
     * @return list<array{path: string, name: string, ts: int, isoWeek: string}>
     */
    private static function scanAndParse(string $dir): array {
        /** @var list<string>|false $paths */
        $paths = glob(rtrim($dir, '/\\') . DIRECTORY_SEPARATOR . 'backup_*.sql.gz');
        if ($paths === false) {
            return [];
        }

        $entries = [];
        foreach ($paths as $path) {
            $name = basename($path);
            if (!preg_match(self::FILE_PATTERN, $name, $m)) {
                continue;
            }
            // Validate the parsed Y/m/d H:i:s as a real timestamp — a
            // filename like backup_20260230-... (Feb 30) is invalid and
            // mktime() would silently roll it over to March 2. Reject
            // instead of keeping a phantom-date file in the wrong week.
            // mktime signature is (hour, minute, second, month, day, year).
            // From the regex: m[1]=year, m[2]=month, m[3]=day, m[4..6]=H:i:s.
            $ts = mktime((int)$m[4], (int)$m[5], (int)$m[6], (int)$m[2], (int)$m[3], (int)$m[1]);
            if ($ts === false) {
                continue;
            }
            // Sanity: the constructed date must round-trip back to the same
            // Y/m/d — this is what catches Feb 30 and similar overflows.
            $checkDate = getdate($ts);
            if ((int)$checkDate['year'] !== (int)$m[1]
                || (int)$checkDate['mon'] !== (int)$m[2]
                || (int)$checkDate['mday'] !== (int)$m[3]
            ) {
                continue;
            }

            $entries[] = [
                'path' => $path,
                'name' => $name,
                'ts' => $ts,
                'isoWeek' => date('o-W', $ts),
            ];
        }

        return $entries;
    }

    /**
     * Pick the protected set: union of the daily-N newest and the
     * weekly-N newest-per-distinct-ISO-week.
     *
     * @param list<array{path: string, name: string, ts: int, isoWeek: string}> $entries
     *                                                       Sorted newest-first.
     * @return array<string, true>           Set of protected paths keyed by abspath.
     */
    private static function selectProtected(array $entries, ?int $now, int $dailyKeep, int $weeklyKeep): array {
        $protected = [];

        // Daily: take the first $dailyKeep entries (already newest-first).
        foreach (array_slice($entries, 0, max(0, $dailyKeep)) as $entry) {
            $protected[$entry['path']] = true;
        }

        // Weekly: walk newest-first, record the first time we see each ISO
        // week key. Take the newest file of the first $weeklyKeep distinct
        // weeks encountered.
        $seenWeeks = [];
        foreach ($entries as $entry) {
            if (count($seenWeeks) >= $weeklyKeep) {
                break;
            }
            if (isset($seenWeeks[$entry['isoWeek']])) {
                continue;
            }
            $seenWeeks[$entry['isoWeek']] = true;
            $protected[$entry['path']] = true;
        }

        // $now is accepted to make the API deterministic-testable (the
        // ISO week of a fixed filename is itself fixed, so $now does not
        // affect selection today), but we keep the parameter so future
        // refinements — e.g. "always keep today's backup even off-schedule"
        // — have a hook without breaking the signature.
        unset($now);

        return $protected;
    }
}
