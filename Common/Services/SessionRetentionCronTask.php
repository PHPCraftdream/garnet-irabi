<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Services;

use Aura\Cli\Stdio;
use Throwable;

/**
 * session-retention cron task: prune the framework `session` and
 * `session_data` tables to the inactivity retention window.
 *
 * Triggered by AppCronService::registerTasks() once per cron tick
 * (`php run_cmd.php cron session-retention`). Schedule (crontab line)
 * is the operator's responsibility.
 *
 * Failure policy (mirrors LogRotationCronTask): SOFT. A thrown error
 * is reported via $stdio but does NOT fail the tick; the next tick
 * retries. The task returns the total count of pruned session +
 * session_data rows so the cron logger records a non-zero "did work"
 * entry on a productive tick (and the daily-heartbeat path logs a
 * no-op otherwise).
 *
 * No NamedLock — this is a read-then-delete on an age slice, not a
 * money path. A re-entrant or overlapping tick at worst finds nothing
 * left to prune on the second pass; the worst case is a no-op, never a
 * double-debit or a data race (see SessionRetentionService).
 *
 * See SessionRetentionService for the retention algorithm and the
 * legal basis for the 365-day window (privacy policy F-05, 152-ФЗ).
 */
class SessionRetentionCronTask {
    /**
     * Run the full session-retention pass. Returns the total number of
     * pruned session + session_data rows (a non-zero "did work" signal
     * to the cron logger); never throws — every failure is reported via
     * $stdio.
     */
    public static function run(Stdio $stdio): int {
        try {
            $result = SessionRetentionService::pruneSessions();
        } catch (Throwable $e) {
            $stdio->outln('session-retention: pruning skipped — ' . $e->getMessage());

            return 0;
        }

        $sessions = $result['sessions_deleted'];
        $data = $result['session_data_deleted'];

        $stdio->outln(
            $sessions === 0
                ? 'session-retention: nothing to prune.'
                : "session-retention: pruned {$sessions} session(s), {$data} session_data row(s)."
        );

        return $sessions + $data;
    }
}
