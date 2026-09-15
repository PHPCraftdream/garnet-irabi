/**
 * D-207: "Пользователей за месяц" counted only `status IN ('confirmed',
 * 'completed')`. expert-3 (cycle8) manually recounted distinct names on the
 * SAME screen the number sits above — "Входящие брони" — and got one more
 * than the counter: 8 vs 7.
 *
 * Verified against the live account (see task notes): the missing student
 * had a `pending` booking this month — a request awaiting the expert's own
 * decision, which the incoming-bookings list shows (it's literally what the
 * list is for) but the counter silently excluded. `ExpertHelpers::
 * dashboardStats()` now counts `pending` too; `cancelled`/`declined` stay
 * excluded — nothing came of those.
 *
 * This spec seeds a brand-new student account (so it can't collide with
 * whatever bookings already exist for the shared USER_LOGIN fixture this
 * month) with ONLY a pending booking, and checks the counter includes them.
 * A second student with only a declined booking proves the exclusion still
 * holds — a fix that dropped the status filter entirely would pass the
 * first assertion and fail this one.
 */
import { test, expect, tn } from '../helpers/scoped-test';
import { withConnection } from '../helpers/db';
import { EXPERT_LOGIN } from '../helpers/logins';

async function getAccountId(login: string): Promise<number> {
	return withConnection(async (c) => {
		const [rows] = await c.execute<any[]>(`SELECT id FROM ${tn('accounts')} WHERE login = ?`, [login]);
		return rows[0]?.id ?? 0;
	});
}

async function createStudent(login: string, name: string): Promise<number> {
	return withConnection(async (c) => {
		const [res]: any = await c.execute(
			`INSERT INTO ${tn('accounts')} (login, login_type, type, name) VALUES (?, 'email', 'user', ?)`,
			[login, name],
		);
		return res.insertId;
	});
}

async function createSlotWithBooking(expertId: number, userId: number, status: string): Promise<{ slotId: number; bookingId: number }> {
	return withConnection(async (c) => {
		const now = Math.floor(Date.now() / 1000);
		const startAt = now + 86400 * (3 + Math.floor(Math.random() * 20));
		const uid = [...Array(16)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');

		const [slotRes]: any = await c.execute(
			`INSERT INTO ${tn('time_slots')}
			 (expert_id, start_at, end_at, duration_min, cost, is_online, location, max_users, status, uid, created_at)
			 VALUES (?, ?, ?, 60, 500, 1, 'https://meet.example.com/d207', 1, 'free', ?, ?)`,
			[expertId, startAt, startAt + 3600, uid, now],
		);
		const slotId = slotRes.insertId;

		const [bookingRes]: any = await c.execute(
			`INSERT INTO ${tn('bookings')} (user_id, bookable_type, bookable_id, status, created_at)
			 VALUES (?, 'time_slot', ?, ?, ?)`,
			[userId, slotId, status, now],
		);
		return { slotId, bookingId: bookingRes.insertId };
	});
}

async function cleanup(ids: { slotId: number; bookingId: number; userId: number }[]): Promise<void> {
	await withConnection(async (c) => {
		for (const { slotId, bookingId, userId } of ids) {
			await c.execute(`DELETE FROM ${tn('bookings')} WHERE id = ?`, [bookingId]);
			await c.execute(`DELETE FROM ${tn('time_slots')} WHERE id = ?`, [slotId]);
			await c.execute(`DELETE FROM ${tn('accounts')} WHERE id = ?`, [userId]);
		}
	});
}

test.describe.configure({ mode: 'serial' });

test.describe('D-207: usersThisMonth agrees with the incoming-bookings list on who counts', () => {
	let expertId = 0;
	const seeded: { slotId: number; bookingId: number; userId: number }[] = [];

	test.beforeAll(async () => {
		expertId = await getAccountId(EXPERT_LOGIN);
		expect(expertId).toBeGreaterThan(0);
	});

	test.afterAll(async () => {
		await cleanup(seeded);
	});

	test('a student with only a PENDING booking this month is counted', async ({ page }) => {
		await page.goto('/system/', { waitUntil: 'domcontentloaded' });
		const before = await page.evaluate(async () => {
			const res = await fetch('/system/~expertStats', { headers: { Accept: 'application/json' }, credentials: 'same-origin' });
			return (await res.json()).usersThisMonth;
		});

		const studentId = await createStudent(`d207-pending-${Date.now()}@dev.test`, 'D-207 Pending Student');
		const { slotId, bookingId } = await createSlotWithBooking(expertId, studentId, 'pending');
		seeded.push({ slotId, bookingId, userId: studentId });

		const after = await page.evaluate(async () => {
			const res = await fetch('/system/~expertStats', { headers: { Accept: 'application/json' }, credentials: 'same-origin' });
			return (await res.json()).usersThisMonth;
		});

		expect(after).toBe(before + 1);
	});

	test('a student with only a DECLINED booking this month is still excluded', async ({ page }) => {
		await page.goto('/system/', { waitUntil: 'domcontentloaded' });
		const before = await page.evaluate(async () => {
			const res = await fetch('/system/~expertStats', { headers: { Accept: 'application/json' }, credentials: 'same-origin' });
			return (await res.json()).usersThisMonth;
		});

		const studentId = await createStudent(`d207-declined-${Date.now()}@dev.test`, 'D-207 Declined Student');
		const { slotId, bookingId } = await createSlotWithBooking(expertId, studentId, 'cancelled');
		seeded.push({ slotId, bookingId, userId: studentId });

		const after = await page.evaluate(async () => {
			const res = await fetch('/system/~expertStats', { headers: { Accept: 'application/json' }, credentials: 'same-origin' });
			return (await res.json()).usersThisMonth;
		});

		expect(after).toBe(before);
	});
});
