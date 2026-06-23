/**
 * Cross-role — Expert cancels a booked slot (with reason)
 *
 * Uses dev-login for reliable session creation (no TOTP registration needed).
 *
 * State machine interactions:
 *   User books slot  -> slot becomes booked, booking created, balance changes
 *   Expert cancels   -> booking cancelled, slot cancelled, balance restored (refund),
 *                       cancellation log entry with reason
 *
 * Uses: dev-login (POST /dev-login), DB helpers for verification.
 */

import { test, expect, tn } from '../helpers/scoped-test';
import type { BrowserContext, Page } from '@playwright/test';
import mysql from 'mysql2/promise';

import { newScopedContext } from '../helpers/scoped-test';
import { DB } from '../helpers/db';
import { roleLogin } from '../helpers/role-login';
test.describe.configure({ mode: 'serial' });

// -- Dev-login helper --

async function devLogin(browser: any, role: string): Promise<{ context: BrowserContext; page: Page }> {
	const context = await newScopedContext(browser);
	const page = await context.newPage();
	await page.goto('/');

	await roleLogin(page, role);

	await page.goto('/');
	return { context, page };
}

async function devLoginOnContext(context: BrowserContext, role: string): Promise<Page> {
	const page = await context.newPage();
	await page.goto('/');

	await roleLogin(page, role);

	await page.goto('/');
	return page;
}

// -- DB helpers --

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
			`SELECT balance FROM ${tn('account_balance')} WHERE account_id = ?`,
			[accountId]
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
			 VALUES (?, ?, ?, 60, ?, 1, 'https://meet.example.com/expert-cancel-test', 1, 'free', ?, ?)`,
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

async function getBookingStatus(bookingId: number): Promise<string> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT status FROM ${tn('bookings')} WHERE id = ?`, [bookingId]
		);
		return rows[0]?.status ?? 'unknown';
	} finally { await conn.end(); }
}

async function ensureBalance(accountId: number, minBalance: number) {
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
				 VALUES (?, 1, ?, 'top_up', '', 0, 'Test top-up', UNIX_TIMESTAMP())`,
				[accountId, topUp]
			);
			await conn.execute(
				`UPDATE ${tn('account_balance')} SET balance = balance + ?, updated_at = UNIX_TIMESTAMP() WHERE account_id = ?`,
				[topUp, accountId]
			);
		}
	} finally { await conn.end(); }
}

async function getBookingIdForSlot(slotId: number): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT id FROM ${tn('bookings')}
			 WHERE bookable_type = 'time_slot' AND bookable_id = ?
			 AND status IN ('pending', 'confirmed')
			 ORDER BY id DESC LIMIT 1`,
			[slotId]
		);
		return rows[0]?.id ?? 0;
	} finally { await conn.end(); }
}

async function getCancellationLog(slotId: number): Promise<{reason: string} | null> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT reason FROM ${tn('expert_cancellations')}
			 WHERE slot_id = ?
			 ORDER BY id DESC LIMIT 1`,
			[slotId]
		);
		return rows[0] ?? null;
	} finally { await conn.end(); }
}

async function getLedgerRefundEntries(accountId: number, bookingId: number): Promise<any[]> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT * FROM ${tn('balance_ledger')}
			 WHERE account_id = ? AND entry_type = 'booking_refund' AND ref_id = ?
			 ORDER BY id DESC`,
			[accountId, bookingId]
		);
		return rows as any[];
	} finally { await conn.end(); }
}

async function cleanupSlot(slotId: number) {
	const conn = await mysql.createConnection(DB);
	try {
		await conn.execute(`DELETE FROM ${tn('expert_cancellations')} WHERE slot_id = ?`, [slotId]);
		await conn.execute(
			`DELETE FROM ${tn('balance_ledger')} WHERE ref_type = 'booking' AND ref_id IN
			 (SELECT id FROM ${tn('bookings')} WHERE bookable_type = 'time_slot' AND bookable_id = ?)`,
			[slotId]
		);
		await conn.execute(`DELETE FROM ${tn('bookings')} WHERE bookable_type='time_slot' AND bookable_id = ?`, [slotId]);
		await conn.execute(`DELETE FROM ${tn('time_slots')} WHERE id = ?`, [slotId]);
	} finally { await conn.end(); }
}

// -- Test suite --

const CANCEL_REASON = 'Эксперт заболел';

test.describe('Expert cancels booking — cross-role (dev-login)', () => {
	const SLOT_COST = 250;
	let expertId = 0;
	let userId = 0;
	let slotId = 0;
	let bookingId = 0;
	// Balances recorded AFTER booking (= before cancellation)
	let userBalanceAfterBooking = 0;
	let expertBalanceAfterBooking = 0;

	let userCtx: BrowserContext | null = null;
	let expertCtx: BrowserContext | null = null;

	// -- Step 0: Setup --

	test('entry: dev-login expert & user, create paid slot, ensure balance', async () => {
		// Don't pre-warm sessions via dev-login here — the dev seed accounts
		// (expert1@dev.test / user1@dev.test) are guaranteed to exist by
		// globalSetup (isolation-setup.ts seeds them into every worker's
		// scope), and each downstream test opens its own scoped context
		// anyway. The previous double dev-login + close pair was ~1.5s
		// of pure overhead before any DB work could begin.
		expertId = await getAccountId('expert1@dev.test');
		userId = await getAccountId('user1@dev.test');
		expect(expertId).toBeGreaterThan(0);
		expect(userId).toBeGreaterThan(0);

		await ensureBalance(userId, SLOT_COST + 5000);

		slotId = await createPaidSlot(expertId, SLOT_COST);
		expect(slotId).toBeGreaterThan(0);
	});

	// -- Step 1: User books the slot --

	test('user books the slot', async ({ browser }) => {
		if (!slotId) { test.skip(); return; }

		userCtx = await newScopedContext(browser);
		const page = await devLoginOnContext(userCtx, 'user');
		try {
			await page.goto(`/bookings/id~${slotId}/~book`);

			const bookBtn = page.locator('[data-test-id="book-btn"]');
			await expect(bookBtn).toBeVisible({ timeout: 8000 });

			await Promise.all([
				page.waitForURL(url => url.pathname === '/bookings', { timeout: 15000 }),
				bookBtn.click(),
			]);
			expect(page.url()).toContain('/bookings');
		} finally {
			await page.close();
		}
	});

	test('DB: slot booked, booking created, balance changed', async () => {
		if (!slotId) { test.skip(); return; }

		expect(await getSlotStatus(slotId)).toBe('booked');

		bookingId = await getBookingIdForSlot(slotId);
		expect(bookingId).toBeGreaterThan(0);

		// Record balances AFTER booking (these are the "before cancel" values)
		userBalanceAfterBooking = await getBalance(userId);
		expertBalanceAfterBooking = await getBalance(expertId);
	});

	// -- Step 2: Expert verifies and cancels --

	test('expert: booked slot visible with user name', async ({ browser }) => {
		if (!slotId) { test.skip(); return; }

		expertCtx = await newScopedContext(browser);
		const page = await devLoginOnContext(expertCtx, 'expert');
		try {
			await page.goto('/expert/~slots');

			const allFilter = page.locator('[data-test-id="filter-status-all"]');
			if (await allFilter.isVisible()) {
				await allFilter.click();
			}

			const slotCard = page.locator(`[data-test-id="expert-slot-${slotId}"]`);
			await expect(slotCard).toBeVisible({ timeout: 10000 });

			const userLink = slotCard.locator(`[data-test-id="user-link-${slotId}"]`);
			await expect(userLink).toBeVisible();
		} finally {
			await page.close();
		}
	});

	test('expert: cancels booking via modal with reason', async () => {
		if (!slotId || !expertCtx) { test.skip(); return; }

		const page = await devLoginOnContext(expertCtx, 'expert');
		try {
			await page.goto('/expert/~slots');

			const allFilter = page.locator('[data-test-id="filter-status-all"]');
			if (await allFilter.isVisible()) {
				await allFilter.click();
			}

			const slotCard = page.locator(`[data-test-id="expert-slot-${slotId}"]`);
			await expect(slotCard).toBeVisible({ timeout: 20000 });

			// Click cancel booking button
			const cancelBtn = slotCard.locator(`[data-test-id="cancel-booking-${slotId}"]`);
			await expect(cancelBtn).toBeVisible();
			await cancelBtn.click();

			// Modal opens
			const cancelModal = page.locator('[data-test-id="cancel-booking-modal"]');
			await expect(cancelModal).toBeVisible({ timeout: 5000 });

			// Fill reason
			const reasonInput = page.locator('[data-test-id="cancel-booking-reason"]');
			await expect(reasonInput).toBeVisible();
			await reasonInput.fill(CANCEL_REASON);

			// Submit
			const [response] = await Promise.all([
				page.waitForResponse(
					resp => resp.url().includes('/expert/~cancelBookedSlot'),
					{ timeout: 12000 }
				),
				page.locator('[data-test-id="cancel-booking-submit"]').click(),
			]);
			expect(response.ok()).toBe(true);

			const responseBody = await response.json();
			expect(responseBody.success).toBe(true);

			// Modal closes
			await expect(cancelModal).not.toBeVisible({ timeout: 5000 });
		} finally {
			await page.close();
		}
	});

	// -- Step 3: DB verification --

	test('DB: slot status = cancelled', async () => {
		if (!slotId) { test.skip(); return; }
		expect(await getSlotStatus(slotId)).toBe('cancelled');
	});

	test('DB: booking status = cancelled', async () => {
		if (!bookingId) { test.skip(); return; }
		expect(await getBookingStatus(bookingId)).toBe('cancelled');
	});

	test('DB: user balance restored by SLOT_COST (refund)', async () => {
		if (!slotId) { test.skip(); return; }
		const userBalanceNow = await getBalance(userId);
		expect(userBalanceNow).toBe(userBalanceAfterBooking + SLOT_COST);
	});

	test('DB: expert balance decreased by SLOT_COST (refund debit)', async () => {
		if (!slotId) { test.skip(); return; }
		const expertBalanceNow = await getBalance(expertId);
		expect(expertBalanceNow).toBe(expertBalanceAfterBooking - SLOT_COST);
	});

	test('DB: refund ledger entries for user (credit) and expert (debit)', async () => {
		if (!bookingId) { test.skip(); return; }

		const userRefunds = await getLedgerRefundEntries(userId, bookingId);
		expect(userRefunds.length).toBeGreaterThan(0);
		expect(Number(userRefunds[0].is_credit)).toBe(1);
		expect(Number(userRefunds[0].amount)).toBe(SLOT_COST);

		const expertRefunds = await getLedgerRefundEntries(expertId, bookingId);
		expect(expertRefunds.length).toBeGreaterThan(0);
		expect(Number(expertRefunds[0].is_credit)).toBe(0);
		expect(Number(expertRefunds[0].amount)).toBe(SLOT_COST);
	});

	test('DB: cancellation log entry with correct reason', async () => {
		if (!slotId) { test.skip(); return; }
		const logEntry = await getCancellationLog(slotId);
		expect(logEntry).not.toBeNull();
		expect(logEntry!.reason).toBe(CANCEL_REASON);
	});

	// -- Step 4: User verifies --

	test('user: booking shows as cancelled on /bookings', async () => {
		if (!bookingId || !userCtx) { test.skip(); return; }

		const page = await devLoginOnContext(userCtx, 'user');
		try {
			await page.goto('/bookings');

			const bookingCard = page.locator(`[data-test-id="booking-card-${bookingId}"]`);
			await expect(bookingCard).toBeVisible({ timeout: 8000 });

			const statusBadge = page.locator(`[data-test-id="booking-status-${bookingId}"]`);
			await expect(statusBadge).toBeVisible();

			// Cancel button should NOT be visible for cancelled booking
			const cancelBtn = page.locator(`[data-test-id="cancel-btn-${bookingId}"]`);
			await expect(cancelBtn).not.toBeVisible();
		} finally {
			await page.close();
		}
	});

	test('user: refund visible on /balance', async () => {
		if (!bookingId || !userCtx) { test.skip(); return; }

		const page = await devLoginOnContext(userCtx, 'user');
		try {
			await page.goto('/balance');

			const ledgerRows = page.locator('[data-test-id="ledger-row"]');
			await expect(ledgerRows.first()).toBeVisible({ timeout: 8000 });

			const allRows = await ledgerRows.allTextContents();
			const hasRefund = allRows.some(text =>
				text.includes('refund') || text.includes('Refund') || text.includes('#' + bookingId)
			);
			expect(hasRefund).toBe(true);
		} finally {
			await page.close();
		}
	});

	// -- Step 5: Admin verifies --

	test('admin: cancellation log on /admin/cancellations/', async ({ browser }) => {
		if (!slotId) { test.skip(); return; }

		const { context, page } = await devLogin(browser, 'admin');
		try {
			await page.goto('/admin/cancellations/');

			// React island hydrates + fetches rows after navigation; poll the
			// body until the reason lands instead of a one-shot read (prod race).
			await expect(page.locator('body')).toContainText(CANCEL_REASON, { timeout: 15000 });
		} finally {
			await context.close();
		}
	});

	// -- Cleanup --

	test('exit: clean up test data', async () => {
		if (userCtx) { await userCtx.close(); userCtx = null; }
		if (expertCtx) { await expertCtx.close(); expertCtx = null; }
		if (slotId) await cleanupSlot(slotId);
	});
});
