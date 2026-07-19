<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Services {
    use PHPCraftdream\Garnet\Kernel\Db\Query\QueryEx;
    use PHPCraftdream\IRabi\Common\Tables\AccountBalance;
    use PHPCraftdream\IRabi\Common\Tables\BalanceLedger;
    use PHPCraftdream\IRabi\Common\Tables\Bookings;
    use PHPCraftdream\IRabi\Common\Tables\TimeSlots;

    /**
     * Read-only balance/ledger reconciliation (handover audit 03, finding H-4,
     * recommendation §4). Detects — but never repairs — discrepancies between
     * the cached `account_balance.balance` and the append-only `balance_ledger`,
     * booking-ledger pairing violations, orphaned money, and the global
     * "booking turnover sums to zero" invariant.
     *
     * Why this exists: the money path is a two-phase CAS-debit + ledger insert
     * + recalculate(), with several crash windows (H-1/H-2/H-3/M-4/M-5) that
     * can leave the cache and ledger out of sync, drop a refund, or split a
     * paired invoice/payment. Without a reconciliation pass those incidents
     * are invisible until a user complains. Every method here is a pure
     * SELECT — repair is intentionally a separate, human-gated command.
     *
     * Pairing semantics are derived from the actual write paths in
     * BookingsController::post__book / post__cancel and SlotsController
     * (NOT from the audit's prose, which uses simplified names): for each
     * (ref_type='booking', ref_id=bookingId) the ledger holds
     *   - exactly one booking_invoice  (is_credit=0 on the buyer,  amount=cost)
     *   - exactly one booking_payment  (is_credit=1 on the expert, amount=cost)
     * and, only after a cancellation, a symmetric refund pair
     *   - one booking_refund (is_credit=1 on the buyer,  amount=userRefund)
     *   - one booking_refund (is_credit=0 on the expert, amount=expertDebit)
     * where userRefund === expertDebit (computeRefundAmounts returns the same
     * value for both legs, even in the partial-refund/penalty branch).
     *
     * @see BookingsController::post__book           invoice+payment insert (cost>0)
     * @see BookingsController::computeRefundAmounts refund split (cost or cost-penalty)
     * @see DashboardFinanceController switch        UI counterpart-direction map
     */
    class BalanceReconciliationService {
        /**
         * Run every check and return a structured report.
         *
         * @return array{
         *     cache_vs_ledger:array{count:int,items:array<int,array<string,int>>},
         *     booking_pairing:array{count:int,items:array<int,array<string,int|string>>},
         *     orphans:array{count:int,items:array<int,array<string,int|string|null>>},
         *     global_zero:array{count:int,turnover:int,items:array<int,array<string,int>>},
         *     negatives:array{count:int,items:array<int,array<string,int>>},
         *     idempotency_index:array{present:bool,count:int}
         * }
         */
        public static function runAll(): array {
            return [
                'cache_vs_ledger' => static::checkCacheVsLedger(),
                'booking_pairing' => static::checkBookingPairing(),
                'orphans' => static::checkOrphans(),
                'global_zero' => static::checkGlobalZero(),
                'negatives' => static::checkNegativeBalances(),
                'idempotency_index' => static::checkIdempotencyIndex(),
            ];
        }

        /**
         * (a) Cache vs ledger: per-account `account_balance.balance` must equal
         * `SUM(CASE WHEN is_credit=1 THEN amount ELSE -amount END)` over its
         * ledger rows. Both directions are checked — a balance row whose sum
         * disagrees, AND a ledger that has rows for an account with no balance
         * row at all (or whose implicit-zero balance is wrong).
         *
         * @return array{count:int,items:array<int,array<string,int>>}
         *     Each item: {account_id, cached_balance, ledger_sum, diff}
         */
        public static function checkCacheVsLedger(): array {
            $balance = AccountBalance::get()->getTableName();
            $ledger = BalanceLedger::get()->getTableName();

            // Side 1: balance row exists, compare to its ledger sum.
            $sql1 = "SELECT b.account_id AS account_id,
                            b.balance AS cached_balance,
                            COALESCE(SUM(CASE WHEN l.is_credit = 1 THEN l.amount ELSE -l.amount END), 0) AS ledger_sum
                     FROM `{$balance}` b
                     LEFT JOIN `{$ledger}` l ON l.account_id = b.account_id
                     GROUP BY b.account_id, b.balance
                     HAVING b.balance <> COALESCE(
                       SUM(CASE WHEN l.is_credit = 1 THEN l.amount ELSE -l.amount END), 0
                     )";
            $rows1 = static::fetchRows($sql1);

            // Side 2: ledger has rows for an account with NO balance row.
            // (A missing balance row with a zero ledger sum is harmless —
            // recalculate() will create it on the next money op — so we only
            // flag accounts whose ledger sum is non-zero.)
            $sql2 = "SELECT ll.account_id AS account_id,
                            0 AS cached_balance,
                            ll.ledger_sum AS ledger_sum
                     FROM (
                       SELECT account_id,
                              SUM(CASE WHEN is_credit = 1 THEN amount ELSE -amount END) AS ledger_sum
                       FROM `{$ledger}`
                       GROUP BY account_id
                     ) ll
                     LEFT JOIN `{$balance}` b ON b.account_id = ll.account_id
                     WHERE b.account_id IS NULL AND ll.ledger_sum <> 0";
            $rows2 = static::fetchRows($sql2);

            $items = [];
            foreach (array_merge($rows1, $rows2) as $row) {
                $cached = (int)($row['cached_balance'] ?? 0);
                $sum = (int)($row['ledger_sum'] ?? 0);
                $items[] = [
                    'account_id' => (int)$row['account_id'],
                    'cached_balance' => $cached,
                    'ledger_sum' => $sum,
                    'diff' => $cached - $sum,
                ];
            }

            return ['count' => count($items), 'items' => $items];
        }

        /**
         * (b) Booking pairing: for each (ref_type='booking', ref_id) the ledger
         * totals must satisfy three rules derived from the write paths:
         *   1. invoice_total (booking_invoice, is_credit=0) == payment_total
         *      (booking_payment, is_credit=1) — one buyer debit pairs with one
         *      expert credit of the same cost.
         *   2. refund_credit (booking_refund, is_credit=1) == refund_debit
         *      (booking_refund, is_credit=0) — the refund pair is symmetric.
         *   3. refund_credit <= invoice_total — never refund more than charged.
         *
         * Each violating ref_id produces one detail item per failed rule, so
         * the report names the specific breakage rather than just the booking.
         *
         * @return array{count:int,items:array<int,array<string,int|string>>}
         *     Each item: {ref_id, rule, invoice_total, payment_total,
         *                 refund_credit, refund_debit}
         */
        public static function checkBookingPairing(): array {
            $ledger = BalanceLedger::get()->getTableName();

            $sql = "SELECT l.ref_id AS ref_id,
                           COALESCE(SUM(CASE WHEN l.entry_type = 'booking_invoice'
                                              AND l.is_credit = 0 THEN l.amount ELSE 0 END), 0) AS invoice_total,
                           COALESCE(SUM(CASE WHEN l.entry_type = 'booking_payment'
                                              AND l.is_credit = 1 THEN l.amount ELSE 0 END), 0) AS payment_total,
                           COALESCE(SUM(CASE WHEN l.entry_type = 'booking_refund'
                                              AND l.is_credit = 1 THEN l.amount ELSE 0 END), 0) AS refund_credit,
                           COALESCE(SUM(CASE WHEN l.entry_type = 'booking_refund'
                                              AND l.is_credit = 0 THEN l.amount ELSE 0 END), 0) AS refund_debit
                    FROM `{$ledger}` l
                    WHERE l.ref_type = 'booking' AND l.ref_id IS NOT NULL
                    GROUP BY l.ref_id
                    HAVING invoice_total <> payment_total
                          OR refund_credit <> refund_debit
                          OR refund_credit > invoice_total";
            $rows = static::fetchRows($sql);

            $items = [];
            foreach ($rows as $row) {
                $refId = (int)$row['ref_id'];
                $invoice = (int)$row['invoice_total'];
                $payment = (int)$row['payment_total'];
                $refundC = (int)$row['refund_credit'];
                $refundD = (int)$row['refund_debit'];

                if ($invoice !== $payment) {
                    $items[] = self::pairItem($refId, 'invoice != payment', $invoice, $payment, $refundC, $refundD);
                }
                if ($refundC !== $refundD) {
                    $items[] = self::pairItem($refId, 'refund_credit != refund_debit', $invoice, $payment, $refundC, $refundD);
                }
                if ($refundC > $invoice) {
                    $items[] = self::pairItem($refId, 'refund > invoice', $invoice, $payment, $refundC, $refundD);
                }
            }

            return ['count' => count($items), 'items' => $items];
        }

        /**
         * (c) Orphaned money: three sub-checks that catch the crash windows in
         * H-2 / M-4 / M-5 — a paid booking whose ledger side never landed (or
         * landed for a booking that no longer exists):
         *   c1. cancelled booking of a PAID slot with no booking_refund entry
         *       (H-2: refund insert crashed between status CAS and ledger).
         *   c2. active (pending|confirmed) booking of a PAID slot with no
         *       booking_invoice entry (M-5: invoice insert crashed after CAS).
         *   c3. ledger rows pointing at ref_type='booking' + a ref_id that is
         *       not in `bookings` at all (M-4 / ClearUserService L-6 leakage).
         *
         * "Paid" is read from time_slots.cost at audit time — this is the same
         * source the cancel path uses today, so it flags exactly the bookings
         * the cancel path would have tried to refund.
         *
         * c1 excludes one legitimate zero-refund case: BookingsController's
         * computeRefundAmounts() returns a 0 refund (and tryAddRefund() is
         * then never called at all — see post__cancel()'s `if ($userRefund >
         * 0)` guard) when a user cancels a CONFIRMED booking before the slot
         * starts on a slot with cancellation_penalty_percent=100. That is a
         * legitimate no-refund outcome, not a dropped write, so a cancelled
         * booking matching that exact shape (confirmed before cancel,
         * cancelled strictly before start_at, 100% penalty) is excluded here
         * — every other cancelled+paid+no-refund combination still refunds
         * the full cost per computeRefundAmounts()'s `!$partialApplies`
         * branch, so it is still flagged. Who actually clicked cancel (user
         * vs. expert/moderator) isn't persisted on the booking, so this is
         * the closest replica of the real business rule the schema allows.
         *
         * @return array{count:int,items:array<int,array<string,int|string|null>>}
         */
        public static function checkOrphans(): array {
            $bookings = Bookings::get()->getTableName();
            $slots = TimeSlots::get()->getTableName();
            $ledger = BalanceLedger::get()->getTableName();

            // c1: cancelled paid bookings without booking_refund, excluding
            // the legitimate 100%-penalty/cancelled-before-start zero-refund
            // case (see docblock above).
            $sqlC1 = "SELECT b.id AS booking_id, b.user_id AS user_id,
                             ts.cost AS cost, ts.expert_id AS expert_id
                      FROM `{$bookings}` b
                      JOIN `{$slots}` ts ON ts.id = b.bookable_id
                      LEFT JOIN `{$ledger}` l
                        ON l.ref_type = 'booking'
                       AND l.ref_id = b.id
                       AND l.entry_type = 'booking_refund'
                      WHERE b.bookable_type = 'time_slot'
                        AND b.status = 'cancelled'
                        AND ts.cost > 0
                        AND l.id IS NULL
                        AND NOT (
                          ts.cancellation_penalty_percent = 100
                          AND b.confirmed_at IS NOT NULL
                          AND b.cancelled_at IS NOT NULL
                          AND b.cancelled_at < ts.start_at
                        )";
            // c2: active paid bookings without booking_invoice.
            $sqlC2 = "SELECT b.id AS booking_id, b.user_id AS user_id,
                             ts.cost AS cost
                      FROM `{$bookings}` b
                      JOIN `{$slots}` ts ON ts.id = b.bookable_id
                      LEFT JOIN `{$ledger}` l
                        ON l.ref_type = 'booking'
                       AND l.ref_id = b.id
                       AND l.entry_type = 'booking_invoice'
                      WHERE b.bookable_type = 'time_slot'
                        AND b.status IN ('pending', 'confirmed')
                        AND ts.cost > 0
                        AND l.id IS NULL";
            // c3: ledger ref_id with no matching booking row.
            $sqlC3 = "SELECT l.ref_id AS ref_id, l.account_id AS account_id,
                             l.entry_type AS entry_type, l.amount AS amount
                      FROM `{$ledger}` l
                      LEFT JOIN `{$bookings}` b ON b.id = l.ref_id
                      WHERE l.ref_type = 'booking'
                        AND l.ref_id IS NOT NULL
                        AND b.id IS NULL
                      GROUP BY l.ref_id, l.account_id, l.entry_type, l.amount";

            $items = [];
            foreach (static::fetchRows($sqlC1) as $row) {
                $items[] = [
                    'kind' => 'cancelled_no_refund',
                    'booking_id' => (int)$row['booking_id'],
                    'user_id' => (int)$row['user_id'],
                    'cost' => (int)$row['cost'],
                    'expert_id' => isset($row['expert_id']) ? (int)$row['expert_id'] : null,
                ];
            }
            foreach (static::fetchRows($sqlC2) as $row) {
                $items[] = [
                    'kind' => 'active_no_invoice',
                    'booking_id' => (int)$row['booking_id'],
                    'user_id' => (int)$row['user_id'],
                    'cost' => (int)$row['cost'],
                    'expert_id' => null,
                ];
            }
            foreach (static::fetchRows($sqlC3) as $row) {
                $items[] = [
                    'kind' => 'ledger_ref_missing_booking',
                    'ref_id' => (int)$row['ref_id'],
                    'account_id' => (int)$row['account_id'],
                    'entry_type' => (string)$row['entry_type'],
                    'amount' => (int)$row['amount'],
                ];
            }

            return ['count' => count($items), 'items' => $items];
        }

        /**
         * (d) Global zero invariant: every booking_* ledger entry is part of a
         * symmetric pair (debit on one side, credit on the other, same amount),
         * so `SUM(+credit - debit)` over all booking_* entries MUST be zero. A
         * non-zero total means the ledger created or destroyed money — the
         * signature of an unpaired write (M-5 partial crash) or of historical
         * ClearUserService breakage (L-6).
         *
         * @return array{count:int,turnover:int,items:array<int,array<string,int>>}
         *     count is 1 when turnover != 0 (a single summary discrepancy),
         *     0 when the ledger is balanced.
         */
        public static function checkGlobalZero(): array {
            $ledger = BalanceLedger::get()->getTableName();

            $sql = "SELECT COALESCE(SUM(CASE WHEN is_credit = 1 THEN amount ELSE -amount END), 0) AS turnover
                    FROM `{$ledger}`
                    WHERE entry_type IN ('booking_invoice', 'booking_payment', 'booking_refund')";
            $rows = static::fetchRows($sql);
            $turnover = (int)($rows[0]['turnover'] ?? 0);

            if ($turnover === 0) {
                return ['count' => 0, 'turnover' => 0, 'items' => []];
            }

            return [
                'count' => 1,
                'turnover' => $turnover,
                'items' => [['turnover' => $turnover]],
            ];
        }

        /**
         * (d, cont.) Negative cached balances. Today these are legal as a
         * side-effect of M-3 (expert debited on refund without overdraft
         * guard), so this is a watch-list, not an invariant breach — each hit
         * should be explainable by a refund-debit on the account.
         *
         * @return array{count:int,items:array<int,array<string,int>>}
         */
        public static function checkNegativeBalances(): array {
            $balance = AccountBalance::get()->getTableName();

            $sql = "SELECT account_id, balance FROM `{$balance}` WHERE balance < 0 ORDER BY balance ASC";
            $rows = static::fetchRows($sql);

            $items = [];
            foreach ($rows as $row) {
                $items[] = ['account_id' => (int)$row['account_id'], 'balance' => (int)$row['balance']];
            }

            return ['count' => count($items), 'items' => $items];
        }

        /**
         * Smoke invariant (audit L-1, §4): the UNIQUE idempotency index on
         * balance_ledger MUST exist — without it every `addEntry()` duplicate-
         * key catch becomes dead code and direct inserts in the controllers
         * silently produce duplicate rows, destroying the booking-pairing and
         * global-zero invariants this service checks. Either `uq_idempotent`
         * (M_0010) or `uq_ledger_ref` (M_0002) provides the guarantee — same
         * columns, different order — so the absence of BOTH is the failure.
         *
         * @return array{present:bool,count:int}
         *     present=true when at least one of the two indexes exists.
         *     count = number of matching index rows (information_schema rows).
         */
        public static function checkIdempotencyIndex(): array {
            $ledger = BalanceLedger::get()->getTableName();

            $sql = "SHOW INDEX FROM `{$ledger}` WHERE Key_name IN ('uq_idempotent', 'uq_ledger_ref')";
            $rows = static::fetchRows($sql);
            $count = count($rows);

            return ['present' => $count > 0, 'count' => $count];
        }

        // ── internals ────────────────────────────────────────────────────────

        /**
         * Run a parameterless SELECT and normalise the return to a list of
         * rows. exFetch() can in principle return int|string|bool on non-SELECT
         * statements; for our SELECTs it is always a list (possibly empty).
         *
         * @return array<int, array<string, mixed>>
         */
        protected static function fetchRows(string $sql): array {
            $rows = QueryEx::get()->exFetch($sql);

            return is_array($rows) ? $rows : [];
        }

        /**
         * @return array<string,int|string>
         */
        private static function pairItem(
            int $refId,
            string $rule,
            int $invoice,
            int $payment,
            int $refundCredit,
            int $refundDebit,
        ): array {
            return [
                'ref_id' => $refId,
                'rule' => $rule,
                'invoice_total' => $invoice,
                'payment_total' => $payment,
                'refund_credit' => $refundCredit,
                'refund_debit' => $refundDebit,
            ];
        }
    }
}
