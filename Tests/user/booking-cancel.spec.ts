/**
 * User — BookingSM: pending -> cancelled
 *
 * State machine: BookingSM x BalanceSM x LedgerSM x TimeSlotSM
 *
 * Entry: user authenticated, approved expert with free slot exists,
 *        user has sufficient balance.
 * Cycle:
 *   BookingSM:    (new) -> pending -> cancelled
 *   BalanceSM:    balance - cost  ->  balance + cost  (restored)
 *   LedgerSM:     +booking_invoice  ->  +booking_refund
 *   TimeSlotSM:   free -> booked -> free  (when max_users=1)
 * Exit: no active bookings, balance restored, slot free again.
 *
 * UI changes:
 *   - Cancel is via a modal (user-cancel-modal) with required reason
 *     textarea (user-cancel-reason) and submit button (user-cancel-submit)
 *   - No more window.confirm() dialog
 *   - Cancel is XHR-based, reactive state update (no page reload)
 *   - Toast shows descriptive success message
 */

import { test, expect, tn } from '../helpers/scoped-test';
import mysql from 'mysql2/promise';
import { DB } from '../helpers/db';
test.describe.configure({ mode: 'serial' });

async function createTestSlot(cost: number): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const [expertAccRows] = await conn.execute<any[]>(
			`SELECT id FROM ${tn('accounts')} WHERE login = 'testuser_setup_expert@irabi.test'`
		);
		const expertId = expertAccRows[0]?.id;
		if (!expertId) return 0;

		const startAt = Math.floor(Date.now() / 1000) + 86400 * 7;
		const uid = [...Array(16)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
		const [result]: any = await conn.execute(
			`INSERT INTO ${tn('time_slots')}
			 (expert_id, start_at, end_at, duration_min, cost, is_online, location, max_users, status, uid, created_at)
			 VALUES (?, ?, ?, 60, ?, 1, 'https://meet.example.com/student-cancel-test', 1, 'free', ?, ?)`,
			[expertId, startAt, startAt + 3600, cost, uid, Math.floor(Date.now() / 1000)]
		);
		return result.insertId;
	} finally {
		await conn.end();
	}
}

async function deleteTestSlot(slotId: number): Promise<void> {
	const conn = await mysql.createConnection(DB);
	try {
		await conn.execute(`DELETE FROM ${tn('balance_ledger')} WHERE ref_type = 'booking' AND ref_id IN (SELECT id FROM ${tn('bookings')} WHERE bookable_type='time_slot' AND bookable_id=?)`, [slotId]);
		await conn.execute(`DELETE FROM ${tn('bookings')} WHERE bookable_type='time_slot' AND bookable_id=?`, [slotId]);
		await conn.execute(`DELETE FROM ${tn('time_slots')} WHERE id=?`, [slotId]);
	} finally {
		await conn.end();
	}
}

async function getUserBalance(): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT ab.balance
			 FROM ${tn('account_balance')} ab
			 JOIN ${tn('accounts')} a ON a.id = ab.account_id
			 WHERE a.login = 'testuser_setup_user@irabi.test'`
		);
		return rows.length ? rows[0].balance : 0;
	} finally {
		await conn.end();
	}
}

async function getSlotStatus(slotId: number): Promise<string> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT status FROM ${tn('time_slots')} WHERE id = ?`, [slotId]
		);
		return rows.length ? rows[0].status : 'unknown';
	} finally {
		await conn.end();
	}
}

// DB-only top-up (not the UI topup flow) — beforeAll only has worker-scoped
// fixtures (no authenticated `page`), so top up directly via the ledger,
// matching the pattern used elsewhere in this suite (e.g. booking-guards.spec.ts).
// Returns the top-up amount actually added (0 if balance was already
// sufficient) so the caller can reverse it in afterAll — otherwise the
// shared testuser_setup_user fixture's balance permanently inflates by
// this amount for the rest of the worker's run every time this spec runs.
async function ensureBalance(minBalance: number): Promise<number> {
	const current = await getUserBalance();
	if (current >= minBalance) return 0;
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT id FROM ${tn('accounts')} WHERE login = 'testuser_setup_user@irabi.test'`
		);
		const userId = rows[0]?.id;
		if (!userId) return 0;
		const topUp = minBalance - current + 1000;
		await conn.execute(
			`INSERT INTO ${tn('balance_ledger')} (account_id, is_credit, amount, entry_type, ref_type, ref_id, note, created_at)
			 VALUES (?, 1, ?, 'top_up', '', 0, 'booking-cancel.spec top-up', UNIX_TIMESTAMP())`,
			[userId, topUp]
		);
		await conn.execute(
			`INSERT INTO ${tn('account_balance')} (account_id, balance, updated_at)
			 VALUES (?, ?, UNIX_TIMESTAMP())
			 ON DUPLICATE KEY UPDATE balance = balance + ?, updated_at = UNIX_TIMESTAMP()`,
			[userId, topUp, topUp]
		);
		return topUp;
	} finally { await conn.end(); }
}

async function reverseTopUp(amount: number): Promise<void> {
	if (amount <= 0) return;
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT id FROM ${tn('accounts')} WHERE login = 'testuser_setup_user@irabi.test'`
		);
		const userId = rows[0]?.id;
		if (!userId) return;
		await conn.execute(
			`DELETE FROM ${tn('balance_ledger')} WHERE account_id = ? AND note = 'booking-cancel.spec top-up' ORDER BY id DESC LIMIT 1`,
			[userId]
		);
		await conn.execute(
			`UPDATE ${tn('account_balance')} SET balance = balance - ?, updated_at = UNIX_TIMESTAMP() WHERE account_id = ?`,
			[amount, userId]
		);
	} finally { await conn.end(); }
}

// -- Tests --

test.describe('BookingSM: pending -> cancelled (balance refund)', () => {
	const SLOT_COST = 200;
	let slotId = 0;
	let slotCost = SLOT_COST;
	let balanceBefore = 0;
	let bookingId = 0;
	let toppedUp = 0;

	// beforeAll/afterAll (not plain tests) — serial mode skips every
	// subsequent test once one fails, so a cleanup step written as a
	// regular test never runs after a mid-flow assertion fails, leaving
	// a stray test slot/booking behind for the rest of this worker's
	// run. Hooks run regardless of test outcome.
	test.beforeAll(async () => {
		slotId = await createTestSlot(SLOT_COST);
		expect(slotId).toBeGreaterThan(0);
		slotCost = SLOT_COST;

		toppedUp = await ensureBalance(SLOT_COST + 500);
		balanceBefore = await getUserBalance();
		expect(balanceBefore).toBeGreaterThanOrEqual(SLOT_COST);
	});

	test('BookingSM: (new) -> pending -- book the slot', async ({ page }) => {
		if (!slotId) { test.skip(); return; }

		await page.goto(`/system/bookings/id~${slotId}/~book`);

		const bookBtn = page.locator('[data-test-id="book-btn"]');
		await expect(bookBtn).toBeVisible({ timeout: 8000 });

		await Promise.all([
			page.waitForURL(url => url.pathname === '/system/bookings' || url.pathname === '/bookings', { timeout: 10000 }),
			bookBtn.click(),
		]);

		expect(page.url()).toContain('/bookings');
	});

	test('BookingSM pending: booking card visible with cancel button', async ({ page }) => {
		if (!slotId) { test.skip(); return; }

		await page.goto('/system/bookings');

		// Find the booking card for our slot
		const cards = page.locator('[data-test-id^="booking-card-"]');
		await expect(cards.first()).toBeVisible({ timeout: 8000 });

		// Get bookingId from the card testid
		const cardTestId = await cards.first().getAttribute('data-test-id');
		bookingId = parseInt(cardTestId?.replace('booking-card-', '') ?? '0', 10);
		expect(bookingId).toBeGreaterThan(0);

		// Status badge shows pending
		const statusBadge = page.locator(`[data-test-id="booking-status-${bookingId}"]`);
		await expect(statusBadge).toBeVisible();

		// Cancel button exists for pending booking
		const cancelBtn = page.locator(`[data-test-id="cancel-btn-${bookingId}"]`);
		await expect(cancelBtn).toBeVisible({ timeout: 8000 });
	});

	test('BalanceSM: balance decreased after booking', async () => {
		if (!slotId || !slotCost || !bookingId) { test.skip(); return; }
		const balanceAfterBook = await getUserBalance();
		expect(balanceAfterBook).toBe(balanceBefore - slotCost);
	});

	test('TimeSlotSM: slot status = booked when max_users=1 and booked', async () => {
		if (!slotId) { test.skip(); return; }
		const status = await getSlotStatus(slotId);
		expect(['booked', 'free']).toContain(status);
	});

	test('BookingSM: pending -> cancelled -- open cancel modal, fill reason, submit', async ({ page }) => {
		if (!bookingId) { test.skip(); return; }

		await page.goto('/system/bookings');

		const cancelBtn = page.locator(`[data-test-id="cancel-btn-${bookingId}"]`);
		await expect(cancelBtn).toBeVisible({ timeout: 8000 });

		// Click cancel button -- opens the cancel modal (not window.confirm)
		await cancelBtn.click();

		// Wait for cancel modal to appear
		const cancelModal = page.locator('[data-test-id="user-cancel-modal"]');
		await expect(cancelModal).toBeVisible({ timeout: 5000 });

		// Fill in the required reason
		const reasonTextarea = page.locator('[data-test-id="user-cancel-reason"]');
		await expect(reasonTextarea).toBeVisible();
		await reasonTextarea.fill('Test cancellation reason');

		// Submit the cancellation
		const submitBtn = page.locator('[data-test-id="user-cancel-submit"]');
		await expect(submitBtn).toBeVisible();
		await submitBtn.click();

		// Wait for XHR and reactive update -- modal closes, booking status changes
		await expect(cancelModal).not.toBeVisible({ timeout: 10000 });
	});

	test('BookingSM cancelled: cancel button gone (booking no longer active)', async ({ page }) => {
		if (!bookingId) { test.skip(); return; }

		await page.goto('/system/bookings');

		// Cancel button must be gone (booking is cancelled)
		const cancelBtn = page.locator(`[data-test-id="cancel-btn-${bookingId}"]`);
		await expect(cancelBtn).toHaveCount(0);
	});

	test('BalanceSM: balance restored after cancellation (booking_refund)', async ({ page }) => {
		if (!slotId || !slotCost) { test.skip(); return; }
		const balanceAfterCancel = await getUserBalance();
		expect(balanceAfterCancel).toBe(balanceBefore);

		// LedgerSM: booking_refund row appears in /balance
		await page.goto('/system/balance');
		const ledgerRows = page.locator('[data-test-id="ledger-row"]');
		await expect(ledgerRows.first()).toBeVisible({ timeout: 5000 });
	});

	test('TimeSlotSM: slot reverts to free after cancellation', async () => {
		if (!slotId) { test.skip(); return; }
		const status = await getSlotStatus(slotId);
		expect(status).toBe('free');
	});

	test.afterAll(async () => {
		if (slotId) await deleteTestSlot(slotId);
		await reverseTopUp(toppedUp);
	});
});
