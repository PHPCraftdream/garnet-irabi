/**
 * Expert — TimeSlotSM: slot management actions
 *
 * State machines: TimeSlotSM × BookingSM × BalanceSM
 *
 * Entry: expert authenticated, approved expert profile exists.
 * Tests:
 *   1. Edit free slot — change cost via edit-slot-modal
 *   2. Delete free slot — free → deleted via UI delete button + ConfirmModal (variant=danger)
 *   3. Cancel booked slot with refund — booked → cancelled via cancel-booking-modal with reason
 * Exit: test slots and bookings cleaned up.
 *
 * UI flow (calendar view):
 *   Free slot: slot-edit-{id} opens edit-slot-modal, slot-delete-{id} triggers ConfirmModal (variant=danger)
 *   Booked slot: cancel-booking-{id} opens cancel-booking-modal with reason textarea
 *   "Complete" button REMOVED entirely.
 *   Cancel + delete merged → one delete button with ConfirmModal.
 *
 * API endpoints:
 *   POST /expert/~editSlot     — edit free slot
 *   POST /expert/~deleteSlot   — delete free slot
 *   POST /expert/~cancelBookedSlot — cancel booked slot with reason + refund
 */

import { test, expect, tn } from '../helpers/scoped-test';
import mysql from 'mysql2/promise';
import { resolveStorageStatePath } from '../helpers/state';

import { newScopedContext } from '../helpers/scoped-test';
import { DB } from '../helpers/db';
// File-level parallel — each of the three TimeSlotSM describes is an
// independent CRUD chain (creates its own slot, asserts on it, cleans
// up). Their slotIds don't overlap, so the describes can fan out
// across workers. Each describe pins itself to `mode: 'serial'`
// below to keep its internal entry→action→exit order.
test.describe.configure({ mode: 'parallel' });

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

async function createFreeSlot(expertId: number, cost: number = 0, futureOffsetSec: number = 86400 * 3): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const startAt = Math.floor(Date.now() / 1000) + futureOffsetSec;
		const uid = [...Array(16)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
		const [result]: any = await conn.execute(
			`INSERT INTO ${tn('time_slots')}
			 (expert_id, start_at, end_at, duration_min, cost, is_online, location, max_users, status, uid, created_at)
			 VALUES (?, ?, ?, 60, ?, 1, '', 1, 'free', ?, ?)`,
			[expertId, startAt, startAt + 3600, cost, uid, Math.floor(Date.now() / 1000)]
		);
		return result.insertId;
	} finally { await conn.end(); }
}

async function getSlot(slotId: number): Promise<any> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT * FROM ${tn('time_slots')} WHERE id = ?`, [slotId]
		);
		return rows[0] ?? null;
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

async function slotExists(slotId: number): Promise<boolean> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT id FROM ${tn('time_slots')} WHERE id = ?`, [slotId]
		);
		return rows.length > 0;
	} finally { await conn.end(); }
}

async function createBooking(userId: number, slotId: number, status: string = 'pending'): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const [result]: any = await conn.execute(
			`INSERT INTO ${tn('bookings')}
			 (user_id, bookable_type, bookable_id, status, created_at)
			 VALUES (?, 'time_slot', ?, ?, ?)`,
			[userId, slotId, status, Math.floor(Date.now() / 1000)]
		);
		// Mark slot as booked
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

async function deleteSlot(slotId: number) {
	const conn = await mysql.createConnection(DB);
	try {
		await conn.execute(`DELETE FROM ${tn('bookings')} WHERE bookable_type='time_slot' AND bookable_id=?`, [slotId]);
		await conn.execute(`DELETE FROM ${tn('time_slots')} WHERE id=?`, [slotId]);
	} finally { await conn.end(); }
}

// ── Test 1: Edit free slot via edit-slot-modal ────────────────────────────────

test.describe('TimeSlotSM: edit free slot via edit-slot-modal', () => {
	test.describe.configure({ mode: 'serial' });

	let expertId = 0;
	let slotId = 0;

	test('entry: create free slot', async () => {
		expertId = await getAccountId('testuser_setup_expert@irabi.test');
		expect(expertId).toBeGreaterThan(0);
		slotId = await createFreeSlot(expertId, 100);
		expect(slotId).toBeGreaterThan(0);
	});

	test('expert sees edit button for free slot in calendar', async ({ page }) => {
		if (!slotId) { test.skip(); return; }

		await page.goto('/expert/~slots');

		const slotCard = page.locator(`[data-test-id="expert-slot-${slotId}"]`);
		await expect(slotCard).toBeVisible({ timeout: 15000 });

		// Calendar view: edit button is inside the slot card
		// SlotCard uses slot-edit-{id}, calendar inline uses ✎ button
		const editBtn = page.locator(`[data-test-id="edit-slot-${slotId}"]`);
		const calendarEditBtn = slotCard.locator('button[title]').first();
		const hasEditBtn = await editBtn.count() > 0;
		const hasCalendarEditBtn = await calendarEditBtn.count() > 0;
		expect(hasEditBtn || hasCalendarEditBtn).toBe(true);
	});

	test('edit slot: open modal, change cost, save', async ({ page }) => {
		if (!slotId) { test.skip(); return; }

		await page.goto('/expert/~slots');

		const slotCard = page.locator(`[data-test-id="expert-slot-${slotId}"]`);
		await expect(slotCard).toBeVisible({ timeout: 15000 });

		// Click edit — try slot-edit-{id} first, then title-based button in calendar
		const editBtn = page.locator(`[data-test-id="edit-slot-${slotId}"]`);
		if (await editBtn.count() > 0) {
			await editBtn.click();
		} else {
			// Calendar view: the first button inside free slot is the edit button
			await slotCard.locator('button[title]').first().click();
		}

		// Edit modal should appear
		const modal = page.locator('[data-test-id="edit-slot-modal"]');
		await expect(modal).toBeVisible({ timeout: 8000 });

		// Change cost
		const costInput = page.locator('[data-test-id="edit-slot-cost"]');
		await expect(costInput).toBeVisible();
		await costInput.fill('500');

		// Save
		const saveBtn = page.locator('[data-test-id="edit-slot-save"]');
		await saveBtn.click();

		// Modal should close
		await expect(modal).not.toBeVisible({ timeout: 8000 });
	});

	test('edit slot: cost updated in DB', async () => {
		if (!slotId) { test.skip(); return; }
		const slot = await getSlot(slotId);
		expect(slot).toBeTruthy();
		expect(Number(slot.cost)).toBe(500);
		expect(slot.status).toBe('free');
	});

	test('exit: clean up', async () => {
		if (slotId) await deleteSlot(slotId);
	});
});

// ── Test 2: Delete free slot via UI (one delete button + ConfirmModal) ────────

test.describe('TimeSlotSM: free → deleted via delete button + ConfirmModal', () => {
	test.describe.configure({ mode: 'serial' });

	let expertId = 0;
	let slotId = 0;

	test('entry: create free slot', async () => {
		expertId = await getAccountId('testuser_setup_expert@irabi.test');
		expect(expertId).toBeGreaterThan(0);
		slotId = await createFreeSlot(expertId, 0);
		expect(slotId).toBeGreaterThan(0);
	});

	test('expert sees delete button for free slot', async ({ page }) => {
		if (!slotId) { test.skip(); return; }

		await page.goto('/expert/~slots');

		const slotCard = page.locator(`[data-test-id="expert-slot-${slotId}"]`);
		await expect(slotCard).toBeVisible({ timeout: 15000 });

		// Delete button: try slot-delete-{id} (SlotCard), else last button in calendar slot
		const deleteBtn = page.locator(`[data-test-id="slot-delete-${slotId}"]`);
		const calendarDeleteBtn = slotCard.locator('button[title]').last();
		const hasDeleteBtn = await deleteBtn.count() > 0;
		const hasCalendarDeleteBtn = await calendarDeleteBtn.count() > 0;
		expect(hasDeleteBtn || hasCalendarDeleteBtn).toBe(true);
	});

	test('TimeSlotSM free → deleted: click delete, confirm in ConfirmModal', async ({ page }) => {
		if (!slotId) { test.skip(); return; }

		await page.goto('/expert/~slots');

		const slotCard = page.locator(`[data-test-id="expert-slot-${slotId}"]`);
		await expect(slotCard).toBeVisible({ timeout: 15000 });

		// Click delete
		const deleteBtn = page.locator(`[data-test-id="slot-delete-${slotId}"]`);
		if (await deleteBtn.count() > 0) {
			await deleteBtn.click();
		} else {
			// Calendar view: last button in free slot is delete
			await slotCard.locator('button[title]').last().click();
		}

		// ConfirmModal appears with danger variant
		const confirmBtn = page.locator('[data-test-id="modal-confirm-btn"]');
		await expect(confirmBtn).toBeVisible({ timeout: 8000 });

		// Click + wait for the delete XHR so the next test's DB check sees
		// the row gone.
		await Promise.all([
			page.waitForResponse(r => r.request().method() === 'POST' && r.status() < 500, { timeout: 10000 }),
			confirmBtn.click(),
		]);
		await expect(confirmBtn).toHaveCount(0, { timeout: 5000 });

	});

	test('TimeSlotSM deleted: slot removed from DB', async () => {
		if (!slotId) { test.skip(); return; }
		const exists = await slotExists(slotId);
		expect(exists).toBe(false);
	});
});

// ── Test 3: Cancel booked slot with refund via cancel-booking-modal ───────────

test.describe('TimeSlotSM: booked → cancelled (refund via cancel-booking-modal)', () => {
	test.describe.configure({ mode: 'serial' });

	const SLOT_COST = 300;
	let expertId = 0;
	let userId = 0;
	let slotId = 0;
	let bookingId = 0;
	let userBalanceBefore = 0;
	let expertBalanceBefore = 0;

	test('entry: create slot, user books it via UI', async ({ browser }) => {
		expertId = await getAccountId('testuser_setup_expert@irabi.test');
		userId = await getAccountId('testuser_setup_user@irabi.test');
		expect(expertId).toBeGreaterThan(0);
		expect(userId).toBeGreaterThan(0);

		slotId = await createFreeSlot(expertId, SLOT_COST);
		expect(slotId).toBeGreaterThan(0);

		// User books the slot via UI
		const userCtx = await newScopedContext(browser, { storageState: resolveStorageStatePath('user') });
		const userPage = await userCtx.newPage();
		try {
			// Ensure balance
			const currentBalance = await getBalance('testuser_setup_user@irabi.test');
			if (currentBalance < SLOT_COST + 1000) {
				await userPage.goto('/balance');
				await userPage.locator('[data-test-id="topup-amount-input"]').fill(String(SLOT_COST + 2000 - currentBalance));
				await userPage.locator('[data-test-id="topup-submit"]').click();
				// Keep this `networkidle` — the next thing is `getBalance()` (a
				// direct DB query) rather than a polling UI assertion, so we
				// genuinely need the topup roundtrip to settle here.
				await userPage.waitForLoadState('networkidle');
			}

			userBalanceBefore = await getBalance('testuser_setup_user@irabi.test');
			expertBalanceBefore = await getBalance('testuser_setup_expert@irabi.test');

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

		// Verify slot is booked
		const slotStatus = await getSlotStatus(slotId);
		expect(slotStatus).toBe('booked');
	});

	test('expert sees cancel-booking button for booked slot', async ({ page }) => {
		if (!slotId) { test.skip(); return; }

		await page.goto('/expert/~slots');

		const slotCard = page.locator(`[data-test-id="expert-slot-${slotId}"]`);
		await expect(slotCard).toBeVisible({ timeout: 15000 });

		const cancelBtn = page.locator(`[data-test-id="cancel-booking-${slotId}"]`);
		await expect(cancelBtn).toBeVisible({ timeout: 8000 });
	});

	test('TimeSlotSM booked → cancelled: expert cancels via cancel-booking-modal', async ({ page }) => {
		if (!slotId) { test.skip(); return; }

		await page.goto('/expert/~slots');

		const cancelBtn = page.locator(`[data-test-id="cancel-booking-${slotId}"]`);
		await expect(cancelBtn).toBeVisible({ timeout: 8000 });
		await cancelBtn.click();

		// Cancel booking modal opens — fill reason
		const modal = page.locator('[data-test-id="cancel-booking-modal"]');
		await expect(modal).toBeVisible({ timeout: 8000 });

		const reasonInput = page.locator('[data-test-id="cancel-booking-reason"]');
		await expect(reasonInput).toBeVisible();
		await reasonInput.fill('Testing: expert cancels booked slot');

		const submitBtn = page.locator('[data-test-id="cancel-booking-submit"]');
		// Wait for the cancel-XHR before the next test reads DB.
		await Promise.all([
			page.waitForResponse(r => r.request().method() === 'POST' && r.status() < 500, { timeout: 10000 }),
			submitBtn.click(),
		]);

		// Modal should close
		await expect(modal).not.toBeVisible({ timeout: 8000 });
	});

	test('TimeSlotSM: slot status = cancelled in DB', async () => {
		if (!slotId) { test.skip(); return; }
		const status = await getSlotStatus(slotId);
		expect(status).toBe('cancelled');
	});

	test('BookingSM: booking status = cancelled after slot cancel', async () => {
		if (!bookingId) { test.skip(); return; }
		const status = await getBookingStatus(bookingId);
		expect(status).toBe('cancelled');
	});

	test('BalanceSM: user balance restored after slot cancel', async () => {
		if (!slotId || !SLOT_COST || !bookingId || !userBalanceBefore) { test.skip(); return; }
		const userBalanceAfter = await getBalance('testuser_setup_user@irabi.test');
		expect(userBalanceAfter).toBe(userBalanceBefore);
	});

	test('BalanceSM: expert balance restored after slot cancel', async () => {
		if (!slotId || !SLOT_COST || !bookingId || !expertBalanceBefore) { test.skip(); return; }
		const expertBalanceAfter = await getBalance('testuser_setup_expert@irabi.test');
		expect(expertBalanceAfter).toBe(expertBalanceBefore);
	});

	test('exit: clean up', async () => {
		if (slotId) await deleteSlot(slotId);
	});
});
