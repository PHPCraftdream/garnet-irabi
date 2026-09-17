/**
 * Крон завершения: осиротевшая подтверждённая бронь закрывается, слот
 * тоже переходит в «завершён» (D-144), а бронь в ожидании получает запись
 * в истории снятий (D-146) — без неё счётчики профиля этого исхода не
 * видели вовсе.
 *
 * Часть разобранного booking-time-guards.spec.ts (был один файл на
 * 1259 строк). Последовательный режим сохранён: проверки внутри
 * опираются на состояние, оставленное предыдущей.
 */

import { test, expect, tn, getDbPrefix } from '../../helpers/scoped-test';
import { DB } from '../../helpers/db';
import mysql from 'mysql2/promise';
import { runServerCommand } from '../../helpers/server-command';
import type { BrowserContext, Page } from '@playwright/test';
import {
    cleanupSlot,
    devLogin,
    emailQueueMaxId,
    ensureBalance,
    getAccountId,
    getBalance,
    getBookingStatus,
    getSlotStatus,
    getUserCancellationKind,
    postBookingCancel,
    recalcBalance,
    seedBooking,
    seedSlot,
} from './helpers';

test.describe.configure({ mode: 'serial' });

test.describe('Fix 7: cron complete-expired completes orphan confirmed booking; user cannot cancel afterwards', () => {
	let userId = 0;
	let expertId = 0;

	// Target: past free-slot (group, under-subscribed) with confirmed booking → must become completed
	let targetSlotId = 0;
	let targetBookingId = 0;

	// Control (a): future free-slot with confirmed booking → must stay confirmed
	let futureSlotId = 0;
	let futureBookingId = 0;

	// Control (b): past free-slot with PENDING booking → auto-cancelled with full refund
	let pastPendingSlotId = 0;
	let pastPendingBookingId = 0;

	// D-183: slots with NO bookings at all. The past one was the case nobody
	// handled — it stayed 'free' forever, counted by the expert's status filter
	// while the calendar window never showed it. The future one is the control
	// that keeps the sweep time-scoped.
	let emptyPastSlotId = 0;
	let emptyFutureSlotId = 0;

	// D-204: a FULL slot (status='booked') whose every seat was held by a
	// request the expert never answered. The first cron branch closes it before
	// the third branch declines those requests, so it used to end the pass
	// labelled the same as a lesson that actually happened.
	let fullPendingSlotId = 0;
	let fullPendingBookingId = 0;


	// Balances + email-queue watermark captured before the cron runs, so the
	// refund + notification assertions can compare against a known baseline.
	const PENDING_SLOT_COST = 300;
	let userBalanceBefore = 0;
	let expertBalanceBefore = 0;
	let userEmailMaxIdBefore = 0;

	test.beforeAll(async () => {
		userId = await getAccountId('user1@dev.test');
		expertId = await getAccountId('expert1@dev.test');
		expect(userId).toBeGreaterThan(0);
		expect(expertId).toBeGreaterThan(0);

		const now = Math.floor(Date.now() / 1000);

		// TARGET: past slot, status=free (under-subscribed group), confirmed booking
		const pastStart = now - 7200;
		const pastEnd = now - 3600; // end_at < now — cron will pick this up
		targetSlotId = await seedSlot({
			expertId,
			startAt: pastStart,
			endAt: pastEnd,
			status: 'free',
			cost: 0,
			maxUsers: 2,
		});
		expect(targetSlotId).toBeGreaterThan(0);
		targetBookingId = await seedBooking({ userId, slotId: targetSlotId, status: 'confirmed' });
		expect(targetBookingId).toBeGreaterThan(0);

		// CONTROL (a): FUTURE slot, status=free, confirmed booking — must NOT be completed
		const futureStart = now + 86400 * 7;
		futureSlotId = await seedSlot({
			expertId,
			startAt: futureStart,
			endAt: futureStart + 3600,
			status: 'free',
			cost: 0,
			maxUsers: 2,
		});
		expect(futureSlotId).toBeGreaterThan(0);
		futureBookingId = await seedBooking({ userId, slotId: futureSlotId, status: 'confirmed' });
		expect(futureBookingId).toBeGreaterThan(0);

		// CONTROL (b): PAST slot, status=free, PENDING booking with a real cost.
		// Cron auto-cancels it (slot expired without an expert decision),
		// refunds the user in full and debits the expert by the same amount.
		pastPendingSlotId = await seedSlot({
			expertId,
			startAt: pastStart,
			endAt: pastEnd,
			status: 'free',
			cost: PENDING_SLOT_COST,
			maxUsers: 2,
		});
		expect(pastPendingSlotId).toBeGreaterThan(0);

		// Fund both sides so the refund/debit math has a non-trivial baseline,
		// and snapshot balances BEFORE seeding the booking.
		await ensureBalance(userId, PENDING_SLOT_COST + 2000);
		await ensureBalance(expertId, PENDING_SLOT_COST + 2000);
		await recalcBalance(userId);
		await recalcBalance(expertId);
		userBalanceBefore = await getBalance(userId);
		expertBalanceBefore = await getBalance(expertId);
		userEmailMaxIdBefore = await emailQueueMaxId('user1@dev.test');

		pastPendingBookingId = await seedBooking({
			userId,
			slotId: pastPendingSlotId,
			status: 'pending',
			cost: PENDING_SLOT_COST,
			expertId,
		});
		expect(pastPendingBookingId).toBeGreaterThan(0);

		// D-183 TARGET: past slot, status=free, and nobody ever booked it.
		emptyPastSlotId = await seedSlot({
			expertId,
			startAt: pastStart,
			endAt: pastEnd,
			status: 'free',
			cost: 0,
			maxUsers: 5,
		});
		expect(emptyPastSlotId).toBeGreaterThan(0);

		// D-183 CONTROL: same thing in the future — must stay bookable.
		emptyFutureSlotId = await seedSlot({
			expertId,
			startAt: futureStart,
			endAt: futureStart + 3600,
			status: 'free',
			cost: 0,
			maxUsers: 5,
		});
		expect(emptyFutureSlotId).toBeGreaterThan(0);

		// D-204 TARGET: single-seat slot already marked 'booked' (the seat was
		// taken) whose only booking is still waiting for the expert's answer.
		// Cost 0 on purpose — the refund branch must not disturb the balance
		// baselines the controls above compare against.
		fullPendingSlotId = await seedSlot({
			expertId,
			startAt: pastStart,
			endAt: pastEnd,
			status: 'booked',
			cost: 0,
			maxUsers: 1,
		});
		expect(fullPendingSlotId).toBeGreaterThan(0);
		fullPendingBookingId = await seedBooking({ userId, slotId: fullPendingSlotId, status: 'pending' });
		expect(fullPendingBookingId).toBeGreaterThan(0);
	});

	test('before cron: target booking is confirmed, controls are correct', async () => {
		if (!targetBookingId) { test.skip(); return; }
		expect(await getBookingStatus(targetBookingId)).toBe('confirmed');
		expect(await getBookingStatus(futureBookingId)).toBe('confirmed');
		expect(await getBookingStatus(pastPendingBookingId)).toBe('pending');
	});

	test('run real cron complete-expired (CronCompletionService)', () => {
		// php run_cmd.php honours DB_PREFIX_OVERRIDE to target the isolated
		// test_worker_N tables — same mechanism as isolation-setup.ts::runCli().
		//
		// NOTE: runServerCommand captures stdout/stderr even on a non-zero
		// exit (unlike execSync, which would throw) because the cron task
		// completes its real work (UPDATE bookings) before attempting to write
		// to the `cron_log` table. That table does NOT exist in isolated test
		// worker scopes (it is not part of the migrations run during isolation
		// setup), so the INSERT into cron_log throws and the process exits 1.
		// The actual CronCompletionService::completeExpired() logic has already
		// run successfully at that point — the DB state is correct. We verify
		// this by checking that stdout contains "Completed:" (printed by the
		// task callback before the log write attempt).
		const prefix = getDbPrefix();
		const res = runServerCommand(['cron', 'complete-expired'], prefix);
		const out = res.stdout + res.stderr;
		console.log('[cron output]', out.trim());
		// The task output line "Completed: X slots, Y bookings" confirms
		// CronCompletionService ran. The subsequent log-write failure (exit 1)
		// is expected in isolated scopes — we do not assert exit code here.
		expect(out).toContain('Completed:');
	});

	test('DB: target booking (past free-slot, confirmed) is now completed', async () => {
		if (!targetBookingId) { test.skip(); return; }
		expect(await getBookingStatus(targetBookingId)).toBe('completed');
	});

	test('D-144: target SLOT itself (under-subscribed group, past) is now completed, not stuck free', async () => {
		if (!targetSlotId) { test.skip(); return; }
		expect(await getSlotStatus(targetSlotId)).toBe('completed');
	});

	test('DB control (a): future free-slot confirmed booking stays confirmed', async () => {
		if (!futureBookingId) { test.skip(); return; }
		expect(await getBookingStatus(futureBookingId)).toBe('confirmed');
	});

	test('DB control (a): future free-slot itself stays free (not touched)', async () => {
		if (!futureSlotId) { test.skip(); return; }
		expect(await getSlotStatus(futureSlotId)).toBe('free');
	});

	test('DB: past free-slot PENDING booking is auto-cancelled with full refund + email', async () => {
		if (!pastPendingBookingId) { test.skip(); return; }

		// Status flipped pending → cancelled by the cron.
		expect(await getBookingStatus(pastPendingBookingId)).toBe('cancelled');

		// Full refund: user credited back the cost, expert debited the same amount.
		// Both ledger rows (booking_invoice / booking_payment from seedBooking, plus
		// the cron's booking_refund) net to zero against the baseline captured pre-seed.
		await recalcBalance(userId);
		await recalcBalance(expertId);
		const userBalanceNow = await getBalance(userId);
		const expertBalanceNow = await getBalance(expertId);
		expect(userBalanceNow).toBe(userBalanceBefore);
		expect(expertBalanceNow).toBe(expertBalanceBefore);

		// A rejection email was enqueued to the user (bookingRejected path).
		const userEmailMaxIdAfter = await emailQueueMaxId('user1@dev.test');
		expect(userEmailMaxIdAfter).toBeGreaterThan(userEmailMaxIdBefore);
	});

	test('D-183/D-204: past slot nobody booked ends as "expired" — over, and it never happened', async () => {
		if (!emptyPastSlotId) { test.skip(); return; }
		// Before the fix this stayed 'free' forever: the expert's status filter
		// counted it, the calendar window (four weeks from today) never showed
		// it, and the two numbers disagreed on the same screen.
		//
		// D-204: closing it is not enough — 'completed' would claim a lesson
		// took place. Nobody was ever booked here.
		expect(await getSlotStatus(emptyPastSlotId)).toBe('expired');
	});

	test('D-183 control: a future slot nobody booked is left alone', async () => {
		if (!emptyFutureSlotId) { test.skip(); return; }
		expect(await getSlotStatus(emptyFutureSlotId)).toBe('free');
	});

	test('D-183: slot whose only request the cron just declined is closed in the same pass', async () => {
		if (!pastPendingSlotId) { test.skip(); return; }
		// The auto-cancel above releases the seat and leaves the slot open.
		// Without the closing sweep it would be back to the D-183 state: past,
		// empty, and still advertised as free. Nobody attended, so 'expired'.
		expect(await getSlotStatus(pastPendingSlotId)).toBe('expired');
	});

	test('D-204: a full slot whose every request went unanswered did NOT take place', async () => {
		if (!fullPendingSlotId) { test.skip(); return; }
		// The request itself is declined by the same pass...
		expect(await getBookingStatus(fullPendingBookingId)).toBe('cancelled');
		// ...and the slot must not end up wearing the same word as a lesson the
		// expert actually gave. The first cron branch closes 'booked' slots
		// before the third one declines their pending requests, so without the
		// re-classification this reads 'completed' — a lesson that never was.
		expect(await getSlotStatus(fullPendingSlotId)).toBe('expired');
	});

	test('D-204 control: a past slot someone actually attended stays "completed"', async () => {
		if (!targetSlotId) { test.skip(); return; }
		// The contrast that gives the word its meaning: same cron pass, same
		// expired time, but here a confirmed booking became a completed one.
		expect(await getBookingStatus(targetBookingId)).toBe('completed');
		expect(await getSlotStatus(targetSlotId)).toBe('completed');
	});

	test('D-146: auto-cancelled pending booking gets a user_cancellations row (kind=decline)', async () => {
		if (!pastPendingBookingId) { test.skip(); return; }
		expect(await getUserCancellationKind(pastPendingBookingId)).toBe('decline');
	});

	test('after cron: user cannot cancel completed booking (returns 400)', async ({ browser }) => {
		if (!targetBookingId) { test.skip(); return; }
		const { context, page } = await devLogin(browser, 'user');
		try {
			const result = await postBookingCancel(page, targetBookingId, 'trying to cancel completed booking');
			expect(result.status).toBe(400);
			expect(result.body).toMatchObject({ error: expect.any(String) });
		} finally {
			await context.close();
		}
	});

	test('DB: target booking status remains completed after blocked cancel attempt', async () => {
		if (!targetBookingId) { test.skip(); return; }
		expect(await getBookingStatus(targetBookingId)).toBe('completed');
	});

	test.afterAll(async () => {
		if (targetSlotId) await cleanupSlot(targetSlotId);
		if (futureSlotId) await cleanupSlot(futureSlotId);
		if (pastPendingSlotId) await cleanupSlot(pastPendingSlotId);
		if (emptyPastSlotId) await cleanupSlot(emptyPastSlotId);
		if (emptyFutureSlotId) await cleanupSlot(emptyFutureSlotId);
		if (fullPendingSlotId) await cleanupSlot(fullPendingSlotId);
		// Clean the rejection email enqueued by the cron so it does not leak
		// into subsequent test runs that share this isolated scope.
		if (userEmailMaxIdBefore > 0) {
			const conn = await mysql.createConnection(DB);
			try {
				await conn.execute(
					`DELETE FROM ${tn('email_queue')} WHERE recipient_email = ? AND id > ?`,
					['user1@dev.test', userEmailMaxIdBefore]
				);
			} finally { await conn.end(); }
		}
		if (userId) await recalcBalance(userId);
		if (expertId) await recalcBalance(expertId);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// D-147: BookingsController::buildAuxMaps() only revealed slot.location while
// booking.status stayed literally 'confirmed'. A booking flips to 'completed'
// once the session's end_at passes — at that exact moment the meeting link
// used to disappear from the student's own booking card, replaced by a bare
// platform-name string. Found live on production (support ticket #4).
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// D-199: an unanswered request dies when the lesson STARTS, not when it ends.
//
// A pending booking is paid at booking time. While it sits unanswered the
// student's money is gone from their balance and the expert is credited for a
// session that has not happened. The cron used to wait for `end_at`, so a
// student who was never let into a lesson still had their money locked for the
// full hour it ran — while every screen in the product had already been saying
// "the lesson has started, you can no longer cancel" since the first minute.
// The owner's decision: move the money at the start, where the words already
// are.
//
// Its own describe on purpose. The Fix 7 block above compares whole-account
// balances before and after one cron pass; a second paid booking seeded into
// that block shifts those totals and makes an unrelated test fail instead of
// this one. Separate slots, separate cron run, separate baselines.
// ─────────────────────────────────────────────────────────────────────────────
