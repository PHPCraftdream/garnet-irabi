<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Services;

use PHPCraftdream\Garnet\Kernel\Db\Tables\DbTable;
use PHPCraftdream\IRabi\Common\Tables\AdminActionLog;
use PHPCraftdream\IRabi\Common\Tables\CronLog;
use PHPCraftdream\IRabi\Common\Tables\EntityHistory;
use PHPCraftdream\IRabi\Common\Tables\MailLog;
use PHPCraftdream\IRabi\Common\Tables\SupportAssignmentLog;
use Throwable;

/**
 * Age-based log retention — prunes the WorkDir/LogJournal file tree and
 * the operational log DB tables to a single fixed window.
 *
 * The privacy policy (docs/handover-audit/01-legal-compliance.md F-05)
 * promises users a 1-year log retention. RETENTION_DAYS is the single
 * source of truth for that promise: both the file journals and every
 * age-prunable log table use it, so the code and the legal text cannot
 * drift apart. Required for 152-ФЗ compliance, not just disk hygiene.
 *
 * This is NOT the QA `php garnet clear-logs` wipe (ClearLogsService) —
 * that one deletes everything at once behind test-mode. This service
 * deletes ONLY records/files OLDER than the cutoff, leaving recent logs
 * intact for ongoing support and debugging.
 *
 * Two halves:
 *
 *   1. pruneFiles($logJournalDir, $now, $retentionDays): walks each of
 *      the Errors/System/Routes category dirs. The framework Logger
 *      (Kernel/Io/Logs/Logger::write/append) creates one DIRECTORY per
 *      day named YYYY-MM-DD with .log files inside, so the dated dir is
 *      the unit of deletion — we remove the whole tree when its date is
 *      strictly older than the cutoff date. Pure filesystem, no boot —
 *      takes the dir path and an injectable $now for clock-free testing.
 *
 *   2. pruneTables($now, $retentionDays): for each log table that has a
 *      created_at INT column, runs DELETE WHERE created_at < cutoff.
 *      Per-table failures are isolated (logged, not thrown) so a
 *      missing/partial table on some install never aborts the whole
 *      rotation. mail_log_recipients has no timestamp column of its own
 *      — it is skipped with an explicit reason (its parent rows in
 *      mail_log ARE pruned; orphan recipient rows carry only small
 *      metadata, so leaving them does not defeat the disk-hygiene goal).
 *
 * Boundary semantics (shared by both halves): an entry/record is kept
 * when its age is EQUAL TO the window — deleted only when STRICTLY
 * older. So "exactly 365 days" is retained, "366 days" is removed. The
 * conservative choice keeps more rather than less, which is the safer
 * side for a legal retention promise.
 */
class LogRotationService {
    /**
     * Log retention window in days. Mirrors the privacy-policy promise
     * ("logs are kept for 1 year", docs/handover-audit/01-legal-compliance.md
     * F-05). ONE named constant — surfaced as the default of every
     * public method so there is a single place to tune the window.
     */
    public const RETENTION_DAYS = 365;

    /** File-journal category subdirs under WorkDir/LogJournal. */
    private const FILE_CATEGORIES = ['Errors', 'System', 'Routes'];

    /**
     * Leading date of a dated entry name. Matches both the real layout
     * (a directory named "2026-07-19") and a flat "2026-07-19.log" form
     * defensively; the trailing part is ignored so an extension or
     * suffix never defeats the match. We still validate the parsed
     * Y/m/d with checkdate (rejects Feb 30 etc.) before acting on it.
     */
    private const DATE_ENTRY_PATTERN = '/^(\d{4})-(\d{2})-(\d{2})\b/';

    /**
     * Log tables with a native INT created_at column keyed for age
     * pruning. Column identity was read from each table's framework
     * parent (vendor, READ-ONLY) — every one of these uses created_at:
     *   mail_log              FwMailLog::init()              created_at INT
     *   admin_action_log      FwAdminActionLog::init()       created_at INT
     *   cron_log              FwCronLog::init()              created_at INT
     *   support_assignment_log FwSupportAssignmentLog::init() created_at INT
     *   entity_history        FwEntityHistory::init()        created_at INT
     * All five are created by M_0002 and indexed on created_at.
     *
     * @var array<string, class-string<DbTable>>
     */
    private const AGE_TABLES = [
        'mail_log' => MailLog::class,
        'admin_action_log' => AdminActionLog::class,
        'cron_log' => CronLog::class,
        'support_assignment_log' => SupportAssignmentLog::class,
        'entity_history' => EntityHistory::class,
    ];

    /**
     * Tables with no native timestamp column — skipped with an explicit
     * reason rather than guessed. mail_log_recipients (FwMailLogRecipients)
     * has only id/mail_log_id/account_id/recipient_email; its age is
     * implicitly that of its parent mail_log row, which IS pruned here.
     * A cross-table age JOIN is out of scope for this pass and the small
     * orphan rows do not defeat the disk-hygiene goal.
     *
     * @var list<string>
     */
    private const NO_TIMESTAMP_TABLES = ['mail_log_recipients'];

    /**
     * Prune dated file-log entries older than the retention window.
     *
     * @param string   $logJournalDir Absolute path to WorkDir/LogJournal.
     * @param ?int     $now           Unix timestamp treated as "now"; null = time().
     *                                Inject a fixed value in tests for determinism.
     * @param int      $retentionDays Cutoff window in days.
     *
     * @return array<string, int> category => count of dated entries removed.
     *                             Always includes all three category keys.
     */
    public static function pruneFiles(
        string $logJournalDir,
        ?int $now = null,
        int $retentionDays = self::RETENTION_DAYS,
    ): array {
        $nowTs = $now ?? time();
        // Cutoff as a Y-m-d date string. Entries whose date is strictly
        // before this string are removed; same-day-or-later are kept.
        // Comparing YYYY-MM-DD lexicographically == comparing chronologically,
        // with no timezone or second-precision ambiguity.
        $cutoffDate = date('Y-m-d', (int)(strtotime("-{$retentionDays} days", $nowTs) ?: 0));

        $counts = [];
        foreach (self::FILE_CATEGORIES as $category) {
            $categoryDir = rtrim($logJournalDir, '/\\') . DIRECTORY_SEPARATOR . $category;
            $counts[$category] = is_dir($categoryDir)
                ? static::pruneCategoryDir($categoryDir, $cutoffDate)
                : 0;
        }

        return $counts;
    }

    /**
     * Walk one category dir, remove every dated entry older than cutoff.
     *
     * @return int number of dated entries (dirs or files) removed.
     */
    private static function pruneCategoryDir(string $categoryDir, string $cutoffDate): int {
        /** @var list<string>|false $entries */
        $entries = scandir($categoryDir);
        if ($entries === false) {
            return 0;
        }

        $deleted = 0;
        foreach ($entries as $name) {
            if ($name === '.' || $name === '..') {
                continue;
            }
            if (!preg_match(self::DATE_ENTRY_PATTERN, $name, $m)) {
                // Not a dated entry — leave untouched (manual file, etc.).
                continue;
            }
            // Reject impossible dates (Feb 30, month 13) instead of
            // letting them through on a blind string compare.
            if (!checkdate((int)$m[2], (int)$m[3], (int)$m[1])) {
                continue;
            }
            $entryDate = $m[1] . '-' . $m[2] . '-' . $m[3];
            // Keep when entryDate >= cutoffDate (boundary-inclusive on
            // the cutoff day); delete only when strictly older.
            if (strcmp($entryDate, $cutoffDate) >= 0) {
                continue;
            }

            $path = $categoryDir . DIRECTORY_SEPARATOR . $name;
            if (static::removeEntry($path)) {
                $deleted++;
            }
        }

        return $deleted;
    }

    /**
     * Delete a dated entry whether it's a directory (the real layout) or
     * a flat file. Returns true only on successful removal.
     */
    private static function removeEntry(string $path): bool {
        if (is_dir($path) && !is_link($path)) {
            return static::rmtree($path);
        }
        if (is_file($path)) {
            return @unlink($path);
        }

        return false;
    }

    /**
     * Recursively delete a directory tree (a dated dir holds one or more
     * .log files). Returns true only if the whole tree was removed.
     */
    private static function rmtree(string $dir): bool {
        /** @var list<string>|false $entries */
        $entries = scandir($dir);
        if ($entries === false) {
            return false;
        }
        foreach ($entries as $name) {
            if ($name === '.' || $name === '..') {
                continue;
            }
            $path = $dir . DIRECTORY_SEPARATOR . $name;
            if (is_dir($path) && !is_link($path)) {
                static::rmtree($path);
            } else {
                @unlink($path);
            }
        }

        return @rmdir($dir);
    }

    /**
     * Prune every age-prunable log table to the retention window.
     *
     * @param ?int $now           Unix timestamp treated as "now"; null = time().
     * @param int  $retentionDays Cutoff window in days.
     *
     * @return array<string, array{deleted: int, skipped_reason: ?string}>
     *         Per-table result. `deleted` = rows removed (0 when skipped).
     *         `skipped_reason` = null when processed normally, or a short
     *         string explaining why this table was not pruned (no timestamp
     *         column / query error). Every log table appears as a key.
     */
    public static function pruneTables(
        ?int $now = null,
        int $retentionDays = self::RETENTION_DAYS,
    ): array {
        $nowTs = $now ?? time();
        $cutoffTs = (int)(strtotime("-{$retentionDays} days", $nowTs) ?: 0);

        $results = [];

        // Tables without a native timestamp — explicit, non-guessed skip.
        foreach (self::NO_TIMESTAMP_TABLES as $label) {
            $results[$label] = ['deleted' => 0, 'skipped_reason' => 'no timestamp column'];
        }

        // Age-prunable tables. Per-table isolation: a missing/partial
        // table on some install must not abort the whole rotation.
        foreach (self::AGE_TABLES as $label => $cls) {
            try {
                $results[$label] = [
                    'deleted' => static::deleteOlderThan($cls, $cutoffTs),
                    'skipped_reason' => null,
                ];
            } catch (Throwable $e) {
                $results[$label] = ['deleted' => 0, 'skipped_reason' => $e->getMessage()];
            }
        }

        return $results;
    }

    /**
     * Count then DELETE rows with created_at < $cutoffTs. Returns the
     * count (exact — taken from the SELECT, since QueryEx::ex() returns
     * false for a DELETE with no result set, not the affected-row count).
     * Mirrors ClearLogsService's count-first approach but with an age WHERE.
     *
     * @param class-string<DbTable> $cls Table gateway class.
     * @param int                   $cutoffTs Unix-second cutoff.
     *
     * @return int Rows deleted (0 when nothing matched the age filter).
     */
    private static function deleteOlderThan(string $cls, int $cutoffTs): int {
        $table = $cls::get();
        $tableName = $table->getTableName();

        $countRow = $table->getQueryEx()->ex(
            "SELECT COUNT(*) AS cnt FROM `{$tableName}` WHERE `created_at` < ?",
            [$cutoffTs],
        );
        $count = is_array($countRow) ? (int)($countRow[0]['cnt'] ?? 0) : 0;

        if ($count > 0) {
            $table->getQueryEx()->ex(
                "DELETE FROM `{$tableName}` WHERE `created_at` < ?",
                [$cutoffTs],
            );
        }

        return $count;
    }
}
