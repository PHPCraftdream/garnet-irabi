/**
 * D-159: after a booking on a slot got cancelled and the server reopened
 * the slot (BookingsController::post__cancel flips it back to 'free' once
 * nobody active holds it), the /slots catalog still treated the slot as
 * permanently "mine" — the card was frozen on a dead-end "Отменён" status
 * with no book button, even though the exact same slot booked fine from
 * the expert's public profile page (which never remembers the
 * cancellation). Found on a group slot (Софья Гринберг → Хана Городецкая,
 * limit 3, occupied seats back to 0 after cancel), but the root cause
 * (SlotsCalendarIsland's `bookedIds` set never shrinking) applies to any
 * slot, group or individual.
 *
 * Fixed: the catalog now derives an `effectiveBookedIds` set that drops a
 * slot once the user's only claim on it is a cancelled booking AND the
 * slot itself has genuinely reopened (`slot.status === 'free'`). Any
 * other status (pending/confirmed/completed), or a cancelled booking on a
 * slot that's still occupied, still blocks as before.
 */

import { test, expect, tn } from '../helpers/scoped-test';
import { newScopedContext } from '../helpers/scoped-test';
import { resolveStorageStatePath } from '../helpers/state';
import { withConnection } from '../helpers/db';
import type { BrowserContext, Page } from '@playwright/test';

const SLOT_COST = 500;
const CANCEL_REASON = 'E2E тест D-159: студент отменяет подтверждённую бронь';

async function getIds(): Promise<{ expertId: number; userId: number }> {
	return withConnection(async (c) => {
		const [er] = await c.execute<any[]>(`SELECT id FROM ${tn('accounts')} WHERE login = 'testuser_setup_expert@irabi.test'`);
		const [ur] = await c.execute<any[]>(`SELECT id FROM ${tn('accounts')} WHERE login = 'testuser_setup_user@irabi.test'`);
		return { expertId: er[0]?.id ?? 0, userId: ur[0]?.id ?? 0 };
	});
}

function generateUid(): string {
	return [...Array(16)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
}

async function createGroupSlot(expertId: number, maxUsers: number): Promise<number> {
	return withConnection(async (c) => {
		const startAt = Math.floor(Date.now() / 1000) + 86400 * 11;
		const [res]: any = await c.execute(
			`INSERT INTO ${tn('time_slots')}
			 (expert_id, start_at, end_at, duration_min, cost, is_online, location, max_users, booked_count, status, uid, created_at)
			 VALUES (?, ?, ?, 60, ?, 1, 'https://meet.example.com/d159-test', ?, 0, 'free', ?, ?)`,
			[expertId, startAt, startAt + 3600, SLOT_COST, maxUsers, generateUid(), Math.floor(Date.now() / 1000)],
		);
		return res.insertId;
	});
}

async function ensureBalance(accountId: number, minBalance: number): Promise<void> {
	await withConnection(async (c) => {
		const [rows] = await c.execute<any[]>(`SELECT balance FROM ${tn('account_balance')} WHERE account_id = ?`, [accountId]);
		const current = rows.length ? Number(rows[0].balance) : 0;
		if (current >= minBalance) return;
		const topUp = minBalance - current + 5000;
		await c.execute(
			`INSERT INTO ${tn('account_balance')} (account_id, balance, updated_at) VALUES (?, 0, UNIX_TIMESTAMP())
			 ON DUPLICATE KEY UPDATE account_id = account_id`,
			[accountId],
		);
		await c.execute(
			`INSERT INTO ${tn('balance_ledger')} (account_id, is_credit, amount, entry_type, ref_type, ref_id, note, created_at)
			 VALUES (?, 1, ?, 'top_up', '', 0, 'E2E d159 top-up', UNIX_TIMESTAMP())`,
			[accountId, topUp],
		);
		await c.execute(`UPDATE ${tn('account_balance')} SET balance = balance + ?, updated_at = UNIX_TIMESTAMP() WHERE account_id = ?`, [topUp, accountId]);
	});
}

async function getSlotRow(slotId: number): Promise<{ status: string; booked_count: number }> {
	return withConnection(async (c) => {
		const [rows] = await c.execute<any[]>(`SELECT status, booked_count FROM ${tn('time_slots')} WHERE id = ?`, [slotId]);
		return rows[0];
	});
}

async function confirmBookingDirect(bookingId: number): Promise<void> {
	await withConnection(async (c) => {
		await c.execute(`UPDATE ${tn('bookings')} SET status = 'confirmed', confirmed_at = UNIX_TIMESTAMP() WHERE id = ?`, [bookingId]);
	});
}

async function getBookingsForSlot(slotId: number): Promise<any[]> {
	return withConnection(async (c) => {
		const [rows] = await c.execute<any[]>(
			`SELECT id, status FROM ${tn('bookings')} WHERE bookable_type = 'time_slot' AND bookable_id = ? ORDER BY id ASC`,
			[slotId],
		);
		return rows;
	});
}

async function recalcBalance(accountId: number): Promise<void> {
	await withConnection(async (c) => {
		const [[sum]]: any = await c.execute(
			`SELECT COALESCE(SUM(CASE WHEN is_credit=1 THEN amount ELSE -amount END), 0) as bal FROM ${tn('balance_ledger')} WHERE account_id = ?`,
			[accountId],
		);
		await c.execute(`UPDATE ${tn('account_balance')} SET balance = ?, updated_at = UNIX_TIMESTAMP() WHERE account_id = ?`, [sum.bal, accountId]);
	});
}

async function cleanup(slotId: number, userId: number, expertId: number): Promise<void> {
	await withConnection(async (c) => {
		await c.execute(`DELETE FROM ${tn('user_cancellations')} WHERE slot_id = ?`, [slotId]);
		await c.execute(
			`DELETE FROM ${tn('balance_ledger')} WHERE ref_type = 'booking' AND ref_id IN
			 (SELECT id FROM ${tn('bookings')} WHERE bookable_type = 'time_slot' AND bookable_id = ?)`,
			[slotId],
		);
		await c.execute(`DELETE FROM ${tn('news_events')} WHERE target_key = ?`, [`slot:${slotId}`]);
		await c.execute(`DELETE FROM ${tn('bookings')} WHERE bookable_type = 'time_slot' AND bookable_id = ?`, [slotId]);
		await c.execute(`DELETE FROM ${tn('time_slots')} WHERE id = ?`, [slotId]);
	});
	if (userId) await recalcBalance(userId);
	if (expertId) await recalcBalance(expertId);
}

/** The catalog is a week-by-week grid — click forward until the card shows up. */
async function revealSlot(page: Page, slotId: number): Promise<void> {
	const card = page.locator(`[data-test-id="slot-card-${slotId}"]`);
	const nextBtn = page.locator('[data-test-id="week-next"]');
	for (let i = 0; i < 6; i++) {
		if (await card.isVisible({ timeout: 2000 }).catch(() => false)) return;
		await nextBtn.click();
	}
}

test.describe.configure({ mode: 'serial' });

test.describe('D-159: a reopened slot stops being a dead end in the /slots catalog', () => {
	let expertId = 0;
	let userId = 0;
	let slotId = 0;
	let firstBookingId = 0;
	let ctx: BrowserContext;
	let page: Page;

	test.beforeAll(async ({ browser }) => {
		({ expertId, userId } = await getIds());
		expect(expertId).toBeGreaterThan(0);
		expect(userId).toBeGreaterThan(0);

		await ensureBalance(userId, SLOT_COST + 5000);

		slotId = await createGroupSlot(expertId, 2);
		expect(slotId).toBeGreaterThan(0);

		ctx = await newScopedContext(browser, { storageState: resolveStorageStatePath('user') });
		page = await ctx.newPage();
		await page.goto('/system/', { waitUntil: 'domcontentloaded' });
	});

	test.afterAll(async () => {
		await ctx?.close().catch(() => {});
		await cleanup(slotId, userId, expertId);
	});

	test('setup: book the slot, confirm it, then cancel it — via the real production endpoints', async () => {
		// Book via the real /slots/~book endpoint (student side).
		const bookResult = await page.evaluate(async (args: { slotId: number }) => {
			const csrf = (window as any).__GARNET_CSRF__ || '';
			const fd = new FormData();
			fd.append('CSRF_TOKEN', csrf);
			fd.append('slot_ids[]', String(args.slotId));
			const res = await fetch('/slots/~book', { method: 'POST', body: fd });
			return { status: res.status, body: await res.json().catch(() => null) };
		}, { slotId });
		expect(bookResult.status).toBe(200);
		expect(bookResult.body.success).toBe(true);

		const afterBook = await getBookingsForSlot(slotId);
		expect(afterBook.length).toBe(1);
		firstBookingId = afterBook[0].id;

		// Confirm directly (expert-side confirm UI is out of scope for this spec —
		// only the post-cancel catalog behaviour is under test).
		await confirmBookingDirect(firstBookingId);
		expect((await getSlotRow(slotId)).status).toBe('free'); // group slot, 1/2 seats — stays free

		// Cancel via the real /bookings/id~X/~cancel endpoint (student side) —
		// this is the exact code path (BookingsController::post__cancel) that
		// reopens the slot once nobody active holds it.
		const cancelResult = await page.evaluate(async (args: { bookingId: number; reason: string }) => {
			const csrf = (window as any).__GARNET_CSRF__ || '';
			const fd = new FormData();
			fd.append('CSRF_TOKEN', csrf);
			fd.append('reason', args.reason);
			const res = await fetch(`/bookings/id~${args.bookingId}/~cancel`, { method: 'POST', body: fd });
			return { status: res.status, body: await res.json().catch(() => null) };
		}, { bookingId: firstBookingId, reason: CANCEL_REASON });
		expect(cancelResult.status).toBe(200);
		expect(cancelResult.body?.error).toBeFalsy();

		const slotAfterCancel = await getSlotRow(slotId);
		expect(slotAfterCancel.status).toBe('free');
		expect(slotAfterCancel.booked_count).toBe(0);
	});

	test('catalog offers "Забронировать" again instead of a frozen "Отменён" dead end', async () => {
		await page.goto('/slots');
		await expect(page.locator('[data-test-id="slots-calendar"]')).toBeVisible({ timeout: 8000 });
		await revealSlot(page, slotId);

		const card = page.locator(`[data-test-id="slot-card-${slotId}"]`);
		await expect(card).toBeVisible({ timeout: 8000 });

		// Before the fix: a frozen status button ("Отменён"), no way to rebook.
		await expect(page.locator(`[data-test-id="slot-booked-${slotId}"]`)).toHaveCount(0);
		await expect(page.locator(`[data-test-id="slot-book-btn-${slotId}"]`)).toBeVisible({ timeout: 5000 });
	});

	test('"Свободные" tab includes the reopened slot', async () => {
		await page.goto('/slots');
		await revealSlot(page, slotId);
		await page.locator('[data-test-id="slot-status-filter-free"]').click();
		await expect(page.locator(`[data-test-id="slot-card-${slotId}"]`)).toBeVisible({ timeout: 5000 });
	});

	test('rebooking the same slot succeeds end to end', async () => {
		await page.goto('/slots');
		await revealSlot(page, slotId);

		const bookBtn = page.locator(`[data-test-id="slot-book-btn-${slotId}"]`);
		await expect(bookBtn).toBeVisible({ timeout: 8000 });
		await bookBtn.click();

		const modal = page.locator('[data-test-id="booking-modal"]');
		await expect(modal).toBeVisible({ timeout: 5000 });

		const [response] = await Promise.all([
			page.waitForResponse(resp => resp.url().includes('/slots') && resp.request().method() === 'POST', { timeout: 15000 }),
			page.locator('[data-test-id="booking-confirm-btn"]').click(),
		]);
		expect(response.ok()).toBe(true);
		await expect(modal).not.toBeVisible({ timeout: 10000 });

		const bookings = await getBookingsForSlot(slotId);
		expect(bookings.length).toBe(2);
		expect(bookings[0].status).toBe('cancelled');
		expect(bookings[1].status).toMatch(/pending|confirmed/);
	});
});
