/**
 * Moderator — cascade-cancel future bookings on expert deactivation.
 *
 * Audit C-1: revoking (IS_APPROVED 1→0) or blocking (IS_DISABLED→1) an expert
 * must cancel their future paid bookings, fully refund affected users, and email
 * them — otherwise a user who paid shows up to a session that will never happen,
 * with no refund and no notification.
 *
 * Also covers audit C-2: a partially-booked multi-slot may still have
 * status='free' while holding active bookings — the cascade must catch it too.
 *
 * State machine: BookingSM × BalanceSM × TimeSlotSM × EmailQueueSM
 *
 * Entry: moderator authenticated; approved seed expert owns a future paid slot
 *        that a user has booked (pending / confirmed / partial).
 * Cycle (per flag toggle):
 *   BookingSM:       pending|confirmed → cancelled
 *   BalanceSM(User):   balance += slotCost (full refund credit)
 *   BalanceSM(Expert): balance -= slotCost (refund debit)
 *   TimeSlotSM:        free|booked → cancelled
 *   EmailQueueSM:      +1 row to user (bookingCancelled)
 * Exit: test slot/booking/ledger/email rows cleaned up; expert flags restored.
 */

import { test, expect, tn } from '../helpers/scoped-test';
import mysql from 'mysql2/promise';
import { DB } from '../helpers/db';

test.describe.configure({ mode: 'serial' });

const EXPERT_LOGIN = 'testuser_setup_expert@irabi.test';
const USER_LOGIN = 'testuser_setup_user@irabi.test';
const SLOT_COST = 400;

// Force max page-size — admin grid defaults to 10/page, but the seed expert may
// sit beyond row 10 by id and the flag button wouldn't render there.
test.beforeEach(async ({ page }) => {
	await page.addInitScript(() => {
		try { localStorage.setItem('garnet.pageSize', '100'); } catch {}
	});
});

// ── DB helpers ─────────────────────────────────────────────────────────────────

async function getAccountId(login: string): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT id FROM ${tn('accounts')} WHERE login = ?`, [login]
		);
		return Number(rows[0]?.id ?? 0);
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

async function createPaidSlot(expertId: number, cost: number, maxUsers: number): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const startAt = Math.floor(Date.now() / 1000) + 86400 * 7;
		const uid = [...Array(16)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
		const [result]: any = await conn.execute(
			`INSERT INTO ${tn('time_slots')}
			 (expert_id, start_at, end_at, duration_min, cost, is_online, location, max_users, booked_count, status, uid, created_at)
			 VALUES (?, ?, ?, 60, ?, 1, 'https://meet.example.com/cascade-test', ?, 0, 'free', ?, ?)`,
			[expertId, startAt, startAt + 3600, cost, maxUsers, uid, Math.floor(Date.now() / 1000)]
		);
		return Number(result.insertId);
	} finally { await conn.end(); }
}

/**
 * Insert a booking row directly and bump the slot's booked_count. The caller
 * decides whether the slot should flip to 'booked' (single-seat) or stay 'free'
 * (partially-booked multi-seat, audit C-2) via `slotBecomesBooked`.
 */
async function insertBooking(slotId: number, userId: number, status: string, slotBecomesBooked: boolean): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const now = Math.floor(Date.now() / 1000);
		const [result]: any = await conn.execute(
			`INSERT INTO ${tn('bookings')} (user_id, bookable_type, bookable_id, status, created_at)
			 VALUES (?, 'time_slot', ?, ?, ?)`,
			[userId, slotId, status, now]
		);
		await conn.execute(
			`UPDATE ${tn('time_slots')} SET booked_count = booked_count + 1, status = ? WHERE id = ?`,
			[slotBecomesBooked ? 'booked' : 'free', slotId]
		);
		return Number(result.insertId);
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

async function emailQueueMaxId(login: string): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT COALESCE(MAX(id), 0) AS maxId FROM ${tn('email_queue')} WHERE recipient_email = ?`,
			[login]
		);
		return Number(rows[0]?.maxId ?? 0);
	} finally { await conn.end(); }
}

async function setBookingsPref(accountId: number, freq: string): Promise<void> {
	const conn = await mysql.createConnection(DB);
	try {
		const value = JSON.stringify({ bookings: freq, messages: 'each', support: 'each' });
		await conn.execute(
			`INSERT INTO ${tn('accounts_data')} (account_id, param, value)
			 VALUES (?, 'email_notif_prefs', ?)
			 ON DUPLICATE KEY UPDATE value = VALUES(value)`,
			[accountId, value]
		);
	} finally { await conn.end(); }
}

async function restoreExpertFlags(expertId: number): Promise<void> {
	const conn = await mysql.createConnection(DB);
	try {
		// IS_APPROVED = 1, IS_DISABLED unset (0).
		await conn.execute(
			`INSERT INTO ${tn('accounts_data')} (account_id, param, value)
			 VALUES (?, 'IS_APPROVED', '1')
			 ON DUPLICATE KEY UPDATE value = '1'`,
			[expertId]
		);
		await conn.execute(
			`DELETE FROM ${tn('accounts_data')} WHERE account_id = ? AND param = 'IS_DISABLED'`,
			[expertId]
		);
		await conn.execute(
			`UPDATE ${tn('expert_profiles')} SET is_approved = 1 WHERE account_id = ?`,
			[expertId]
		);
	} finally { await conn.end(); }
}

async function clickFlagAndWait(page: import('@playwright/test').Page, flagName: string, userId: number): Promise<void> {
	await page.goto('/admin/');
	await page.waitForSelector('table', { timeout: 12000 });
	const btn = page.locator(`[data-test-id="flag-${flagName}-${userId}"]`);
	await expect(btn).toBeVisible({ timeout: 8000 });
	await Promise.all([
		page.waitForResponse(r => r.request().method() === 'POST' && r.status() < 500, { timeout: 10000 }),
		btn.click(),
	]);
}

/** Poll an async getter until predicate holds (cascade writes settle post-response). */
async function pollUntil<T>(fn: () => Promise<T>, predicate: (v: T) => boolean, attempts = 20, delayMs = 50): Promise<T> {
	let v: T;
	for (let i = 0; i < attempts; i++) {
		v = await fn();
		if (predicate(v)) return v;
		await new Promise(r => setTimeout(r, delayMs));
	}
	return await fn();
}

/**
 * Surgical cleanup of everything the cascade (and our setup) created, restoring
 * the seed accounts to their pre-test balance so sibling specs in this worker
 * aren't poisoned. The refund was the only ledger delta (DB-only booking setup
 * moves no money), so deleting those rows + restoring the recorded balances is
 * an exact undo.
 */
async function cleanupTest(opts: {
	slotId: number;
	bookingIds: number[];
	userLogin: string;
	userBalanceBefore: number;
	expertId: number;
	expertBalanceBefore: number;
	emailIdBefore: number;
}): Promise<void> {
	const conn = await mysql.createConnection(DB);
	try {
		const now = Math.floor(Date.now() / 1000);
		if (opts.bookingIds.length) {
			const ph = opts.bookingIds.map(() => '?').join(',');
			// Remove the refund ledger entries the cascade wrote.
			await conn.execute(
				`DELETE FROM ${tn('balance_ledger')} WHERE ref_type = 'booking' AND ref_id IN (${ph})`,
				opts.bookingIds
			);
			// Audit rows the cascade wrote.
			await conn.execute(
				`DELETE FROM ${tn('expert_cancellations')} WHERE booking_id IN (${ph})`,
				opts.bookingIds
			);
			await conn.execute(
				`DELETE FROM ${tn('bookings')} WHERE id IN (${ph})`,
				opts.bookingIds
			);
		}
		if (opts.slotId) {
			await conn.execute(`DELETE FROM ${tn('time_slots')} WHERE id = ?`, [opts.slotId]);
		}
		// Restore the recorded balances (undo the refund credit/debit).
		const userId = await getAccountId(opts.userLogin);
		for (const [accId, bal] of [[userId, opts.userBalanceBefore], [opts.expertId, opts.expertBalanceBefore]] as const) {
			await conn.execute(
				`INSERT INTO ${tn('account_balance')} (account_id, balance, updated_at)
				 VALUES (?, ?, ?)
				 ON DUPLICATE KEY UPDATE balance = VALUES(balance), updated_at = VALUES(updated_at)`,
				[accId, bal, now]
			);
		}
		// Remove only the emails this test produced (id > watermark).
		await conn.execute(
			`DELETE FROM ${tn('email_queue')} WHERE recipient_email = ? AND id > ?`,
			[opts.userLogin, opts.emailIdBefore]
		);
		// Always leave the seed expert approved + enabled for the next spec.
		await restoreExpertFlags(opts.expertId);
	} finally { await conn.end(); }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('C-1: IS_DISABLED=1 cancels a pending paid booking + refund + email', () => {
	let expertId = 0;
	let userId = 0;
	let slotId = 0;
	let bookingId = 0;
	let userBalanceBefore = 0;
	let expertBalanceBefore = 0;
	let emailIdBefore = 0;

	test('entry: seed slot + pending booking', async () => {
		expertId = await getAccountId(EXPERT_LOGIN);
		userId = await getAccountId(USER_LOGIN);
		expect(expertId).toBeGreaterThan(0);
		expect(userId).toBeGreaterThan(0);

		await restoreExpertFlags(expertId);
		await setBookingsPref(userId, 'each');

		userBalanceBefore = await getBalance(USER_LOGIN);
		expertBalanceBefore = await getBalance(EXPERT_LOGIN);
		emailIdBefore = await emailQueueMaxId(USER_LOGIN);

		slotId = await createPaidSlot(expertId, SLOT_COST, 1);
		bookingId = await insertBooking(slotId, userId, 'pending', true);

		expect(await getSlotStatus(slotId)).toBe('booked');
		expect(await getBookingStatus(bookingId)).toBe('pending');
	});

	test('moderator disables expert', async ({ page }) => {
		test.skip(!slotId, 'setup failed');
		await clickFlagAndWait(page, 'IS_DISABLED', expertId);
	});

	test('BookingSM: booking → cancelled', async () => {
		test.skip(!bookingId, 'setup failed');
		const status = await pollUntil(() => getBookingStatus(bookingId), s => s === 'cancelled');
		expect(status).toBe('cancelled');
	});

	test('TimeSlotSM: slot → cancelled', async () => {
		test.skip(!slotId, 'setup failed');
		const status = await pollUntil(() => getSlotStatus(slotId), s => s === 'cancelled');
		expect(status).toBe('cancelled');
	});

	test('BalanceSM: user credited full refund', async () => {
		test.skip(!bookingId, 'setup failed');
		const after = await pollUntil(() => getBalance(USER_LOGIN), b => b === userBalanceBefore + SLOT_COST);
		expect(after).toBe(userBalanceBefore + SLOT_COST);
	});

	test('BalanceSM: expert debited refund', async () => {
		test.skip(!bookingId, 'setup failed');
		const after = await pollUntil(() => getBalance(EXPERT_LOGIN), b => b === expertBalanceBefore - SLOT_COST);
		expect(after).toBe(expertBalanceBefore - SLOT_COST);
	});

	test('EmailQueueSM: user notified', async () => {
		test.skip(!bookingId, 'setup failed');
		const maxId = await pollUntil(() => emailQueueMaxId(USER_LOGIN), m => m > emailIdBefore);
		expect(maxId).toBeGreaterThan(emailIdBefore);
	});

	test('exit: cleanup', async () => {
		await cleanupTest({
			slotId, bookingIds: bookingId ? [bookingId] : [],
			userLogin: USER_LOGIN, userBalanceBefore,
			expertId, expertBalanceBefore, emailIdBefore,
		});
	});
});

test.describe('C-1: IS_APPROVED 1→0 cancels a confirmed paid booking + refund + email', () => {
	let expertId = 0;
	let userId = 0;
	let slotId = 0;
	let bookingId = 0;
	let userBalanceBefore = 0;
	let expertBalanceBefore = 0;
	let emailIdBefore = 0;

	test('entry: seed slot + confirmed booking', async () => {
		expertId = await getAccountId(EXPERT_LOGIN);
		userId = await getAccountId(USER_LOGIN);
		expect(expertId).toBeGreaterThan(0);
		expect(userId).toBeGreaterThan(0);

		await restoreExpertFlags(expertId);
		await setBookingsPref(userId, 'each');

		userBalanceBefore = await getBalance(USER_LOGIN);
		expertBalanceBefore = await getBalance(EXPERT_LOGIN);
		emailIdBefore = await emailQueueMaxId(USER_LOGIN);

		slotId = await createPaidSlot(expertId, SLOT_COST, 1);
		bookingId = await insertBooking(slotId, userId, 'confirmed', true);

		expect(await getBookingStatus(bookingId)).toBe('confirmed');
	});

	test('moderator revokes expert approval', async ({ page }) => {
		test.skip(!slotId, 'setup failed');
		await clickFlagAndWait(page, 'IS_APPROVED', expertId);
	});

	test('BookingSM: confirmed booking → cancelled', async () => {
		test.skip(!bookingId, 'setup failed');
		const status = await pollUntil(() => getBookingStatus(bookingId), s => s === 'cancelled');
		expect(status).toBe('cancelled');
	});

	test('TimeSlotSM: slot → cancelled', async () => {
		test.skip(!slotId, 'setup failed');
		const status = await pollUntil(() => getSlotStatus(slotId), s => s === 'cancelled');
		expect(status).toBe('cancelled');
	});

	test('BalanceSM: user credited full refund', async () => {
		test.skip(!bookingId, 'setup failed');
		const after = await pollUntil(() => getBalance(USER_LOGIN), b => b === userBalanceBefore + SLOT_COST);
		expect(after).toBe(userBalanceBefore + SLOT_COST);
	});

	test('BalanceSM: expert debited refund', async () => {
		test.skip(!bookingId, 'setup failed');
		const after = await pollUntil(() => getBalance(EXPERT_LOGIN), b => b === expertBalanceBefore - SLOT_COST);
		expect(after).toBe(expertBalanceBefore - SLOT_COST);
	});

	test('EmailQueueSM: user notified', async () => {
		test.skip(!bookingId, 'setup failed');
		const maxId = await pollUntil(() => emailQueueMaxId(USER_LOGIN), m => m > emailIdBefore);
		expect(maxId).toBeGreaterThan(emailIdBefore);
	});

	test('exit: cleanup', async () => {
		await cleanupTest({
			slotId, bookingIds: bookingId ? [bookingId] : [],
			userLogin: USER_LOGIN, userBalanceBefore,
			expertId, expertBalanceBefore, emailIdBefore,
		});
	});
});

test.describe('C-2: IS_DISABLED=1 cancels a partially-booked multi-slot (status=free)', () => {
	let expertId = 0;
	let userId = 0;
	let slotId = 0;
	let bookingId = 0;
	let userBalanceBefore = 0;
	let expertBalanceBefore = 0;
	let emailIdBefore = 0;

	test('entry: seed multi-seat slot (max_users=3) + 1 booking, slot stays free', async () => {
		expertId = await getAccountId(EXPERT_LOGIN);
		userId = await getAccountId(USER_LOGIN);
		expect(expertId).toBeGreaterThan(0);
		expect(userId).toBeGreaterThan(0);

		await restoreExpertFlags(expertId);
		await setBookingsPref(userId, 'each');

		userBalanceBefore = await getBalance(USER_LOGIN);
		expertBalanceBefore = await getBalance(EXPERT_LOGIN);
		emailIdBefore = await emailQueueMaxId(USER_LOGIN);

		slotId = await createPaidSlot(expertId, SLOT_COST, 3);
		bookingId = await insertBooking(slotId, userId, 'pending', false);

		// The crux of audit C-2: an active booking exists on a slot whose status
		// is still 'free' (1 of 3 seats taken). The cascade must still catch it.
		expect(await getSlotStatus(slotId)).toBe('free');
		expect(await getBookingStatus(bookingId)).toBe('pending');
	});

	test('moderator disables expert', async ({ page }) => {
		test.skip(!slotId, 'setup failed');
		await clickFlagAndWait(page, 'IS_DISABLED', expertId);
	});

	test('BookingSM: booking on free slot → cancelled', async () => {
		test.skip(!bookingId, 'setup failed');
		const status = await pollUntil(() => getBookingStatus(bookingId), s => s === 'cancelled');
		expect(status).toBe('cancelled');
	});

	test('TimeSlotSM: partially-booked free slot → cancelled', async () => {
		test.skip(!slotId, 'setup failed');
		const status = await pollUntil(() => getSlotStatus(slotId), s => s === 'cancelled');
		expect(status).toBe('cancelled');
	});

	test('BalanceSM: user credited full refund', async () => {
		test.skip(!bookingId, 'setup failed');
		const after = await pollUntil(() => getBalance(USER_LOGIN), b => b === userBalanceBefore + SLOT_COST);
		expect(after).toBe(userBalanceBefore + SLOT_COST);
	});

	test('EmailQueueSM: user notified', async () => {
		test.skip(!bookingId, 'setup failed');
		const maxId = await pollUntil(() => emailQueueMaxId(USER_LOGIN), m => m > emailIdBefore);
		expect(maxId).toBeGreaterThan(emailIdBefore);
	});

	test('exit: cleanup', async () => {
		await cleanupTest({
			slotId, bookingIds: bookingId ? [bookingId] : [],
			userLogin: USER_LOGIN, userBalanceBefore,
			expertId, expertBalanceBefore, emailIdBefore,
		});
	});
});
