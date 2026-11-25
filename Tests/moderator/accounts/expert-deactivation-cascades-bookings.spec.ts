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

import { test, expect, tn } from '../../helpers/scoped-test';
import mysql from 'mysql2/promise';
import { DB } from '../../helpers/db/db';
import {
	getAccountId, resyncBalanceFromLedger, bookingLedgerNet, balanceDriftFromLedger, createPaidSlot,
	insertBooking, getBookingStatus, getSlotStatus, emailQueueMaxId, setBookingsPref, restoreExpertFlags,
} from '../../helpers/db/cascade-fixtures';

import { searchAdminGrid } from '../../helpers/ui/admin-grid';
import { createDiagnostics } from '../../helpers/guards/failure-diagnostics';
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

async function clickFlagAndWait(page: import('@playwright/test').Page, flagName: string, userId: number, login: string = EXPERT_LOGIN): Promise<void> {
	await page.goto('/admin/');
	await page.waitForSelector('table', { timeout: 12000 });
	await searchAdminGrid(page, login);
	const btn = page.locator(`[data-test-id="flag-${flagName}-${userId}"]`);
	await expect(btn).toBeVisible({ timeout: 8000 });
	await Promise.all([
		page.waitForResponse(r => r.request().method() === 'POST' && r.status() < 500, { timeout: 10000 }),
		btn.click(),
	]);
}

/** Poll an async getter until predicate holds (cascade writes settle post-response). */
async function pollUntil<T>(fn: () => Promise<T>, predicate: (v: T) => boolean, attempts = 150, delayMs = 100): Promise<T> {
	const startedAt = performance.now();
	for (let i = 0; i < attempts; i++) {
		const v = await fn();
		if (predicate(v)) {
			diag.note('poll settled', { attempt: i + 1, waitedMs: Math.round(performance.now() - startedAt), value: v });
			return v;
		}
		await new Promise(r => setTimeout(r, delayMs));
	}
	const last = await fn();
	diag.note('poll gave up', { attempts, waitedMs: Math.round(performance.now() - startedAt), value: last });
	return last;
}

// The cascade writes settle after the HTTP response, so the wait is bounded by time (15 s),
// not by a handful of tries; on a failure the report says how long the poll really waited
// and what the balances and ledger held.
const diag = createDiagnostics(async () => {
	const conn = await mysql.createConnection(DB);
	try {
		const since = Math.floor(Date.now() / 1000) - 900;
		const [balances] = await conn.execute<any[]>(
			`SELECT a.login, ab.balance FROM ${tn('account_balance')} ab
			 JOIN ${tn('accounts')} a ON a.id = ab.account_id WHERE a.login IN (?, ?)`,
			[USER_LOGIN, EXPERT_LOGIN],
		);
		const [ledger] = await conn.execute<any[]>(
			`SELECT a.login, l.is_credit, l.amount, l.entry_type, l.ref_id, l.created_at
			 FROM ${tn('balance_ledger')} l JOIN ${tn('accounts')} a ON a.id = l.account_id
			 WHERE a.login IN (?, ?) AND l.created_at >= ? ORDER BY l.id DESC LIMIT 20`,
			[USER_LOGIN, EXPERT_LOGIN, since],
		);
		const [bookings] = await conn.execute<any[]>(
			`SELECT id, status, bookable_id FROM ${tn('bookings')} ORDER BY id DESC LIMIT 3`,
		);
		return { balances, ledger, bookings };
	} finally { await conn.end(); }
});

test.beforeEach(() => diag.reset());
test.afterEach(async ({}, testInfo) => { await diag.report(testInfo); });

/**
 * Surgical cleanup of everything the cascade (and our setup) created, so sibling specs in this
 * worker aren't poisoned. The refund of our booking is the only ledger delta that is ours
 * (DB-only booking setup moves no money): delete those rows and rebuild both cached balances
 * from the ledger, which also keeps the refunds of any foreign booking the cascade cancelled.
 */
async function cleanupTest(opts: {
	slotId: number;
	bookingIds: number[];
	userLogin: string;
	expertId: number;
	emailIdBefore: number;
}): Promise<void> {
	const conn = await mysql.createConnection(DB);
	try {
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
		await resyncBalanceFromLedger(await getAccountId(opts.userLogin));
		await resyncBalanceFromLedger(opts.expertId);
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
	let emailIdBefore = 0;

	// beforeAll/afterAll (not plain tests) — serial mode skips every
	// subsequent test once one fails, so a cleanup step written as a
	// regular test never runs after a mid-flow assertion fails. This
	// spec's entry disables/demotes the shared testuser_setup_expert
	// fixture via the admin UI, so a skipped cleanup leaves it disabled
	// for the rest of this worker's run, poisoning unrelated later
	// specs (confirmed live in this session — see live-counts.spec.ts).
	// Hooks run regardless of test outcome.
	test.beforeAll(async () => {
		expertId = await getAccountId(EXPERT_LOGIN);
		userId = await getAccountId(USER_LOGIN);
		expect(expertId).toBeGreaterThan(0);
		expect(userId).toBeGreaterThan(0);

		await restoreExpertFlags(expertId);
		await setBookingsPref(userId, 'each');

		await resyncBalanceFromLedger(userId);
		await resyncBalanceFromLedger(expertId);
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
		const net = await pollUntil(() => bookingLedgerNet(USER_LOGIN, bookingId), n => n === SLOT_COST);
		expect(net).toBe(SLOT_COST);
		expect(await balanceDriftFromLedger(USER_LOGIN)).toBe(0);
	});

	test('BalanceSM: expert debited refund', async () => {
		test.skip(!bookingId, 'setup failed');
		const net = await pollUntil(() => bookingLedgerNet(EXPERT_LOGIN, bookingId), n => n === -SLOT_COST);
		expect(net).toBe(-SLOT_COST);
		expect(await balanceDriftFromLedger(EXPERT_LOGIN)).toBe(0);
	});

	test('EmailQueueSM: user notified', async () => {
		test.skip(!bookingId, 'setup failed');
		const maxId = await pollUntil(() => emailQueueMaxId(USER_LOGIN), m => m > emailIdBefore);
		expect(maxId).toBeGreaterThan(emailIdBefore);
	});

	test.afterAll(async () => {
		await cleanupTest({
			slotId, bookingIds: bookingId ? [bookingId] : [],
			userLogin: USER_LOGIN, expertId, emailIdBefore,
		});
	});
});

test.describe('C-1: IS_APPROVED 1→0 cancels a confirmed paid booking + refund + email', () => {
	let expertId = 0;
	let userId = 0;
	let slotId = 0;
	let bookingId = 0;
	let emailIdBefore = 0;

	test.beforeAll(async () => {
		expertId = await getAccountId(EXPERT_LOGIN);
		userId = await getAccountId(USER_LOGIN);
		expect(expertId).toBeGreaterThan(0);
		expect(userId).toBeGreaterThan(0);

		await restoreExpertFlags(expertId);
		await setBookingsPref(userId, 'each');

		await resyncBalanceFromLedger(userId);
		await resyncBalanceFromLedger(expertId);
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
		const net = await pollUntil(() => bookingLedgerNet(USER_LOGIN, bookingId), n => n === SLOT_COST);
		expect(net).toBe(SLOT_COST);
		expect(await balanceDriftFromLedger(USER_LOGIN)).toBe(0);
	});

	test('BalanceSM: expert debited refund', async () => {
		test.skip(!bookingId, 'setup failed');
		const net = await pollUntil(() => bookingLedgerNet(EXPERT_LOGIN, bookingId), n => n === -SLOT_COST);
		expect(net).toBe(-SLOT_COST);
		expect(await balanceDriftFromLedger(EXPERT_LOGIN)).toBe(0);
	});

	test('EmailQueueSM: user notified', async () => {
		test.skip(!bookingId, 'setup failed');
		const maxId = await pollUntil(() => emailQueueMaxId(USER_LOGIN), m => m > emailIdBefore);
		expect(maxId).toBeGreaterThan(emailIdBefore);
	});

	test.afterAll(async () => {
		await cleanupTest({
			slotId, bookingIds: bookingId ? [bookingId] : [],
			userLogin: USER_LOGIN, expertId, emailIdBefore,
		});
	});
});

test.describe('C-2: IS_DISABLED=1 cancels a partially-booked multi-slot (status=free)', () => {
	let expertId = 0;
	let userId = 0;
	let slotId = 0;
	let bookingId = 0;
	let emailIdBefore = 0;

	test.beforeAll(async () => {
		expertId = await getAccountId(EXPERT_LOGIN);
		userId = await getAccountId(USER_LOGIN);
		expect(expertId).toBeGreaterThan(0);
		expect(userId).toBeGreaterThan(0);

		await restoreExpertFlags(expertId);
		await setBookingsPref(userId, 'each');

		await resyncBalanceFromLedger(userId);
		await resyncBalanceFromLedger(expertId);
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
		const net = await pollUntil(() => bookingLedgerNet(USER_LOGIN, bookingId), n => n === SLOT_COST);
		expect(net).toBe(SLOT_COST);
		expect(await balanceDriftFromLedger(USER_LOGIN)).toBe(0);
	});

	test('EmailQueueSM: user notified', async () => {
		test.skip(!bookingId, 'setup failed');
		const maxId = await pollUntil(() => emailQueueMaxId(USER_LOGIN), m => m > emailIdBefore);
		expect(maxId).toBeGreaterThan(emailIdBefore);
	});

	test.afterAll(async () => {
		await cleanupTest({
			slotId, bookingIds: bookingId ? [bookingId] : [],
			userLogin: USER_LOGIN, expertId, emailIdBefore,
		});
	});
});
