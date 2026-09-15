/**
 * Regression specs for booking time-guards (fixes 1-7).
 *
 * Fix 1: BookingsController::post__book returns 404 when slot not found / not free.
 * Fix 2: BookingsController::post__book returns 400 for past slots.
 * Fix 3: SlotsController::post__book (multi-booking) returns 409 slot_in_past for past slots.
 * Fix 4: BookingsController::post__cancel returns 400 for confirmed + past slot (session started).
 * Fix 5: pending booking on past slot IS cancellable — full refund (no over-restriction).
 * Fix 6: ExpertBookingsService::cancelBooking returns 400 for confirmed + past slot.
 * Fix 7: CronCompletionService::completeExpired completes orphan confirmed bookings;
 *         after completion the booking is no longer cancellable by the user.
 * Fix 8 (D-144): the SAME cron pass also flips the under-subscribed slot's own
 *         status to 'completed' — before this fix only the booking changed,
 *         the slot itself stayed 'free' forever with active Edit/Delete.
 * Fix 9 (D-146): the auto-cancel-pending-booking branch now also writes a
 *         user_cancellations row (kind='decline') — before this fix the
 *         profile counters ("Снятий"/"Отмен") never saw this outcome at all,
 *         while "Всего бронирований" still counted it.
 *
 * Seeding: direct MySQL — bypasses controller validation deliberately.
 * Cleanup: each test or describe block removes its own rows.
 */

import { test, expect, tn, getDbPrefix } from '../helpers/scoped-test';
import { newScopedContext } from '../helpers/scoped-test';
import type { BrowserContext, Page } from '@playwright/test';
import mysql from 'mysql2/promise';
import { DB, withConnection } from '../helpers/db';
import { roleLogin } from '../helpers/role-login';
import { spawnSync } from 'child_process';
import * as path from 'path';

// Absolute path to Apps/IRabi — cwd for php run_cmd.php calls.
// __dirname = Apps/IRabi/Tests/user → two levels up → Apps/IRabi
const APP_DIR = path.resolve(__dirname, '../..');

test.describe.configure({ mode: 'serial' });

// ─────────────────────────────────────────────────────────────────────────────
// Shared DB helpers
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

/** Insert a slot directly in DB — bypasses controller validation on purpose. */
async function seedSlot(params: {
	expertId: number;
	startAt: number;
	endAt: number;
	status?: string;
	maxUsers?: number;
	cost?: number;
}): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const [result]: any = await conn.execute(
			`INSERT INTO ${tn('time_slots')}
			 (expert_id, start_at, end_at, duration_min, cost, is_online, location, max_users, status, uid, created_at)
			 VALUES (?, ?, ?, 60, ?, 1, 'https://meet.example.com/time-guards-test', ?, ?, ?, ?)`,
			[
				params.expertId,
				params.startAt,
				params.endAt,
				params.cost ?? 500,
				params.maxUsers ?? 1,
				params.status ?? 'free',
				generateUid(),
				Math.floor(Date.now() / 1000),
			]
		);
		return result.insertId;
	} finally { await conn.end(); }
}

/** Insert a booking directly in DB. */
async function seedBooking(params: {
	userId: number;
	slotId: number;
	status: string;
	cost?: number;
	expertId?: number;
}): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const [result]: any = await conn.execute(
			`INSERT INTO ${tn('bookings')} (user_id, bookable_type, bookable_id, status, created_at)
			 VALUES (?, 'time_slot', ?, ?, ?)`,
			[params.userId, params.slotId, params.status, Math.floor(Date.now() / 1000)]
		);
		const bookingId = result.insertId;

		// If there is a cost, add ledger entries (booking_invoice for user, booking_payment for expert)
		// so refund checks work correctly. Both sides mirror what post__book does
		// at booking time: the user is debited and the expert credited unconditionally.
		if (params.cost && params.cost > 0) {
			try {
				await conn.execute(
					`INSERT INTO ${tn('balance_ledger')} (account_id, is_credit, amount, entry_type, ref_type, ref_id, note, created_at)
					 VALUES (?, 0, ?, 'booking_invoice', 'booking', ?, 'seed booking_invoice', UNIX_TIMESTAMP())`,
					[params.userId, params.cost, bookingId]
				);
				await conn.execute(
					`UPDATE ${tn('account_balance')} SET balance = balance - ?, updated_at = UNIX_TIMESTAMP() WHERE account_id = ?`,
					[params.cost, params.userId]
				);
				if (params.expertId && params.expertId > 0) {
					await conn.execute(
						`INSERT INTO ${tn('balance_ledger')} (account_id, is_credit, amount, entry_type, ref_type, ref_id, note, created_at)
						 VALUES (?, 1, ?, 'booking_payment', 'booking', ?, 'seed booking_payment', UNIX_TIMESTAMP())`,
						[params.expertId, params.cost, bookingId]
					);
					await conn.execute(
						`UPDATE ${tn('account_balance')} SET balance = balance + ?, updated_at = UNIX_TIMESTAMP() WHERE account_id = ?`,
						[params.cost, params.expertId]
					);
				}
			} catch {
				// ignore ledger errors — balance deduction is optional for these guard tests
			}
		}

		return bookingId;
	} finally { await conn.end(); }
}

async function cleanupSlot(slotId: number): Promise<void> {
	if (!slotId) return;
	const conn = await mysql.createConnection(DB);
	try {
		// clean ledger
		await conn.execute(
			`DELETE FROM ${tn('balance_ledger')} WHERE ref_type = 'booking' AND ref_id IN
			 (SELECT id FROM ${tn('bookings')} WHERE bookable_type = 'time_slot' AND bookable_id = ?)`,
			[slotId]
		);
		// clean user_cancellations
		await conn.execute(`DELETE FROM ${tn('user_cancellations')} WHERE slot_id = ?`, [slotId]);
		await conn.execute(`DELETE FROM ${tn('bookings')} WHERE bookable_type = 'time_slot' AND bookable_id = ?`, [slotId]);
		await conn.execute(`DELETE FROM ${tn('time_slots')} WHERE id = ?`, [slotId]);
	} finally { await conn.end(); }
}

async function getBookingStatus(bookingId: number): Promise<string> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT status FROM ${tn('bookings')} WHERE id = ?`, [bookingId]
		);
		return rows[0]?.status ?? 'not_found';
	} finally { await conn.end(); }
}

async function getUserCancellationKind(bookingId: number): Promise<string | null> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT kind FROM ${tn('user_cancellations')} WHERE booking_id = ?`, [bookingId]
		);
		return rows[0]?.kind ?? null;
	} finally { await conn.end(); }
}

async function getSlotStatus(slotId: number): Promise<string> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT status FROM ${tn('time_slots')} WHERE id = ?`, [slotId]
		);
		return rows[0]?.status ?? 'not_found';
	} finally { await conn.end(); }
}

/** Highest email_queue id for a recipient login — used to detect new emails. */
async function emailQueueMaxId(login: string): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT COALESCE(MAX(id), 0) AS maxId FROM ${tn('email_queue')} WHERE recipient_email = ?`,
			[login]
		);
		return Number(rows[0]?.maxId ?? 0);
	} finally { await conn.end(); }
}

/** POST to a booking endpoint from within page context, returns {status, body}. */
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

/** POST to the slots multi-book endpoint from within page context. */
async function postSlotsBook(
	page: Page,
	slotIds: number[]
): Promise<{ status: number; body: any }> {
	return await page.evaluate(async (args: { slotIds: number[] }) => {
		const csrf = (window as any).__GARNET_CSRF__ || '';
		const fd = new FormData();
		fd.append('CSRF_TOKEN', csrf);
		for (const id of args.slotIds) {
			fd.append('slot_ids[]', String(id));
		}
		const res = await fetch('/slots/~book', { method: 'POST', body: fd });
		const text = await res.text();
		let body: any = null;
		try { body = JSON.parse(text); } catch { body = text; }
		return { status: res.status, body };
	}, { slotIds });
}

/** POST to expert cancel booking endpoint from within page context. */
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
// Fix 1: post__book returns 404 when slot not found OR slot not free
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Fix 1: post__book returns 404 for non-existent or non-free slot', () => {
	let expertId = 0;
	let cancelledSlotId = 0;

	test('GET /bookings/id~999999999/~book returns 404', async ({ page }) => {
		const resp = await page.goto('/bookings/id~999999999/~book');
		expect(resp?.status()).toBe(404);
	});

	// beforeAll/afterAll (not plain tests) — serial mode skips every
	// subsequent test once one fails, so a cleanup step written as a
	// regular test never runs after a mid-flow assertion fails, leaving
	// stray test slots/bookings (and, in the balance-touching blocks
	// below, un-recalculated shared user1@dev.test/expert1@dev.test
	// balances) behind for the rest of this worker's run. Hooks run
	// regardless of test outcome.
	test.beforeAll(async () => {
		expertId = await getAccountId('expert1@dev.test');
		expect(expertId).toBeGreaterThan(0);

		const now = Math.floor(Date.now() / 1000);
		cancelledSlotId = await seedSlot({
			expertId,
			startAt: now + 86400,
			endAt: now + 86400 + 3600,
			status: 'cancelled',
			cost: 0,
		});
		expect(cancelledSlotId).toBeGreaterThan(0);
	});

	test('POST to book a cancelled slot returns 404 (slot not free guard)', async ({ browser }) => {
		if (!cancelledSlotId) { test.skip(); return; }
		const { context, page } = await devLogin(browser, 'user');
		try {
			const result = await page.evaluate(async (bid: number) => {
				const csrf = (window as any).__GARNET_CSRF__ || '';
				const fd = new FormData();
				fd.append('CSRF_TOKEN', csrf);
				const res = await fetch(`/bookings/id~${bid}/~book`, { method: 'POST', body: fd });
				const text = await res.text();
				let body: any = null;
				try { body = JSON.parse(text); } catch { body = text; }
				return { status: res.status, body };
			}, cancelledSlotId);

			expect(result.status).toBe(404);
			expect(result.body).toMatchObject({ error: expect.any(String) });
		} finally {
			await context.close();
		}
	});

	test.afterAll(async () => {
		if (cancelledSlotId) await cleanupSlot(cancelledSlotId);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 2 & 3: Booking a past slot via single-book and multi-book APIs
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Fix 2: post__book (single) returns 400 for past slot', () => {
	let expertId = 0;
	let userId = 0;
	let slotId = 0;

	test.beforeAll(async () => {
		expertId = await getAccountId('expert1@dev.test');
		userId = await getAccountId('user1@dev.test');
		expect(expertId).toBeGreaterThan(0);
		expect(userId).toBeGreaterThan(0);

		const now = Math.floor(Date.now() / 1000);
		const startAt = now - 7200; // 2 hours in the past
		slotId = await seedSlot({
			expertId,
			startAt,
			endAt: startAt + 3600,
			status: 'free',
			cost: 0, // free slot so balance isn't the blocker
		});
		expect(slotId).toBeGreaterThan(0);
	});

	test('past slot page renders (GET returns 200)', async ({ page }) => {
		if (!slotId) { test.skip(); return; }
		const resp = await page.goto(`/bookings/id~${slotId}/~book`);
		expect(resp?.status()).toBe(200);
	});

	test('clicking book on past slot returns 400 (from page context)', async ({ browser }) => {
		if (!slotId) { test.skip(); return; }
		const { context, page } = await devLogin(browser, 'user');
		try {
			const result = await page.evaluate(async (bid: number) => {
				const csrf = (window as any).__GARNET_CSRF__ || '';
				const fd = new FormData();
				fd.append('CSRF_TOKEN', csrf);
				const res = await fetch(`/bookings/id~${bid}/~book`, { method: 'POST', body: fd });
				const text = await res.text();
				let body: any = null;
				try { body = JSON.parse(text); } catch { body = text; }
				return { status: res.status, body };
			}, slotId);

			expect(result.status).toBe(400);
			expect(result.body).toMatchObject({ error: expect.any(String) });
		} finally {
			await context.close();
		}
	});

	test.afterAll(async () => {
		if (slotId) await cleanupSlot(slotId);
	});
});

test.describe('Fix 3: SlotsController::post__book returns 409 slot_in_past for past slot', () => {
	let expertId = 0;
	let userId = 0;
	let slotId = 0;

	test.beforeAll(async () => {
		expertId = await getAccountId('expert1@dev.test');
		userId = await getAccountId('user1@dev.test');
		expect(expertId).toBeGreaterThan(0);
		expect(userId).toBeGreaterThan(0);

		const now = Math.floor(Date.now() / 1000);
		const startAt = now - 7200;
		slotId = await seedSlot({
			expertId,
			startAt,
			endAt: startAt + 3600,
			status: 'free',
			cost: 0,
		});
		expect(slotId).toBeGreaterThan(0);
	});

	test('multi-book past slot → 409 slot_in_past', async ({ browser }) => {
		if (!slotId) { test.skip(); return; }
		const { context, page } = await devLogin(browser, 'user');
		try {
			const result = await postSlotsBook(page, [slotId]);
			expect(result.status).toBe(409);
			expect(result.body).toMatchObject({ error: 'slot_in_past' });
			expect(result.body).toHaveProperty('redirectUrl');
		} finally {
			await context.close();
		}
	});

	test.afterAll(async () => {
		if (slotId) await cleanupSlot(slotId);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 4: Cancellation of confirmed + past booking → 400
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Fix 4: post__cancel returns 400 for confirmed booking after session started', () => {
	let userId = 0;
	let expertId = 0;
	let slotId = 0;
	let bookingId = 0;
	let balanceBefore = 0;
	const SLOT_COST = 300;

	test.beforeAll(async () => {
		userId = await getAccountId('user1@dev.test');
		expertId = await getAccountId('expert1@dev.test');
		expect(userId).toBeGreaterThan(0);
		expect(expertId).toBeGreaterThan(0);

		await ensureBalance(userId, SLOT_COST + 2000);
		await ensureBalance(expertId, 0);
		await recalcBalance(userId);
		balanceBefore = await getBalance(userId);

		const now = Math.floor(Date.now() / 1000);
		const startAt = now - 7200; // past
		slotId = await seedSlot({
			expertId,
			startAt,
			endAt: startAt + 3600,
			status: 'booked',
			cost: SLOT_COST,
			maxUsers: 1,
		});
		expect(slotId).toBeGreaterThan(0);

		bookingId = await seedBooking({
			userId,
			slotId,
			status: 'confirmed', // confirmed + past = cancel blocked
			cost: SLOT_COST,
		});
		expect(bookingId).toBeGreaterThan(0);
	});

	test('cancel confirmed past booking returns 400', async ({ browser }) => {
		if (!bookingId) { test.skip(); return; }
		// Use devLogin so that auth flow populates window.__GARNET_CSRF__
		const { context, page } = await devLogin(browser, 'user');
		try {
			const result = await postBookingCancel(page, bookingId, 'trying to cancel confirmed past booking');
			expect(result.status).toBe(400);
			expect(result.body).toMatchObject({ error: expect.any(String) });
		} finally {
			await context.close();
		}
	});

	test('DB: booking status is still confirmed (no change)', async () => {
		if (!bookingId) { test.skip(); return; }
		const status = await getBookingStatus(bookingId);
		expect(status).toBe('confirmed');
	});

	test('DB: user balance NOT changed after blocked cancel', async () => {
		if (!userId) { test.skip(); return; }
		const balanceNow = await getBalance(userId);
		// Balance might have been decremented during seedBooking; it should be the same
		// as right after the seed — not restored (refund must NOT happen)
		expect(balanceNow).toBe(balanceBefore - SLOT_COST);
	});

	test.afterAll(async () => {
		if (slotId) await cleanupSlot(slotId);
		if (userId) await recalcBalance(userId);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 5: pending booking on past slot IS cancellable → full refund (no over-restriction)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Fix 5: pending booking on past slot IS cancellable with full refund', () => {
	let userId = 0;
	let expertId = 0;
	let slotId = 0;
	let bookingId = 0;
	let balanceBefore = 0;
	const SLOT_COST = 250;

	test.beforeAll(async () => {
		userId = await getAccountId('user1@dev.test');
		expertId = await getAccountId('expert1@dev.test');
		expect(userId).toBeGreaterThan(0);
		expect(expertId).toBeGreaterThan(0);

		await ensureBalance(userId, SLOT_COST + 2000);
		await recalcBalance(userId);
		balanceBefore = await getBalance(userId);

		const now = Math.floor(Date.now() / 1000);
		const startAt = now - 7200; // past
		slotId = await seedSlot({
			expertId,
			startAt,
			endAt: startAt + 3600,
			status: 'free', // slot status doesn't matter here
			cost: SLOT_COST,
			maxUsers: 1,
		});
		expect(slotId).toBeGreaterThan(0);

		bookingId = await seedBooking({
			userId,
			slotId,
			status: 'pending', // pending + past = cancellable
			cost: SLOT_COST,
		});
		expect(bookingId).toBeGreaterThan(0);
	});

	test('cancel pending past booking is ALLOWED (returns 200 success)', async ({ browser }) => {
		if (!bookingId) { test.skip(); return; }
		const { context, page } = await devLogin(browser, 'user');
		try {
			const result = await postBookingCancel(page, bookingId, 'no longer needed, slot never confirmed');
			expect(result.status).toBe(200);
			expect(result.body).toMatchObject({ success: true });
		} finally {
			await context.close();
		}
	});

	test('DB: booking status changed to cancelled', async () => {
		if (!bookingId) { test.skip(); return; }
		const status = await getBookingStatus(bookingId);
		expect(status).toBe('cancelled');
	});

	test('DB: user balance restored (full refund on pending past slot)', async () => {
		if (!userId) { test.skip(); return; }
		await recalcBalance(userId);
		const balanceNow = await getBalance(userId);
		// Should be back to balanceBefore (refund of SLOT_COST after invoice deduction)
		expect(balanceNow).toBe(balanceBefore);
	});

	test.afterAll(async () => {
		if (slotId) await cleanupSlot(slotId);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 6: Expert cannot cancel a confirmed past booking → 400
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Fix 6: expert cancelBooking returns 400 for confirmed + past slot', () => {
	let userId = 0;
	let expertId = 0;
	let slotId = 0;
	let bookingId = 0;
	const SLOT_COST = 200;

	test.beforeAll(async () => {
		userId = await getAccountId('user1@dev.test');
		expertId = await getAccountId('expert1@dev.test');
		expect(userId).toBeGreaterThan(0);
		expect(expertId).toBeGreaterThan(0);

		await ensureBalance(userId, SLOT_COST + 2000);
		await ensureBalance(expertId, 0);

		const now = Math.floor(Date.now() / 1000);
		const startAt = now - 7200;
		slotId = await seedSlot({
			expertId,
			startAt,
			endAt: startAt + 3600,
			status: 'booked',
			cost: SLOT_COST,
			maxUsers: 1,
		});
		expect(slotId).toBeGreaterThan(0);

		bookingId = await seedBooking({
			userId,
			slotId,
			status: 'confirmed',
		});
		expect(bookingId).toBeGreaterThan(0);
	});

	test('expert: cancel confirmed past booking → 400', async ({ browser }) => {
		if (!bookingId) { test.skip(); return; }

		const { context, page } = await devLogin(browser, 'expert');
		try {
			await page.goto('/system/bookings');

			const result = await postExpertCancelBooking(page, bookingId, 'trying to cancel past session');
			expect(result.status).toBe(400);
			expect(result.body).toMatchObject({ error: expect.any(String) });
		} finally {
			await context.close();
		}
	});

	test('DB: booking remains confirmed after blocked expert cancel', async () => {
		if (!bookingId) { test.skip(); return; }
		const status = await getBookingStatus(bookingId);
		expect(status).toBe('confirmed');
	});

	test.afterAll(async () => {
		if (slotId) await cleanupSlot(slotId);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix 7: Real cron (CronCompletionService::completeExpired) completes orphan
//         confirmed bookings on past free-status slots; after completion the
//         booking is no longer cancellable.
//
// Control assertions (selectivity):
//   (a) confirmed booking on FUTURE free-slot  → stays 'confirmed' (not touched)
//   (b) pending booking on PAST free-slot      → AUTO-CANCELLED with full refund
//       (user credited, expert debited) and a rejection email enqueued.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Fix 7: cron complete-expired completes orphan confirmed booking; user cannot cancel afterwards', () => {
	let userId = 0;
	let expertId = 0;

	// Target: past free-slot (group, under-subscribed) with confirmed booking → must become completed
	let targetSlotId = 0;
	let targetBookingId = 0;

	// Control (a): future free-slot with confirmed booking → must stay confirmed
	let futureSlotId = 0;
	let futureBookingId = 0;

	// Control (b): past free-slot with PENDING booking → auto-cancelled with full refund
	let pastPendingSlotId = 0;
	let pastPendingBookingId = 0;

	// D-183: slots with NO bookings at all. The past one was the case nobody
	// handled — it stayed 'free' forever, counted by the expert's status filter
	// while the calendar window never showed it. The future one is the control
	// that keeps the sweep time-scoped.
	let emptyPastSlotId = 0;
	let emptyFutureSlotId = 0;

	// Balances + email-queue watermark captured before the cron runs, so the
	// refund + notification assertions can compare against a known baseline.
	const PENDING_SLOT_COST = 300;
	let userBalanceBefore = 0;
	let expertBalanceBefore = 0;
	let userEmailMaxIdBefore = 0;

	test.beforeAll(async () => {
		userId = await getAccountId('user1@dev.test');
		expertId = await getAccountId('expert1@dev.test');
		expect(userId).toBeGreaterThan(0);
		expect(expertId).toBeGreaterThan(0);

		const now = Math.floor(Date.now() / 1000);

		// TARGET: past slot, status=free (under-subscribed group), confirmed booking
		const pastStart = now - 7200;
		const pastEnd = now - 3600; // end_at < now — cron will pick this up
		targetSlotId = await seedSlot({
			expertId,
			startAt: pastStart,
			endAt: pastEnd,
			status: 'free',
			cost: 0,
			maxUsers: 2,
		});
		expect(targetSlotId).toBeGreaterThan(0);
		targetBookingId = await seedBooking({ userId, slotId: targetSlotId, status: 'confirmed' });
		expect(targetBookingId).toBeGreaterThan(0);

		// CONTROL (a): FUTURE slot, status=free, confirmed booking — must NOT be completed
		const futureStart = now + 86400 * 7;
		futureSlotId = await seedSlot({
			expertId,
			startAt: futureStart,
			endAt: futureStart + 3600,
			status: 'free',
			cost: 0,
			maxUsers: 2,
		});
		expect(futureSlotId).toBeGreaterThan(0);
		futureBookingId = await seedBooking({ userId, slotId: futureSlotId, status: 'confirmed' });
		expect(futureBookingId).toBeGreaterThan(0);

		// CONTROL (b): PAST slot, status=free, PENDING booking with a real cost.
		// Cron auto-cancels it (slot expired without an expert decision),
		// refunds the user in full and debits the expert by the same amount.
		pastPendingSlotId = await seedSlot({
			expertId,
			startAt: pastStart,
			endAt: pastEnd,
			status: 'free',
			cost: PENDING_SLOT_COST,
			maxUsers: 2,
		});
		expect(pastPendingSlotId).toBeGreaterThan(0);

		// Fund both sides so the refund/debit math has a non-trivial baseline,
		// and snapshot balances BEFORE seeding the booking.
		await ensureBalance(userId, PENDING_SLOT_COST + 2000);
		await ensureBalance(expertId, PENDING_SLOT_COST + 2000);
		await recalcBalance(userId);
		await recalcBalance(expertId);
		userBalanceBefore = await getBalance(userId);
		expertBalanceBefore = await getBalance(expertId);
		userEmailMaxIdBefore = await emailQueueMaxId('user1@dev.test');

		pastPendingBookingId = await seedBooking({
			userId,
			slotId: pastPendingSlotId,
			status: 'pending',
			cost: PENDING_SLOT_COST,
			expertId,
		});
		expect(pastPendingBookingId).toBeGreaterThan(0);

		// D-183 TARGET: past slot, status=free, and nobody ever booked it.
		emptyPastSlotId = await seedSlot({
			expertId,
			startAt: pastStart,
			endAt: pastEnd,
			status: 'free',
			cost: 0,
			maxUsers: 5,
		});
		expect(emptyPastSlotId).toBeGreaterThan(0);

		// D-183 CONTROL: same thing in the future — must stay bookable.
		emptyFutureSlotId = await seedSlot({
			expertId,
			startAt: futureStart,
			endAt: futureStart + 3600,
			status: 'free',
			cost: 0,
			maxUsers: 5,
		});
		expect(emptyFutureSlotId).toBeGreaterThan(0);
	});

	test('before cron: target booking is confirmed, controls are correct', async () => {
		if (!targetBookingId) { test.skip(); return; }
		expect(await getBookingStatus(targetBookingId)).toBe('confirmed');
		expect(await getBookingStatus(futureBookingId)).toBe('confirmed');
		expect(await getBookingStatus(pastPendingBookingId)).toBe('pending');
	});

	test('run real cron complete-expired (CronCompletionService)', () => {
		// php run_cmd.php honours DB_PREFIX_OVERRIDE to target the isolated
		// test_worker_N tables — same mechanism as isolation-setup.ts::runCli().
		//
		// NOTE: spawnSync is used instead of execSync because the cron task
		// completes its real work (UPDATE bookings) before attempting to write
		// to the `cron_log` table. That table does NOT exist in isolated test
		// worker scopes (it is not part of the migrations run during isolation
		// setup), so the INSERT into cron_log throws and the process exits 1.
		// The actual CronCompletionService::completeExpired() logic has already
		// run successfully at that point — the DB state is correct. We verify
		// this by checking that stdout contains "Completed:" (printed by the
		// task callback before the log write attempt).
		const prefix = getDbPrefix();
		const res = spawnSync('php', ['run_cmd.php', 'cron', 'complete-expired'], {
			cwd: APP_DIR,
			env: { ...process.env, DB_PREFIX_OVERRIDE: prefix },
			encoding: 'utf8',
		});
		const out = (res.stdout ?? '') + (res.stderr ?? '');
		console.log('[cron output]', out.trim());
		// The task output line "Completed: X slots, Y bookings" confirms
		// CronCompletionService ran. The subsequent log-write failure (exit 1)
		// is expected in isolated scopes — we do not assert exit code here.
		expect(out).toContain('Completed:');
	});

	test('DB: target booking (past free-slot, confirmed) is now completed', async () => {
		if (!targetBookingId) { test.skip(); return; }
		expect(await getBookingStatus(targetBookingId)).toBe('completed');
	});

	test('D-144: target SLOT itself (under-subscribed group, past) is now completed, not stuck free', async () => {
		if (!targetSlotId) { test.skip(); return; }
		expect(await getSlotStatus(targetSlotId)).toBe('completed');
	});

	test('DB control (a): future free-slot confirmed booking stays confirmed', async () => {
		if (!futureBookingId) { test.skip(); return; }
		expect(await getBookingStatus(futureBookingId)).toBe('confirmed');
	});

	test('DB control (a): future free-slot itself stays free (not touched)', async () => {
		if (!futureSlotId) { test.skip(); return; }
		expect(await getSlotStatus(futureSlotId)).toBe('free');
	});

	test('DB: past free-slot PENDING booking is auto-cancelled with full refund + email', async () => {
		if (!pastPendingBookingId) { test.skip(); return; }

		// Status flipped pending → cancelled by the cron.
		expect(await getBookingStatus(pastPendingBookingId)).toBe('cancelled');

		// Full refund: user credited back the cost, expert debited the same amount.
		// Both ledger rows (booking_invoice / booking_payment from seedBooking, plus
		// the cron's booking_refund) net to zero against the baseline captured pre-seed.
		await recalcBalance(userId);
		await recalcBalance(expertId);
		const userBalanceNow = await getBalance(userId);
		const expertBalanceNow = await getBalance(expertId);
		expect(userBalanceNow).toBe(userBalanceBefore);
		expect(expertBalanceNow).toBe(expertBalanceBefore);

		// A rejection email was enqueued to the user (bookingRejected path).
		const userEmailMaxIdAfter = await emailQueueMaxId('user1@dev.test');
		expect(userEmailMaxIdAfter).toBeGreaterThan(userEmailMaxIdBefore);
	});

	test('D-183: past slot nobody booked stops being "free" — it is over, not available', async () => {
		if (!emptyPastSlotId) { test.skip(); return; }
		// Before the fix this stayed 'free' forever: the expert's status filter
		// counted it, the calendar window (four weeks from today) never showed
		// it, and the two numbers disagreed on the same screen.
		expect(await getSlotStatus(emptyPastSlotId)).toBe('completed');
	});

	test('D-183 control: a future slot nobody booked is left alone', async () => {
		if (!emptyFutureSlotId) { test.skip(); return; }
		expect(await getSlotStatus(emptyFutureSlotId)).toBe('free');
	});

	test('D-183: slot whose only request the cron just declined is closed in the same pass', async () => {
		if (!pastPendingSlotId) { test.skip(); return; }
		// The auto-cancel above releases the seat and leaves the slot open.
		// Without the closing sweep it would be back to the D-183 state: past,
		// empty, and still advertised as free.
		expect(await getSlotStatus(pastPendingSlotId)).toBe('completed');
	});

	test('D-146: auto-cancelled pending booking gets a user_cancellations row (kind=decline)', async () => {
		if (!pastPendingBookingId) { test.skip(); return; }
		expect(await getUserCancellationKind(pastPendingBookingId)).toBe('decline');
	});

	test('after cron: user cannot cancel completed booking (returns 400)', async ({ browser }) => {
		if (!targetBookingId) { test.skip(); return; }
		const { context, page } = await devLogin(browser, 'user');
		try {
			const result = await postBookingCancel(page, targetBookingId, 'trying to cancel completed booking');
			expect(result.status).toBe(400);
			expect(result.body).toMatchObject({ error: expect.any(String) });
		} finally {
			await context.close();
		}
	});

	test('DB: target booking status remains completed after blocked cancel attempt', async () => {
		if (!targetBookingId) { test.skip(); return; }
		expect(await getBookingStatus(targetBookingId)).toBe('completed');
	});

	test.afterAll(async () => {
		if (targetSlotId) await cleanupSlot(targetSlotId);
		if (futureSlotId) await cleanupSlot(futureSlotId);
		if (pastPendingSlotId) await cleanupSlot(pastPendingSlotId);
		if (emptyPastSlotId) await cleanupSlot(emptyPastSlotId);
		if (emptyFutureSlotId) await cleanupSlot(emptyFutureSlotId);
		// Clean the rejection email enqueued by the cron so it does not leak
		// into subsequent test runs that share this isolated scope.
		if (userEmailMaxIdBefore > 0) {
			const conn = await mysql.createConnection(DB);
			try {
				await conn.execute(
					`DELETE FROM ${tn('email_queue')} WHERE recipient_email = ? AND id > ?`,
					['user1@dev.test', userEmailMaxIdBefore]
				);
			} finally { await conn.end(); }
		}
		if (userId) await recalcBalance(userId);
		if (expertId) await recalcBalance(expertId);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// D-147: BookingsController::buildAuxMaps() only revealed slot.location while
// booking.status stayed literally 'confirmed'. A booking flips to 'completed'
// once the session's end_at passes — at that exact moment the meeting link
// used to disappear from the student's own booking card, replaced by a bare
// platform-name string. Found live on production (support ticket #4).
// ─────────────────────────────────────────────────────────────────────────────

async function postBookingsPage(page: Page): Promise<{ status: number; body: any }> {
	return await page.evaluate(async () => {
		const csrf = (window as any).__GARNET_CSRF__ || '';
		const fd = new FormData();
		fd.append('CSRF_TOKEN', csrf);
		fd.append('status', '');
		fd.append('showPast', 'true');
		const res = await fetch('/bookings/~page', { method: 'POST', body: fd });
		const text = await res.text();
		let body: any = null;
		try { body = JSON.parse(text); } catch { body = text; }
		return { status: res.status, body };
	});
}

test.describe('D-147: meeting link stays visible after the session (booked slot) completes', () => {
	let userId = 0;
	let expertId = 0;
	let slotId = 0;
	let bookingId = 0;
	const MEETING_URL = 'https://meet.example.com/d147-test';

	test.beforeAll(async () => {
		userId = await getAccountId('user1@dev.test');
		expertId = await getAccountId('expert1@dev.test');
		expect(userId).toBeGreaterThan(0);
		expect(expertId).toBeGreaterThan(0);

		const now = Math.floor(Date.now() / 1000);
		const pastStart = now - 7200;
		const pastEnd = now - 3600;

		// status='booked' (max_users=1, fully booked) — takes the FIRST cron
		// branch (slots.where status='booked'), NOT the D-144 under-subscribed
		// path, keeping this test focused on the confirmed->completed status
		// transition alone.
		const conn = await mysql.createConnection(DB);
		try {
			const [res]: any = await conn.execute(
				`INSERT INTO ${tn('time_slots')}
				 (expert_id, start_at, end_at, duration_min, cost, is_online, location, max_users, booked_count, status, uid, created_at)
				 VALUES (?, ?, ?, 60, 0, 1, ?, 1, 1, 'booked', ?, ?)`,
				[expertId, pastStart, pastEnd, MEETING_URL, generateUid(), Math.floor(Date.now() / 1000)],
			);
			slotId = res.insertId;
		} finally { await conn.end(); }
		expect(slotId).toBeGreaterThan(0);

		bookingId = await seedBooking({ userId, slotId, status: 'confirmed' });
		expect(bookingId).toBeGreaterThan(0);
	});

	test('before cron: booking confirmed, /bookings/~page already shows the real link', async ({ browser }) => {
		if (!bookingId) { test.skip(); return; }
		expect(await getBookingStatus(bookingId)).toBe('confirmed');

		const { context, page } = await devLogin(browser, 'user');
		try {
			const result = await postBookingsPage(page);
			expect(result.status).toBe(200);
			expect(result.body.slots[String(slotId)].location).toBe(MEETING_URL);
		} finally {
			await context.close();
		}
	});

	test('run real cron complete-expired', () => {
		const prefix = getDbPrefix();
		const res = spawnSync('php', ['run_cmd.php', 'cron', 'complete-expired'], {
			cwd: APP_DIR,
			env: { ...process.env, DB_PREFIX_OVERRIDE: prefix },
			encoding: 'utf8',
		});
		const out = (res.stdout ?? '') + (res.stderr ?? '');
		expect(out).toContain('Completed:');
	});

	test('after cron: booking is completed, but /bookings/~page STILL shows the real link', async ({ browser }) => {
		if (!bookingId) { test.skip(); return; }
		expect(await getBookingStatus(bookingId)).toBe('completed');

		const { context, page } = await devLogin(browser, 'user');
		try {
			const result = await postBookingsPage(page);
			expect(result.status).toBe(200);
			expect(result.body.slots[String(slotId)].location).toBe(MEETING_URL);
		} finally {
			await context.close();
		}
	});

	test.afterAll(async () => {
		if (slotId) await cleanupSlot(slotId);
	});
});
