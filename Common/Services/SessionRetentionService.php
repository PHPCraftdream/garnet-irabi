<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Services;

use PHPCraftdream\Garnet\Kernel\Db\Entity\Session\SessionDataTable;
use PHPCraftdream\Garnet\Kernel\Db\Entity\Session\SessionTable;

/**
 * Age-based session retention — prunes abandoned `session` rows and their
 * `session_data` children past a fixed inactivity window.
 *
 * The privacy-policy audit (docs/handover-audit/01-legal-compliance.md
 * F-05) calls out that nothing in the app ever purges the framework
 * session tables: the `session` cookie lives up to 5 years
 * (Cookie::rememberForever → +5 years), and a session row whose owner
 * never came back stays forever alongside the personal-data-derived
 * `session_data` params it carries (consent timestamps, auth_login
 * links, …). This service closes the last unpurgeable slice of F-05 —
 * the file journals and the six operational log tables were handled by
 * LogRotationService (task #60); the session tables are handled here.
 *
 * Retention window: the audit names NO concrete session number. The
 * published policy only offers "разумный срок" (a reasonable term) and
 * the "5 лет" cookie lifetime (a browser-side technical fact, not a
 * server-side promise). RETENTION_DAYS mirrors LogRotationService's
 * 365 on purpose — one uniform 1-year window across every retention
 * surface, and 365 is already the publicly documented log-retention
 * promise. A session inactive for over a year is safely dead: the
 * returner just re-authenticates via the email one-time code, which is
 * the normal first-visit path anyway. Not a bug, a graceful degrade.
 *
 * This is a read-then-delete on an age slice, so it needs NO lock — a
 * re-entrant or overlapping tick at worst finds nothing left to prune
 * (see SessionRetentionCronTask).
 *
 * Algorithm:
 *   1. SELECT id FROM session WHERE lastUsage < cutoff  — the candidate
 *      session ids. `lastUsage` (INT unix ts) is the framework's
 *      last-activity column: SessionData::getDataAsync() bumps it at
 *      most once per day when the session is read, and
 *      SessionData::touchSessionAsync() sets it on create/flush.
 *   2. DELETE FROM session_data WHERE sessionId IN (those ids) —
 *      children FIRST, then parents (same order as
 *      StaticPagesSeed::wipe(): blocks→pages→snippets; here
 *      session_data→session). session_data has no timestamp of its own;
 *      its age is its parent session's age.
 *   3. DELETE FROM session WHERE id IN (those ids) — the parents.
 *
 * Boundary semantics (same conservative rule as LogRotationService): a
 * row whose lastUsage is EXACTLY on the cutoff is KEPT — deleted only
 * when STRICTLY older. So "exactly 365 days inactive" survives,
 * "366 days" goes. The safe side for a retention promise: keep more,
 * not less.
 */
class SessionRetentionService {
    /**
     * Session inactivity retention window in days. Intentionally mirrors
     * LogRotationService::RETENTION_DAYS so the whole project honours a
     * single 1-year retention policy. ONE named constant — surfaced as
     * the default of pruneSessions() so there is a single place to tune
     * the window without a clock dependency.
     */
    public const RETENTION_DAYS = 365;

    /**
     * Prune `session` rows (and their `session_data` children) whose
     * lastUsage is older than the retention window.
     *
     * @param ?int $now           Unix timestamp treated as "now"; null = time().
     *                            Inject a fixed value in tests for determinism.
     * @param int  $retentionDays Cutoff window in days.
     *
     * @return array{sessions_deleted: int, session_data_deleted: int}
     *         Counts of pruned rows. Both are exact — taken from the
     *         SELECT counts, because QueryEx::ex() returns false for a
     *         DELETE with no result set, not the affected-row count
     *         (same reason LogRotationService counts first).
     */
    public static function pruneSessions(
        ?int $now = null,
        int $retentionDays = self::RETENTION_DAYS,
    ): array {
        $nowTs = $now ?? time();
        // Strictly-older cutoff: lastUsage < cutoff deletes; == survives.
        $cutoffTs = (int)(strtotime("-{$retentionDays} days", $nowTs) ?: 0);

        $sessionTable = SessionTable::get();
        $dataTable = SessionDataTable::get();
        $sessionTableName = $sessionTable->getTableName();
        $dataTableName = $dataTable->getTableName();

        // 1. Candidate session ids — the age slice on the parent table.
        /** @var list<array{id: int|string}>|bool|int $rows */
        $rows = $sessionTable->getQueryEx()->ex(
            "SELECT id FROM `{$sessionTableName}` WHERE `lastUsage` < ?",
            [$cutoffTs],
        );
        $ids = [];
        if (is_array($rows)) {
            foreach ($rows as $row) {
                if (!empty($row['id'])) {
                    $ids[] = (int)$row['id'];
                }
            }
        }

        if ($ids === []) {
            return ['sessions_deleted' => 0, 'session_data_deleted' => 0];
        }

        $placeholders = implode(',', array_fill(0, count($ids), '?'));

        // 2. Children FIRST. Count before delete — QueryEx::ex() returns
        // false for a DELETE, not the affected-row count, so the count
        // has to come from a preceding SELECT (mirrors
        // LogRotationService::deleteOlderThan).
        /** @var list<array{cnt: int|string}>|bool|int $countRows */
        $countRows = $dataTable->getQueryEx()->ex(
            "SELECT COUNT(*) AS cnt FROM `{$dataTableName}` WHERE `sessionId` IN ({$placeholders})",
            $ids,
        );
        $dataCount = is_array($countRows) ? (int)($countRows[0]['cnt'] ?? 0) : 0;

        if ($dataCount > 0) {
            $dataTable->getQueryEx()->ex(
                "DELETE FROM `{$dataTableName}` WHERE `sessionId` IN ({$placeholders})",
                $ids,
            );
        }

        // 3. Parents. Count is already known from the id slice.
        $sessionTable->getQueryEx()->ex(
            "DELETE FROM `{$sessionTableName}` WHERE `id` IN ({$placeholders})",
            $ids,
        );

        return ['sessions_deleted' => count($ids), 'session_data_deleted' => $dataCount];
    }
}
