/**
 * Обнаружение расхождений по категориям: где именно баланс расходится с
 * проводками.
 *
 * Часть разобранного finance-reconciliation.spec.ts.
 */

import { test, expect, tn, getDbPrefix } from '../../../../helpers/scoped-test';
import { withConnection } from '../../../../helpers/db/db';
import {
    runFinanceAudit,
    seedBalance,
    seedLedger,
    seedSlot,
    seedBooking,
    truncateRelevantTables,
    BASE,
} from './helpers';

test.describe.configure({ mode: 'serial' });

test.describe('BalanceReconciliationService — per-category detection', () => {
    test.beforeAll(async () => {
        await truncateRelevantTables();
    });

    test('(a) cache vs ledger — clean when balance == SUM(ledger)', async () => {
        const acc = BASE + 1;
        try {
            await seedBalance(acc, 100);
            await seedLedger({ accountId: acc, isCredit: true, amount: 150, entryType: 'top_up' });
            await seedLedger({ accountId: acc, isCredit: false, amount: 50, entryType: 'manual' });

            const res = runFinanceAudit(getDbPrefix());
            const out = res.stdout + res.stderr;
            // The [a] line shows zero discrepancies for this category.
            expect(out).toMatch(/\[a\] cache vs ledger — 0 discrepancy\(ies\)/);
            // And our account_id is NOT named anywhere in the report.
            expect(out).not.toContain(`account=${acc}`);
        } finally {
            await withConnection(async (conn) => {
                await conn.execute(`DELETE FROM ${tn('balance_ledger')} WHERE account_id = ?`, [acc]);
                await conn.execute(`DELETE FROM ${tn('account_balance')} WHERE account_id = ?`, [acc]);
            });
        }
    });

    test('(a) cache vs ledger — dirty when balance drifts from SUM(ledger)', async () => {
        const acc = BASE + 2;
        try {
            // Ledger sums to 100, but cache says 200 — a 100-unit drift.
            await seedBalance(acc, 200);
            await seedLedger({ accountId: acc, isCredit: true, amount: 100, entryType: 'top_up' });

            const res = runFinanceAudit(getDbPrefix());
            const out = res.stdout + res.stderr;
            expect(res.exitCode).toBe(1);
            expect(out).toMatch(/\[a\] cache vs ledger — 1 discrepancy\(ies\)/);
            // Detail line names the account and the +100 drift.
            expect(out).toContain(`account=${acc}  cached=200  ledger_sum=100  diff=+100`);
        } finally {
            await withConnection(async (conn) => {
                await conn.execute(`DELETE FROM ${tn('balance_ledger')} WHERE account_id = ?`, [acc]);
                await conn.execute(`DELETE FROM ${tn('account_balance')} WHERE account_id = ?`, [acc]);
            });
        }
    });

    test('(a) cache vs ledger — ledger exists without balance row', async () => {
        const acc = BASE + 3;
        try {
            // Ledger sums to 50, but no balance row at all — the "other
            // direction" of the LEFT JOIN that audit §4 explicitly calls out.
            await seedLedger({ accountId: acc, isCredit: true, amount: 50, entryType: 'top_up' });

            const res = runFinanceAudit(getDbPrefix());
            const out = res.stdout + res.stderr;
            expect(res.exitCode).toBe(1);
            expect(out).toContain(`account=${acc}  cached=0  ledger_sum=50  diff=-50`);
        } finally {
            await withConnection(async (conn) => {
                await conn.execute(`DELETE FROM ${tn('balance_ledger')} WHERE account_id = ?`, [acc]);
                await conn.execute(`DELETE FROM ${tn('account_balance')} WHERE account_id = ?`, [acc]);
            });
        }
    });

    test('(b) booking pairing — clean when invoice+payment match', async () => {
        const buyer = BASE + 10;
        const expert = BASE + 11;
        const refId = BASE + 1000;
        try {
            await seedLedger({ accountId: buyer, isCredit: false, amount: 100, entryType: 'booking_invoice', refType: 'booking', refId });
            await seedLedger({ accountId: expert, isCredit: true, amount: 100, entryType: 'booking_payment', refType: 'booking', refId });

            const res = runFinanceAudit(getDbPrefix());
            const out = res.stdout + res.stderr;
            expect(out).toMatch(/\[b\] booking pairing — 0 violation\(s\)/);
            expect(out).not.toContain(`ref=${refId}`);
        } finally {
            await withConnection(async (conn) => {
                await conn.execute(`DELETE FROM ${tn('balance_ledger')} WHERE account_id IN (?, ?)`, [buyer, expert]);
            });
        }
    });

    test('(b) booking pairing — dirty when payment leg is missing', async () => {
        const buyer = BASE + 12;
        const refId = BASE + 1001;
        try {
            // Invoice present, payment never landed — M-5 partial-crash signature.
            await seedLedger({ accountId: buyer, isCredit: false, amount: 100, entryType: 'booking_invoice', refType: 'booking', refId });

            const res = runFinanceAudit(getDbPrefix());
            const out = res.stdout + res.stderr;
            expect(res.exitCode).toBe(1);
            expect(out).toMatch(/\[b\] booking pairing — 1 violation\(s\)/);
            // The rule that fired: invoice != payment (100 vs 0).
            expect(out).toContain(`ref=${refId}  invoice != payment  invoice=100 payment=0`);
        } finally {
            await withConnection(async (conn) => {
                await conn.execute(`DELETE FROM ${tn('balance_ledger')} WHERE account_id = ?`, [buyer]);
            });
        }
    });

    test('(c) orphans — cancelled paid booking without refund', async () => {
        const user = BASE + 20;
        const expert = BASE + 21;
        try {
            const slotId = await seedSlot(250, expert);
            const bookingId = await seedBooking(user, slotId, 'cancelled');
            // NO booking_refund entry — the H-2 backfill scenario.

            const res = runFinanceAudit(getDbPrefix());
            const out = res.stdout + res.stderr;
            expect(res.exitCode).toBe(1);
            expect(out).toMatch(/\[c\] orphaned money — \d+ case\(s\)/);
            expect(out).toContain(`cancelled_no_refund  booking=${bookingId}  user=${user}  cost=250  expert=${expert}`);
        } finally {
            await withConnection(async (conn) => {
                // bookings + slots have auto-increment ids we don't know here;
                // delete by the user_id/expert_id markers we controlled.
                await conn.execute(`DELETE FROM ${tn('bookings')} WHERE user_id = ?`, [user]);
                await conn.execute(`DELETE FROM ${tn('time_slots')} WHERE expert_id = ?`, [expert]);
            });
        }
    });

    test('(c) orphans — clean for a legitimate 100%-penalty zero-refund cancellation', async () => {
        // BookingsController::post__cancel() only calls tryAddRefund() when
        // computeRefundAmounts() returns a positive amount (`if ($userRefund
        // > 0)`); with cancellation_penalty_percent=100 and a cancellation
        // before start_at on a previously-confirmed booking, the refund is
        // exactly 0 and NO booking_refund row is ever written — by design,
        // not a dropped write. c1 must not flag this shape.
        const user = BASE + 25;
        const expert = BASE + 26;
        try {
            const slotId = await seedSlot(400, expert, /* penaltyPercent */ 100, /* startOffsetSec */ 86400);
            await seedBooking(user, slotId, 'cancelled', /* confirmedBeforeCancel */ true);
            // NO booking_refund entry — this is the legitimate zero-refund case.

            const res = runFinanceAudit(getDbPrefix());
            const out = res.stdout + res.stderr;
            expect(res.exitCode, `finance-audit stdout:\n${out}`).toBe(0);
            expect(out).not.toContain(`user=${user}`);
            expect(out).toMatch(/\[c\] orphaned money — 0 case\(s\)/);
        } finally {
            await withConnection(async (conn) => {
                await conn.execute(`DELETE FROM ${tn('bookings')} WHERE user_id = ?`, [user]);
                await conn.execute(`DELETE FROM ${tn('time_slots')} WHERE expert_id = ?`, [expert]);
            });
        }
    });

    test('(c) orphans — active paid booking without invoice', async () => {
        const user = BASE + 22;
        const expert = BASE + 23;
        try {
            const slotId = await seedSlot(300, expert);
            const bookingId = await seedBooking(user, slotId, 'pending');
            // NO booking_invoice — the M-5 "free booking" signature.

            const res = runFinanceAudit(getDbPrefix());
            const out = res.stdout + res.stderr;
            expect(res.exitCode).toBe(1);
            expect(out).toContain(`active_no_invoice  booking=${bookingId}  user=${user}  cost=300`);
        } finally {
            await withConnection(async (conn) => {
                await conn.execute(`DELETE FROM ${tn('bookings')} WHERE user_id = ?`, [user]);
                await conn.execute(`DELETE FROM ${tn('time_slots')} WHERE expert_id = ?`, [expert]);
            });
        }
    });

    test('(c) orphans — ledger ref_id missing in bookings', async () => {
        const acc = BASE + 24;
        const ghostRefId = 9_999_999;
        try {
            await seedLedger({
                accountId: acc, isCredit: false, amount: 77,
                entryType: 'booking_invoice', refType: 'booking', refId: ghostRefId,
            });

            const res = runFinanceAudit(getDbPrefix());
            const out = res.stdout + res.stderr;
            expect(res.exitCode).toBe(1);
            expect(out).toContain(`ledger_ref_missing_booking  ref_id=${ghostRefId}  account=${acc}  booking_invoice  amount=77`);
        } finally {
            await withConnection(async (conn) => {
                await conn.execute(`DELETE FROM ${tn('balance_ledger')} WHERE account_id = ?`, [acc]);
            });
        }
    });

    test('(d) global zero — clean when invoice+payment balanced', async () => {
        const buyer = BASE + 30;
        const expert = BASE + 31;
        const refId = BASE + 3000;
        try {
            await seedLedger({ accountId: buyer, isCredit: false, amount: 100, entryType: 'booking_invoice', refType: 'booking', refId });
            await seedLedger({ accountId: expert, isCredit: true, amount: 100, entryType: 'booking_payment', refType: 'booking', refId });

            const res = runFinanceAudit(getDbPrefix());
            const out = res.stdout + res.stderr;
            expect(out).toMatch(/\[d\] global booking turnover — OK/);
        } finally {
            await withConnection(async (conn) => {
                await conn.execute(`DELETE FROM ${tn('balance_ledger')} WHERE account_id IN (?, ?)`, [buyer, expert]);
            });
        }
    });

    test('(d) global zero — dirty when unpaired invoice breaks the invariant', async () => {
        const buyer = BASE + 32;
        const refId = BASE + 3001;
        try {
            // Invoice (debit) with no matching payment (credit) — the
            // booking turnover is now -100 instead of 0.
            await seedLedger({ accountId: buyer, isCredit: false, amount: 100, entryType: 'booking_invoice', refType: 'booking', refId });

            const res = runFinanceAudit(getDbPrefix());
            const out = res.stdout + res.stderr;
            expect(res.exitCode).toBe(1);
            expect(out).toMatch(/\[d\] global booking turnover — BREACH/);
            // Turnover is -100: invoice debited -100, no payment to cancel it.
            expect(out).toContain('turnover=-100 (must be 0)');
        } finally {
            await withConnection(async (conn) => {
                await conn.execute(`DELETE FROM ${tn('balance_ledger')} WHERE account_id = ?`, [buyer]);
            });
        }
    });

    test('(d) negatives — flagged when balance < 0', async () => {
        const acc = BASE + 40;
        try {
            await seedBalance(acc, -50);
            await seedLedger({ accountId: acc, isCredit: false, amount: 50, entryType: 'manual' });

            const res = runFinanceAudit(getDbPrefix());
            const out = res.stdout + res.stderr;
            expect(res.exitCode).toBe(1);
            expect(out).toMatch(/\[d\] negative balances — 1 account\(s\)/);
            expect(out).toContain(`account=${acc}  balance=-50`);
        } finally {
            await withConnection(async (conn) => {
                await conn.execute(`DELETE FROM ${tn('balance_ledger')} WHERE account_id = ?`, [acc]);
                await conn.execute(`DELETE FROM ${tn('account_balance')} WHERE account_id = ?`, [acc]);
            });
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. End-to-end CLI — clean worker exits 0, dirty exits 1
// ─────────────────────────────────────────────────────────────────────────
