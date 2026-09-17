/**
 * D-171 [MAJOR/P0]: clicking "Отменить бронь" fired 5 identical
 * `/bookings/id~{id}/~cancel` requests instead of 1. Root cause was in
 * `useSending` (garnet-framework Bundle/Front/Common/hooks/useSending.ts):
 * the `sending` guard was React state, which lags behind rapid repeated
 * invocations of the same handler within one browser tick — several
 * clicks landed before the first `setSending(true)` had actually
 * committed, so every one of them passed the `if (sending) return;`
 * check. Fixed with a synchronous `useRef` guard checked before any
 * state update.
 *
 * This spec reproduces the collision directly: several synchronous
 * DOM `click()` calls on the cancel-modal submit button (bypassing
 * Playwright's own actionability throttling, which would otherwise
 * serialize the clicks and hide the race) must still result in exactly
 * one network request and exactly one `booking_refund` ledger entry —
 * not five.
 */
import { test, expect, tn } from '../../../helpers/scoped-test';
import mysql from 'mysql2/promise';
import { DB } from '../../../helpers/db/db';
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
			 VALUES (?, ?, ?, 60, ?, 1, 'https://meet.example.com/d171-test', 1, 'free', ?, ?)`,
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
			 VALUES (?, 1, ?, 'top_up', '', 0, 'D-171 regression top-up', UNIX_TIMESTAMP())`,
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
			`DELETE FROM ${tn('balance_ledger')} WHERE account_id = ? AND note = 'D-171 regression top-up' ORDER BY id DESC LIMIT 1`,
			[userId]
		);
		await conn.execute(
			`UPDATE ${tn('account_balance')} SET balance = balance - ?, updated_at = UNIX_TIMESTAMP() WHERE account_id = ?`,
			[amount, userId]
		);
	} finally { await conn.end(); }
}

// Scoped to one account: a single successful cancel legitimately writes
// TWO booking_refund rows (a credit to the student, a debit to the
// expert) — see booking-penalty-cancel.spec.ts. Counting unscoped would
// read a correct double-entry cancel as "duplicated".
async function getRefundCount(accountId: number, bookingId: number): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT COUNT(*) AS cnt FROM ${tn('balance_ledger')}
			 WHERE account_id = ? AND ref_type = 'booking' AND ref_id = ? AND entry_type = 'booking_refund'`,
			[accountId, bookingId]
		);
		return Number(rows[0]?.cnt ?? 0);
	} finally { await conn.end(); }
}

async function getUserAccountId(): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT id FROM ${tn('accounts')} WHERE login = 'testuser_setup_user@irabi.test'`
		);
		return rows[0]?.id ?? 0;
	} finally { await conn.end(); }
}

test.describe('D-171: rapid clicks on the cancel-modal submit fire exactly one request', () => {
	const SLOT_COST = 250;
	let slotId = 0;
	let bookingId = 0;
	let balanceBefore = 0;
	let toppedUp = 0;

	test.beforeAll(async () => {
		slotId = await createTestSlot(SLOT_COST);
		expect(slotId).toBeGreaterThan(0);
		toppedUp = await ensureBalance(SLOT_COST + 500);
		balanceBefore = await getUserBalance();
		expect(balanceBefore).toBeGreaterThanOrEqual(SLOT_COST);
	});

	test.afterAll(async () => {
		if (slotId) await deleteTestSlot(slotId);
		await reverseTopUp(toppedUp);
	});

	test('book the slot via UI', async ({ page }) => {
		if (!slotId) { test.skip(); return; }
		await page.goto(`/system/bookings/id~${slotId}/~book`);
		const bookBtn = page.locator('[data-test-id="book-btn"]');
		await expect(bookBtn).toBeVisible({ timeout: 8000 });
		await Promise.all([
			page.waitForURL(url => url.pathname === '/system/bookings' || url.pathname === '/bookings', { timeout: 10000 }),
			bookBtn.click(),
		]);

		const cards = page.locator('[data-test-id^="booking-card-"]');
		await expect(cards.first()).toBeVisible({ timeout: 8000 });
		const cardTestId = await cards.first().getAttribute('data-test-id');
		bookingId = parseInt(cardTestId?.replace('booking-card-', '') ?? '0', 10);
		expect(bookingId).toBeGreaterThan(0);
	});

	test('firing 5 synchronous clicks on the submit button sends exactly 1 cancel request', async ({ page }) => {
		if (!bookingId) { test.skip(); return; }

		await page.goto('/system/bookings');
		const cancelBtn = page.locator(`[data-test-id="cancel-btn-${bookingId}"]`);
		await expect(cancelBtn).toBeVisible({ timeout: 8000 });
		await cancelBtn.click();

		const cancelModal = page.locator('[data-test-id="user-cancel-modal"]');
		await expect(cancelModal).toBeVisible({ timeout: 5000 });

		const reasonTextarea = page.locator('[data-test-id="user-cancel-modal-reason"]');
		await reasonTextarea.fill('D-171 regression: duplicate-click guard');

		const cancelRequests: string[] = [];
		page.on('request', (req) => {
			if (req.method() === 'POST' && req.url().includes(`/bookings/id~${bookingId}/~cancel`)) {
				cancelRequests.push(req.url());
			}
		});

		const submitBtn = page.locator('[data-test-id="user-cancel-modal-submit"]');
		await expect(submitBtn).toBeVisible();

		// Dispatch 5 synchronous DOM clicks in one JS tick — this is the
		// exact repro: multiple invocations of the handler land before
		// React has committed the first `setSending(true)`, so a
		// state-only guard lets every one of them through. Playwright's
		// own `.click()` would serialize + wait for actionability between
		// calls and never reproduce the race, hence the raw DOM dispatch.
		await submitBtn.evaluate((el: HTMLElement) => {
			for (let i = 0; i < 5; i++) el.click();
		});

		// Let all requests that are going to fire actually land before
		// counting them.
		await expect(cancelModal).not.toBeVisible({ timeout: 10000 });
		await page.waitForTimeout(1000);

		expect(cancelRequests.length).toBe(1);
		const userId = await getUserAccountId();
		expect(await getRefundCount(userId, bookingId)).toBe(1);

		const balanceAfter = await getUserBalance();
		expect(balanceAfter).toBe(balanceBefore);
	});
});
