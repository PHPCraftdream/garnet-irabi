<?php declare(strict_types=1);

namespace PHPCraftdream\IRabi\Common\Commands {
    use Aura\Cli\Context;
    use Aura\Cli\Stdio;
    use PHPCraftdream\Garnet\Kernel\Interfaces\ICommand;
    use PHPCraftdream\IRabi\Common\Services\BalanceReconciliationService;

    /**
     * `php garnet finance-audit` — reconcile `account_balance` against the
     * append-only `balance_ledger` and report every discrepancy.
     *
     * Closes the "no detection mechanism" gap (handover audit 03, finding
     * H-4): until this command existed, a dropped refund, a split
     * invoice/payment, or a cache that drifted from the ledger could sit
     * unnoticed indefinitely. The command is READ-ONLY — it never repairs.
     * Repair is intentionally a separate, human-gated step (the audit's
     * §4 recommendation), because the correct fix depends on which side is
     * wrong and is not safe to automate blindly.
     *
     * Exit code:
     *   0 — every check passed, no discrepancies.
     *   1 — one or more discrepancies found (or the idempotency index is
     *       missing, which is a structural breach rather than a data one).
     * Useful for CI / monitoring: a non-zero exit is an actionable signal.
     */
    class CMDFinanceAudit implements ICommand {
        public static function description(): string {
            return 'Reconcile account_balance vs balance_ledger (read-only audit)';
        }

        public static function help(array $args, Context $context, Stdio $stdio): void {
            $stdio->outln('Usage: php garnet finance-audit');
            $stdio->outln('');
            $stdio->outln('  Runs five read-only checks against the money tables:');
            $stdio->outln('    (a) account_balance.balance vs SUM(ledger) per account');
            $stdio->outln('    (b) booking_invoice / booking_payment / booking_refund pairing');
            $stdio->outln('    (c) orphaned money (cancelled w/o refund, active w/o invoice,');
            $stdio->outln('        ledger ref_id missing in bookings)');
            $stdio->outln('    (d) global booking turnover == 0, and negative balances');
            $stdio->outln('    (e) UNIQUE idempotency index on balance_ledger exists');
            $stdio->outln('');
            $stdio->outln('  Reports details per category. Exits 0 when clean, 1 when any');
            $stdio->outln('  discrepancy or structural issue is found. Nothing is repaired.');
        }

        public static function run(array $args, Context $context, Stdio $stdio): void {
            $report = BalanceReconciliationService::runAll();

            $dirty = false;

            // (a) cache vs ledger
            $a = $report['cache_vs_ledger'];
            $stdio->outln('[a] cache vs ledger — ' . $a['count'] . ' discrepancy(ies)');
            if ($a['count'] > 0) {
                $dirty = true;
                foreach ($a['items'] as $item) {
                    $stdio->outln(sprintf(
                        '    account=%d  cached=%d  ledger_sum=%d  diff=%+d',
                        $item['account_id'],
                        $item['cached_balance'],
                        $item['ledger_sum'],
                        $item['diff'],
                    ));
                }
            }

            // (b) booking pairing
            $b = $report['booking_pairing'];
            $stdio->outln('[b] booking pairing — ' . $b['count'] . ' violation(s)');
            if ($b['count'] > 0) {
                $dirty = true;
                foreach ($b['items'] as $item) {
                    $stdio->outln(sprintf(
                        '    ref=%d  %s  invoice=%d payment=%d refund_c=%d refund_d=%d',
                        $item['ref_id'],
                        $item['rule'],
                        $item['invoice_total'],
                        $item['payment_total'],
                        $item['refund_credit'],
                        $item['refund_debit'],
                    ));
                }
            }

            // (c) orphans
            $c = $report['orphans'];
            $stdio->outln('[c] orphaned money — ' . $c['count'] . ' case(s)');
            if ($c['count'] > 0) {
                $dirty = true;
                foreach ($c['items'] as $item) {
                    self::printOrphan($stdio, $item);
                }
            }

            // (d1) global zero
            $d = $report['global_zero'];
            $stdio->outln('[d] global booking turnover — ' . ($d['count'] > 0 ? 'BREACH' : 'OK'));
            if ($d['count'] > 0) {
                $dirty = true;
                $stdio->outln(sprintf('    turnover=%+d (must be 0)', $d['turnover']));
            }

            // (d2) negatives
            $n = $report['negatives'];
            $stdio->outln('[d] negative balances — ' . $n['count'] . ' account(s)');
            if ($n['count'] > 0) {
                $dirty = true;
                foreach ($n['items'] as $item) {
                    $stdio->outln(sprintf('    account=%d  balance=%d', $item['account_id'], $item['balance']));
                }
            }

            // (e) idempotency index smoke
            $idx = $report['idempotency_index'];
            if ($idx['present']) {
                $stdio->outln('[e] idempotency index — OK (uq_idempotent/uq_ledger_ref present)');
            } else {
                $dirty = true;
                $stdio->outln('[e] idempotency index — CRITICAL MISSING');
                $stdio->outln('    neither uq_idempotent nor uq_ledger_ref exists on balance_ledger.');
                $stdio->outln('    duplicate-key catches in addEntry() are dead code until restored.');
            }

            $stdio->outln('');
            if ($dirty) {
                $stdio->outln('Result: DISCREPANCIES FOUND — review the categories above.');
                exit(1);
            }
            $stdio->outln('Result: CLEAN — no discrepancies detected.');
        }

        /**
         * @param array<string,int|string|null> $item
         */
        private static function printOrphan(Stdio $stdio, array $item): void {
            $kind = (string)$item['kind'];
            if ($kind === 'ledger_ref_missing_booking') {
                $stdio->outln(sprintf(
                    '    %s  ref_id=%d  account=%d  %s  amount=%d',
                    $kind,
                    $item['ref_id'],
                    $item['account_id'],
                    $item['entry_type'],
                    $item['amount'],
                ));
                return;
            }
            $expert = $item['expert_id'] === null ? '-' : (string)$item['expert_id'];
            $stdio->outln(sprintf(
                '    %s  booking=%d  user=%d  cost=%d  expert=%s',
                $kind,
                $item['booking_id'],
                $item['user_id'],
                $item['cost'],
                $expert,
            ));
        }
    }
}
