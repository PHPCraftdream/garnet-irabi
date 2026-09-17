/**
 * D-192: expert-2 (cycle5) saw the cancel-cost hint that appears after
 * confirming a booking overlap the neighboring slot card directly below it
 * in the same weekday column, unreadable, until a full page reload.
 *
 * Investigated against the current `CalendarSlotCell`/`CalendarDayColumn`
 * code (since refactored out of a monolithic `ExpertCalendar` for D-200):
 * each day's slot list auto-sizes to its content (no fixed row height, no
 * absolute positioning on the hint), so a cell that grows after confirming
 * pushes its own bounds down rather than bleeding into a sibling's. Verified
 * empirically here rather than by inspection alone: confirming a booking and
 * measuring the hint's bounding box against its own slot card's shows zero
 * overflow. This pins that state down as a regression guard, since a future
 * change to the day column's layout (fixed height, absolute positioning)
 * could silently reintroduce exactly this bleed.
 */
import { test, expect, tn } from '../../helpers/scoped-test';
import mysql from 'mysql2/promise';
import { DB } from '../../helpers/db/db';

test.describe.configure({ mode: 'serial' });

test('D-192: confirmed-booking cost hint stays within its own slot card', async ({ expertPage }) => {
	const conn = await mysql.createConnection(DB);
	let slotId = 0;
	try {
		const [expertRows] = await conn.execute<any[]>(`SELECT id FROM ${tn('accounts')} WHERE login = 'testuser_setup_expert@irabi.test'`);
		const expertId = expertRows[0].id;
		const [userRows] = await conn.execute<any[]>(`SELECT id FROM ${tn('accounts')} WHERE login = 'testuser_setup_user@irabi.test'`);
		const userId = userRows[0].id;
		const now = Math.floor(Date.now() / 1000);
		const uid = [...Array(16)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
		const startAt = now + 86400 * 7;
		const [slotIns]: any = await conn.execute(
			`INSERT INTO ${tn('time_slots')}
			 (expert_id, start_at, end_at, duration_min, cost, is_online, location, max_users, status, uid, created_at)
			 VALUES (?, ?, ?, 60, 500, 1, 'https://meet.example.com/d192-test', 1, 'booked', ?, ?)`,
			[expertId, startAt, startAt + 3600, uid, now],
		);
		slotId = slotIns.insertId;
		await conn.execute(
			`INSERT INTO ${tn('bookings')} (user_id, bookable_type, bookable_id, status, created_at) VALUES (?, 'time_slot', ?, 'pending', ?)`,
			[userId, slotId, now],
		);

		await expertPage.goto('/system/expert/~slots');
		const confirmBtn = expertPage.locator(`[data-test-id="confirm-booking-${slotId}"]`);
		await expect(confirmBtn).toBeVisible({ timeout: 10000 });
		await confirmBtn.click();

		const hint = expertPage.locator(`[data-test-id="booking-cost-hint-${slotId}"]`);
		await expect(hint).toBeVisible({ timeout: 10000 });

		const hintBox = await hint.boundingBox();
		const cellBox = await expertPage.locator(`[data-test-id="expert-slot-${slotId}"]`).boundingBox();
		expect(hintBox).not.toBeNull();
		expect(cellBox).not.toBeNull();

		// The hint's bottom edge must not extend past its own card's bottom
		// edge — that overflow into the row below is exactly D-192.
		expect(hintBox!.y + hintBox!.height).toBeLessThanOrEqual(cellBox!.y + cellBox!.height + 1);
	} finally {
		if (slotId) {
			await conn.execute(`DELETE FROM ${tn('bookings')} WHERE bookable_type = 'time_slot' AND bookable_id = ?`, [slotId]);
			await conn.execute(`DELETE FROM ${tn('time_slots')} WHERE id = ?`, [slotId]);
		}
		await conn.end();
	}
});
