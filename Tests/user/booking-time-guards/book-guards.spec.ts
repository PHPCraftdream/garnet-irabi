/**
 * Гарды бронирования: несуществующий и занятый слот, слот в прошлом
 * (одиночная бронь и мультибронь).
 *
 * Часть разобранного booking-time-guards.spec.ts (был один файл на
 * 1259 строк). Последовательный режим сохранён: проверки внутри
 * опираются на состояние, оставленное предыдущей.
 */

import { test, expect } from '../../helpers/scoped-test';
import {
    cleanupSlot,
    devLogin,
    getAccountId,
    postSlotsBook,
    seedSlot,
} from './helpers';

test.describe.configure({ mode: 'serial' });

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
