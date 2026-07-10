<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Dashboard\Controllers {
    use Aura\SqlQuery\Common\SelectInterface;
    use PHPCraftdream\Garnet\Bundle\Utils\HtmlLayout;
    use PHPCraftdream\Garnet\Bundle\Utils\RenderIsland;
    use PHPCraftdream\Garnet\Kernel\Db\Entity\Account\Account;
    use PHPCraftdream\Garnet\Kernel\Interfaces\IGlobalReqParams;
    use PHPCraftdream\Garnet\Kernel\Interfaces\Router\IRouterUriParams;
    use PHPCraftdream\Garnet\Kernel\Io\Router\ControllerTools;
    use PHPCraftdream\Garnet\Kernel\Io\Twig\TwigParams;
    use PHPCraftdream\IRabi\Common\PaginationHelper;
    use PHPCraftdream\IRabi\Common\Tables\AccountBalance;
    use PHPCraftdream\IRabi\Common\Tables\AdminActionLog;
    use PHPCraftdream\IRabi\Common\Tables\BalanceLedger;
    use PHPCraftdream\IRabi\Common\Tables\Bookings;
    use PHPCraftdream\IRabi\Common\Tables\TimeSlots;
    use PHPCraftdream\IRabi\Dashboard\GridConfig;
    use PHPCraftdream\IRabi\Foreground\I18n\ForegroundI18n;
    use PHPCraftdream\IRabi\IRabi;

    class DashboardFinanceController extends DashboardController {
        public const URL = '/admin/finance/';

        private static function fetchLedger(): array {
            $rows = BalanceLedger::get()->selectAll(function (SelectInterface $q): void {
                $q->orderBy(['id DESC']);
                $q->limit(300);
            });

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

        private static function fetchBalances(): array {
            $balances = AccountBalance::get()->selectAll(function (SelectInterface $q): void {
                $q->orderBy(['balance DESC']);
            });

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
                searchFields: ['login', 'name', 'entry_type', 'note'],
                sortFields:   ['id', 'amount', 'created_at'],
                pageSize:     PaginationHelper::DEFAULT_PER_PAGE,
            );

            $balancesGridConfig = GridConfig::make(
                columns: [
                    GridConfig::col('name', $t->Admin_Balance_Account()),
                    GridConfig::col('balance', $t->Admin_Balance_Balance(), shrink: true),
                    GridConfig::col('updated_at', $t->Admin_Balance_Updated()),
                ],
                searchFields: ['name'],
                sortFields:   ['balance', 'updated_at'],
                pageSize:     PaginationHelper::DEFAULT_PER_PAGE,
            );

            $content = RenderIsland::render('admin-finance', [
                'ledger' => static::fetchLedger(),
                'balances' => static::fetchBalances(),
                'ledgerGridConfig' => $ledgerGridConfig,
                'balancesGridConfig' => $balancesGridConfig,
                'userDetailUrl' => IRabi::url('/admin/~userDetail'),
                'adjustUrl' => IRabi::url(self::URL . '~adjustBalance'),
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

        public static function post__adjustBalance(IGlobalReqParams $globals, IRouterUriParams $params): mixed {
            if (!static::isModerator()) {
                return ControllerTools::JSON(['error' => 'Access denied'], status: 403);
            }

            $accountId = (int)$globals->readPostValue('account_id', '0');
            $amount = (int)$globals->readPostValue('amount', '0');
            $isCredit = (int)$globals->readPostValue('is_credit', '0') === 1;
            $note = trim((string)$globals->readPostValue('note', ''));

            if ($accountId <= 0) {
                return ControllerTools::JSON(['error' => 'Invalid account_id'], status: 400);
            }
            if ($amount <= 0) {
                return ControllerTools::JSON(['error' => 'Invalid amount'], status: 400);
            }
            if (mb_strlen($note) < 3 || mb_strlen($note) > 500) {
                return ControllerTools::JSON(['error' => 'Invalid note'], status: 400);
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
