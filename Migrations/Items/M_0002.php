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
            $bookings = Bookings::get()->getTableName();
            $ledger = BalanceLedger::get()->getTableName();
            $pool->query("
                ALTER TABLE {$bookings}
                  ADD COLUMN active_dup_key VARCHAR(64)
                  GENERATED ALWAYS AS (
                    IF(status IN ('pending','confirmed'),
                       CONCAT(user_id, ':', bookable_type, ':', bookable_id),
                       NULL)
                  ) VIRTUAL
            ");
            $pool->query("ALTER TABLE {$bookings} ADD UNIQUE INDEX uq_active_booking (active_dup_key)");
            $pool->query("ALTER TABLE {$ledger} ADD UNIQUE INDEX uq_ledger_ref (account_id, ref_type, ref_id, entry_type)");

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
            StaticPagesSeed::install(time());

            $stdio->outln('M_0002: IRabi business schema created');
        }
    }
}
