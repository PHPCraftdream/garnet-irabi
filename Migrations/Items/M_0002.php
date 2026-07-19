<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Migrations\Items {
    use Aura\Cli\Stdio;
    use PHPCraftdream\Garnet\Kernel\Db\Link\DbPool;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Migration\IMigrationItem;
    use PHPCraftdream\IRabi\Common\Tables\AccountBalance;
    use PHPCraftdream\IRabi\Common\Tables\AdminActionLog;
    use PHPCraftdream\IRabi\Common\Tables\BalanceLedger;
    use PHPCraftdream\IRabi\Common\Tables\Bookings;
    use PHPCraftdream\IRabi\Common\Tables\Comments;
    use PHPCraftdream\IRabi\Common\Tables\CronLog;
    use PHPCraftdream\IRabi\Common\Tables\EmailAttempts;
    use PHPCraftdream\IRabi\Common\Tables\EmailQueue;
    use PHPCraftdream\IRabi\Common\Tables\EntityHistory;
    use PHPCraftdream\IRabi\Common\Tables\ExpertCancellations;
    use PHPCraftdream\IRabi\Common\Tables\ExpertProfiles;
    use PHPCraftdream\IRabi\Common\Tables\IdempotencyKeys;
    use PHPCraftdream\IRabi\Common\Tables\ImAttachments;
    use PHPCraftdream\IRabi\Common\Tables\ImConversations;
    use PHPCraftdream\IRabi\Common\Tables\ImMessages;
    use PHPCraftdream\IRabi\Common\Tables\ImReadStatus;
    use PHPCraftdream\IRabi\Common\Tables\InviteRegistrations;
    use PHPCraftdream\IRabi\Common\Tables\InviteTokens;
    use PHPCraftdream\IRabi\Common\Tables\JsErrors;
    use PHPCraftdream\IRabi\Common\Tables\MailLog;
    use PHPCraftdream\IRabi\Common\Tables\MailLogRecipients;
    use PHPCraftdream\IRabi\Common\Tables\NewsArchived;
    use PHPCraftdream\IRabi\Common\Tables\NewsEvents;
    use PHPCraftdream\IRabi\Common\Tables\NewsReads;
    use PHPCraftdream\IRabi\Common\Tables\Payments;
    use PHPCraftdream\IRabi\Common\Tables\PaymentsLog;
    use PHPCraftdream\IRabi\Common\Tables\StaticPageBlocks;
    use PHPCraftdream\IRabi\Common\Tables\StaticPages;
    use PHPCraftdream\IRabi\Common\Tables\StaticSnippets;
    use PHPCraftdream\IRabi\Common\Tables\SupportAssignmentLog;
    use PHPCraftdream\IRabi\Common\Tables\SupportAttachments;
    use PHPCraftdream\IRabi\Common\Tables\SupportMessages;
    use PHPCraftdream\IRabi\Common\Tables\SupportTickets;
    use PHPCraftdream\IRabi\Common\Tables\TimeSlots;
    use PHPCraftdream\IRabi\Common\Tables\UserCancellations;
    use PHPCraftdream\IRabi\Migrations\Helpers\StaticPagesSeed;

    /**
     * IRabi business schema — all `ir_*` tables in their final shape, plus
     * race-condition guards that aren't expressible by the table builder
     * (generated columns, multi-column UNIQUE indexes), plus the canonical
     * static-pages seed.
     *
     * Splits cleanly from M_0001 (framework) so a future white-label app
     * keeps the framework half intact and ships its own M_0002.
     */
    class M_0002 implements IMigrationItem {
        public static function update(Stdio $stdio): void {
            $pool = DbPool::get();

            // ── Profiles, slots, bookings ──
            ExpertProfiles::get()->init()->ex();
            TimeSlots::get()->init()->ex();
            Bookings::get()->init()->ex();

            // ── Finance ──
            Payments::get()->init()->ex();
            PaymentsLog::get()->init()->ex();
            BalanceLedger::get()->init()->ex();
            AccountBalance::get()->init()->ex();

            // Race guards. Bookings.active_dup_key is a virtual generated
            // column reflecting the (user, target) pair only while the
            // booking is still consuming a slot — UNIQUE on it makes
            // double-book impossible at the storage level. BalanceLedger
            // gets a UNIQUE on (account, ref_type, ref_id, entry_type) to
            // make ledger entries idempotent under retries.
            //
            // Each ALTER is guarded (SHOW COLUMNS / SHOW INDEX) so that a
            // migration-tracker reset or a partial-DB restore — which makes
            // the runner replay M_0002 on an already-migrated DB — does not
            // abort with "Duplicate column name" / "Duplicate key name".
            // Guards are no-ops on a fresh install (nothing exists yet), so
            // the resulting schema is identical to the unguarded original.
            $bookings = Bookings::get()->getTableName();
            $ledger = BalanceLedger::get()->getTableName();

            $hasActiveDupKey = $pool->query("SHOW COLUMNS FROM {$bookings} LIKE 'active_dup_key'");
            if (empty($hasActiveDupKey)) {
                $pool->query("
                    ALTER TABLE {$bookings}
                      ADD COLUMN active_dup_key VARCHAR(64)
                      GENERATED ALWAYS AS (
                        IF(status IN ('pending','confirmed'),
                           CONCAT(user_id, ':', bookable_type, ':', bookable_id),
                           NULL)
                      ) VIRTUAL
                ");
                $stdio->outln("M_0002: added {$bookings}.active_dup_key");
            } else {
                $stdio->outln("M_0002: {$bookings}.active_dup_key already present, skipped");
            }

            $hasActiveBookingIdx = $pool->query("SHOW INDEX FROM {$bookings} WHERE Key_name = 'uq_active_booking'");
            if (empty($hasActiveBookingIdx)) {
                $pool->query("ALTER TABLE {$bookings} ADD UNIQUE INDEX uq_active_booking (active_dup_key)");
                $stdio->outln("M_0002: added index {$bookings}.uq_active_booking");
            } else {
                $stdio->outln("M_0002: index {$bookings}.uq_active_booking already present, skipped");
            }

            $hasLedgerRefIdx = $pool->query("SHOW INDEX FROM {$ledger} WHERE Key_name = 'uq_ledger_ref'");
            if (empty($hasLedgerRefIdx)) {
                $pool->query("ALTER TABLE {$ledger} ADD UNIQUE INDEX uq_ledger_ref (account_id, ref_type, ref_id, entry_type)");
                $stdio->outln("M_0002: added index {$ledger}.uq_ledger_ref");
            } else {
                $stdio->outln("M_0002: index {$ledger}.uq_ledger_ref already present, skipped");
            }

            // ── Support ──
            SupportTickets::get()->init()->ex();
            SupportMessages::get()->init()->ex();
            SupportAssignmentLog::get()->init()->ex();
            SupportAttachments::get()->init()->ex();

            // ── Direct messages / comments ──
            ImConversations::get()->init()->ex();
            ImMessages::get()->init()->ex();
            ImAttachments::get()->init()->ex();
            ImReadStatus::get()->init()->ex();
            Comments::get()->init()->ex();

            // ── News ──
            NewsEvents::init()->ex();
            NewsReads::init()->ex();
            NewsArchived::init()->ex();

            // ── Mail log + queue ──
            // FwMailLog::init() already declares the `meta` column directly
            // (added there after this migration was first written) — the
            // ALTER TABLE that used to backfill it here is redundant now and
            // fails with "Duplicate column name" on any fresh database.
            MailLog::get()->init()->ex();
            MailLogRecipients::get()->init()->ex();
            EmailQueue::get()->init()->ex();
            EmailAttempts::get()->init()->ex();

            // ── Cancellations + admin trail ──
            ExpertCancellations::get()->init()->ex();
            UserCancellations::get()->init()->ex();
            AdminActionLog::get()->init()->ex();

            // ── Cron + JS errors ──
            CronLog::get()->init()->ex();
            JsErrors::get()->init()->ex();

            // ── Invite tokens + registrations ──
            InviteTokens::get()->init()->ex();
            InviteRegistrations::get()->init()->ex();

            // ── Entity history (admin audit) ──
            EntityHistory::get()->init()->ex();

            // ── Static pages CMS ──
            StaticPages::get()->init()->ex();
            StaticPageBlocks::get()->init()->ex();
            StaticSnippets::get()->init()->ex();

            // ── Idempotency keys ──
            IdempotencyKeys::get()->init()->ex();

            // ── Canonical content seed ──
            // Guard: only seed when static_pages is empty. On a fresh
            // install all three static_* tables were just created empty
            // above, so the seed runs in full (identical to the previous
            // unguarded behaviour). On a replay (tracker row lost / version
            // hand-reset during incident investigation) the table already
            // holds the canonical rows — and potentially admin edits on top.
            // StaticPagesSeed::install() does wipe()+seed() unconditionally,
            // which would DELETE every static_pages / static_page_blocks /
            // static_snippets row (including admin-authored content) and
            // silently replace them with the canonical seed. Skipping the
            // call entirely when rows already exist preserves that content.
            $staticPagesTable = StaticPages::get()->getTableName();
            $countRows = $pool->query("SELECT COUNT(*) AS cnt FROM {$staticPagesTable}");
            $staticPagesTotal = empty($countRows) ? 0 : (int)($countRows[0]['cnt'] ?? 0);
            if ($staticPagesTotal === 0) {
                StaticPagesSeed::install(time());
                $stdio->outln('M_0002: static-pages seed installed');
            } else {
                $stdio->outln(
                    "M_0002: static_pages already populated ({$staticPagesTotal} rows), "
                    . 'seed skipped to preserve existing content'
                );
            }

            $stdio->outln('M_0002: IRabi business schema created');
        }
    }
}
