/**
 * Expert — BookingSM: pending → confirmed
 *
 * State machine: BookingSM
 *
 * Entry: expert authenticated, approved expert profile exists,
 *        user has booked a paid slot (booking status = pending).
 * Cycle:
 *   BookingSM: pending → confirmed  (expert clicks confirm)
 *   Expert can also cancel: confirmed → cancelled  (with refund)
 * Exit: test slot and booking cleaned up.
 *
 * Tests the expert booking management UI:
 *   POST /expert/~confirmBooking — confirm pending booking
 *   POST /expert/~cancelBooking  — cancel booking (via ConfirmModal)
 *   GET  /expert/~bookings       — bookings list page
 *
 * Uses data-test-id: confirm-btn-{id}, expert-cancel-btn-{id}, modal-confirm-btn
 */

import { test, expect, tn } from '../helpers/scoped-test';
import mysql from 'mysql2/promise';
import { resolveStorageStatePath } from '../helpers/state';

import { newScopedContext } from '../helpers/scoped-test';
import { DB } from '../helpers/db';
test.describe.configure({ mode: 'serial' });

// ── DB helpers ─────────────────────────────────────────────────────────────────

async function getAccountId(login: string): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT id FROM ${tn('accounts')} WHERE login = ?`, [login]
		);
		return rows[0]?.id ?? 0;
	} finally { await conn.end(); }
}

async function getBalance(login: string): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT ab.balance
			 FROM ${tn('account_balance')} ab
			 JOIN ${tn('accounts')} a ON a.id = ab.account_id
			 WHERE a.login = ?`,
			[login]
		);
		return rows.length ? Number(rows[0].balance) : 0;
	} finally { await conn.end(); }
}

async function createPaidSlot(expertId: number, cost: number): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const startAt = Math.floor(Date.now() / 1000) + 86400 * 7;
		const uid = [...Array(16)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
		const [result]: any = await conn.execute(
			`INSERT INTO ${tn('time_slots')}
			 (expert_id, start_at, end_at, duration_min, cost, is_online, location, max_users, status, uid, created_at)
			 VALUES (?, ?, ?, 60, ?, 1, 'https://meet.example.com/confirm-test', 1, 'free', ?, ?)`,
			[expertId, startAt, startAt + 3600, cost, uid, Math.floor(Date.now() / 1000)]
		);
		return result.insertId;
	} finally { await conn.end(); }
}

async function createBooking(userId: number, slotId: number): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const [result]: any = await conn.execute(
			`INSERT INTO ${tn('bookings')}
			 (user_id, bookable_type, bookable_id, status, created_at)
			 VALUES (?, 'time_slot', ?, 'pending', ?)`,
			[userId, slotId, Math.floor(Date.now() / 1000)]
		);
		// Mark slot as booked (max_users=1)
		await conn.execute(
			`UPDATE ${tn('time_slots')} SET status = 'booked' WHERE id = ?`, [slotId]
		);
		return result.insertId;
	} finally { await conn.end(); }
}

async function getBookingStatus(bookingId: number): Promise<string> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT status FROM ${tn('bookings')} WHERE id = ?`, [bookingId]
		);
		return rows[0]?.status ?? 'unknown';
	} finally { await conn.end(); }
}

async function getSlotStatus(slotId: number): Promise<string> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT status FROM ${tn('time_slots')} WHERE id = ?`, [slotId]
		);
		return rows[0]?.status ?? 'unknown';
	} finally { await conn.end(); }
}

async function cleanup(slotId: number, bookingId: number) {
	const conn = await mysql.createConnection(DB);
	try {
		if (bookingId) await conn.execute(`DELETE FROM ${tn('bookings')} WHERE id = ?`, [bookingId]);
		if (slotId) await conn.execute(`DELETE FROM ${tn('time_slots')} WHERE id = ?`, [slotId]);
	} finally { await conn.end(); }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('BookingSM: pending → confirmed (expert confirms)', () => {
	const SLOT_COST = 200;
	let expertId = 0;
	let userId = 0;
	let slotId = 0;
	let bookingId = 0;

	test('entry: create slot and pending booking via DB', async () => {
		expertId = await getAccountId('testuser_setup_expert@irabi.test');
		userId = await getAccountId('testuser_setup_user@irabi.test');
		expect(expertId).toBeGreaterThan(0);
		expect(userId).toBeGreaterThan(0);

		slotId = await createPaidSlot(expertId, SLOT_COST);
		expect(slotId).toBeGreaterThan(0);

		bookingId = await createBooking(userId, slotId);
		expect(bookingId).toBeGreaterThan(0);

		const bookingStatus = await getBookingStatus(bookingId);
		expect(bookingStatus).toBe('pending');
	});

	test('BookingSM pending: expert sees pending booking on /expert/~bookings', async ({ page }) => {
		if (!bookingId) { test.skip(); return; }

		await page.goto('/expert/~bookings');
		await expect(page.locator('h1')).toBeVisible({ timeout: 12000 });

		// Confirm button visible for pending booking
		const confirmBtn = page.locator(`[data-test-id="confirm-btn-${bookingId}"]`);
		await expect(confirmBtn).toBeVisible({ timeout: 8000 });

		// Cancel button also visible
		const cancelBtn = page.locator(`[data-test-id="expert-cancel-btn-${bookingId}"]`);
		await expect(cancelBtn).toBeVisible({ timeout: 8000 });
	});

	test('BookingSM pending → confirmed: expert clicks confirm', async ({ page }) => {
		if (!bookingId) { test.skip(); return; }

		await page.goto('/expert/~bookings');
		await expect(page.locator('h1')).toBeVisible({ timeout: 12000 });

		const confirmBtn = page.locator(`[data-test-id="confirm-btn-${bookingId}"]`);
		await expect(confirmBtn).toBeVisible({ timeout: 8000 });

		// Click confirm and wait for the confirm-XHR to land so the next
		// test's DB read sees the status='confirmed' write.
		await Promise.all([
			page.waitForResponse(r => r.request().method() === 'POST' && r.status() < 500, { timeout: 10000 }),
			confirmBtn.click(),
		]);
		await expect(confirmBtn).toHaveCount(0, { timeout: 5000 });
	});

	test('BookingSM confirmed: booking status = confirmed in DB', async () => {
		if (!bookingId) { test.skip(); return; }
		const status = await getBookingStatus(bookingId);
		expect(status).toBe('confirmed');
	});

	test('BookingSM confirmed: confirm button gone, cancel button remains', async ({ page }) => {
		if (!bookingId) { test.skip(); return; }

		await page.goto('/expert/~bookings');

		// Confirm button should be gone (booking is already confirmed)
		const confirmBtn = page.locator(`[data-test-id="confirm-btn-${bookingId}"]`);
		await expect(confirmBtn).toHaveCount(0);

		// Cancel button still visible for confirmed bookings
		const cancelBtn = page.locator(`[data-test-id="expert-cancel-btn-${bookingId}"]`);
		await expect(cancelBtn).toBeVisible({ timeout: 8000 });
	});

	test('exit: clean up test data', async () => {
		await cleanup(slotId, bookingId);
	});
});

test.describe('BookingSM: pending → cancelled (expert cancels with refund)', () => {
	const SLOT_COST = 250;
	let expertId = 0;
	let userId = 0;
	let slotId = 0;
	let bookingId = 0;
	let userBalanceBefore = 0;
	let expertBalanceBefore = 0;

	test('entry: create slot, book it via user, record balances', async ({ browser }) => {
		expertId = await getAccountId('testuser_setup_expert@irabi.test');
		userId = await getAccountId('testuser_setup_user@irabi.test');
		expect(expertId).toBeGreaterThan(0);
		expect(userId).toBeGreaterThan(0);

		slotId = await createPaidSlot(expertId, SLOT_COST);
		expect(slotId).toBeGreaterThan(0);

		// Ensure user has enough balance and book via UI for proper balance handling
		const userCtx = await newScopedContext(browser, { storageState: resolveStorageStatePath('user') });
		const userPage = await userCtx.newPage();
		try {
			// Top up balance
			const currentBalance = await getBalance('testuser_setup_user@irabi.test');
			if (currentBalance < SLOT_COST + 1000) {
				await userPage.goto('/balance');
				await userPage.locator('[data-test-id="topup-amount-input"]').fill(String(SLOT_COST + 2000 - currentBalance));
				await userPage.locator('[data-test-id="topup-submit"]').click();
				await userPage.waitForLoadState('networkidle');
			}

			userBalanceBefore = await getBalance('testuser_setup_user@irabi.test');
			expertBalanceBefore = await getBalance('testuser_setup_expert@irabi.test');

			// Book the slot via UI
			await userPage.goto(`/bookings/id~${slotId}/~book`);
			const bookBtn = userPage.locator('[data-test-id="book-btn"]');
			await expect(bookBtn).toBeVisible({ timeout: 8000 });
			await Promise.all([
				userPage.waitForURL(url => url.pathname === '/bookings', { timeout: 15000 }),
				bookBtn.click(),
			]);

			// Get booking ID
			await userPage.goto('/bookings');
			const cards = userPage.locator('[data-test-id^="booking-card-"]');
			await expect(cards.first()).toBeVisible({ timeout: 8000 });
			const cardTestId = await cards.first().getAttribute('data-test-id');
			bookingId = parseInt(cardTestId?.replace('booking-card-', '') ?? '0', 10);
			expect(bookingId).toBeGreaterThan(0);
		} finally {
			await userCtx.close();
		}
	});

	test('BookingSM pending: expert sees cancel button', async ({ page }) => {
		if (!bookingId) { test.skip(); return; }

		await page.goto('/expert/~bookings');

		const cancelBtn = page.locator(`[data-test-id="expert-cancel-btn-${bookingId}"]`);
		await expect(cancelBtn).toBeVisible({ timeout: 8000 });
	});

	test('BookingSM pending → cancelled: expert cancels booking via ConfirmModal', async ({ page }) => {
		if (!bookingId) { test.skip(); return; }

		await page.goto('/expert/~bookings');

		const cancelBtn = page.locator(`[data-test-id="expert-cancel-btn-${bookingId}"]`);
		await expect(cancelBtn).toBeVisible({ timeout: 8000 });

		// Click cancel — opens ConfirmModal (not window.confirm)
		await cancelBtn.click();

		// Confirm in modal — wait for the cancel-XHR before letting the next
		// test read DB.
		const modalConfirmBtn = page.locator('[data-test-id="modal-confirm-btn"]');
		await expect(modalConfirmBtn).toBeVisible({ timeout: 8000 });
		await Promise.all([
			page.waitForResponse(r => r.request().method() === 'POST' && r.status() < 500, { timeout: 10000 }),
			modalConfirmBtn.click(),
		]);
		await expect(modalConfirmBtn).toHaveCount(0, { timeout: 5000 });

	});

	test('BookingSM cancelled: booking status = cancelled in DB', async () => {
		if (!bookingId) { test.skip(); return; }
		const status = await getBookingStatus(bookingId);
		expect(status).toBe('cancelled');
	});

	test('BalanceSM: user balance restored after expert cancel', async () => {
		if (!bookingId || !SLOT_COST || !userBalanceBefore) { test.skip(); return; }
		const userBalanceAfter = await getBalance('testuser_setup_user@irabi.test');
		expect(userBalanceAfter).toBe(userBalanceBefore);
	});

	test('BalanceSM: expert balance restored after expert cancel', async () => {
		if (!bookingId || !SLOT_COST || !userBalanceBefore) { test.skip(); return; }
		const expertBalanceAfter = await getBalance('testuser_setup_expert@irabi.test');
		expect(expertBalanceAfter).toBe(expertBalanceBefore);
	});

	test('TimeSlotSM: slot reverts to free after booking cancelled', async () => {
		if (!slotId) { test.skip(); return; }
		const status = await getSlotStatus(slotId);
		expect(status).toBe('free');
	});

	test('exit: clean up test data', async () => {
		const conn = await mysql.createConnection(DB);
		try {
			if (bookingId) await conn.execute(`DELETE FROM ${tn('bookings')} WHERE id = ?`, [bookingId]);
			if (slotId) await conn.execute(`DELETE FROM ${tn('time_slots')} WHERE id = ?`, [slotId]);
		} finally { await conn.end(); }
	});
});
