<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Migrations {
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Migration\Migration;
    use PHPCraftdream\IRabi\Migrations\Items\M_0001;
    use PHPCraftdream\IRabi\Migrations\Items\M_0002;
    use PHPCraftdream\IRabi\Migrations\Items\M_0003;
    use PHPCraftdream\IRabi\Migrations\Items\M_0004;
    use PHPCraftdream\IRabi\Migrations\Items\M_0005;
    use PHPCraftdream\IRabi\Migrations\Items\M_0006;
    use PHPCraftdream\IRabi\Migrations\Items\M_0007;
    use PHPCraftdream\IRabi\Migrations\Items\M_0008;
    use PHPCraftdream\IRabi\Migrations\Items\M_0009;
    use PHPCraftdream\IRabi\Migrations\Items\M_0010;
    use PHPCraftdream\IRabi\Migrations\Items\M_0011;
    use PHPCraftdream\IRabi\Migrations\Items\M_0012;

    /**
     * Migration plan:
     *   M_0001 — framework tables (accounts, sessions, settings, …).
     *   M_0002 — IRabi business tables + canonical static-pages seed.
     *   M_0003 — invite_tokens.account_type for user vs. expert links.
     *   M_0004 — cookie disclosure: privacy block §7 update + /cookies page.
     *   M_0005 — consent audit columns on accounts (consent_pd_at,
     *            consent_marketing_at, consent_marketing_withdrawn_at).
     *   M_0006 — re-sync /terms block (no-asking-counterparty-to-cancel clause).
     *   M_0007 — `kind` column on cancellation tables (decline vs cancel stats).
     *   M_0008 — email_throttle table for per-account notification frequency.
     *   M_0009 — SEO columns on static_pages (seo_title, og_image).
     *   M_0010 — UNIQUE INDEX on balance_ledger for ledger idempotency.
     *   M_0011 — sys_log_throttle table for per-IP /sys/log rate limiting.
     *   M_0012 — time_slots.booked_count atomic capacity gate (H-01).
     *
     * Historical M_0003..M_0019 were squashed into M_0002 in a one-time
     * consolidation pass. Existing prod DBs at version=19 keep their
     * schema as-is and have their tracker updated to version=2 (no
     * destructive ALTERs replayed).
     */
    class AppMigration extends Migration {
        protected int $currentVersion = 12;

        /**
         * @var array|class-string[]
         */
        protected array $migrationClasses = [
            1 => M_0001::class,
            2 => M_0002::class,
            3 => M_0003::class,
            4 => M_0004::class,
            5 => M_0005::class,
            6 => M_0006::class,
            7 => M_0007::class,
            8 => M_0008::class,
            9 => M_0009::class,
            10 => M_0010::class,
            11 => M_0011::class,
            12 => M_0012::class,
        ];
    }
}
