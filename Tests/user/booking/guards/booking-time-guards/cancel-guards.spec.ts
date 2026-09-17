/**
 * Гарды отмены: после начала занятия отменять нельзя, но бронь в
 * ожидании на прошедшем слоте — можно, с полным возвратом. Та же граница
 * с стороны эксперта.
 *
 * Часть разобранного booking-time-guards.spec.ts (был один файл на
 * 1259 строк). Последовательный режим сохранён: проверки внутри
 * опираются на состояние, оставленное предыдущей.
 */

import { test, expect } from '../../../../helpers/scoped-test';
import { DB } from '../../../../helpers/db/db';
import {
    cleanupSlot,
    devLogin,
    ensureBalance,
    getAccountId,
    getBalance,
    getBookingStatus,
    postBookingCancel,
    postExpertCancelBooking,
    recalcBalance,
    seedBooking,
    seedSlot,
} from './helpers';

test.describe.configure({ mode: 'serial' });

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
