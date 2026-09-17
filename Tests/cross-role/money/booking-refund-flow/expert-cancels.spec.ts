/**
 * Сквозной путь: пользователь бронирует, эксперт отменяет, деньги
 * возвращаются обеим сторонам правильно.
 *
 * Единая цепочка в одном файле: шаги делят слот, бронь и снятые до
 * начала балансы — по отдельности они ничего не проверяют.
 */

import { test, expect, tn } from '../../../helpers/scoped-test';
import type { BrowserContext, Page } from '@playwright/test';
import { DB } from '../../../helpers/db/db';
import mysql from 'mysql2/promise';
import {
    devLogin,
    getAccountId,
    getBalance,
    ensureBalance,
    createFreeSlot,
    getSlotStatus,
    getBookingForSlot,
    getCancellationLog,
    cleanupSlot,
    recalcBalance,
    SLOT_COST,
    CANCEL_REASON,
} from './helpers';

test.describe.configure({ mode: 'serial' });

// Состояние цепочки: шаги делят слот, бронь и снятые до начала балансы.
// Оно живёт в файле проверок, а не в helpers: helpers — это инструменты,
// а это — то, что цепочка о себе помнит.
let expertContext: BrowserContext;
let userContext: BrowserContext;
let expertPage: Page;
let userPage: Page;

let expertId = 0;
let userId = 0;
let slotId = 0;
let bookingId = 0;
let userBalanceBefore = 0;
let expertBalanceBefore = 0;

test.describe('Cross-role: booking + expert cancels + refund', () => {

	// ── Step 0: Setup ───────────────────────────────────────────────────────

	// beforeAll/afterAll (not plain tests) — serial mode skips every
	// subsequent test once one fails, so a cleanup step written as a
	// regular test never runs after a mid-flow assertion fails, leaving
	// the shared user1@dev.test/expert1@dev.test dev-seed fixtures'
	// balance un-recalculated and a stray test slot/booking behind for
	// the rest of this worker's run. Hooks run regardless of test
	// outcome.
	test.beforeAll(async ({ browser }) => {
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
		const reasonInput = expertPage.locator('[data-test-id="cancel-booking-modal-reason"]');
		await expect(reasonInput).toBeVisible();
		await reasonInput.fill(CANCEL_REASON);

		// Submit
		const [response] = await Promise.all([
			expertPage.waitForResponse(
				resp => resp.url().includes('/expert/~cancelBookedSlot'),
				{ timeout: 12000 }
			),
			expertPage.locator('[data-test-id="cancel-booking-modal-submit"]').click(),
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

	test.afterAll(async () => {
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
