/**
 * Повторная отмена уже возвращённой брони не создаёт второй возврат.
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
    postBookingCancel,
    devLogin,
} from './helpers';

test.describe.configure({ mode: 'serial' });

test.describe('H-2 idempotency: retry cancel on already-refunded booking (no double refund)', () => {
	let userId = 0;
	let expertId = 0;
	let slotId = 0;
	let bookingId = 0;
	let userBalanceBefore = 0;
	let expertBalanceBefore = 0;
	const SLOT_COST = 200;

	test.beforeAll(async () => {
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

	test.afterAll(async () => {
		if (slotId) await cleanupSlot(slotId);
		if (userId) await recalcBalance(userId);
		if (expertId) await recalcBalance(expertId);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Case 4: expert cancelBooking — already cancelled, NO refund
// ─────────────────────────────────────────────────────────────────────────────
