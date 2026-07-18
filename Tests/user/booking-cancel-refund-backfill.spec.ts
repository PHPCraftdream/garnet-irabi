/**
 * Refund backfill on idempotent retry (audit H-2).
 *
 * Bug: cancellation was TWO independent ops without a transaction —
 *   1. CAS UPDATE bookings SET status='cancelled'
 *   2. INSERT booking_refund ledger entries + recalculate
 * If the process crashed between (1) and (2), the booking was already
 * cancelled but the user's money was never refunded. A retry hit the
 * status guard (booking no longer pending/confirmed) and returned
 * without fixing the missing refund.
 *
 * Fix: when post__cancel / ExpertBookingsService::cancelBooking detects
 * the booking is already 'cancelled', it recovers previousStatus from
 * confirmed_at and re-runs the idempotent refund path (tryAddRefund is
 * a no-op on duplicates via the ledger UNIQUE index).
 *
 * Seeding: direct MySQL — simulates the exact "crashed between CAS and
 * refund" state: booking inserted with status='cancelled', money moved
 * (booking_invoice + booking_payment) but NO booking_refund row.
 */

import { test, expect, tn } from '../helpers/scoped-test';
import { newScopedContext } from '../helpers/scoped-test';
import type { BrowserContext, Page } from '@playwright/test';
import mysql from 'mysql2/promise';
import { DB } from '../helpers/db';
import { roleLogin } from '../helpers/role-login';

test.describe.configure({ mode: 'serial' });

// ─────────────────────────────────────────────────────────────────────────────
// Shared DB helpers (same style as booking-time-guards.spec.ts)
// ─────────────────────────────────────────────────────────────────────────────

function generateUid(): string {
	return [...Array(16)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
}

async function getAccountId(login: string): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT id FROM ${tn('accounts')} WHERE login = ?`, [login]
		);
		return rows[0]?.id ?? 0;
	} finally { await conn.end(); }
}

async function getBalance(accountId: number): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT balance FROM ${tn('account_balance')} WHERE account_id = ?`, [accountId]
		);
		return rows.length ? Number(rows[0].balance) : 0;
	} finally { await conn.end(); }
}

async function ensureBalance(accountId: number, minBalance: number): Promise<void> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT balance FROM ${tn('account_balance')} WHERE account_id = ?`, [accountId]
		);
		const current = rows.length ? Number(rows[0].balance) : 0;
		if (current < minBalance) {
			const topUp = minBalance - current + 5000;
			await conn.execute(
				`INSERT INTO ${tn('account_balance')} (account_id, balance, updated_at)
				 VALUES (?, 0, UNIX_TIMESTAMP())
				 ON DUPLICATE KEY UPDATE account_id = account_id`,
				[accountId]
			);
			await conn.execute(
				`INSERT INTO ${tn('balance_ledger')} (account_id, is_credit, amount, entry_type, ref_type, ref_id, note, created_at)
				 VALUES (?, 1, ?, 'top_up', '', 0, 'Test top-up', UNIX_TIMESTAMP())`,
				[accountId, topUp]
			);
			await conn.execute(
				`UPDATE ${tn('account_balance')} SET balance = balance + ?, updated_at = UNIX_TIMESTAMP() WHERE account_id = ?`,
				[topUp, accountId]
			);
		}
	} finally { await conn.end(); }
}

async function recalcBalance(accountId: number): Promise<void> {
	const conn = await mysql.createConnection(DB);
	try {
		const [[sum]]: any = await conn.execute(
			`SELECT COALESCE(SUM(CASE WHEN is_credit=1 THEN amount ELSE -amount END), 0) as bal
			 FROM ${tn('balance_ledger')} WHERE account_id = ?`, [accountId]
		);
		await conn.execute(
			`UPDATE ${tn('account_balance')} SET balance = ?, updated_at = UNIX_TIMESTAMP() WHERE account_id = ?`,
			[sum.bal, accountId]
		);
	} finally { await conn.end(); }
}

/** Insert a slot directly in DB. */
async function seedSlot(params: {
	expertId: number;
	startAt: number;
	endAt: number;
	status?: string;
	maxUsers?: number;
	cost?: number;
	penaltyPct?: number;
}): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const [result]: any = await conn.execute(
			`INSERT INTO ${tn('time_slots')}
			 (expert_id, start_at, end_at, duration_min, cost, is_online, location, max_users,
			  booked_count, status, uid, created_at, cancellation_penalty_percent)
			 VALUES (?, ?, ?, 60, ?, 1, 'https://meet.example.com/backfill-test', ?, 0, ?, ?, ?, ?)`,
			[
				params.expertId,
				params.startAt,
				params.endAt,
				params.cost ?? 300,
				params.maxUsers ?? 1,
				params.status ?? 'booked',
				generateUid(),
				Math.floor(Date.now() / 1000),
				params.penaltyPct ?? 0,
			]
		);
		return result.insertId;
	} finally { await conn.end(); }
}

/**
 * Seed a booking in the exact "crashed between CAS and refund" state:
 * status='cancelled', money moved (invoice + payment) but NO refund.
 *
 * When withRefund=true, also inserts the booking_refund rows — used for
 * the idempotency test (retry on an already-fully-refunded booking).
 */
async function seedCancelledBooking(params: {
	userId: number;
	expertId: number;
	slotId: number;
	cost: number;
	confirmedAt: number | null;
	cancelledAt: number;
	withRefund?: boolean;
}): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const now = Math.floor(Date.now() / 1000);
		const [result]: any = await conn.execute(
			`INSERT INTO ${tn('bookings')}
			 (user_id, bookable_type, bookable_id, status, created_at, confirmed_at, cancelled_at)
			 VALUES (?, 'time_slot', ?, 'cancelled', ?, ?, ?)`,
			[params.userId, params.slotId, now, params.confirmedAt, params.cancelledAt]
		);
		const bookingId = result.insertId;

		// Mirror what post__book does: debit the user, credit the expert.
		if (params.cost > 0) {
			await conn.execute(
				`INSERT INTO ${tn('balance_ledger')} (account_id, is_credit, amount, entry_type, ref_type, ref_id, note, created_at)
				 VALUES (?, 0, ?, 'booking_invoice', 'booking', ?, 'seed invoice', UNIX_TIMESTAMP())`,
				[params.userId, params.cost, bookingId]
			);
			await conn.execute(
				`UPDATE ${tn('account_balance')} SET balance = balance - ?, updated_at = UNIX_TIMESTAMP() WHERE account_id = ?`,
				[params.cost, params.userId]
			);
			await conn.execute(
				`INSERT INTO ${tn('balance_ledger')} (account_id, is_credit, amount, entry_type, ref_type, ref_id, note, created_at)
				 VALUES (?, 1, ?, 'booking_payment', 'booking', ?, 'seed payment', UNIX_TIMESTAMP())`,
				[params.expertId, params.cost, bookingId]
			);
			await conn.execute(
				`UPDATE ${tn('account_balance')} SET balance = balance + ?, updated_at = UNIX_TIMESTAMP() WHERE account_id = ?`,
				[params.cost, params.expertId]
			);

			if (params.withRefund) {
				await conn.execute(
					`INSERT INTO ${tn('balance_ledger')} (account_id, is_credit, amount, entry_type, ref_type, ref_id, note, created_at)
					 VALUES (?, 1, ?, 'booking_refund', 'booking', ?, 'seed refund user', UNIX_TIMESTAMP())`,
					[params.userId, params.cost, bookingId]
				);
				await conn.execute(
					`UPDATE ${tn('account_balance')} SET balance = balance + ?, updated_at = UNIX_TIMESTAMP() WHERE account_id = ?`,
					[params.cost, params.userId]
				);
				await conn.execute(
					`INSERT INTO ${tn('balance_ledger')} (account_id, is_credit, amount, entry_type, ref_type, ref_id, note, created_at)
					 VALUES (?, 0, ?, 'booking_refund', 'booking', ?, 'seed refund expert', UNIX_TIMESTAMP())`,
					[params.expertId, params.cost, bookingId]
				);
				await conn.execute(
					`UPDATE ${tn('account_balance')} SET balance = balance - ?, updated_at = UNIX_TIMESTAMP() WHERE account_id = ?`,
					[params.cost, params.expertId]
				);
			}
		}

		return bookingId;
	} finally { await conn.end(); }
}

/** Count booking_refund ledger entries for a booking, split by is_credit. */
async function countRefunds(bookingId: number): Promise<{ userCredit: number; expertDebit: number }> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT is_credit, COUNT(*) as cnt
			 FROM ${tn('balance_ledger')}
			 WHERE entry_type = 'booking_refund' AND ref_type = 'booking' AND ref_id = ?
			 GROUP BY is_credit`,
			[bookingId]
		);
		let userCredit = 0;
		let expertDebit = 0;
		for (const r of rows) {
			if (Number(r.is_credit) === 1) userCredit = Number(r.cnt);
			if (Number(r.is_credit) === 0) expertDebit = Number(r.cnt);
		}
		return { userCredit, expertDebit };
	} finally { await conn.end(); }
}

async function cleanupSlot(slotId: number): Promise<void> {
	if (!slotId) return;
	const conn = await mysql.createConnection(DB);
	try {
		await conn.execute(
			`DELETE FROM ${tn('balance_ledger')} WHERE ref_type = 'booking' AND ref_id IN
			 (SELECT id FROM ${tn('bookings')} WHERE bookable_type = 'time_slot' AND bookable_id = ?)`,
			[slotId]
		);
		await conn.execute(`DELETE FROM ${tn('user_cancellations')} WHERE slot_id = ?`, [slotId]);
		await conn.execute(`DELETE FROM ${tn('expert_cancellations')} WHERE slot_id = ?`, [slotId]);
		await conn.execute(`DELETE FROM ${tn('bookings')} WHERE bookable_type = 'time_slot' AND bookable_id = ?`, [slotId]);
		await conn.execute(`DELETE FROM ${tn('time_slots')} WHERE id = ?`, [slotId]);
	} finally { await conn.end(); }
}

/** POST /bookings/id~{id}/~cancel from page context. */
async function postBookingCancel(
	page: Page,
	bookingId: number,
	reason: string
): Promise<{ status: number; body: any }> {
	return await page.evaluate(async (args: { bid: number; reason: string }) => {
		const csrf = (window as any).__GARNET_CSRF__ || '';
		const fd = new FormData();
		fd.append('CSRF_TOKEN', csrf);
		fd.append('reason', args.reason);
		const res = await fetch(`/bookings/id~${args.bid}/~cancel`, { method: 'POST', body: fd });
		const text = await res.text();
		let body: any = null;
		try { body = JSON.parse(text); } catch { body = text; }
		return { status: res.status, body };
	}, { bid: bookingId, reason });
}

/** POST /expert/~cancelBooking from page context. */
async function postExpertCancelBooking(
	page: Page,
	bookingId: number,
	reason: string
): Promise<{ status: number; body: any }> {
	return await page.evaluate(async (args: { bid: number; reason: string }) => {
		const csrf = (window as any).__GARNET_CSRF__ || '';
		const fd = new FormData();
		fd.append('CSRF_TOKEN', csrf);
		fd.append('booking_id', String(args.bid));
		fd.append('reason', args.reason);
		const res = await fetch('/expert/~cancelBooking', { method: 'POST', body: fd });
		const text = await res.text();
		let body: any = null;
		try { body = JSON.parse(text); } catch { body = text; }
		return { status: res.status, body };
	}, { bid: bookingId, reason });
}

async function devLogin(browser: any, role: string): Promise<{ context: BrowserContext; page: Page }> {
	const context = await newScopedContext(browser);
	const page = await context.newPage();
	await page.goto('/');
	await roleLogin(page, role);
	await page.goto('/');
	return { context, page };
}

// ─────────────────────────────────────────────────────────────────────────────
// Case 1: user cancel — pending booking, already cancelled, NO refund
// ─────────────────────────────────────────────────────────────────────────────

test.describe('H-2 backfill: user cancel on already-cancelled booking (was pending, no refund)', () => {
	let userId = 0;
	let expertId = 0;
	let slotId = 0;
	let bookingId = 0;
	let userBalanceBefore = 0;
	let expertBalanceBefore = 0;
	const SLOT_COST = 300;

	test('setup: seed slot + already-cancelled booking without refund', async () => {
		userId = await getAccountId('user1@dev.test');
		expertId = await getAccountId('expert1@dev.test');
		expect(userId).toBeGreaterThan(0);
		expect(expertId).toBeGreaterThan(0);

		await ensureBalance(userId, SLOT_COST + 5000);
		await ensureBalance(expertId, SLOT_COST + 5000);
		await recalcBalance(userId);
		await recalcBalance(expertId);
		userBalanceBefore = await getBalance(userId);
		expertBalanceBefore = await getBalance(expertId);

		const now = Math.floor(Date.now() / 1000);
		const startAt = now + 86400 * 7;
		slotId = await seedSlot({
			expertId,
			startAt,
			endAt: startAt + 3600,
			status: 'free',
			cost: SLOT_COST,
			maxUsers: 1,
			penaltyPct: 0,
		});
		expect(slotId).toBeGreaterThan(0);

		bookingId = await seedCancelledBooking({
			userId,
			expertId,
			slotId,
			cost: SLOT_COST,
			confirmedAt: null,   // was pending before crash
			cancelledAt: now - 3600,
		});
		expect(bookingId).toBeGreaterThan(0);

		// Sanity: no refund exists yet.
		const refunds = await countRefunds(bookingId);
		expect(refunds.userCredit).toBe(0);
		expect(refunds.expertDebit).toBe(0);
	});

	test('retry cancel returns success', async ({ browser }) => {
		if (!bookingId) { test.skip(); return; }
		const { context, page } = await devLogin(browser, 'user');
		try {
			const result = await postBookingCancel(page, bookingId, 'retry after crash');
			expect(result.status).toBe(200);
			expect(result.body).toMatchObject({ success: true });
		} finally {
			await context.close();
		}
	});

	test('DB: booking_refund ledger entries created (user credit + expert debit)', async () => {
		if (!bookingId) { test.skip(); return; }
		const refunds = await countRefunds(bookingId);
		expect(refunds.userCredit).toBe(1);
		expect(refunds.expertDebit).toBe(1);
	});

	test('DB: user balance restored to baseline (full refund)', async () => {
		if (!userId) { test.skip(); return; }
		await recalcBalance(userId);
		const balanceNow = await getBalance(userId);
		expect(balanceNow).toBe(userBalanceBefore);
	});

	test('DB: expert balance restored to baseline (full debit)', async () => {
		if (!expertId) { test.skip(); return; }
		await recalcBalance(expertId);
		const balanceNow = await getBalance(expertId);
		expect(balanceNow).toBe(expertBalanceBefore);
	});

	test('cleanup', async () => {
		if (slotId) await cleanupSlot(slotId);
		if (userId) await recalcBalance(userId);
		if (expertId) await recalcBalance(expertId);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Case 2: user cancel — confirmed booking, already cancelled, NO refund
// (confirmed_at set, cancelled_at before slot start, penalty=0 → full refund)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('H-2 backfill: user cancel on already-cancelled booking (was confirmed, no refund)', () => {
	let userId = 0;
	let expertId = 0;
	let slotId = 0;
	let bookingId = 0;
	let userBalanceBefore = 0;
	let expertBalanceBefore = 0;
	const SLOT_COST = 250;

	test('setup: seed slot + already-cancelled confirmed booking without refund', async () => {
		userId = await getAccountId('user1@dev.test');
		expertId = await getAccountId('expert1@dev.test');
		expect(userId).toBeGreaterThan(0);
		expect(expertId).toBeGreaterThan(0);

		await ensureBalance(userId, SLOT_COST + 5000);
		await ensureBalance(expertId, SLOT_COST + 5000);
		await recalcBalance(userId);
		await recalcBalance(expertId);
		userBalanceBefore = await getBalance(userId);
		expertBalanceBefore = await getBalance(expertId);

		const now = Math.floor(Date.now() / 1000);
		const startAt = now + 86400 * 7;
		slotId = await seedSlot({
			expertId,
			startAt,
			endAt: startAt + 3600,
			status: 'free',
			cost: SLOT_COST,
			maxUsers: 1,
			penaltyPct: 0,
		});
		expect(slotId).toBeGreaterThan(0);

		bookingId = await seedCancelledBooking({
			userId,
			expertId,
			slotId,
			cost: SLOT_COST,
			confirmedAt: now - 86400 * 2,  // confirmed 2 days ago
			cancelledAt: now - 3600,         // cancelled 1 hour ago (before slot start)
		});
		expect(bookingId).toBeGreaterThan(0);

		const refunds = await countRefunds(bookingId);
		expect(refunds.userCredit).toBe(0);
		expect(refunds.expertDebit).toBe(0);
	});

	test('retry cancel returns success', async ({ browser }) => {
		if (!bookingId) { test.skip(); return; }
		const { context, page } = await devLogin(browser, 'user');
		try {
			const result = await postBookingCancel(page, bookingId, 'retry after crash');
			expect(result.status).toBe(200);
			expect(result.body).toMatchObject({ success: true });
		} finally {
			await context.close();
		}
	});

	test('DB: booking_refund ledger entries created (user credit + expert debit)', async () => {
		if (!bookingId) { test.skip(); return; }
		const refunds = await countRefunds(bookingId);
		expect(refunds.userCredit).toBe(1);
		expect(refunds.expertDebit).toBe(1);
	});

	test('DB: user balance restored to baseline (full refund, penalty=0)', async () => {
		if (!userId) { test.skip(); return; }
		await recalcBalance(userId);
		const balanceNow = await getBalance(userId);
		expect(balanceNow).toBe(userBalanceBefore);
	});

	test('DB: expert balance restored to baseline (full debit)', async () => {
		if (!expertId) { test.skip(); return; }
		await recalcBalance(expertId);
		const balanceNow = await getBalance(expertId);
		expect(balanceNow).toBe(expertBalanceBefore);
	});

	test('cleanup', async () => {
		if (slotId) await cleanupSlot(slotId);
		if (userId) await recalcBalance(userId);
		if (expertId) await recalcBalance(expertId);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Case 3: idempotency — retry cancel on already-cancelled + already-refunded
// booking must NOT double-refund or change balances.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('H-2 idempotency: retry cancel on already-refunded booking (no double refund)', () => {
	let userId = 0;
	let expertId = 0;
	let slotId = 0;
	let bookingId = 0;
	let userBalanceBefore = 0;
	let expertBalanceBefore = 0;
	const SLOT_COST = 200;

	test('setup: seed already-cancelled booking WITH refund already present', async () => {
		userId = await getAccountId('user1@dev.test');
		expertId = await getAccountId('expert1@dev.test');
		expect(userId).toBeGreaterThan(0);
		expect(expertId).toBeGreaterThan(0);

		await ensureBalance(userId, SLOT_COST + 5000);
		await ensureBalance(expertId, SLOT_COST + 5000);
		await recalcBalance(userId);
		await recalcBalance(expertId);

		const now = Math.floor(Date.now() / 1000);
		const startAt = now + 86400 * 7;
		slotId = await seedSlot({
			expertId,
			startAt,
			endAt: startAt + 3600,
			status: 'free',
			cost: SLOT_COST,
			maxUsers: 1,
			penaltyPct: 0,
		});
		expect(slotId).toBeGreaterThan(0);

		bookingId = await seedCancelledBooking({
			userId,
			expertId,
			slotId,
			cost: SLOT_COST,
			confirmedAt: null,
			cancelledAt: now - 3600,
			withRefund: true,   // refund already present
		});
		expect(bookingId).toBeGreaterThan(0);

		// Refund already exists.
		const refunds = await countRefunds(bookingId);
		expect(refunds.userCredit).toBe(1);
		expect(refunds.expertDebit).toBe(1);

		await recalcBalance(userId);
		await recalcBalance(expertId);
		userBalanceBefore = await getBalance(userId);
		expertBalanceBefore = await getBalance(expertId);
	});

	test('retry cancel returns success', async ({ browser }) => {
		if (!bookingId) { test.skip(); return; }
		const { context, page } = await devLogin(browser, 'user');
		try {
			const result = await postBookingCancel(page, bookingId, 'idempotent retry');
			expect(result.status).toBe(200);
			expect(result.body).toMatchObject({ success: true });
		} finally {
			await context.close();
		}
	});

	test('DB: no additional refund rows (still exactly 1 per side)', async () => {
		if (!bookingId) { test.skip(); return; }
		const refunds = await countRefunds(bookingId);
		expect(refunds.userCredit).toBe(1);
		expect(refunds.expertDebit).toBe(1);
	});

	test('DB: user balance unchanged (no double refund)', async () => {
		if (!userId) { test.skip(); return; }
		await recalcBalance(userId);
		const balanceNow = await getBalance(userId);
		expect(balanceNow).toBe(userBalanceBefore);
	});

	test('DB: expert balance unchanged (no double debit)', async () => {
		if (!expertId) { test.skip(); return; }
		await recalcBalance(expertId);
		const balanceNow = await getBalance(expertId);
		expect(balanceNow).toBe(expertBalanceBefore);
	});

	test('cleanup', async () => {
		if (slotId) await cleanupSlot(slotId);
		if (userId) await recalcBalance(userId);
		if (expertId) await recalcBalance(expertId);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Case 4: expert cancelBooking — already cancelled, NO refund
// ─────────────────────────────────────────────────────────────────────────────

test.describe('H-2 backfill: expert cancelBooking on already-cancelled booking (no refund)', () => {
	let userId = 0;
	let expertId = 0;
	let slotId = 0;
	let bookingId = 0;
	let userBalanceBefore = 0;
	let expertBalanceBefore = 0;
	const SLOT_COST = 350;

	test('setup: seed slot + already-cancelled booking without refund', async () => {
		userId = await getAccountId('user1@dev.test');
		expertId = await getAccountId('expert1@dev.test');
		expect(userId).toBeGreaterThan(0);
		expect(expertId).toBeGreaterThan(0);

		await ensureBalance(userId, SLOT_COST + 5000);
		await ensureBalance(expertId, SLOT_COST + 5000);
		await recalcBalance(userId);
		await recalcBalance(expertId);
		userBalanceBefore = await getBalance(userId);
		expertBalanceBefore = await getBalance(expertId);

		const now = Math.floor(Date.now() / 1000);
		const startAt = now + 86400 * 7;
		slotId = await seedSlot({
			expertId,
			startAt,
			endAt: startAt + 3600,
			status: 'booked',
			cost: SLOT_COST,
			maxUsers: 1,
			penaltyPct: 0,
		});
		expect(slotId).toBeGreaterThan(0);

		bookingId = await seedCancelledBooking({
			userId,
			expertId,
			slotId,
			cost: SLOT_COST,
			confirmedAt: null,
			cancelledAt: now - 3600,
		});
		expect(bookingId).toBeGreaterThan(0);

		const refunds = await countRefunds(bookingId);
		expect(refunds.userCredit).toBe(0);
		expect(refunds.expertDebit).toBe(0);
	});

	test('expert retry cancel returns success', async ({ browser }) => {
		if (!bookingId) { test.skip(); return; }
		const { context, page } = await devLogin(browser, 'expert');
		try {
			await page.goto('/system/bookings');
			const result = await postExpertCancelBooking(page, bookingId, 'expert retry after crash');
			expect(result.status).toBe(200);
			expect(result.body).toMatchObject({ success: true });
		} finally {
			await context.close();
		}
	});

	test('DB: booking_refund ledger entries created (user credit + expert debit)', async () => {
		if (!bookingId) { test.skip(); return; }
		const refunds = await countRefunds(bookingId);
		expect(refunds.userCredit).toBe(1);
		expect(refunds.expertDebit).toBe(1);
	});

	test('DB: user balance restored to baseline (full refund)', async () => {
		if (!userId) { test.skip(); return; }
		await recalcBalance(userId);
		const balanceNow = await getBalance(userId);
		expect(balanceNow).toBe(userBalanceBefore);
	});

	test('DB: expert balance restored to baseline (full debit)', async () => {
		if (!expertId) { test.skip(); return; }
		await recalcBalance(expertId);
		const balanceNow = await getBalance(expertId);
		expect(balanceNow).toBe(expertBalanceBefore);
	});

	test('cleanup', async () => {
		if (slotId) await cleanupSlot(slotId);
		if (userId) await recalcBalance(userId);
		if (expertId) await recalcBalance(expertId);
	});
});
