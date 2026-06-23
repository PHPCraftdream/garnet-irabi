/**
 * User — BookingSM guards
 *
 * Tests conditions that BLOCK the (new) -> pending transition.
 *
 * Guards:
 *   G1. Slot not found (404)               -> BookingSM never created
 *   G2. Insufficient balance               -> BookingSM blocked, book-error shown
 *   G3. Slot already at capacity (full)    -> BookingSM blocked, book-error shown
 *
 * Entry conditions for each test are set up individually.
 * uid field is required in all time_slots INSERT statements.
 */

import { test, expect, tn } from '../helpers/scoped-test';
import mysql from 'mysql2/promise';
import { DB } from '../helpers/db';
test.describe.configure({ mode: 'serial' });

function generateUid(): string {
	return [...Array(16)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
}

async function getUserId(): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT id FROM ${tn('accounts')} WHERE login = 'testuser_setup_user@irabi.test'`
		);
		return rows[0]?.id ?? 0;
	} finally { await conn.end(); }
}

async function setUserBalance(amount: number) {
	const conn = await mysql.createConnection(DB);
	try {
		const userId = await getUserId();
		await conn.execute(
			`INSERT INTO ${tn('account_balance')} (account_id, balance, updated_at)
			 VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE balance = VALUES(balance), updated_at = VALUES(updated_at)`,
			[userId, amount, Math.floor(Date.now() / 1000)]
		);
	} finally { await conn.end(); }
}

async function createFullSlot(): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const [[expertRow]]: any = await conn.execute(
			`SELECT account_id FROM ${tn('expert_profiles')} WHERE is_approved = 1 LIMIT 1`
		);
		if (!expertRow) return 0;
		const expertId = expertRow.account_id;
		const startAt = Math.floor(Date.now() / 1000) + 86400 * 3 + 9 * 3600;

		const [result]: any = await conn.execute(
			`INSERT INTO ${tn('time_slots')}
			 (expert_id, start_at, end_at, duration_min, cost, is_online, location, max_users, status, uid, created_at)
			 VALUES (?, ?, ?, 60, 0, 1, 'https://meet.example.com/guard-test', 1, 'free', ?, ?)`,
			[expertId, startAt, startAt + 3600, generateUid(), Math.floor(Date.now() / 1000)]
		);
		const slotId: number = result.insertId;

		// Insert a booking to fill the slot
		const studentId = await getUserId();
		await conn.execute(
			`INSERT INTO ${tn('bookings')} (user_id, bookable_type, bookable_id, status, created_at)
			 VALUES (?, 'time_slot', ?, 'pending', ?)`,
			[studentId, slotId, Math.floor(Date.now() / 1000)]
		);
		// Mark slot as booked
		await conn.execute(`UPDATE ${tn('time_slots')} SET status = 'booked' WHERE id = ?`, [slotId]);
		return slotId;
	} finally { await conn.end(); }
}

async function createFreeExpensiveSlot(): Promise<{ id: number; cost: number }> {
	const conn = await mysql.createConnection(DB);
	try {
		const [[expertRow]]: any = await conn.execute(
			`SELECT account_id FROM ${tn('expert_profiles')} WHERE is_approved = 1 LIMIT 1`
		);
		const expertId = expertRow.account_id;
		const startAt = Math.floor(Date.now() / 1000) + 86400 * 4 + 10 * 3600;
		const cost = 999999;

		const [result]: any = await conn.execute(
			`INSERT INTO ${tn('time_slots')}
			 (expert_id, start_at, end_at, duration_min, cost, is_online, location, max_users, status, uid, created_at)
			 VALUES (?, ?, ?, 60, ?, 1, 'https://meet.example.com/expensive', 1, 'free', ?, ?)`,
			[expertId, startAt, startAt + 3600, cost, generateUid(), Math.floor(Date.now() / 1000)]
		);
		return { id: result.insertId, cost };
	} finally { await conn.end(); }
}

async function cleanup(slotIds: number[]) {
	const conn = await mysql.createConnection(DB);
	try {
		for (const id of slotIds) {
			await conn.execute(`DELETE FROM ${tn('bookings')} WHERE bookable_type='time_slot' AND bookable_id=?`, [id]);
			await conn.execute(`DELETE FROM ${tn('time_slots')} WHERE id=?`, [id]);
		}
	} finally { await conn.end(); }
}

// -- G1: Slot not found --

test.describe('G1: BookingSM guard -- slot not found (404)', () => {
	test('booking form for non-existent slot returns 404', async ({ page }) => {
		const resp = await page.goto('/system/bookings/id~999999999/~book');
		expect(resp?.status()).toBe(404);
	});
});

// -- G2: Insufficient balance --

test.describe('G2: BookingSM guard -- insufficient balance', () => {
	let expensiveSlotId = 0;

	test('entry: create expensive slot, set user balance to 0', async () => {
		const slot = await createFreeExpensiveSlot();
		expensiveSlotId = slot.id;
		await setUserBalance(0);
	});

	test('booking form is accessible (slot exists)', async ({ page }) => {
		if (!expensiveSlotId) { test.skip(); return; }
		const resp = await page.goto(`/system/bookings/id~${expensiveSlotId}/~book`);
		expect(resp?.status()).toBe(200);
		await expect(page.locator('[data-test-id="book-btn"]')).toBeVisible({ timeout: 8000 });
	});

	test('clicking book shows insufficient balance error', async ({ page }) => {
		if (!expensiveSlotId) { test.skip(); return; }

		await page.goto(`/system/bookings/id~${expensiveSlotId}/~book`);

		const bookBtn = page.locator('[data-test-id="book-btn"]');
		await expect(bookBtn).toBeVisible({ timeout: 8000 });
		await bookBtn.click();

		// Error message appears inline -- no redirect
		await expect(page.locator('[data-test-id="book-error"]')).toBeVisible({ timeout: 8000 });
		// Still on the booking form page (not redirected to /bookings)
		expect(page.url()).toContain(`/bookings/id~${expensiveSlotId}`);
	});

	test('BookingSM: no pending booking was created', async () => {
		if (!expensiveSlotId) { test.skip(); return; }
		const conn = await mysql.createConnection(DB);
		try {
			const [rows] = await conn.execute<any[]>(
				`SELECT id FROM ${tn('bookings')}
				 WHERE bookable_type='time_slot' AND bookable_id=? AND status='pending'`,
				[expensiveSlotId]
			);
			expect(rows.length).toBe(0);
		} finally { await conn.end(); }
	});

	test('exit: restore user balance, clean up slot', async () => {
		const userId = await getUserId();
		const conn = await mysql.createConnection(DB);
		try {
			await conn.execute(
				`INSERT INTO ${tn('account_balance')} (account_id, balance, updated_at)
				 VALUES (?, 10000, ?) ON DUPLICATE KEY UPDATE balance = VALUES(balance), updated_at = VALUES(updated_at)`,
				[userId, Math.floor(Date.now() / 1000)]
			);
		} finally { await conn.end(); }
		if (expensiveSlotId) await cleanup([expensiveSlotId]);
	});
});

// -- G3: Slot already full --

test.describe('G3: BookingSM guard -- slot at capacity (status=booked)', () => {
	let fullSlotId = 0;

	test('entry: create slot at capacity (status=booked)', async () => {
		fullSlotId = await createFullSlot();
		expect(fullSlotId).toBeGreaterThan(0);
	});

	test('booking form for booked slot is accessible', async ({ page }) => {
		if (!fullSlotId) { test.skip(); return; }
		const resp = await page.goto(`/system/bookings/id~${fullSlotId}/~book`);
		expect(resp?.status()).toBe(200);
	});

	test('clicking book on full slot shows error', async ({ page }) => {
		if (!fullSlotId) { test.skip(); return; }

		await page.goto(`/system/bookings/id~${fullSlotId}/~book`);

		const bookBtn = page.locator('[data-test-id="book-btn"]');
		await expect(bookBtn).toBeVisible({ timeout: 8000 });
		await bookBtn.click();

		// Error is shown -- slot is full
		await expect(page.locator('[data-test-id="book-error"]')).toBeVisible({ timeout: 8000 });
		expect(page.url()).toContain(`/bookings/id~${fullSlotId}`);
	});

	test('exit: clean up full slot', async () => {
		if (fullSlotId) await cleanup([fullSlotId]);
	});
});
