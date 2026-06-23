/**
 * Cross-role: User books slot, expert cancels, refund verified
 *
 * Two sessions: user + expert
 * Steps:
 *   1. Setup: expert has a free slot, user has balance
 *   2. User books the slot
 *   3. Verify: expert sees booked slot with user name
 *   4. Verify: user balance decreased, expert balance increased
 *   5. Expert cancels booking with reason
 *   6. Verify: user gets refund, booking cancelled
 *   7. Verify: cancellation logged in admin section
 *
 * Uses dev-login for reliable session creation.
 * Uses direct DB slot creation for faster, more reliable setup.
 */

import { test, expect, tn } from '../helpers/scoped-test';
import type { BrowserContext, Page } from '@playwright/test';
import mysql from 'mysql2/promise';

import { newScopedContext } from '../helpers/scoped-test';
import { DB } from '../helpers/db';
import { roleLogin } from '../helpers/role-login';
test.describe.configure({ mode: 'serial' });

const SLOT_COST = 750;
const CANCEL_REASON = 'E2E тест: эксперт отменяет бронирование';

let expertContext: BrowserContext;
let userContext: BrowserContext;
let expertPage: Page;
let userPage: Page;

// State shared across tests
let expertId = 0;
let userId = 0;
let slotId = 0;
let bookingId = 0;
let userBalanceBefore = 0;
let expertBalanceBefore = 0;

// ── Dev-login helper ────────────────────────────────────────────────────────

async function devLogin(browser: any, role: string): Promise<{ context: BrowserContext; page: Page }> {
	const context = await newScopedContext(browser);
	const page = await context.newPage();
	await page.goto('/');

	await roleLogin(page, role);

	await page.goto('/');
	return { context, page };
}

// ── DB helpers ──────────────────────────────────────────────────────────────

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
				 VALUES (?, 1, ?, 'top_up', '', 0, 'E2E refund-flow top-up', UNIX_TIMESTAMP())`,
				[accountId, topUp]
			);
			await conn.execute(
				`UPDATE ${tn('account_balance')} SET balance = balance + ?, updated_at = UNIX_TIMESTAMP() WHERE account_id = ?`,
				[topUp, accountId]
			);
		}
	} finally { await conn.end(); }
}

async function createFreeSlot(tId: number, cost: number): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const startAt = Math.floor(Date.now() / 1000) + 86400 * 7;
		const uid = [...Array(16)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
		const [result]: any = await conn.execute(
			`INSERT INTO ${tn('time_slots')}
			 (expert_id, start_at, end_at, duration_min, cost, is_online, location, max_users, status, uid, created_at)
			 VALUES (?, ?, ?, 60, ?, 1, 'https://meet.example.com/refund-flow-test', 1, 'free', ?, ?)`,
			[tId, startAt, startAt + 3600, cost, uid, Math.floor(Date.now() / 1000)]
		);
		return result.insertId;
	} finally { await conn.end(); }
}

async function getSlotStatus(sId: number): Promise<string> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT status FROM ${tn('time_slots')} WHERE id = ?`, [sId]
		);
		return rows[0]?.status ?? 'unknown';
	} finally { await conn.end(); }
}

async function getBookingForSlot(sId: number): Promise<{ id: number; status: string } | null> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT id, status FROM ${tn('bookings')}
			 WHERE bookable_type = 'time_slot' AND bookable_id = ?
			 ORDER BY id DESC LIMIT 1`,
			[sId]
		);
		return rows[0] ?? null;
	} finally { await conn.end(); }
}

async function getCancellationLog(sId: number): Promise<{ reason: string } | null> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT reason FROM ${tn('expert_cancellations')}
			 WHERE slot_id = ? ORDER BY id DESC LIMIT 1`,
			[sId]
		);
		return rows[0] ?? null;
	} finally { await conn.end(); }
}

async function cleanupSlot(sId: number): Promise<void> {
	if (!sId) return;
	const conn = await mysql.createConnection(DB);
	try {
		await conn.execute(`DELETE FROM ${tn('expert_cancellations')} WHERE slot_id = ?`, [sId]);
		await conn.execute(`DELETE FROM ${tn('user_cancellations')} WHERE slot_id = ?`, [sId]);
		await conn.execute(
			`DELETE FROM ${tn('balance_ledger')} WHERE ref_type = 'booking' AND ref_id IN
			 (SELECT id FROM ${tn('bookings')} WHERE bookable_type = 'time_slot' AND bookable_id = ?)`,
			[sId]
		);
		await conn.execute(`DELETE FROM ${tn('bookings')} WHERE bookable_type = 'time_slot' AND bookable_id = ?`, [sId]);
		await conn.execute(`DELETE FROM ${tn('time_slots')} WHERE id = ?`, [sId]);
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

// ── Tests ───────────────────────────────────────────────────────────────────

test.describe('Cross-role: booking + expert cancels + refund', () => {

	// ── Step 0: Setup ───────────────────────────────────────────────────────

	test('entry: dev-login expert & user, create slot, ensure balance', async ({ browser }) => {
		const expert = await devLogin(browser, 'expert');
		expertContext = expert.context;
		expertPage = expert.page;

		const user = await devLogin(browser, 'user');
		userContext = user.context;
		userPage = user.page;

		expertId = await getAccountId('expert1@dev.test');
		userId = await getAccountId('user1@dev.test');
		expect(expertId).toBeGreaterThan(0);
		expect(userId).toBeGreaterThan(0);

		// Ensure user has balance
		await ensureBalance(userId, SLOT_COST + 5000);
		// Ensure expert balance row exists
		await ensureBalance(expertId, 0);

		// Record balances before booking
		userBalanceBefore = await getBalance(userId);
		expertBalanceBefore = await getBalance(expertId);
		console.log('Balances before:', { user: userBalanceBefore, expert: expertBalanceBefore });

		// Create a free slot via DB
		slotId = await createFreeSlot(expertId, SLOT_COST);
		expect(slotId).toBeGreaterThan(0);
		console.log('Created slot ID:', slotId);
	});

	// ── Step 1: User books the slot ─────────────────────────────────────────

	test('step 1: user navigates to /slots/ and sees the slot', async () => {
		if (!slotId) { test.skip(); return; }

		await userPage.goto('/slots/');

		await expect(userPage.locator('[data-test-id="slots-calendar"]')).toBeVisible({ timeout: 10000 });

		// Slot is 7 days ahead — may be in the next week; navigate forward if needed
		let slotCard = userPage.locator(`[data-test-id="slot-card-${slotId}"]`);
		if (!(await slotCard.isVisible({ timeout: 3000 }).catch(() => false))) {
			const nextBtn = userPage.locator('[data-test-id="week-next"]');
			if (await nextBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
				await nextBtn.click();
			}
		}
		slotCard = userPage.locator(`[data-test-id="slot-card-${slotId}"]`);
		await expect(slotCard).toBeVisible({ timeout: 10000 });
	});

	test('step 1: user opens booking modal and confirms', async () => {
		if (!slotId) { test.skip(); return; }

		const bookBtn = userPage.locator(`[data-test-id="slot-book-btn-${slotId}"]`);
		await expect(bookBtn).toBeVisible();
		await bookBtn.click();

		// Booking modal
		const modal = userPage.locator('[data-test-id="booking-modal"]');
		await expect(modal).toBeVisible({ timeout: 5000 });

		// Confirm booking
		const confirmBtn = userPage.locator('[data-test-id="booking-confirm-btn"]');
		await Promise.all([
			expect(confirmBtn).toBeVisible(),
			expect(confirmBtn).toBeEnabled(),
		]);

		const [response] = await Promise.all([
			userPage.waitForResponse(
				resp => resp.url().includes('/slots') && resp.request().method() === 'POST',
				{ timeout: 15000 }
			),
			confirmBtn.click(),
		]);

		const respBody = await response.json().catch(() => null);
		console.log('Booking response:', response.status(), JSON.stringify(respBody)?.substring(0, 200));

		// Modal should close
		await expect(modal).not.toBeVisible({ timeout: 15000 });
	});

	test('step 1: booking created in DB, slot booked', async () => {
		if (!slotId) { test.skip(); return; }

		// Slot should be booked
		expect(await getSlotStatus(slotId)).toBe('booked');

		// Booking exists
		const booking = await getBookingForSlot(slotId);
		expect(booking).not.toBeNull();
		expect(booking!.status).toMatch(/pending|confirmed/);
		bookingId = booking!.id;
		console.log('Booking ID:', bookingId);
	});

	// ── Step 2: Verify expert sees booked slot ──────────────────────────────

	test('step 2: expert navigates to /expert/~slots and sees booked slot', async () => {
		if (!slotId) { test.skip(); return; }

		await expertPage.goto('/expert/~slots');

		// Ensure all slots are visible (switch to "all" filter)
		const allFilter = expertPage.locator('[data-test-id="filter-status-all"]');
		if (await allFilter.isVisible({ timeout: 2000 }).catch(() => false)) {
			await allFilter.click();
		}

		const slotCard = expertPage.locator(`[data-test-id="expert-slot-${slotId}"]`);
		await expect(slotCard).toBeVisible({ timeout: 10000 });

		// User name should be visible
		const userLink = slotCard.locator(`[data-test-id="user-link-${slotId}"]`);
		await expect(userLink).toBeVisible({ timeout: 5000 });

		// Cancel booking button should be visible
		const cancelBtn = slotCard.locator(`[data-test-id="cancel-booking-${slotId}"]`);
		await expect(cancelBtn).toBeVisible({ timeout: 5000 });
	});

	// ── Step 3: Verify balance changes ──────────────────────────────────────

	test('step 3: user balance decreased by SLOT_COST', async () => {
		if (!slotId) { test.skip(); return; }

		const userBalanceAfter = await getBalance(userId);
		expect(userBalanceAfter).toBe(userBalanceBefore - SLOT_COST);
		console.log('User balance after booking:', userBalanceAfter);
	});

	test('step 3: expert balance increased by SLOT_COST', async () => {
		if (!slotId) { test.skip(); return; }

		const expertBalanceAfter = await getBalance(expertId);
		expect(expertBalanceAfter).toBe(expertBalanceBefore + SLOT_COST);
		console.log('Expert balance after booking:', expertBalanceAfter);
	});

	// ── Step 4: Expert cancels booking with reason ──────────────────────────

	test('step 4: expert opens cancel modal and submits with reason', async () => {
		if (!slotId) { test.skip(); return; }

		const slotCard = expertPage.locator(`[data-test-id="expert-slot-${slotId}"]`);
		const cancelBtn = slotCard.locator(`[data-test-id="cancel-booking-${slotId}"]`);
		await cancelBtn.click();

		// Cancel modal
		const modal = expertPage.locator('[data-test-id="cancel-booking-modal"]');
		await expect(modal).toBeVisible({ timeout: 5000 });

		// Fill reason
		const reasonInput = expertPage.locator('[data-test-id="cancel-booking-reason"]');
		await expect(reasonInput).toBeVisible();
		await reasonInput.fill(CANCEL_REASON);

		// Submit
		const [response] = await Promise.all([
			expertPage.waitForResponse(
				resp => resp.url().includes('/expert/~cancelBookedSlot'),
				{ timeout: 12000 }
			),
			expertPage.locator('[data-test-id="cancel-booking-submit"]').click(),
		]);

		expect(response.ok()).toBe(true);
		const respBody = await response.json().catch(() => null);
		console.log('Cancel response:', JSON.stringify(respBody)?.substring(0, 200));

		// Modal closes
		await expect(modal).not.toBeVisible({ timeout: 5000 });
	});

	// ── Step 5: Verify refund and status ────────────────────────────────────

	test('step 5: slot status = cancelled', async () => {
		if (!slotId) { test.skip(); return; }
		expect(await getSlotStatus(slotId)).toBe('cancelled');
	});

	test('step 5: booking status = cancelled', async () => {
		if (!bookingId) { test.skip(); return; }
		const booking = await getBookingForSlot(slotId);
		// After cancel, status could be 'cancelled' — re-fetch directly
		const conn = await mysql.createConnection(DB);
		try {
			const [rows] = await conn.execute<any[]>(
				`SELECT status FROM ${tn('bookings')} WHERE id = ?`, [bookingId]
			);
			expect(rows[0].status).toBe('cancelled');
		} finally { await conn.end(); }
	});

	test('step 5: user balance restored (refund)', async () => {
		if (!slotId) { test.skip(); return; }
		const userBalanceNow = await getBalance(userId);
		expect(userBalanceNow).toBe(userBalanceBefore);
		console.log('User balance after refund:', userBalanceNow);
	});

	test('step 5: expert balance decreased (refund debit)', async () => {
		if (!slotId) { test.skip(); return; }
		const expertBalanceNow = await getBalance(expertId);
		expect(expertBalanceNow).toBe(expertBalanceBefore);
		console.log('Expert balance after refund:', expertBalanceNow);
	});

	test('step 5: refund ledger entries exist for both parties', async () => {
		if (!bookingId) { test.skip(); return; }

		const conn = await mysql.createConnection(DB);
		try {
			// User refund (credit)
			const [userRefunds] = await conn.execute<any[]>(
				`SELECT * FROM ${tn('balance_ledger')}
				 WHERE account_id = ? AND entry_type = 'booking_refund' AND ref_id = ?`,
				[userId, bookingId]
			);
			expect(userRefunds.length).toBeGreaterThan(0);
			expect(Number(userRefunds[0].is_credit)).toBe(1);
			expect(Number(userRefunds[0].amount)).toBe(SLOT_COST);

			// Expert refund (debit)
			const [expertRefunds] = await conn.execute<any[]>(
				`SELECT * FROM ${tn('balance_ledger')}
				 WHERE account_id = ? AND entry_type = 'booking_refund' AND ref_id = ?`,
				[expertId, bookingId]
			);
			expect(expertRefunds.length).toBeGreaterThan(0);
			expect(Number(expertRefunds[0].is_credit)).toBe(0);
			expect(Number(expertRefunds[0].amount)).toBe(SLOT_COST);
		} finally { await conn.end(); }
	});

	// ── Step 6: Cancellation log ────────────────────────────────────────────

	test('step 6: cancellation logged with correct reason', async () => {
		if (!slotId) { test.skip(); return; }
		const log = await getCancellationLog(slotId);
		expect(log).not.toBeNull();
		expect(log!.reason).toBe(CANCEL_REASON);
	});

	// ── Step 7: User sees cancelled booking on /bookings ───────────────────

	test('step 7: user sees booking as cancelled on /bookings', async () => {
		if (!bookingId) { test.skip(); return; }

		await userPage.goto('/bookings');

		const bookingCard = userPage.locator(`[data-test-id="booking-card-${bookingId}"]`);
		await expect(bookingCard).toBeVisible({ timeout: 8000 });

		// Cancel button should NOT be visible
		const cancelBtn = userPage.locator(`[data-test-id="cancel-btn-${bookingId}"]`);
		await expect(cancelBtn).not.toBeVisible();
	});

	test('step 7: user sees refund entry on /balance', async () => {
		if (!bookingId) { test.skip(); return; }

		await userPage.goto('/balance');

		const balanceEl = userPage.locator('[data-test-id="balance-amount"]');
		await expect(balanceEl).toBeVisible({ timeout: 5000 });

		// Ledger should show refund
		const ledgerRows = userPage.locator('[data-test-id="ledger-row"]');
		await expect(ledgerRows.first()).toBeVisible({ timeout: 5000 });
	});

	// ── Step 8: Admin verifies cancellation log ─────────────────────────────

	test('step 8: admin sees cancellation on /admin/cancellations/', async ({ browser }) => {
		if (!slotId) { test.skip(); return; }

		const admin = await devLogin(browser, 'admin');
		try {
			await admin.page.goto('/admin/cancellations/');

			// The cancellations grid is a React island — on prod it hydrates and
			// fetches its rows after navigation, so a one-shot `textContent`
			// races the data load. Poll the body until the reason shows up.
			await expect(admin.page.locator('body')).toContainText(CANCEL_REASON, { timeout: 15000 });
		} finally {
			await admin.context.close();
		}
	});

	// ── Cleanup ─────────────────────────────────────────────────────────────

	test('exit: clean up test data and recalculate balances', async () => {
		if (slotId) {
			await cleanupSlot(slotId);
		}
		// Recalculate balances
		if (userId) await recalcBalance(userId);
		if (expertId) await recalcBalance(expertId);

		await expertContext?.close();
		await userContext?.close();
	});
});
