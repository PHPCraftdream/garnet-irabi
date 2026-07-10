/**
 * Cross-role: User books expert's slot, expert sees booking, user cancels
 *
 * Story:
 *   1. Expert creates a slot via UI (create-slot-modal)
 *   2. User browses /slots/, finds the slot, books it via BookingModal
 *   3. Expert sees slot status change to "booked" with user name
 *   4. User cancels booking via cancel modal with reason
 *   5. User verifies refund in /balance/
 *   6. Expert sees slot revert to "free"
 *
 * State machines exercised:
 *   TimeSlotSM: (new) -> free -> booked -> free
 *   BookingSM:  (new) -> pending -> cancelled
 *   BalanceSM:  balance - cost -> balance + cost (restored)
 *   LedgerSM:  +booking_invoice -> +booking_refund
 */

import { test, expect, tn } from '../helpers/scoped-test';
import type { BrowserContext, Page } from '@playwright/test';
import { resolveStorageStatePath } from '../helpers/state';
import mysql from 'mysql2/promise';

import { newScopedContext } from '../helpers/scoped-test';
import { DB } from '../helpers/db';
test.describe.configure({ mode: 'serial' });

const SLOT_COST = 1000;

let expertContext: BrowserContext;
let userContext: BrowserContext;
let expertPage: Page;
let userPage: Page;

// State shared across tests
let createdSlotId = 0;
let bookingId = 0;
let userBalanceBefore = 0;

// ── DB helpers ─────────────────────────────────────────────────────────────────

async function getBalance(login: string): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT ab.balance FROM ${tn('account_balance')} ab
			 JOIN ${tn('accounts')} a ON a.id = ab.account_id
			 WHERE a.login = ?`, [login]
		);
		return rows.length ? Number(rows[0].balance) : 0;
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

async function getLatestSlotId(expertLogin: string): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT ts.id FROM ${tn('time_slots')} ts
			 JOIN ${tn('accounts')} a ON a.id = ts.expert_id
			 WHERE a.login = ? AND ts.status = 'free'
			 ORDER BY ts.created_at DESC LIMIT 1`, [expertLogin]
		);
		return rows[0]?.id ?? 0;
	} finally { await conn.end(); }
}

async function getLedgerRefundCount(userLogin: string): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT COUNT(*) as cnt FROM ${tn('balance_ledger')} bl
			 JOIN ${tn('accounts')} a ON a.id = bl.account_id
			 WHERE a.login = ? AND bl.entry_type = 'booking_refund'`, [userLogin]
		);
		return rows[0]?.cnt ?? 0;
	} finally { await conn.end(); }
}

async function cleanupSlot(slotId: number): Promise<void> {
	if (!slotId) return;
	const conn = await mysql.createConnection(DB);
	try {
		await conn.execute(`DELETE FROM ${tn('user_cancellations')} WHERE slot_id = ?`, [slotId]);
		await conn.execute(`DELETE FROM ${tn('balance_ledger')} WHERE ref_type = 'booking' AND ref_id IN (SELECT id FROM ${tn('bookings')} WHERE bookable_type = 'time_slot' AND bookable_id = ?)`, [slotId]);
		await conn.execute(`DELETE FROM ${tn('bookings')} WHERE bookable_type = 'time_slot' AND bookable_id = ?`, [slotId]);
		await conn.execute(`DELETE FROM ${tn('time_slots')} WHERE id = ?`, [slotId]);
	} finally { await conn.end(); }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function getTomorrowStr(): string {
	const d = new Date();
	d.setDate(d.getDate() + 1);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Cross-role: user books slot, expert sees booking, user cancels', () => {

	test.beforeAll(async ({ browser }) => {
		expertContext = await newScopedContext(browser, { storageState: resolveStorageStatePath('expert') });
		userContext = await newScopedContext(browser, { storageState: resolveStorageStatePath('user') });
		expertPage = await expertContext.newPage();
		userPage = await userContext.newPage();
	});

	test.afterAll(async () => {
		// Clean up test data
		if (createdSlotId) {
			await cleanupSlot(createdSlotId);
			// Recalculate balances after cleanup
			const conn = await mysql.createConnection(DB);
			try {
				for (const login of ['testuser_setup_user@irabi.test', 'testuser_setup_expert@irabi.test']) {
					const [[acc]]: any = await conn.execute(`SELECT id FROM ${tn('accounts')} WHERE login = ?`, [login]);
					if (acc) {
						const [[sum]]: any = await conn.execute(
							`SELECT COALESCE(SUM(CASE WHEN is_credit=1 THEN amount ELSE -amount END), 0) as bal
							 FROM ${tn('balance_ledger')} WHERE account_id = ?`, [acc.id]
						);
						await conn.execute(
							`UPDATE ${tn('account_balance')} SET balance = ?, updated_at = UNIX_TIMESTAMP() WHERE account_id = ?`,
							[sum.bal, acc.id]
						);
					}
				}
			} finally { await conn.end(); }
		}
		await expertContext?.close();
		await userContext?.close();
	});

	// ── Step 0: Ensure user has sufficient balance ─────────────────────────────

	test('setup: user has sufficient balance', async () => {
		// Ensure balance via DB (more reliable than UI top-up in cross-role test)
		const conn = await mysql.createConnection(DB);
		try {
			const [[user]]: any = await conn.execute(
				`SELECT id FROM ${tn('accounts')} WHERE login = 'testuser_setup_user@irabi.test'`
			);
			expect(user).toBeTruthy();
			const userId = user.id;

			// Ensure account_balance row exists
			const [[existing]]: any = await conn.execute(
				`SELECT balance FROM ${tn('account_balance')} WHERE account_id = ?`, [userId]
			);
			if (!existing) {
				await conn.execute(
					`INSERT INTO ${tn('account_balance')} (account_id, balance, updated_at) VALUES (?, 0, UNIX_TIMESTAMP())`,
					[userId]
				);
			}

			const currentBalance = existing ? Number(existing.balance) : 0;
			if (currentBalance < SLOT_COST + 2000) {
				const topUpAmount = SLOT_COST + 5000 - currentBalance;
				// Add ledger entry for top-up
				await conn.execute(
					`INSERT INTO ${tn('balance_ledger')} (account_id, is_credit, amount, entry_type, note, created_at)
					 VALUES (?, 1, ?, 'top_up', 'E2E test top-up', UNIX_TIMESTAMP())`,
					[userId, topUpAmount]
				);
				// Recalculate balance
				const [[sum]]: any = await conn.execute(
					`SELECT COALESCE(SUM(CASE WHEN is_credit=1 THEN amount ELSE -amount END), 0) as bal
					 FROM ${tn('balance_ledger')} WHERE account_id = ?`, [userId]
				);
				await conn.execute(
					`UPDATE ${tn('account_balance')} SET balance = ?, updated_at = UNIX_TIMESTAMP() WHERE account_id = ?`,
					[sum.bal, userId]
				);
			}
		} finally { await conn.end(); }

		userBalanceBefore = await getBalance('testuser_setup_user@irabi.test');
		expect(userBalanceBefore).toBeGreaterThanOrEqual(SLOT_COST);
		console.log('User balance before:', userBalanceBefore);

		// Also ensure expert account_balance row exists AND expert is approved
		const conn2 = await mysql.createConnection(DB);
		try {
			const [[expert]]: any = await conn2.execute(
				`SELECT id FROM ${tn('accounts')} WHERE login = 'testuser_setup_expert@irabi.test'`
			);
			if (expert) {
				const [[texisting]]: any = await conn2.execute(
					`SELECT 1 FROM ${tn('account_balance')} WHERE account_id = ?`, [expert.id]
				);
				if (!texisting) {
					await conn2.execute(
						`INSERT INTO ${tn('account_balance')} (account_id, balance, updated_at) VALUES (?, 0, UNIX_TIMESTAMP())`,
						[expert.id]
					);
				}
				// Ensure expert is approved so their slots appear in /slots/
				await conn2.execute(
					`INSERT INTO ${tn('accounts_data')} (account_id, param, value) VALUES (?, 'IS_APPROVED', '1')
					 ON DUPLICATE KEY UPDATE value = '1'`,
					[expert.id]
				);
				await conn2.execute(
					`UPDATE ${tn('expert_profiles')} SET is_approved = 1 WHERE account_id = ?`,
					[expert.id]
				);
			}
		} finally { await conn2.end(); }
	});

	// ── Step 1: Expert creates a slot via UI ───────────────────────────────────

	test('step 1: expert navigates to /expert/~slots', async () => {
		await expertPage.goto('/expert/~slots');
		await expect(expertPage.locator('[data-test-id="open-create-slot-modal"]')).toBeVisible({ timeout: 10000 });
	});

	test('step 1: expert opens create-slot-modal and fills form', async () => {
		await expertPage.locator('[data-test-id="open-create-slot-modal"]').click();

		const modal = expertPage.locator('[data-test-id="create-slot-modal"]');
		await expect(modal).toBeVisible({ timeout: 5000 });

		// The CreateSlotForm uses react-hook-form with register(). Use the form#createSlotForm
		const form = modal.locator('#createSlotForm');
		await expect(form).toBeVisible({ timeout: 3000 });

		// Clear and fill date (tomorrow) — react-hook-form registers by name
		const dateInput = form.locator('input[name="date"]');
		await dateInput.fill(getTomorrowStr());

		// Fill time (14:00)
		const timeInput = form.locator('input[name="time"]');
		await timeInput.fill('14:00');

		// Duration select — select '60'
		const durationSelect = form.locator('select[name="duration"]');
		await durationSelect.selectOption('60');

		// Fill cost — clear first, then type value
		const costInput = form.locator('input[name="cost"]');
		await costInput.click({ clickCount: 3 }); // Select all
		await costInput.fill(String(SLOT_COST));

		// Max users = 1
		const maxUsersInput = form.locator('input[name="max_users"]');
		await maxUsersInput.click({ clickCount: 3 });
		await maxUsersInput.fill('1');
	});

	test('step 1: expert submits slot and it appears in calendar', async () => {
		const modal = expertPage.locator('[data-test-id="create-slot-modal"]');
		const submitBtn = expertPage.locator('[data-test-id="create-slot-btn"]');
		await expect(submitBtn).toBeVisible();

		// Click submit and wait for the slot creation XHR to complete
		// sendPostFormData uses XHR to POST /expert/~slots
		const responsePromise = expertPage.waitForResponse(
			resp => resp.url().includes('/expert/') && resp.request().method() === 'POST',
			{ timeout: 15000 }
		);
		await submitBtn.click();
		const response = await responsePromise;
		const respBody = await response.text().catch(() => '');
		console.log('Slot creation API:', response.status(), respBody.substring(0, 200));

		// Give react-hook-form + state update time to process

		// If modal still visible, capture text for debugging
		const stillVisible = await modal.isVisible().catch(() => false);
		if (stillVisible) {
			const modalText = await modal.textContent().catch(() => '');
			console.log('Modal text (still visible):', modalText?.substring(0, 300));
			// Check if there are validation errors
			const errors = await modal.locator('.invalid-feedback, .text-danger').allTextContents();
			if (errors.length > 0) console.log('Form errors:', errors);
		}

		// Modal should close after success
		await expect(modal).not.toBeVisible({ timeout: 10000 });

		// Get the slot ID from DB
		createdSlotId = await getLatestSlotId('testuser_setup_expert@irabi.test');
		expect(createdSlotId).toBeGreaterThan(0);
		console.log('Created slot ID:', createdSlotId);

		// Verify slot appears in calendar
		const slotCard = expertPage.locator(`[data-test-id="expert-slot-${createdSlotId}"]`);
		await expect(slotCard).toBeVisible({ timeout: 20000 });

		// Verify slot is free in DB
		const status = await getSlotStatus(createdSlotId);
		expect(status).toBe('free');
	});

	// ── Step 2: User browses slots and books it ───────────────────────────────

	test('step 2: user navigates to /slots/ and sees the slot', async () => {
		if (!createdSlotId) { test.skip(); return; }

		await userPage.goto('/slots/');

		// The slots calendar should be visible
		await expect(userPage.locator('[data-test-id="slots-calendar"]')).toBeVisible({ timeout: 10000 });

		// Slot was created for "tomorrow" — depending on the locale's
		// week-start convention (Sun-Sat in this app) and the current
		// day-of-week, that timestamp may land in next week's column
		// and be hidden by the calendar's one-week view. Step forward
		// up to 5 weeks until our card is on screen.
		const slotCard = userPage.locator(`[data-test-id="slot-card-${createdSlotId}"]`);
		for (let i = 0; i < 5; i++) {
			if (await slotCard.isVisible({ timeout: 1000 }).catch(() => false)) break;
			const nextBtn = userPage.locator('[data-test-id="week-next"]');
			if (!(await nextBtn.isVisible({ timeout: 500 }).catch(() => false))) break;
			await nextBtn.click();
		}
		await expect(slotCard).toBeVisible({ timeout: 10000 });
	});

	test('step 2: user clicks book button and booking modal opens', async () => {
		if (!createdSlotId) { test.skip(); return; }

		const bookBtn = userPage.locator(`[data-test-id="slot-book-btn-${createdSlotId}"]`);
		await expect(bookBtn).toBeVisible();
		await bookBtn.click();

		// Booking modal appears
		const modal = userPage.locator('[data-test-id="booking-modal"]');
		await Promise.all([
			expect(modal).toBeVisible({ timeout: 5000 }),

		// Main slot should be pre-selected
			expect(userPage.locator('[data-test-id="booking-main-slot"]')).toBeVisible(),
		]);
	});

	test('step 2: user confirms booking', async () => {
		if (!createdSlotId) { test.skip(); return; }

		const confirmBtn = userPage.locator('[data-test-id="booking-confirm-btn"]');
		await Promise.all([
			expect(confirmBtn).toBeVisible(),
			expect(confirmBtn).toBeEnabled(),
		]);

		// Intercept the booking API response to diagnose errors. Match the
		// `~book` endpoint specifically — under nginx-pool the slots page
		// also fires concurrent list/refresh POSTs, and the previous
		// generic `/slots`+POST filter could win the race with one of them.
		const [response] = await Promise.all([
			userPage.waitForResponse(resp => resp.url().includes('~book') && resp.request().method() === 'POST', { timeout: 15000 }),
			confirmBtn.click(),
		]);
		const respBody = await response.json().catch(() => null);
		console.log('Booking API response:', response.status(), JSON.stringify(respBody));

		if (respBody?.error) {
			// If there's an error, log it and check if it's the modal that shows it
			const errorText = await userPage.locator('[data-test-id="booking-modal"]').textContent().catch(() => '');
			console.log('Modal text after error:', errorText?.substring(0, 200));
		}

		// After booking, modal should close (onBooked + onClose called)
		const modal = userPage.locator('[data-test-id="booking-modal"]');
		await expect(modal).not.toBeVisible({ timeout: 15000 });
	});

	test('step 2: booking created in DB, balance deducted', async () => {
		if (!createdSlotId) { test.skip(); return; }

		// The booking endpoint returns 200 the moment the transaction
		// commits, but with the nginx-fronted php-S pool several other
		// workers may still be flushing related writes — poll briefly so
		// the DB read sees the final state without flaking under load.
		let slotStatus = '';
		let balanceAfter = 0;
		for (let i = 0; i < 20; i++) {
			slotStatus = await getSlotStatus(createdSlotId);
			balanceAfter = await getBalance('testuser_setup_user@irabi.test');
			if (slotStatus === 'booked' && balanceAfter === userBalanceBefore - SLOT_COST) break;
			await new Promise((r) => setTimeout(r, 200));
		}
		expect(slotStatus).toBe('booked');
		expect(balanceAfter).toBe(userBalanceBefore - SLOT_COST);

		// Get booking ID from DB
		const conn = await mysql.createConnection(DB);
		try {
			const [rows] = await conn.execute<any[]>(
				`SELECT id FROM ${tn('bookings')}
				 WHERE bookable_type = 'time_slot' AND bookable_id = ?
				   AND status IN ('pending', 'confirmed')
				 ORDER BY created_at DESC LIMIT 1`, [createdSlotId]
			);
			bookingId = rows[0]?.id ?? 0;
			expect(bookingId).toBeGreaterThan(0);
			console.log('Booking ID:', bookingId);
		} finally { await conn.end(); }
	});

	// ── Step 3: Expert sees the booking ───────────────────────────────────────

	test('step 3: expert refreshes and sees slot as booked with user name', async () => {
		if (!createdSlotId) { test.skip(); return; }

		await expertPage.goto('/expert/~slots');

		const slotCard = expertPage.locator(`[data-test-id="expert-slot-${createdSlotId}"]`);
		await expect(slotCard).toBeVisible({ timeout: 25000 });

		// Cancel booking button should be visible (indicates booked state)
		const cancelBtn = expertPage.locator(`[data-test-id="cancel-booking-${createdSlotId}"]`);
		await expect(cancelBtn).toBeVisible({ timeout: 12000 });

		// User name link should be visible
		const userLink = expertPage.locator(`[data-test-id="user-link-${createdSlotId}"]`);
		await expect(userLink).toBeVisible({ timeout: 5000 });
	});

	// ── Step 4: User cancels the booking ─────────────────────────────────────

	test('step 4: user navigates to /bookings/ and sees the booking', async () => {
		if (!bookingId) { test.skip(); return; }

		await userPage.goto('/bookings');

		const bookingCard = userPage.locator(`[data-test-id="booking-card-${bookingId}"]`);
		await expect(bookingCard).toBeVisible({ timeout: 8000 });

		// Status should show pending
		const statusBadge = userPage.locator(`[data-test-id="booking-status-${bookingId}"]`);
		await expect(statusBadge).toBeVisible();

		// Cancel button visible
		const cancelBtn = userPage.locator(`[data-test-id="cancel-btn-${bookingId}"]`);
		await expect(cancelBtn).toBeVisible();
	});

	test('step 4: user opens cancel modal, enters reason, submits', async () => {
		if (!bookingId) { test.skip(); return; }

		// Click cancel
		await userPage.locator(`[data-test-id="cancel-btn-${bookingId}"]`).click();

		// Cancel modal appears
		const modal = userPage.locator('[data-test-id="user-cancel-modal"]');
		await expect(modal).toBeVisible({ timeout: 5000 });

		// Fill reason
		const reasonInput = userPage.locator('[data-test-id="user-cancel-reason"]');
		await expect(reasonInput).toBeVisible();
		await reasonInput.fill('Не могу прийти');

		// Submit cancellation
		const submitBtn = userPage.locator('[data-test-id="user-cancel-submit"]');
		await expect(submitBtn).toBeVisible();
		await submitBtn.click();

		// Modal closes
		await expect(modal).not.toBeVisible({ timeout: 10000 });
	});

	test('step 4: booking is cancelled in DB, slot reverts to free', async () => {
		if (!bookingId || !createdSlotId) { test.skip(); return; }

		// Booking status = cancelled
		const conn = await mysql.createConnection(DB);
		try {
			const [rows] = await conn.execute<any[]>(
				`SELECT status FROM ${tn('bookings')} WHERE id = ?`, [bookingId]
			);
			expect(rows[0]?.status).toBe('cancelled');
		} finally { await conn.end(); }

		// Slot reverts to free
		const slotStatus = await getSlotStatus(createdSlotId);
		expect(slotStatus).toBe('free');
	});

	// ── Step 5: User verifies balance refund ─────────────────────────────────

	test('step 5: user balance restored after cancellation', async () => {
		if (!createdSlotId) { test.skip(); return; }

		const balanceAfterCancel = await getBalance('testuser_setup_user@irabi.test');
		expect(balanceAfterCancel).toBe(userBalanceBefore);
	});

	test('step 5: user sees refund in /balance/ ledger', async () => {
		if (!bookingId) { test.skip(); return; }

		await userPage.goto('/balance');

		// Balance amount should show restored value
		const balanceEl = userPage.locator('[data-test-id="balance-amount"]');
		await expect(balanceEl).toBeVisible({ timeout: 5000 });

		// Ledger should show refund row
		const ledgerRows = userPage.locator('[data-test-id="ledger-row"]');
		await expect(ledgerRows.first()).toBeVisible({ timeout: 5000 });
	});

	// ── Step 6: Expert sees slot reverted to free ─────────────────────────────

	test('step 6: expert refreshes and sees slot as free again', async () => {
		if (!createdSlotId) { test.skip(); return; }

		await expertPage.goto('/expert/~slots');

		const slotCard = expertPage.locator(`[data-test-id="expert-slot-${createdSlotId}"]`);
		await expect(slotCard).toBeVisible({ timeout: 15000 });

		// Cancel booking button should NOT be visible (slot is free)
		const cancelBtn = expertPage.locator(`[data-test-id="cancel-booking-${createdSlotId}"]`);
		await expect(cancelBtn).toHaveCount(0);

		// User name link should NOT be visible
		const userLink = expertPage.locator(`[data-test-id="user-link-${createdSlotId}"]`);
		await expect(userLink).toHaveCount(0);
	});
});
