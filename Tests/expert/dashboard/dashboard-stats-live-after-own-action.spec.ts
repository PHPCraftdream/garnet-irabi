/**
 * D-206: the teacher's own action left the numbers above it stale.
 *
 * The pending-requests list on the dashboard was made live in an earlier pass.
 * The six numbers sitting right above it — requests, students this month,
 * earnings this month, declines, cancellations, missed — were not: they came
 * baked into the HTML once and stayed there. Declining a request made the card
 * disappear while "Отклонений" kept its old value and "Доход за месяц" kept an
 * amount that did not account for the refund the same click had just issued.
 * On the live site expert-3 measured it exactly: 2 instead of 3, and 9280 ₽
 * instead of 8780 ₽ — wrong money on screen at the moment the next decision is
 * taken.
 *
 * Fixed by the rule the whole D-198 family points at: after a mutation, re-read
 * from the server the state that mutation changes. `ExpertHelpers::
 * dashboardStats()` is now the single place those six are computed, and the
 * dashboard asks `~expertStats` for them after confirming or declining.
 *
 * The decline is the case worth asserting: it moves TWO numbers at once (the
 * decline tally and the money, because the refund rides along), so a fix that
 * only refreshed the obvious one would still pass a weaker test.
 */
import { test, expect, tn } from '../../helpers/scoped-test';
import { withConnection } from '../../helpers/db/db';
import { EXPERT_LOGIN, USER_LOGIN } from '../../helpers/auth/logins';

const SLOT_COST = 700;

async function getAccountId(login: string): Promise<number> {
	return withConnection(async (c) => {
		const [rows] = await c.execute<any[]>(`SELECT id FROM ${tn('accounts')} WHERE login = ?`, [login]);
		return rows[0]?.id ?? 0;
	});
}

async function seedSlotWithPendingBooking(expertId: number, userId: number): Promise<{slotId: number; bookingId: number}> {
	return withConnection(async (c) => {
		const now = Math.floor(Date.now() / 1000);
		const startAt = now + 86400 * 4;

		const [slotRes]: any = await c.execute(
			`INSERT INTO ${tn('time_slots')}
			 (expert_id, start_at, end_at, duration_min, cost, is_online, location, max_users, booked_count, status, uid, created_at)
			 VALUES (?, ?, ?, 60, ?, 1, 'https://meet.example.com/d206', 2, 1, 'free', ?, ?)`,
			[expertId, startAt, startAt + 3600, SLOT_COST, `d206${now}`.slice(0, 16), now],
		);
		const slotId = slotRes.insertId;

		const [bookingRes]: any = await c.execute(
			`INSERT INTO ${tn('bookings')} (user_id, bookable_type, bookable_id, status, created_at)
			 VALUES (?, 'time_slot', ?, 'pending', ?)`,
			[userId, slotId, now],
		);
		const bookingId = bookingRes.insertId;

		// Money moves at booking time, exactly as post__book does it: the
		// student is debited and the expert credited. Without these rows the
		// decline would have no refund to issue and the money half of this
		// test would prove nothing.
		await c.execute(
			`INSERT INTO ${tn('balance_ledger')} (account_id, is_credit, amount, entry_type, ref_type, ref_id, note, created_at)
			 VALUES (?, 0, ?, 'booking_invoice', 'booking', ?, 'D-206 seed', ?)`,
			[userId, SLOT_COST, bookingId, now],
		);
		await c.execute(
			`INSERT INTO ${tn('balance_ledger')} (account_id, is_credit, amount, entry_type, ref_type, ref_id, note, created_at)
			 VALUES (?, 1, ?, 'booking_payment', 'booking', ?, 'D-206 seed', ?)`,
			[expertId, SLOT_COST, bookingId, now],
		);

		return {slotId, bookingId};
	});
}

async function cleanup(slotId: number, bookingId: number): Promise<void> {
	if (!slotId) return;
	await withConnection(async (c) => {
		await c.execute(`DELETE FROM ${tn('balance_ledger')} WHERE ref_type = 'booking' AND ref_id = ?`, [bookingId]);
		await c.execute(`DELETE FROM ${tn('expert_cancellations')} WHERE booking_id = ?`, [bookingId]);
		await c.execute(`DELETE FROM ${tn('user_cancellations')} WHERE booking_id = ?`, [bookingId]);
		await c.execute(`DELETE FROM ${tn('bookings')} WHERE id = ?`, [bookingId]);
		await c.execute(`DELETE FROM ${tn('time_slots')} WHERE id = ?`, [slotId]);
	});
}

/** Reads an integer out of a stat tile, tolerating the "700 ₽" suffix. */
function numberFrom(text: string | null): number {
	const m = /-?\d[\d\s ]*/.exec(text ?? '');
	return m ? Number(m[0].replace(/[\s ]/g, '')) : NaN;
}

test.describe.configure({ mode: 'serial' });

test.describe('D-206: the numbers above the list keep up with the teacher acting on it', () => {
	let expertId = 0;
	let userId = 0;
	let slotId = 0;
	let bookingId = 0;

	test.beforeAll(async () => {
		// Строго те аккаунты, под которыми проект заходит в браузер: слот,
		// засеянный другому преподавателю, в этот дашборд не попадёт и тест
		// провалится на пустом списке, ничего не сказав о самой находке.
		expertId = await getAccountId(EXPERT_LOGIN);
		userId = await getAccountId(USER_LOGIN);
		expect(expertId).toBeGreaterThan(0);
		expect(userId).toBeGreaterThan(0);

		const seeded = await seedSlotWithPendingBooking(expertId, userId);
		slotId = seeded.slotId;
		bookingId = seeded.bookingId;
		expect(bookingId).toBeGreaterThan(0);
	});

	test.afterAll(async () => {
		await cleanup(slotId, bookingId);
	});

	test('~expertStats answers the expert with the same six numbers the page was drawn from', async ({ page }) => {
		await page.goto('/system/', { waitUntil: 'domcontentloaded' });
		await expect(page.locator('[data-test-id="expert-stats"]')).toBeVisible({ timeout: 15000 });

		const stats = await page.evaluate(async () => {
			const res = await fetch('/system/~expertStats', {headers: {Accept: 'application/json'}, credentials: 'same-origin'});
			return {status: res.status, body: await res.json()};
		});

		expect(stats.status).toBe(200);
		// Shape first: a missing key would silently become 0 on the client and
		// look like a legitimate reset.
		for (const key of ['pendingBookings', 'usersThisMonth', 'earningsThisMonth', 'declines', 'cancellations', 'missed']) {
			expect(typeof stats.body[key]).toBe('number');
		}

		// And it must agree with what the server already rendered — two
		// formulas for one number is how this class of finding is born.
		const declinesOnScreen = numberFrom(await page.locator('[data-test-id="expert-stat-declines"]').textContent());
		const earningsOnScreen = numberFrom(await page.locator('[data-test-id="expert-stat-earnings"]').textContent());
		expect(stats.body.declines).toBe(declinesOnScreen);
		expect(stats.body.earningsThisMonth).toBe(earningsOnScreen);
	});

	test('declining a request updates BOTH the decline tally and the money, with no reload', async ({ page }) => {
		await page.goto('/system/', { waitUntil: 'domcontentloaded' });

		const declinesEl = page.locator('[data-test-id="expert-stat-declines"]');
		const earningsEl = page.locator('[data-test-id="expert-stat-earnings"]');
		await expect(declinesEl).toBeVisible({ timeout: 15000 });

		const declinesBefore = numberFrom(await declinesEl.textContent());
		const earningsBefore = numberFrom(await earningsEl.textContent());
		expect(Number.isNaN(declinesBefore)).toBe(false);
		expect(Number.isNaN(earningsBefore)).toBe(false);

		// Decline the seeded request through the real UI path.
		const row = page.locator(`[data-test-id="pending-booking-${bookingId}"]`);
		await expect(row).toBeVisible({ timeout: 15000 });
		await page.locator(`[data-test-id="pending-reject-${bookingId}"]`).click();

		const reasonInput = page.locator('[data-test-id="reject-modal-reason"]');
		await expect(reasonInput).toBeVisible({ timeout: 10000 });
		await reasonInput.fill('D-206: занято другим занятием');
		await page.locator('[data-test-id="reject-modal-submit"]').click();

		// The card goes — that part already worked before the fix.
		await expect(row).toHaveCount(0, { timeout: 15000 });

		// These two did not. No reload happens anywhere in this test.
		await expect
			.poll(async () => numberFrom(await declinesEl.textContent()), { timeout: 10000 })
			.toBe(declinesBefore + 1);
		await expect
			.poll(async () => numberFrom(await earningsEl.textContent()), { timeout: 10000 })
			.toBe(earningsBefore - SLOT_COST);
	});

	test('the server agrees with what the screen now shows', async ({ page }) => {
		// Guards against the opposite failure: a client that just decrements
		// its own copy would pass the test above and drift from the truth.
		await page.goto('/system/', { waitUntil: 'domcontentloaded' });
		const declinesEl = page.locator('[data-test-id="expert-stat-declines"]');
		await expect(declinesEl).toBeVisible({ timeout: 15000 });

		const fromServer = await page.evaluate(async () => {
			const res = await fetch('/system/~expertStats', {headers: {Accept: 'application/json'}, credentials: 'same-origin'});
			return res.json();
		});

		expect(numberFrom(await declinesEl.textContent())).toBe(fromServer.declines);
		expect(numberFrom(await page.locator('[data-test-id="expert-stat-earnings"]').textContent()))
			.toBe(fromServer.earningsThisMonth);
	});
});
