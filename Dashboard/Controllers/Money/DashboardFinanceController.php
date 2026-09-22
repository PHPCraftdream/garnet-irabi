<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Dashboard\Controllers\Money {
    use Aura\SqlQuery\Common\SelectInterface;
    use PHPCraftdream\Garnet\Bundle\Support\Utils\HtmlLayout;
    use PHPCraftdream\Garnet\Bundle\Support\Utils\RenderIsland;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\Account;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Session\Session;
    use PHPCraftdream\Garnet\Kernel\Db\Link\CasUpdate;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Core\IGlobalReqParams;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Web\Router\IRouterUriParams;
    use PHPCraftdream\Garnet\Kernel\Io\Http\Router\Controller\ControllerTools;
    use PHPCraftdream\Garnet\Kernel\Io\Render\Twig\TwigParams;
    use PHPCraftdream\IRabi\Common\Support\Exceptions\AccountLockAcquireException;
    use PHPCraftdream\IRabi\Common\Support\PaginationHelper;
    use PHPCraftdream\IRabi\Common\Tables\Accounts\AccountBalance;
    use PHPCraftdream\IRabi\Common\Tables\Accounts\BalanceLedger;
    use PHPCraftdream\IRabi\Common\Tables\Booking\Bookings;
    use PHPCraftdream\IRabi\Common\Tables\Booking\TimeSlots;
    use PHPCraftdream\IRabi\Common\Tables\Ops\AdminActionLog;
    use PHPCraftdream\IRabi\Dashboard\Controllers\Shell\DashboardController;
    use PHPCraftdream\IRabi\Dashboard\GridConfig;
    use PHPCraftdream\IRabi\Foreground\I18n\ForegroundI18n;
    use PHPCraftdream\IRabi\Foreground\Params\UserEntityConfig;
    use PHPCraftdream\IRabi\IRabi;

    class DashboardFinanceController extends DashboardController {
        public const URL = '/admin/finance/';

        /**
         * Ceiling for a single manual balance adjustment. Guards against a
         * fat-fingered / abusive owner minting an unbounded amount in one call.
         */
        private const MAX_ADJUST_AMOUNT = 1_000_000;

        private const LEDGER_SEARCH_FIELDS = ['entry_type', 'note'];

        private const LEDGER_SORT_FIELDS = ['id', 'amount', 'created_at'];

        /**
         * Raw SQL for "which account is the from/to party of this row" —
         * mirrors the PHP switch in hydrateLedger() exactly, so the two
         * never answer differently for the same row. Needed because the
         * from/to party isn't a plain column: it's account_id itself for
         * some entry_types, the booking's counterpart (via a join) for
         * others, or the manual-adjustment actor_id.
         */
        private static function ledgerPartySql(string $ledgerTbl, string $bookingsTbl, string $slotsTbl, bool $from): string {
            $bookingCounterpart = "{$bookingsTbl}.user_id";
            $slotCounterpart = "{$slotsTbl}.expert_id";

            if ($from) {
                return "CASE
                    WHEN {$ledgerTbl}.entry_type = 'booking_invoice' THEN {$ledgerTbl}.account_id
                    WHEN {$ledgerTbl}.entry_type = 'booking_payment' THEN {$bookingCounterpart}
                    WHEN {$ledgerTbl}.entry_type = 'booking_refund' AND {$ledgerTbl}.is_credit = 1 THEN {$slotCounterpart}
                    WHEN {$ledgerTbl}.entry_type = 'booking_refund' AND {$ledgerTbl}.is_credit = 0 THEN {$ledgerTbl}.account_id
                    WHEN {$ledgerTbl}.entry_type = 'top_up' THEN NULL
                    WHEN {$ledgerTbl}.entry_type = 'manual' AND {$ledgerTbl}.actor_id > 0
                        THEN (CASE WHEN {$ledgerTbl}.is_credit = 1 THEN {$ledgerTbl}.actor_id ELSE {$ledgerTbl}.account_id END)
                    ELSE (CASE WHEN {$ledgerTbl}.is_credit = 1 THEN NULL ELSE {$ledgerTbl}.account_id END)
                END";
            }

            return "CASE
                WHEN {$ledgerTbl}.entry_type = 'booking_invoice' THEN {$slotCounterpart}
                WHEN {$ledgerTbl}.entry_type = 'booking_payment' THEN {$ledgerTbl}.account_id
                WHEN {$ledgerTbl}.entry_type = 'booking_refund' AND {$ledgerTbl}.is_credit = 1 THEN {$ledgerTbl}.account_id
                WHEN {$ledgerTbl}.entry_type = 'booking_refund' AND {$ledgerTbl}.is_credit = 0 THEN {$bookingCounterpart}
                WHEN {$ledgerTbl}.entry_type = 'top_up' THEN {$ledgerTbl}.account_id
                WHEN {$ledgerTbl}.entry_type = 'manual' AND {$ledgerTbl}.actor_id > 0
                    THEN (CASE WHEN {$ledgerTbl}.is_credit = 1 THEN {$ledgerTbl}.account_id ELSE {$ledgerTbl}.actor_id END)
                ELSE (CASE WHEN {$ledgerTbl}.is_credit = 1 THEN {$ledgerTbl}.account_id ELSE NULL END)
            END";
        }

        /**
         * LEFT JOIN balance_ledger → bookings → time_slots, needed only to
         * resolve the from/to party SQL above (booking_* entries reference a
         * counterpart account through the booking/slot, not a ledger column).
         */
        private static function joinLedgerParties(SelectInterface $q): void {
            $ledgerTbl = BalanceLedger::get()->getTableName();
            $bookingsTbl = Bookings::get()->getTableName();
            $slotsTbl = TimeSlots::get()->getTableName();

            $q->join('LEFT', $bookingsTbl, "{$bookingsTbl}.id = {$ledgerTbl}.ref_id AND {$ledgerTbl}.ref_type = 'booking'");
            $q->join('LEFT', $slotsTbl, "{$slotsTbl}.id = {$bookingsTbl}.bookable_id AND {$bookingsTbl}.bookable_type = 'time_slot'");
        }

        /**
         * @return array<string, mixed> PageResponse shape
         */
        private static function fetchLedgerPage(
            int $page,
            int $perPage,
            string $query = '',
            ?string $sortField = null,
            string $sortDir = 'asc',
            array $filters = [],
        ): array {
            $ledgerTbl = BalanceLedger::get()->getTableName();
            $bookingsTbl = Bookings::get()->getTableName();
            $slotsTbl = TimeSlots::get()->getTableName();

            $pageData = PaginationHelper::fetchPage(
                BalanceLedger::get(),
                $page,
                $perPage,
                static function (SelectInterface $q) use ($ledgerTbl, $bookingsTbl, $slotsTbl, $filters, $query, $sortField, $sortDir): void {
                    $q->resetCols();
                    $q->cols([
                        "{$ledgerTbl}.id", "{$ledgerTbl}.account_id", "{$ledgerTbl}.is_credit",
                        "{$ledgerTbl}.amount", "{$ledgerTbl}.entry_type", "{$ledgerTbl}.ref_type",
                        "{$ledgerTbl}.ref_id", "{$ledgerTbl}.note", "{$ledgerTbl}.actor_id",
                        "{$ledgerTbl}.created_at",
                    ]);

                    if (!empty($filters['fromAccountId']) || !empty($filters['toAccountId'])) {
                        static::joinLedgerParties($q);
                        if (!empty($filters['fromAccountId'])) {
                            $fromSql = static::ledgerPartySql($ledgerTbl, $bookingsTbl, $slotsTbl, from: true);
                            $q->where("({$fromSql}) = ?", [(int)$filters['fromAccountId']]);
                        }
                        if (!empty($filters['toAccountId'])) {
                            $toSql = static::ledgerPartySql($ledgerTbl, $bookingsTbl, $slotsTbl, from: false);
                            $q->where("({$toSql}) = ?", [(int)$filters['toAccountId']]);
                        }
                    }
                    if (!empty($filters['entryType'])) {
                        $q->where("{$ledgerTbl}.entry_type = ?", [$filters['entryType']]);
                    }
                    if (!empty($filters['dateFrom'])) {
                        $q->where("{$ledgerTbl}.created_at >= ?", [(int)$filters['dateFrom']]);
                    }
                    if (!empty($filters['dateTo'])) {
                        $q->where("{$ledgerTbl}.created_at <= ?", [(int)$filters['dateTo']]);
                    }

                    PaginationHelper::applySearchAndSort(
                        $q, $query, self::LEDGER_SEARCH_FIELDS, $sortField, $sortDir, self::LEDGER_SORT_FIELDS, "{$ledgerTbl}.id DESC",
                    );
                },
            );

            $pageData->pageItems = static::hydrateLedger($pageData->pageItems);

            return PaginationHelper::toPageResponse($pageData);
        }

        /**
         * Combobox options for the From/To filters + the entry-type dropdown
         * — distinct across the whole table, not just the loaded page.
         *
         * @return array{fromOptions: array<int, array{value: string, label: string}>, toOptions: array<int, array{value: string, label: string}>, entryTypes: array<int, string>}
         */
        private static function fetchLedgerFilterOptions(): array {
            $ledgerTbl = BalanceLedger::get()->getTableName();
            $bookingsTbl = Bookings::get()->getTableName();
            $slotsTbl = TimeSlots::get()->getTableName();

            $collect = static function (bool $from) use ($ledgerTbl, $bookingsTbl, $slotsTbl): array {
                $sql = static::ledgerPartySql($ledgerTbl, $bookingsTbl, $slotsTbl, $from);
                $rows = BalanceLedger::get()->selectAll(static function (SelectInterface $q) use ($sql): void {
                    static::joinLedgerParties($q);
                    $q->resetCols();
                    $q->cols(["({$sql}) AS pid"]);
                    $q->distinct();
                    $q->where("({$sql}) IS NOT NULL");
                });
                return array_values(array_unique(array_map(static fn (array $r): int => (int)$r['pid'], $rows)));
            };

            $fromIds = $collect(true);
            $toIds = $collect(false);
            $allIds = array_unique(array_merge($fromIds, $toIds));

            $accounts = [];
            if (!empty($allIds)) {
                $accs = Account::getAccounts(
                    selectCallback: static function (SelectInterface $select) use ($allIds): void {
                        $select->resetCols();
                        $select->cols(['id', 'login', 'name']);
                        $select->where('id IN (?)', [array_map('intval', $allIds)]);
                    },
                );
                foreach ($accs as $a) {
                    $accounts[(int)$a['id']] = $a;
                }
            }

            $label = static fn (int $id): string => ($accounts[$id]['name'] ?? '') ?: (($accounts[$id]['login'] ?? '') ?: "#{$id}");
            $toOption = static fn (int $id): array => ['value' => (string)$id, 'label' => $label($id)];

            $entryTypeRows = BalanceLedger::get()->selectAll(static function (SelectInterface $q): void {
                $q->resetCols();
                $q->cols(['entry_type']);
                $q->distinct();
            });

            return [
                'fromOptions' => array_map($toOption, $fromIds),
                'toOptions' => array_map($toOption, $toIds),
                'entryTypes' => array_values(array_unique(array_column($entryTypeRows, 'entry_type'))),
            ];
        }

        /**
         * @param array<int, array<string, mixed>> $rows
         * @return array<int, array<string, mixed>>
         */
        private static function hydrateLedger(array $rows): array {
            if ($rows === []) {
                return $rows;
            }

            // Fetch accounts for all ledger owners + actors (admins who made manual adjustments)
            $accountIds = array_values(array_unique(array_filter(array_column($rows, 'account_id'))));
            foreach ($rows as $row) {
                if (!empty($row['actor_id'])) {
                    $accountIds[] = (int)$row['actor_id'];
                }
            }
            $accountIds = array_values(array_unique(array_map('intval', $accountIds)));
            $allAccounts = [];
            if (!empty($accountIds)) {
                $accs = Account::getAccounts(
                    selectCallback: static function (SelectInterface $sel) use ($accountIds): void {
                        $sel->resetCols();
                        $sel->cols(['id', 'login', 'name']);
                        $sel->where('id IN (?)', [array_map('intval', $accountIds)]);
                    },
                );
                foreach ($accs as $a) {
                    $allAccounts[(int)$a['id']] = $a;
                }
            }

            foreach ($rows as &$row) {
                $aid = (int)$row['account_id'];
                $row['login'] = $allAccounts[$aid]['login'] ?? '';
                $row['name'] = $allAccounts[$aid]['name'] ?? '';
            }

            // Enrich rows that reference a booking
            $bookingRefIds = array_values(array_unique(array_map(
                fn ($r) => (int)$r['ref_id'],
                array_filter($rows, fn ($r) => $r['ref_type'] === 'booking' && $r['ref_id'])
            )));

            $bookingsMap = [];
            $slotsMap = [];

            if (!empty($bookingRefIds)) {
                $bookingsData = Bookings::get()->selectAll(function (SelectInterface $q) use ($bookingRefIds): void {
                    $q->where('id IN (?)', [array_map('intval', $bookingRefIds)]);
                });
                foreach ($bookingsData as $b) {
                    $bookingsMap[(int)$b['id']] = $b;
                }

                $slotIds = array_values(array_unique(array_filter(array_map(
                    fn ($b) => $b['bookable_type'] === 'time_slot' ? (int)$b['bookable_id'] : null,
                    $bookingsData
                ))));
                $slotsData = [];
                if (!empty($slotIds)) {
                    $slotsData = TimeSlots::get()->selectAll(function (SelectInterface $q) use ($slotIds): void {
                        $q->where('id IN (?)', [array_map('intval', $slotIds)]);
                    });
                    foreach ($slotsData as $s) {
                        $slotsMap[(int)$s['id']] = $s;
                    }
                }

                // Collect counterpart account ids (users from bookings, experts from slots)
                $counterpartIds = [];
                foreach ($bookingsData as $b) {
                    if ((int)$b['user_id']) {
                        $counterpartIds[] = (int)$b['user_id'];
                    }
                }
                foreach ($slotsData as $s) {
                    if ((int)$s['expert_id']) {
                        $counterpartIds[] = (int)$s['expert_id'];
                    }
                }

                $extraIds = array_values(array_unique(array_diff($counterpartIds, array_keys($allAccounts))));
                if (!empty($extraIds)) {
                    $extraAccs = Account::getAccounts(
                        selectCallback: static function (SelectInterface $sel) use ($extraIds): void {
                            $sel->resetCols();
                            $sel->cols(['id', 'login', 'name']);
                            $sel->where('id IN (?)', [array_map('intval', $extraIds)]);
                        },
                    );
                    foreach ($extraAccs as $a) {
                        $allAccounts[(int)$a['id']] = $a;
                    }
                }
            }

            // Helper: build an account party
            $accountParty = function (int $id) use (&$allAccounts): array {
                $a = $allAccounts[$id] ?? null;
                return [
                    'type' => 'account',
                    'account_id' => $id,
                    'label' => $a ? ($a['name'] ?: $a['login']) : "#{$id}",
                    'sub' => null,
                ];
            };
            $externalParty = ['type' => 'external', 'account_id' => null, 'label' => null, 'sub' => null];
            $systemParty = ['type' => 'system',   'account_id' => null, 'label' => null, 'sub' => null];

            foreach ($rows as &$row) {
                $row['ref_data'] = null;

                $entryType = $row['entry_type'];
                $isCredit = (bool)(int)$row['is_credit'];
                $accountId = (int)$row['account_id'];

                $b = ($row['ref_type'] === 'booking' && $row['ref_id'])
                    ? ($bookingsMap[(int)$row['ref_id']] ?? null)
                    : null;
                $s = $b && $b['bookable_type'] === 'time_slot'
                    ? ($slotsMap[(int)$b['bookable_id']] ?? null)
                    : null;

                if ($b) {
                    $row['ref_data'] = [
                        'booking_id' => (int)$b['id'],
                        'booking_status' => $b['status'],
                        'slot_start_at' => $s ? $s['start_at'] : null,
                        'slot_duration_min' => $s ? (int)($s['duration_min'] ?? 60) : null,
                        'slot_cost' => $s ? (int)($s['cost'] ?? 0) : null,
                        'slot_is_online' => $s ? (int)($s['is_online'] ?? 1) : null,
                        'slot_location' => $s ? ($s['location'] ?? '') : null,
                    ];
                }

                $userId = $b ? (int)$b['user_id'] : null;
                $expertId = $s ? (int)$s['expert_id'] : null;

                $slotLabel = $s
                    ? "Slot #{$b['bookable_id']}"
                    : ($b ? "Booking #{$b['id']}" : null);

                $slotParty = [
                    'type' => 'slot',
                    'account_id' => null,
                    'label' => $slotLabel ?? '—',
                    'sub' => null,
                ];

                switch ($entryType) {
                    case 'booking_invoice': // user debited → expert credited (paired w/ booking_payment)
                        // account_id == user_id; expert is counterpart
                        $row['from'] = $accountParty($accountId);
                        $row['to'] = $expertId
                            ? $accountParty($expertId)
                            : ($s ? $slotParty : $systemParty);
                        break;

                    case 'booking_payment': // expert credited ← from user
                        // account_id == expert_id; user is counterpart
                        $row['from'] = $userId
                            ? $accountParty($userId)
                            : ($s ? $slotParty : $systemParty);
                        $row['to'] = $accountParty($accountId);
                        break;

                    case 'booking_refund': // counterpart depends on direction
                        if ($isCredit) {
                            // user credited; account_id == user_id; from = expert
                            $row['from'] = $expertId
                                ? $accountParty($expertId)
                                : ($s ? $slotParty : $systemParty);
                            $row['to'] = $accountParty($accountId);
                        } else {
                            // expert debited; account_id == expert_id; to = user
                            $row['from'] = $accountParty($accountId);
                            $row['to'] = $userId
                                ? $accountParty($userId)
                                : ($s ? $slotParty : $systemParty);
                        }
                        break;

                    case 'top_up': // external → account
                        $row['from'] = $externalParty;
                        $row['to'] = $accountParty($accountId);
                        break;

                    default: // manual or unknown
                        $actorId = (int)($row['actor_id'] ?? 0);
                        if ($entryType === 'manual' && $actorId > 0) {
                            // Manual adjustment by admin → counterpart is the admin actor
                            $row['from'] = $isCredit ? $accountParty($actorId) : $accountParty($accountId);
                            $row['to'] = $isCredit ? $accountParty($accountId) : $accountParty($actorId);
                        } else {
                            // Legacy manual entries without actor_id, or unknown entry type
                            $row['from'] = $isCredit ? $systemParty : $accountParty($accountId);
                            $row['to'] = $isCredit ? $accountParty($accountId) : $systemParty;
                        }
                        break;
                }
            }
            unset($row);

            return $rows;
        }

        private const BALANCES_SORT_FIELDS = ['id', 'balance', 'updated_at'];

        /**
         * @return array<string, mixed> PageResponse shape
         */
        private static function fetchBalancesPage(
            int $page,
            int $perPage,
            string $query = '',
            ?string $sortField = null,
            string $sortDir = 'asc',
            array $filters = [],
        ): array {
            $pageData = PaginationHelper::fetchPage(
                AccountBalance::get(),
                $page,
                $perPage,
                static function (SelectInterface $q) use ($filters, $query, $sortField, $sortDir): void {
                    if (!empty($filters['accountId'])) {
                        $q->where('account_id = ?', [(int)$filters['accountId']]);
                    }
                    if (!empty($filters['dateFrom'])) {
                        $q->where('updated_at >= ?', [(int)$filters['dateFrom']]);
                    }
                    if (!empty($filters['dateTo'])) {
                        $q->where('updated_at <= ?', [(int)$filters['dateTo']]);
                    }
                    // No real free-text column on account_balance — name/login
                    // are hydrated below, not searchable server-side.
                    PaginationHelper::applySearchAndSort($q, $query, [], $sortField, $sortDir, self::BALANCES_SORT_FIELDS, 'balance DESC');
                },
            );

            $pageData->pageItems = static::hydrateBalances($pageData->pageItems);

            return PaginationHelper::toPageResponse($pageData);
        }

        /**
         * @return array<int, array{value: string, label: string}>
         */
        private static function fetchBalancesFilterOptions(): array {
            $accountIds = array_column(AccountBalance::get()->selectAll(static function (SelectInterface $q): void {
                $q->resetCols();
                $q->cols(['account_id']);
            }), 'account_id');
            $accountIds = array_values(array_unique(array_map('intval', $accountIds)));

            if (empty($accountIds)) {
                return [];
            }

            $accs = Account::getAccounts(
                selectCallback: static function (SelectInterface $select) use ($accountIds): void {
                    $select->resetCols();
                    $select->cols(['id', 'login', 'name']);
                    $select->where('id IN (?)', [$accountIds]);
                },
            );

            $options = array_map(static fn (array $a): array => [
                'value' => (string)$a['id'],
                'label' => $a['name'] ?: ($a['login'] ?: "#{$a['id']}"),
            ], $accs);

            usort($options, static fn (array $a, array $b): int => strcasecmp($a['label'], $b['label']));

            return $options;
        }

        /**
         * @param array<int, array<string, mixed>> $balances
         * @return array<int, array<string, mixed>>
         */
        private static function hydrateBalances(array $balances): array {
            if ($balances === []) {
                return $balances;
            }

            $accountIds = array_unique(array_filter(array_column($balances, 'account_id')));
            $accounts = [];
            if (!empty($accountIds)) {
                $accs = Account::getAccounts(
                    selectCallback: static function (SelectInterface $select) use ($accountIds): void {
                        $select->resetCols();
                        $select->cols(['id', 'login', 'name', 'type']);
                        $select->where('id IN (?)', [array_map('intval', $accountIds)]);
                    },
                    accountDataFields: [Account::IS_MODERATOR, Account::IS_OWNER, Account::IS_ADMIN],
                );
                foreach ($accs as $a) {
                    $accounts[(int)$a['id']] = $a;
                }
            }

            foreach ($balances as &$bal) {
                $aid = (int)$bal['account_id'];
                $acc = $accounts[$aid] ?? null;
                $bal['login'] = $acc['login'] ?? '';
                $bal['name'] = $acc['name'] ?? '';
                $bal['type'] = $acc ? static::resolveRole($acc) : '';
            }

            return $balances;
        }

        private static function resolveRole(array $account): string {
            if (intval($account[Account::IS_ADMIN] ?? 0) > 0) {
                return 'admin';
            }
            if (intval($account[Account::IS_OWNER] ?? 0) > 0) {
                return 'owner';
            }
            if (intval($account[Account::IS_MODERATOR] ?? 0) > 0) {
                return 'moderator';
            }
            return $account['type'] ?? 'user';
        }

        public static function get__main(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            if (!static::isModerator()) {
                return ControllerTools::redirect(IRabi::url('/'));
            }

            $url = $globals->getUri();
            $t = ForegroundI18n::getInstance();

            $tabParam = (string)($globals->readGetValue('tab', '') ?? '');
            $initialTab = $tabParam === 'balances' ? 'balances' : 'finance';

            $ledgerGridConfig = GridConfig::make(
                columns: [
                    GridConfig::col('created_at', $t->Admin_Ledger_Date()),
                    GridConfig::col('from',       $t->Admin_Ledger_From()),
                    GridConfig::col('to',         $t->Admin_Ledger_To()),
                    GridConfig::col('entry_type', $t->Admin_Ledger_Type()),
                    GridConfig::col('amount',     $t->Admin_Ledger_Amount(), shrink: true),
                    GridConfig::col('note',       $t->Admin_Ledger_Note()),
                ],
                // login/name are hydrated (joined from accounts), not real
                // columns on balance_ledger — server-side search can only
                // cover entry_type/note.
                searchFields: ['entry_type', 'note'],
                sortFields:   self::LEDGER_SORT_FIELDS,
                pageSize:     PaginationHelper::DEFAULT_PER_PAGE,
            );

            $balancesGridConfig = GridConfig::make(
                columns: [
                    GridConfig::col('name', $t->Admin_Balance_Account()),
                    GridConfig::col('balance', $t->Admin_Balance_Balance(), shrink: true),
                    GridConfig::col('updated_at', $t->Admin_Balance_Updated()),
                ],
                // name isn't a real column on account_balance either — the
                // account combobox filter covers "find by user" instead.
                searchFields: [],
                sortFields:   self::BALANCES_SORT_FIELDS,
                pageSize:     PaginationHelper::DEFAULT_PER_PAGE,
            );

            $content = RenderIsland::render('admin-finance', [
                'ledgerPageUrl' => IRabi::url(self::URL . '~ledgerPage'),
                'ledgerInitialData' => static::fetchLedgerPage(1, PaginationHelper::DEFAULT_PER_PAGE),
                'ledgerInitialFilterOptions' => static::fetchLedgerFilterOptions(),
                'balancesPageUrl' => IRabi::url(self::URL . '~balancesPage'),
                'balancesInitialData' => static::fetchBalancesPage(1, PaginationHelper::DEFAULT_PER_PAGE),
                'balancesInitialAccountOptions' => static::fetchBalancesFilterOptions(),
                'ledgerGridConfig' => $ledgerGridConfig,
                'balancesGridConfig' => $balancesGridConfig,
                'userDetailUrl' => IRabi::url('/admin/~userDetail'),
                'adjustUrl' => IRabi::url(self::URL . '~adjustBalance'),
                // Manual adjustment is owner/admin-only (enforced server-side in
                // post__adjustBalance). Hide the button for moderators so they
                // don't see an action that would 403.
                'canAdjust' => static::isOwner(),
                'initialTab' => $initialTab,
            ]);

            return ControllerTools::ok(HtmlLayout::render(
                TwigParams::init()->get(TwigParams::DEF_LAYOUT_PARAMS, [
                    'content' => $content,
                    'top_menu_items' => static::getMainMenu($url),
                    'side_menu_items' => static::getSideMenu($url),
                ])
            ));
        }

        public static function post__ledgerPage(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            if (!static::isModerator()) {
                return ControllerTools::JSON(['error' => 'Access denied'], status: 403);
            }
            ['page' => $page, 'perPage' => $perPage] = PaginationHelper::readPageParams($globals);
            ['query' => $query, 'sortField' => $sortField, 'sortDir' => $sortDir] = PaginationHelper::readSearchSortParams($globals);
            $filters = [
                'fromAccountId' => (int)$globals->readPostValue('fromAccountId', '0') ?: null,
                'toAccountId' => (int)$globals->readPostValue('toAccountId', '0') ?: null,
                'entryType' => (string)$globals->readPostValue('entryType', '') ?: null,
                'dateFrom' => (int)$globals->readPostValue('dateFrom', '0') ?: null,
                'dateTo' => (int)$globals->readPostValue('dateTo', '0') ?: null,
            ];

            return ControllerTools::JSON(static::fetchLedgerPage($page, $perPage, $query, $sortField, $sortDir, $filters));
        }

        public static function post__balancesPage(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            if (!static::isModerator()) {
                return ControllerTools::JSON(['error' => 'Access denied'], status: 403);
            }
            ['page' => $page, 'perPage' => $perPage] = PaginationHelper::readPageParams($globals);
            ['query' => $query, 'sortField' => $sortField, 'sortDir' => $sortDir] = PaginationHelper::readSearchSortParams($globals);
            $filters = [
                'accountId' => (int)$globals->readPostValue('accountId', '0') ?: null,
                'dateFrom' => (int)$globals->readPostValue('dateFrom', '0') ?: null,
                'dateTo' => (int)$globals->readPostValue('dateTo', '0') ?: null,
            ];

            return ControllerTools::JSON(static::fetchBalancesPage($page, $perPage, $query, $sortField, $sortDir, $filters));
        }

        public static function post__adjustBalance(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            // Money movement is owner/admin-only. A moderator (lowest staff rank)
            // must never be able to mint or drain funds — see security audit H-1.
            if (!static::isOwner()) {
                return ControllerTools::JSON(['error' => 'Access denied'], status: 403);
            }

            $postCsrf = $globals->readPostValue(Session::CSRF_TOKEN, '');
            if (!hash_equals(Session::touchCSRF_(), (string)$postCsrf)) {
                return ControllerTools::JSON(['error' => 'CSRF check failed'], status: 403);
            }

            $accountId = (int)$globals->readPostValue('account_id', '0');
            $amount = (int)$globals->readPostValue('amount', '0');
            $isCredit = (int)$globals->readPostValue('is_credit', '0') === 1;
            $note = trim((string)$globals->readPostValue('note', ''));

            if ($accountId <= 0) {
                return ControllerTools::JSON(['error' => 'Invalid account_id'], status: 400);
            }
            if ($amount <= 0 || $amount > self::MAX_ADJUST_AMOUNT) {
                return ControllerTools::JSON(['error' => 'Invalid amount'], status: 400);
            }
            if (mb_strlen($note) < 3 || mb_strlen($note) > 500) {
                return ControllerTools::JSON(['error' => 'Invalid note'], status: 400);
            }

            // Target-rank guard: block adjusting an account that outranks the
            // actor (e.g. owner touching an admin) and block self-adjustment.
            if (!UserEntityConfig::actorMayActOn($accountId)) {
                return ControllerTools::JSON(['error' => 'Access denied'], status: 403);
            }

            // Verify account exists
            $accounts = Account::getAccounts(
                selectCallback: static function (SelectInterface $sel) use ($accountId): void {
                    $sel->resetCols();
                    $sel->cols(['id', 'login', 'name']);
                    $sel->where('id = ?', [$accountId]);
                },
            );
            if (empty($accounts)) {
                return ControllerTools::JSON(['error' => 'Account not found'], status: 404);
            }
            $target = $accounts[0];
            $targetLogin = (string)($target['login'] ?? '');

            $oldBalance = AccountBalance::getBalance($accountId);

            $actor = Account::fromSession();
            $actorId = $actor !== null ? (int)$actor->readParam('id') : null;

            // Money critical section (handover audit 03, finding H-1): the
            // transient CAS-debit (for debits) and the ledger insert must be
            // serialised per account against any concurrent recalculate() —
            // otherwise a concurrent top-up/refund recalculates the cache from
            // a ledger missing this debit and resurrects the spent money,
            // defeating the overdraft guard. The lock also covers the final
            // recalculate, so the balance returned below is authoritative.
            try {
                $debitResult = AccountBalance::withAccountLock(
                    $accountId,
                    static function () use ($accountId, $amount, $isCredit, $note, $actorId) {
                        // Overdraft guard for debits: atomically ensure sufficient
                        // funds before recording the ledger entry. The framework
                        // replaces SQL transactions with idempotent CAS updates
                        // (see CasUpdate), so we mirror the booking flow — a debit
                        // that would drive the balance below zero affects 0 rows
                        // and is refused. Credits need no guard; recalculate()
                        // below rebuilds the authoritative balance from the ledger
                        // in both cases.
                        if (!$isCredit) {
                            $balanceTbl = AccountBalance::get()->getTableName();
                            $affected = CasUpdate::exec(
                                "UPDATE {$balanceTbl} SET balance = balance - ?, updated_at = ? WHERE account_id = ? AND balance >= ?",
                                [$amount, time(), $accountId, $amount]
                            );
                            if ($affected === 0) {
                                return ControllerTools::JSON(['error' => 'Insufficient balance'], status: 400);
                            }
                        }

                        // Прямой insert + recalculate (вместо addEntry()), чтобы записать actor_id
                        // и при просмотре ledger в админке видеть, кто именно сделал корректировку.
                        BalanceLedger::get()->insert([
                            'account_id' => $accountId,
                            'is_credit' => $isCredit ? 1 : 0,
                            'amount' => $amount,
                            'entry_type' => 'manual',
                            'ref_type' => null,
                            'ref_id' => null,
                            'note' => $note,
                            'actor_id' => $actorId,
                            'created_at' => time(),
                        ]);
                        AccountBalance::recalculate($accountId);

                        return null;
                    },
                );
            } catch (AccountLockAcquireException) {
                return ControllerTools::JSON(['error' => 'Account is busy, please retry'], status: 503);
            }

            if ($debitResult !== null) {
                return $debitResult;
            }

            $newBalance = AccountBalance::getBalance($accountId);

            if ($actor !== null) {
                AdminActionLog::get()->writeLog(
                    actorId:     (int)$actor->readParam('id'),
                    actorLogin:  (string)$actor->readParam('login'),
                    targetId:    $accountId,
                    targetLogin: $targetLogin,
                    action:      'balance.adjust',
                    oldValue:    (string)$oldBalance,
                    newValue:    (string)$newBalance,
                );
            }

            return ControllerTools::JSON([
                'success' => true,
                'account_id' => $accountId,
                'new_balance' => $newBalance,
                'updated_at' => time(),
            ]);
        }
    }
}
