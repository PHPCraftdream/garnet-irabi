/**
 * Добор возврата при отмене эксперта.
 *
 * Часть разобранного booking-cancel-refund-backfill.spec.ts.
 */

import { test, expect } from '../../../../helpers/scoped-test';
import { DB } from '../../../../helpers/db/db';
import {
    getAccountId,
    getBalance,
    ensureBalance,
    recalcBalance,
    seedSlot,
    seedCancelledBooking,
    countRefunds,
    cleanupSlot,
    postExpertCancelBooking,
    devLogin,
} from './helpers';

test.describe.configure({ mode: 'serial' });

test.describe('H-2 backfill: expert cancelBooking on already-cancelled booking (no refund)', () => {
	let userId = 0;
	let expertId = 0;
	let slotId = 0;
	let bookingId = 0;
	let userBalanceBefore = 0;
	let expertBalanceBefore = 0;
	const SLOT_COST = 350;

	// beforeAll/afterAll (not plain tests) — serial mode skips every
	// subsequent test once one fails, so a cleanup step written as a
	// regular test never runs after a mid-flow assertion fails, leaving
	// the shared user1@dev.test/expert1@dev.test dev-seed fixtures'
	// balances un-recalculated and stray test slots/bookings behind for
	// the rest of this worker's run. Hooks run regardless of test
	// outcome.
	test.beforeAll(async () => {
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

	test.afterAll(async () => {
		if (slotId) await cleanupSlot(slotId);
		if (userId) await recalcBalance(userId);
		if (expertId) await recalcBalance(expertId);
	});
});
