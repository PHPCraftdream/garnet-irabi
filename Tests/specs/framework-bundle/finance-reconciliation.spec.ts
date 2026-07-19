/**
 * finance-audit reconciliation (handover audit 03, finding H-4 + §4):
 *
 * Before this task, NOTHING in the app checked that the cached
 * `account_balance.balance` matched `SUM(balance_ledger)`, that booking
 * ledger entries were properly paired, or that cancelled paid bookings
 * had their refund. The H-1/H-2/H-3/M-4/M-5 crash windows could drop or
 * create money silently. This spec proves the new detection layer:
 *
 *   1. Per-category clean vs dirty: for each of the four audit checks
 *      (cache-vs-ledger, booking pairing, orphans, global-zero + negatives)
 *      a controlled seed with NO discrepancy produces a "0" count, and a
 *      controlled seed WITH a discrepancy produces the exact detail row
 *      the audit predicted (account_id / ref_id / amounts / kind).
 *
 *   2. End-to-end CLI: `php run_cmd.php finance-audit` exits 0 on a clean
 *      worker and exits 1 on a dirty one, with the report naming every
 *      discrepancy — the contract monitoring/CI relies on.
 *
 *   3. Cron tick: `php run_cmd.php cron finance-audit` exits 0 regardless
 *      of discrepancies (the cron tick itself never fails — it returns
 *      the mismatch count as a "did work" signal instead), and logs a
 *      single per-category-count line that the cron_log CapturingStdio
 *      captures.
 *
 * All seeding targets the worker-isolated tables via DB_PREFIX_OVERRIDE,
 * mirroring email-queue-cron-lock.spec.ts / log-rotation-cron.spec.ts.
 * Each test cleans up exactly the rows it inserted so no "dirty" state
 * leaks to sibling tests in the same worker.
 */

import { test, expect, tn, getDbPrefix } from '../../helpers/scoped-test';
import { spawnSync } from 'child_process';
import * as path from 'node:path';
import { withConnection } from '../../helpers/db';

const APP_DIR = path.resolve(__dirname, '../../..');

test.describe.configure({ mode: 'serial' });

/**
 * Run the finance-audit CLI against the worker-isolated tables. Returns
 * captured stdout+stderr and the process exit code. Same shape as the
 * db-backup / log-rotation cron runners.
 */
function runFinanceAudit(prefix: string): { stdout: string; stderr: string; exitCode: number | null } {
    const res = spawnSync('php', ['run_cmd.php', 'finance-audit'], {
        cwd: APP_DIR,
        env: { ...process.env, DB_PREFIX_OVERRIDE: prefix },
        encoding: 'utf8',
        timeout: 60000,
    });
    return { stdout: res.stdout ?? '', stderr: res.stderr ?? '', exitCode: res.status };
}

/**
 * Run the finance-audit CRON task (not the standalone command). The cron
 * tick always exits 0 — discrepancies surface as a non-zero return value
 * logged by AppCronService, not as a CLI failure.
 */
function runFinanceAuditCron(prefix: string): { stdout: string; stderr: string; exitCode: number | null } {
    const res = spawnSync('php', ['run_cmd.php', 'cron', 'finance-audit'], {
        cwd: APP_DIR,
        env: { ...process.env, DB_PREFIX_OVERRIDE: prefix },
        encoding: 'utf8',
        timeout: 60000,
    });
    return { stdout: res.stdout ?? '', stderr: res.stderr ?? '', exitCode: res.status };
}

/**
 * Insert a balance row. Returns nothing — caller cleans up by account_id.
 */
async function seedBalance(accountId: number, balance: number): Promise<void> {
    await withConnection(async (conn) => {
        await conn.execute(
            `INSERT INTO ${tn('account_balance')} (account_id, balance, updated_at) VALUES (?, ?, ?)`,
            [accountId, balance, Math.floor(Date.now() / 1000)],
        );
    });
}

/**
 * Insert a ledger row. Mirrors what FwBalanceLedger::addEntry() writes,
 * minus the recalculate() call — we want to construct controlled state,
 * not run the real money path. bypassUnique=true skips the idempotency
 * UNIQUE guard via INSERT IGNORE so a test can insert a deliberately
 * duplicate-shaped row to corrupt state.
 */
async function seedLedger(args: {
    accountId: number;
    isCredit: boolean;
    amount: number;
    entryType: string;
    refType?: string | null;
    refId?: number | null;
    note?: string;
}): Promise<void> {
    await withConnection(async (conn) => {
        await conn.execute(
            `INSERT INTO ${tn('balance_ledger')}
             (account_id, is_credit, amount, entry_type, ref_type, ref_id, note, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                args.accountId,
                args.isCredit ? 1 : 0,
                args.amount,
                args.entryType,
                args.refType ?? null,
                args.refId ?? null,
                args.note ?? 'spec seed',
                Math.floor(Date.now() / 1000),
            ],
        );
    });
}

/**
 * Insert a time_slot with a paid cost and return its auto-increment id.
 * startOffsetSec lets a test place start_at in the future (default, for the
 * booked-before-start cases) or in the past.
 */
async function seedSlot(
    cost: number,
    expertId: number,
    penaltyPercent = 0,
    startOffsetSec = 86400,
): Promise<number> {
    return withConnection(async (conn) => {
        const [r]: any = await conn.execute(
            `INSERT INTO ${tn('time_slots')}
             (expert_id, start_at, end_at, duration_min, cost, is_online, location,
              max_users, booked_count, status, uid, created_at, cancellation_penalty_percent)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                expertId,
                Math.floor(Date.now() / 1000) + startOffsetSec,
                Math.floor(Date.now() / 1000) + startOffsetSec + 3600,
                60,
                cost,
                1,
                '',
                1,
                0,
                'free',
                'spec' + Math.random().toString(36).slice(2, 10),
                Math.floor(Date.now() / 1000),
                penaltyPercent,
            ],
        );
        return Number(r.insertId);
    });
}

/**
 * Insert a booking and return its auto-increment id. confirmedBeforeCancel
 * sets confirmed_at to a timestamp before cancelled_at, matching the
 * "previousStatus was confirmed" shape computeRefundAmounts() keys off.
 */
async function seedBooking(
    userId: number,
    slotId: number,
    status: string,
    confirmedBeforeCancel = false,
): Promise<number> {
    return withConnection(async (conn) => {
        const now = Math.floor(Date.now() / 1000);
        const [r]: any = await conn.execute(
            `INSERT INTO ${tn('bookings')}
             (user_id, bookable_type, bookable_id, status, created_at, confirmed_at, cancelled_at)
             VALUES (?, 'time_slot', ?, ?, ?, ?, ?)`,
            [
                userId,
                slotId,
                status,
                now,
                confirmedBeforeCancel ? now - 60 : null,
                status === 'cancelled' ? now : null,
            ],
        );
        return Number(r.insertId);
    });
}

// Per-test-run unique ID ranges. Workers are isolated, but using a
// high random base keeps the dev-stand run (where DB_PREFIX_OVERRIDE
// falls through to db_ir when PW_WORKER_ISOLATION=0) from ever colliding
// with seed data.
const BASE = 2_000_000 + Math.floor(Math.random() * 100_000);

/**
 * The four tables the reconciliation reads. Seeded worker tables come
 * pre-populated by the test:provision clone of the dev seed — which
 * itself contains ~12 known "cancelled_no_refund" orphans (the audit's
 * H-2 scenario, demonstrably present even in seed data). That seeded
 * state is exactly what the audit exists to surface, but it makes
 * "clean worker → exit 0" assertions impossible without a controlled
 * baseline. None of the other specs in the framework-bundle project
 * touch these four tables (they live in cross-role / booking project
 * workers), so TRUNCATE here is safe and restores a deterministic
 * clean state for every test in this file.
 */
async function truncateRelevantTables(): Promise<void> {
    await withConnection(async (conn) => {
        for (const t of ['balance_ledger', 'account_balance', 'bookings', 'time_slots']) {
            await conn.execute(`DELETE FROM ${tn(t)}`);
        }
    });
}

// ─────────────────────────────────────────────────────────────────────────
// 1. Per-category clean vs dirty detection
// ─────────────────────────────────────────────────────────────────────────
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
test.describe('CMDFinanceAudit — CLI exit codes', () => {
    const acc = BASE + 50;

    test.beforeAll(async () => {
        await truncateRelevantTables();
    });

    test.afterEach(async () => {
        await withConnection(async (conn) => {
            await conn.execute(`DELETE FROM ${tn('balance_ledger')} WHERE account_id = ?`, [acc]);
            await conn.execute(`DELETE FROM ${tn('account_balance')} WHERE account_id = ?`, [acc]);
        });
    });

    test('clean worker — exit 0, report says CLEAN', async () => {
        const res = runFinanceAudit(getDbPrefix());
        const out = res.stdout + res.stderr;
        expect(res.exitCode, `finance-audit stdout:\n${out}`).toBe(0);
        expect(out).toContain('Result: CLEAN — no discrepancies detected.');
        // The idempotency-index smoke is part of every clean run.
        expect(out).toMatch(/\[e\] idempotency index — OK/);
    });

    test('dirty worker — exit 1, report says DISCREPANCIES FOUND', async () => {
        // Seed ONE controlled discrepancy on an otherwise-clean worker.
        await seedBalance(acc, 999);
        await seedLedger({ accountId: acc, isCredit: true, amount: 1, entryType: 'top_up' });

        const res = runFinanceAudit(getDbPrefix());
        const out = res.stdout + res.stderr;
        expect(res.exitCode).toBe(1);
        expect(out).toContain('Result: DISCREPANCIES FOUND');
        expect(out).toContain(`account=${acc}  cached=999  ledger_sum=1  diff=+998`);
    });
});

// ─────────────────────────────────────────────────────────────────────────
// 3. Cron tick — always exits 0, logs per-category counts
// ─────────────────────────────────────────────────────────────────────────
test.describe('cron finance-audit — tick output', () => {
    const acc = BASE + 60;

    test.beforeAll(async () => {
        await truncateRelevantTables();
    });

    test.afterEach(async () => {
        await withConnection(async (conn) => {
            await conn.execute(`DELETE FROM ${tn('balance_ledger')} WHERE account_id = ?`, [acc]);
            await conn.execute(`DELETE FROM ${tn('account_balance')} WHERE account_id = ?`, [acc]);
        });
    });

    test('clean worker — cron exits 0 and logs zero counts', async () => {
        const res = runFinanceAuditCron(getDbPrefix());
        const out = res.stdout + res.stderr;
        expect(res.exitCode).toBe(0);
        expect(out).toMatch(/OK/);
        // The single per-category-count line, all zeros on a clean run.
        expect(out).toMatch(/finance-audit: cache_vs_ledger=0 booking_pairing=0 orphans=0 global_zero_breach=0 negatives=0 idempotency_index=ok/);
    });

    test('dirty worker — cron still exits 0 and logs the non-zero count', async () => {
        // One controlled discrepancy — the cron tick must NOT fail (it
        // returns the mismatch count as a "did work" signal), but the
        // log line must reflect the real state.
        await seedBalance(acc, 999);
        await seedLedger({ accountId: acc, isCredit: true, amount: 1, entryType: 'top_up' });

        const res = runFinanceAuditCron(getDbPrefix());
        const out = res.stdout + res.stderr;
        expect(res.exitCode).toBe(0);
        expect(out).toMatch(/OK/);
        // The cache_vs_ledger count is non-zero; the rest stay zero because
        // we only corrupted that one category.
        expect(out).toMatch(/finance-audit: cache_vs_ledger=[1-9]\d* booking_pairing=0 orphans=0 global_zero_breach=0 negatives=0 idempotency_index=ok/);
    });
});
