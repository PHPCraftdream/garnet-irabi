<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Services;

use Aura\Cli\Stdio;
use PHPCraftdream\IRabi\IRabi;
use Throwable;

/**
 * log-rotation cron task: prune the file journals (WorkDir/LogJournal)
 * and the operational log DB tables to the 1-year retention window.
 *
 * Triggered by AppCronService::registerTasks() once per cron tick
 * (`php run_cmd.php cron log-rotation`). Schedule (crontab line) is the
 * operator's responsibility.
 *
 * Failure policy (mirrors DbBackupCronTask): SOFT per category and per
 * table. An error pruning one file category or one log table is
 * reported via $stdio but does NOT fail the tick — the remaining
 * categories/tables still get pruned, and the next tick retries. The
 * task returns the total count of pruned entries + rows so the cron
 * logger records a non-zero "did work" entry on a productive tick
 * (and the daily-heartbeat path logs a no-op otherwise).
 *
 * See LogRotationService for the retention algorithm and the legal
 * basis for the 365-day window (privacy policy F-05, 152-ФЗ).
 */
class LogRotationCronTask {
    /**
     * Run the full log-rotation pass. Returns the total number of pruned
     * file entries + DB rows (a non-zero "did work" signal to the cron
     * logger); never throws — every failure is reported via $stdio.
     */
    public static function run(Stdio $stdio): int {
        $total = 0;

        // ── 1. File journals ────────────────────────────────────────
        $total += self::pruneFilesSafe($stdio);

        // ── 2. DB log tables ────────────────────────────────────────
        $total += self::pruneTablesSafe($stdio);

        return $total;
    }

    /**
     * File half, wrapped so a thrown error never aborts the table half.
     * Returns the count of dated journal entries removed.
     */
    private static function pruneFilesSafe(Stdio $stdio): int {
        $logJournalDir = self::logJournalDir();
        if ($logJournalDir === null) {
            $stdio->outln('log-rotation: could not resolve WorkDir; skipping file pruning.');

            return 0;
        }
        if (!is_dir($logJournalDir)) {
            $stdio->outln('log-rotation: LogJournal dir not found, skipping file pruning.');

            return 0;
        }

        try {
            $counts = LogRotationService::pruneFiles($logJournalDir);
        } catch (Throwable $e) {
            $stdio->outln('log-rotation: file pruning skipped — ' . $e->getMessage());

            return 0;
        }

        $fileTotal = array_sum($counts);
        foreach ($counts as $category => $count) {
            if ($count > 0) {
                $stdio->outln("log-rotation: {$category} — removed {$count} dated journal dir(s).");
            }
        }
        $stdio->outln(
            $fileTotal === 0
                ? 'log-rotation: file journals — nothing to prune.'
                : "log-rotation: file journals — pruned {$fileTotal} dated entr(ies)."
        );

        return $fileTotal;
    }

    /**
     * Table half, wrapped so a thrown error never fails the tick. Returns
     * the count of pruned log rows.
     */
    private static function pruneTablesSafe(Stdio $stdio): int {
        try {
            $results = LogRotationService::pruneTables();
        } catch (Throwable $e) {
            $stdio->outln('log-rotation: table pruning skipped — ' . $e->getMessage());

            return 0;
        }

        $rowsTotal = 0;
        foreach ($results as $label => $res) {
            $reason = $res['skipped_reason'];
            if ($reason !== null) {
                $stdio->outln("log-rotation: {$label} — skipped ({$reason}).");

                continue;
            }
            $deleted = $res['deleted'];
            if ($deleted > 0) {
                $stdio->outln("log-rotation: {$label} — deleted {$deleted} row(s).");
            }
            $rowsTotal += $deleted;
        }
        $stdio->outln(
            $rowsTotal === 0
                ? 'log-rotation: log tables — nothing to prune.'
                : "log-rotation: log tables — pruned {$rowsTotal} row(s) total."
        );

        return $rowsTotal;
    }

    /**
     * Resolve the LogJournal dir from the active IRabi instance. Same
     * logic ClearLogsService uses to find the same path.
     */
    private static function logJournalDir(): ?string {
        try {
            return rtrim(IRabi::getInstance()->workDir, '/\\') . DIRECTORY_SEPARATOR . 'LogJournal';
        } catch (Throwable) {
            return null;
        }
    }
}
