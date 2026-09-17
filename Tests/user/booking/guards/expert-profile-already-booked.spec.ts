/**
 * D-187: the expert-profile page offered "Забронировать" to a user who
 * already had a CONFIRMED booking on that exact slot.
 *
 * Root cause: on a group slot (max_users > 1) `time_slots.status` stays
 * 'free' as long as a seat remains — that's correct for OTHER visitors, but
 * this page never checked whether the CURRENT viewer already held one of
 * those seats. The catalog (/system/slots) already collects that per-user
 * booking status and shows it instead of a book button; the expert-profile
 * page didn't, so the same slot told two different stories depending on
 * which screen showed it — the exact class of bug already closed for
 * D-151/D-186/D-200.
 *
 * Fixed by exposing `Bookings::activeBookingStatusesForUser()` (the same
 * pending/confirmed condition the server uses to REJECT a duplicate booking)
 * to ExpertController, and having ExpertSlotCard show that status instead of
 * the book button when present.
 */
import { test, expect, tn } from '../../../helpers/scoped-test';
import mysql from 'mysql2/promise';
import { DB } from '../../../helpers/db/db';
import { USER_LOGIN } from '../../../helpers/auth/logins';

test.describe.configure({ mode: 'serial' });

const BASE = process.env.BASE_URL || 'http://localhost:8001';

async function dbQuery(sql: string, params: any[] = []): Promise<any[]> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(sql, params);
		return rows;
	} finally { await conn.end(); }
}

async function dbExec(sql: string, params: any[] = []): Promise<void> {
	const conn = await mysql.createConnection(DB);
	try { await conn.execute(sql, params); }
	finally { await conn.end(); }
}

async function approvedExpertId(): Promise<number> {
	const rows = await dbQuery(`SELECT a.id AS account_id FROM ${tn('accounts')} a
             JOIN ${tn('accounts_data')} d ON d.account_id = a.id
              AND d.param = 'IS_APPROVED' AND d.value > 0
            WHERE a.type = 'expert' LIMIT 1`);
	return Number(rows[0]?.account_id ?? 0);
}

async function userAccountId(): Promise<number> {
	const rows = await dbQuery(`SELECT id FROM ${tn('accounts')} WHERE login = ?`, [USER_LOGIN]);
	return Number(rows[0]?.id ?? 0);
}

/** A group slot with one open seat left, so `status` stays 'free' even after one booking. */
async function createGroupSlot(expertId: number): Promise<number> {
	const now = Math.floor(Date.now() / 1000);
	const startAt = now + 86400 * 6;
	const uid = [...Array(16)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
	const conn = await mysql.createConnection(DB);
	try {
		const [ins]: any = await conn.execute(
			`INSERT INTO ${tn('time_slots')}
             (expert_id, start_at, end_at, duration_min, cost, is_online, location, max_users, status, uid, cancellation_penalty_percent, created_at)
             VALUES (?, ?, ?, 60, 500, 1, 'https://meet.example.com/d187-test', 2, 'free', ?, 0, ?)`,
			[expertId, startAt, startAt + 3600, uid, now]
		);
		return Number(ins.insertId);
	} finally { await conn.end(); }
}

async function insertConfirmedBooking(userId: number, slotId: number): Promise<void> {
	const now = Math.floor(Date.now() / 1000);
	await dbExec(
		`INSERT INTO ${tn('bookings')} (user_id, bookable_type, bookable_id, status, confirmed_at, created_at)
         VALUES (?, 'time_slot', ?, 'confirmed', ?, ?)`,
		[userId, slotId, now, now]
	);
}

test.describe('D-187: expert profile knows about the viewer\'s own booking', () => {
	let expertId = 0;
	let userId = 0;
	const slotIds: number[] = [];

	test.beforeAll(async () => {
		expertId = await approvedExpertId();
		expect(expertId).toBeGreaterThan(0);
		userId = await userAccountId();
		expect(userId).toBeGreaterThan(0);
	});

	test.afterAll(async () => {
		for (const id of slotIds) {
			await dbExec(`DELETE FROM ${tn('bookings')} WHERE bookable_id = ? AND bookable_type = 'time_slot'`, [id]);
			await dbExec(`DELETE FROM ${tn('time_slots')} WHERE id = ?`, [id]);
		}
	});

	test('a slot the user already booked shows status, not a Book button', async ({ page }) => {
		const slotId = await createGroupSlot(expertId);
		slotIds.push(slotId);
		await insertConfirmedBooking(userId, slotId);

		await page.goto(`${BASE}/system/expert/id~${expertId}`);

		await expect(page.locator(`[data-test-id="slot-already-booked-${slotId}"]`)).toBeVisible({ timeout: 10000 });
		await expect(page.locator(`[data-test-id="slot-book-${slotId}"]`)).toHaveCount(0);
	});

	test('a slot with an open seat the user has NOT booked still shows the Book button', async ({ page }) => {
		const slotId = await createGroupSlot(expertId);
		slotIds.push(slotId);

		await page.goto(`${BASE}/system/expert/id~${expertId}`);

		await expect(page.locator(`[data-test-id="slot-book-${slotId}"]`)).toBeVisible({ timeout: 10000 });
		await expect(page.locator(`[data-test-id="slot-already-booked-${slotId}"]`)).toHaveCount(0);
	});
});
