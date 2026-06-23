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
		// so refund checks work correctly.
		if (params.cost && params.cost > 0) {
			// We don't have expertId here easily; the balance already exists; just insert invoice debit for user.
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

	test('setup: seed a cancelled slot (exists but status != free)', async () => {
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

	test('cleanup: remove cancelled slot', async () => {
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

	test('setup: seed past slot', async () => {
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

	test('cleanup', async () => {
		if (slotId) await cleanupSlot(slotId);
	});
});

test.describe('Fix 3: SlotsController::post__book returns 409 slot_in_past for past slot', () => {
	let expertId = 0;
	let userId = 0;
	let slotId = 0;

	test('setup: seed past slot', async () => {
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

	test('cleanup', async () => {
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

	test('setup: seed past confirmed booking with cost', async () => {
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

	test('cleanup', async () => {
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

	test('setup: seed past pending booking with cost', async () => {
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

	test('cleanup', async () => {
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

	test('setup: seed past confirmed booking for expert context', async () => {
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

	test('cleanup', async () => {
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
//   (b) pending booking on PAST free-slot      → stays 'pending'   (cron skips non-confirmed)
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

	// Control (b): past free-slot with PENDING booking → must stay pending
	let pastPendingSlotId = 0;
	let pastPendingBookingId = 0;

	test('setup: seed target + control slots and bookings', async () => {
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

		// CONTROL (b): PAST slot, status=free, PENDING booking — must NOT be completed (cron only targets confirmed)
		pastPendingSlotId = await seedSlot({
			expertId,
			startAt: pastStart,
			endAt: pastEnd,
			status: 'free',
			cost: 0,
			maxUsers: 2,
		});
		expect(pastPendingSlotId).toBeGreaterThan(0);
		pastPendingBookingId = await seedBooking({ userId, slotId: pastPendingSlotId, status: 'pending' });
		expect(pastPendingBookingId).toBeGreaterThan(0);
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

	test('DB control (a): future free-slot confirmed booking stays confirmed', async () => {
		if (!futureBookingId) { test.skip(); return; }
		expect(await getBookingStatus(futureBookingId)).toBe('confirmed');
	});

	test('DB control (b): past free-slot PENDING booking stays pending', async () => {
		if (!pastPendingBookingId) { test.skip(); return; }
		expect(await getBookingStatus(pastPendingBookingId)).toBe('pending');
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

	test('cleanup: remove all seeded slots', async () => {
		if (targetSlotId) await cleanupSlot(targetSlotId);
		if (futureSlotId) await cleanupSlot(futureSlotId);
		if (pastPendingSlotId) await cleanupSlot(pastPendingSlotId);
	});
});
