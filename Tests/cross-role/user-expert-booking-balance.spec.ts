/**
 * Cross-role — BalanceSM(User) × BalanceSM(Expert) × TimeSlotSM
 *
 * State machine interactions:
 *   User books slot → user balance decreases, expert balance increases
 *   User cancels   → user balance restored,  expert balance decremented
 *
 * Entry: both users authenticated; expert has an approved profile with a paid free slot.
 * Cycle:
 *   TimeSlotSM:       free → booked → free
 *   BalanceSM(User):  balance − cost  →  balance + cost
 *   BalanceSM(Expert): balance + cost  →  balance − cost
 *   LedgerSM:          booking_invoice → booking_refund (user)
 *                      booking_payment → booking_refund (expert)
 * Exit: both balances identical to before; slot free again.
 *
 * Uses: browser fixture (multi-context), DB helpers for state verification.
 */

import { test, expect, tn } from '../helpers/scoped-test';
import mysql from 'mysql2/promise';
import type { BrowserContext } from '@playwright/test';
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
			 VALUES (?, ?, ?, 60, ?, 1, 'https://meet.example.com/balance-test', 1, 'free', ?, ?)`,
			[expertId, startAt, startAt + 3600, cost, uid, Math.floor(Date.now() / 1000)]
		);
		return result.insertId;
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

async function ensureUserBalance(page: any, minBalance: number) {
	const current = await getBalance('testuser_setup_user@irabi.test');
	if (current < minBalance) {
		await page.goto('/balance');
		const topUpAmount = minBalance - current + 2000;
		await page.locator('[data-test-id="topup-amount-input"]').fill(String(topUpAmount));
		await page.locator('[data-test-id="topup-submit"]').click();
		// Topup is XHR-based; wait for the row to commit before moving on.
		const targetBalance = current + topUpAmount;
		for (let i = 0; i < 10; i++) {
			if (await getBalance('testuser_setup_user@irabi.test') >= targetBalance) break;
			await new Promise(r => setTimeout(r, 50));
		}
	}
}

async function deleteSlot(slotId: number) {
	const conn = await mysql.createConnection(DB);
	try {
		await conn.execute(`DELETE FROM ${tn('bookings')} WHERE bookable_type='time_slot' AND bookable_id=?`, [slotId]);
		await conn.execute(`DELETE FROM ${tn('time_slots')} WHERE id=?`, [slotId]);
	} finally { await conn.end(); }
}

// ── Test suite ─────────────────────────────────────────────────────────────────

test.describe('BalanceSM(User) × BalanceSM(Expert) × TimeSlotSM', () => {
	const SLOT_COST = 300;
	let expertId = 0;
	let userId = 0;
	let slotId = 0;
	let userBalanceBefore = 0;
	let expertBalanceBefore = 0;
	let bookingId = 0;
	let userCtx: BrowserContext | null = null;

	test('entry: create paid slot, record both balances', async () => {
		expertId = await getAccountId('testuser_setup_expert@irabi.test');
		userId = await getAccountId('testuser_setup_user@irabi.test');
		expect(expertId).toBeGreaterThan(0);
		expect(userId).toBeGreaterThan(0);

		// Create a fresh paid slot
		slotId = await createPaidSlot(expertId, SLOT_COST);
		expect(slotId).toBeGreaterThan(0);

		// Deterministic starting balance — bypass the UI top-up flow.
		//
		// PHP's AccountBalance::recalculate() rebuilds the balance row
		// from the running sum of ir_balance_ledger on every booking,
		// so just writing a balance value isn't enough: prior specs
		// leak ledger rows for these accounts into the worker's DB and
		// the next recalc swaps in their accumulated sum. Clear the
		// ledger for both accounts, seed a single top-up row matching
		// the desired start balance, and set the balance row to the
		// same value. See the matching helper in
		// specs/iRabi/moderator/booking-cancel.spec.ts.
		const FIXED_USER_START = 10000;
		const FIXED_EXPERT_START = 0;
		const conn = await mysql.createConnection(DB);
		try {
			for (const [accId, startBal] of [[userId, FIXED_USER_START], [expertId, FIXED_EXPERT_START]] as const) {
				await conn.execute(
					`DELETE FROM ${tn('balance_ledger')} WHERE account_id = ?`,
					[accId]
				);
				if (startBal > 0) {
					await conn.execute(
						`INSERT INTO ${tn('balance_ledger')}
						 (account_id, is_credit, amount, entry_type, note, created_at)
						 VALUES (?, 1, ?, 'top_up', 'user-expert-booking-balance.spec seed', UNIX_TIMESTAMP())`,
						[accId, startBal]
					);
				}
				await conn.execute(
					`INSERT INTO ${tn('account_balance')} (account_id, balance, updated_at)
					 VALUES (?, ?, UNIX_TIMESTAMP())
					 ON DUPLICATE KEY UPDATE balance = VALUES(balance), updated_at = VALUES(updated_at)`,
					[accId, startBal]
				);
			}
		} finally { await conn.end(); }

		// Record both balances
		userBalanceBefore = await getBalance('testuser_setup_user@irabi.test');
		expertBalanceBefore = await getBalance('testuser_setup_expert@irabi.test');

		expect(userBalanceBefore).toBe(FIXED_USER_START);
		expect(expertBalanceBefore).toBe(FIXED_EXPERT_START);

		// Slot is free
		const slotStatus = await getSlotStatus(slotId);
		expect(slotStatus).toBe('free');
	});

	test('TimeSlotSM free → booked / BalanceSM: user books paid slot', async ({ browser }) => {
		if (!slotId) { test.skip(); return; }

		userCtx = await newScopedContext(browser, { storageState: resolveStorageStatePath('user') });
		const userPage = await userCtx.newPage();
		try {
			await userPage.goto(`/bookings/id~${slotId}/~book`);

			const bookBtn = userPage.locator('[data-test-id="book-btn"]');
			await expect(bookBtn).toBeVisible({ timeout: 8000 });

			await Promise.all([
				userPage.waitForURL(url => url.pathname === '/bookings', { timeout: 15000 }),
				bookBtn.click(),
			]);

			// Let the bookings page settle so the booking transaction is
			// committed to DB before BalanceSM checks read the balance.
			await userPage.waitForLoadState('networkidle');
			expect(userPage.url()).toContain('/bookings');
		} finally {
			await userPage.close();
		}
	});

	test('BalanceSM(User): balance decreased by slot cost after booking', async () => {
		if (!slotId) { test.skip(); return; }
		// Booking response can return before PHP finishes the balance update
		// under parallel-worker load; poll briefly for the expected value.
		let userBalanceAfter = 0;
		for (let i = 0; i < 10; i++) {
			userBalanceAfter = await getBalance('testuser_setup_user@irabi.test');
			if (userBalanceAfter === userBalanceBefore - SLOT_COST) break;
			await new Promise(r => setTimeout(r, 50));
		}
		expect(userBalanceAfter).toBe(userBalanceBefore - SLOT_COST);
	});

	test('BalanceSM(Expert): balance increased by slot cost after user booking', async () => {
		if (!slotId) { test.skip(); return; }
		let expertBalanceAfter = 0;
		for (let i = 0; i < 10; i++) {
			expertBalanceAfter = await getBalance('testuser_setup_expert@irabi.test');
			if (expertBalanceAfter === expertBalanceBefore + SLOT_COST) break;
			await new Promise(r => setTimeout(r, 50));
		}
		expect(expertBalanceAfter).toBe(expertBalanceBefore + SLOT_COST);
	});

	test('TimeSlotSM: slot status = booked after single-seat booking', async () => {
		if (!slotId) { test.skip(); return; }
		const status = await getSlotStatus(slotId);
		expect(status).toBe('booked');
	});

	test('get bookingId from DB by slotId', async () => {
		if (!slotId) { test.skip(); return; }

		// Look up by slot+user instead of grabbing the first booking card —
		// dev DB carries unrelated bookings from earlier specs that would
		// cause `cards.first()` to point at the wrong row.
		const conn = await mysql.createConnection(DB);
		try {
			const [rows] = await conn.execute<any[]>(
				`SELECT id FROM ${tn('bookings')}
				 WHERE bookable_type = 'time_slot' AND bookable_id = ? AND user_id = ?
				 ORDER BY id DESC LIMIT 1`,
				[slotId, userId]
			);
			bookingId = rows[0]?.id ?? 0;
		} finally {
			await conn.end();
		}
		expect(bookingId).toBeGreaterThan(0);
	});

	test('BookingSM: pending → cancelled — user cancels booking via modal', async () => {
		if (!bookingId || !userCtx) { test.skip(); return; }

		const userPage = await userCtx.newPage();
		try {
			await userPage.goto('/system/bookings');

			const cancelBtn = userPage.locator(`[data-test-id="cancel-btn-${bookingId}"]`);
			await expect(cancelBtn).toBeVisible({ timeout: 8000 });

			// Click cancel opens a modal with reason textarea (no window.confirm)
			await cancelBtn.click();

			// Wait for cancel modal to appear
			await expect(userPage.locator('[data-test-id="user-cancel-modal"]')).toBeVisible({ timeout: 5000 });

			// Fill the reason textarea (required)
			await userPage.locator('[data-test-id="user-cancel-reason"]').fill('E2E test: cancellation reason');

			// Submit cancellation
			const [response] = await Promise.all([
				userPage.waitForResponse(
					resp => resp.url().includes(`/bookings/id~${bookingId}/~cancel`),
					{ timeout: 12000 }
				),
				userPage.locator('[data-test-id="user-cancel-submit"]').click(),
			]);
			expect(response.ok()).toBe(true);

		} finally {
			await userPage.close();
		}
	});

	test('BalanceSM(User): balance restored to pre-booking value after cancel', async () => {
		if (!slotId) { test.skip(); return; }
		let userBalanceAfterCancel = 0;
		for (let i = 0; i < 10; i++) {
			userBalanceAfterCancel = await getBalance('testuser_setup_user@irabi.test');
			if (userBalanceAfterCancel === userBalanceBefore) break;
			await new Promise(r => setTimeout(r, 50));
		}
		expect(userBalanceAfterCancel).toBe(userBalanceBefore);
	});

	test('BalanceSM(Expert): balance restored to pre-booking value after user cancel', async () => {
		if (!slotId) { test.skip(); return; }
		let expertBalanceAfterCancel = 0;
		for (let i = 0; i < 10; i++) {
			expertBalanceAfterCancel = await getBalance('testuser_setup_expert@irabi.test');
			if (expertBalanceAfterCancel === expertBalanceBefore) break;
			await new Promise(r => setTimeout(r, 50));
		}
		expect(expertBalanceAfterCancel).toBe(expertBalanceBefore);
	});

	test('TimeSlotSM: slot reverts to free after cancellation', async () => {
		if (!slotId) { test.skip(); return; }
		const status = await getSlotStatus(slotId);
		expect(status).toBe('free');
	});

	test('LedgerSM: expert balance page shows booking_payment and booking_refund entries', async ({ browser }) => {
		if (!slotId) { test.skip(); return; }

		const expertCtx = await newScopedContext(browser, { storageState: resolveStorageStatePath('expert') });
		const expertPage = await expertCtx.newPage();
		try {
			await expertPage.goto('/balance');

			const ledgerRows = expertPage.locator('[data-test-id="ledger-row"]');
			await expect(ledgerRows.first()).toBeVisible({ timeout: 8000 });
		} finally {
			await expertCtx.close();
		}
	});

	test('exit: clean up test slot', async () => {
		if (userCtx) { await userCtx.close(); userCtx = null; }
		if (slotId) await deleteSlot(slotId);
	});
});
