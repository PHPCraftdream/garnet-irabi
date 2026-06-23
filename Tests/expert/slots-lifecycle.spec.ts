/**
 * Expert — TimeSlotSM lifecycle
 *
 * State machine: TimeSlotSM × BookingSM × BalanceSM
 *
 * Tests that the expert sees their slot's status change as users book/cancel.
 *
 * Entry: expert authenticated, approved expert profile exists.
 * Cycle:
 *   TimeSlotSM: (new) → free → booked → free
 *   (booked when all seats taken; free when booking cancelled)
 * Exit: slot cleaned up.
 *
 * UI: ExpertCalendar view uses data-test-id="expert-slot-{id}" for slot cards.
 * Status is shown via UniversalBadge inside the slot card.
 * "Complete" button REMOVED entirely.
 * Cancel + delete merged → one delete button with ConfirmModal (modal-confirm-btn, variant danger).
 * Cancel booked slot: cancel-booking-{id} → cancel-booking-modal → cancel-booking-reason → cancel-booking-submit.
 */

import { test, expect, tn } from '../helpers/scoped-test';
import mysql from 'mysql2/promise';
import { storageStatePath } from '../helpers/state';
import { DB } from '../helpers/db';
test.describe.configure({ mode: 'serial' });

async function getExpertId(): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT id FROM ${tn('accounts')} WHERE login = 'testuser_setup_expert@irabi.test'`
		);
		return rows[0]?.id ?? 0;
	} finally { await conn.end(); }
}

async function createTestSlot(expertId: number, cost = 0, maxUsers = 1): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const startAt = Math.floor(Date.now() / 1000) + 86400 * 3 + 11 * 3600;
		const uid = [...Array(16)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
		const [result]: any = await conn.execute(
			`INSERT INTO ${tn('time_slots')}
			 (expert_id, start_at, end_at, duration_min, cost, is_online, location, max_users, status, uid, created_at)
			 VALUES (?, ?, ?, 60, ?, 1, 'https://meet.example.com/lifecycle-test', ?, 'free', ?, ?)`,
			[expertId, startAt, startAt + 3600, cost, maxUsers, uid, Math.floor(Date.now() / 1000)]
		);
		return result.insertId;
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

async function bookSlot(slotId: number, studentLogin: string): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const [[studentRow]]: any = await conn.execute(
			`SELECT id FROM ${tn('accounts')} WHERE login = ?`, [studentLogin]
		);
		const [result]: any = await conn.execute(
			`INSERT INTO ${tn('bookings')} (user_id, bookable_type, bookable_id, status, created_at)
			 VALUES (?, 'time_slot', ?, 'pending', ?)`,
			[studentRow.id, slotId, Math.floor(Date.now() / 1000)]
		);
		// Mark slot as booked if now full
		await conn.execute(
			`UPDATE ${tn('time_slots')} SET status = 'booked'
			 WHERE id = ? AND max_users <=
			   (SELECT COUNT(*) FROM ${tn('bookings')} WHERE bookable_type='time_slot' AND bookable_id=? AND status IN ('pending','confirmed'))`,
			[slotId, slotId]
		);
		return result.insertId;
	} finally { await conn.end(); }
}

async function cancelBooking(bookingId: number, slotId: number) {
	const conn = await mysql.createConnection(DB);
	try {
		await conn.execute(
			`UPDATE ${tn('bookings')} SET status='cancelled', cancelled_at=? WHERE id=?`,
			[Math.floor(Date.now() / 1000), bookingId]
		);
		// Restore slot to free if no active bookings remain
		await conn.execute(
			`UPDATE ${tn('time_slots')} SET status = 'free'
			 WHERE id = ? AND status = 'booked'
			   AND (SELECT COUNT(*) FROM ${tn('bookings')} WHERE bookable_type='time_slot' AND bookable_id=? AND status IN ('pending','confirmed')) < max_users`,
			[slotId, slotId]
		);
	} finally { await conn.end(); }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('TimeSlotSM: free → booked → free', () => {
	let expertId = 0;
	let slotId = 0;
	let bookingId = 0;

	test('entry: create test slot (max_users=1, cost=0)', async () => {
		expertId = await getExpertId();
		expect(expertId).toBeGreaterThan(0);

		slotId = await createTestSlot(expertId, 0, 1);
		expect(slotId).toBeGreaterThan(0);

		const status = await getSlotStatus(slotId);
		expect(status).toBe('free');
	});

	test('TimeSlotSM free: slot appears in expert calendar', async ({ page }) => {
		if (!slotId) { test.skip(); return; }

		await page.goto('/expert/~slots');

		const slotCard = page.locator(`[data-test-id="expert-slot-${slotId}"]`);
		await expect(slotCard).toBeVisible({ timeout: 15000 });
	});

	test('TimeSlotSM free → booked: user books last seat', async () => {
		if (!slotId) { test.skip(); return; }

		bookingId = await bookSlot(slotId, 'testuser_setup_user@irabi.test');
		expect(bookingId).toBeGreaterThan(0);

		const status = await getSlotStatus(slotId);
		expect(status).toBe('booked');
	});

	test('TimeSlotSM booked: expert calendar shows slot as booked', async ({ page }) => {
		if (!slotId) { test.skip(); return; }

		await page.goto('/expert/~slots');

		const slotCard = page.locator(`[data-test-id="expert-slot-${slotId}"]`);
		await expect(slotCard).toBeVisible({ timeout: 15000 });

		// Cancel booking button should be visible for booked slot
		const cancelBookingBtn = page.locator(`[data-test-id="cancel-booking-${slotId}"]`);
		await expect(cancelBookingBtn).toBeVisible({ timeout: 8000 });
	});

	test('TimeSlotSM booked → free: user cancels booking', async () => {
		if (!slotId || !bookingId) { test.skip(); return; }

		await cancelBooking(bookingId, slotId);
		const status = await getSlotStatus(slotId);
		expect(status).toBe('free');
	});

	test('TimeSlotSM free: expert calendar shows slot as free again', async ({ page }) => {
		if (!slotId) { test.skip(); return; }

		await page.goto('/expert/~slots');

		const slotCard = page.locator(`[data-test-id="expert-slot-${slotId}"]`);
		await expect(slotCard).toBeVisible({ timeout: 15000 });

		// Cancel booking button should NOT be visible for free slot
		const cancelBookingBtn = page.locator(`[data-test-id="cancel-booking-${slotId}"]`);
		await expect(cancelBookingBtn).toHaveCount(0);
	});

	test('exit: clean up test slot and booking', async () => {
		const conn = await mysql.createConnection(DB);
		try {
			if (bookingId) await conn.execute(`DELETE FROM ${tn('bookings')} WHERE id = ?`, [bookingId]);
			if (slotId) await conn.execute(`DELETE FROM ${tn('time_slots')} WHERE id = ?`, [slotId]);
		} finally { await conn.end(); }
	});
});

// ── Multi-seat slot: stays free until all seats taken ─────────────────────────

test.describe('TimeSlotSM: multi-seat slot stays free until capacity', () => {
	let expertId2 = 0;
	let slotId2 = 0;
	let bookingId2 = 0;

	test('entry: create slot with max_users=2', async () => {
		expertId2 = await getExpertId();
		slotId2 = await createTestSlot(expertId2, 0, 2);
		expect(slotId2).toBeGreaterThan(0);
	});

	test('TimeSlotSM: one booking, slot stays free (1 < maxUsers=2)', async () => {
		if (!slotId2) { test.skip(); return; }
		bookingId2 = await bookSlot(slotId2, 'testuser_setup_user@irabi.test');
		const status = await getSlotStatus(slotId2);
		expect(status).toBe('free'); // still free — seat available
	});

	test('exit: clean up', async () => {
		const conn = await mysql.createConnection(DB);
		try {
			if (bookingId2) await conn.execute(`DELETE FROM ${tn('bookings')} WHERE id = ?`, [bookingId2]);
			if (slotId2) await conn.execute(`DELETE FROM ${tn('time_slots')} WHERE id = ?`, [slotId2]);
		} finally { await conn.end(); }
	});
});
