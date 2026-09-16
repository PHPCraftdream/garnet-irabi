/**
 * D-193 (#418): reschedule end-to-end through the real UI — not just the
 * service (BookingRescheduleService) or the raw endpoint (post__reschedule),
 * which #416 already covers structurally. This spec drives the actual
 * "Перенести" button → RescheduleModal → slot pick → submit flow added in
 * #417, and checks the contract's central promise: rescheduling never moves
 * money. Zero-cost slots keep the setup free of balance top-up noise while
 * still exercising the full path (reserveSeat → CAS bookable_id swap →
 * releaseSeat → syncSlotState on both slots).
 */
import { test, expect, tn } from '../helpers/scoped-test';
import mysql from 'mysql2/promise';
import { DB } from '../helpers/db';
test.describe.configure({ mode: 'serial' });

async function createTestSlot(startOffsetDays: number): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const [expertAccRows] = await conn.execute<any[]>(
			`SELECT id FROM ${tn('accounts')} WHERE login = 'testuser_setup_expert@irabi.test'`
		);
		const expertId = expertAccRows[0]?.id;
		if (!expertId) return 0;

		const startAt = Math.floor(Date.now() / 1000) + 86400 * startOffsetDays;
		const uid = [...Array(16)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
		const [result]: any = await conn.execute(
			`INSERT INTO ${tn('time_slots')}
			 (expert_id, start_at, end_at, duration_min, cost, is_online, location, max_users, status, uid, created_at)
			 VALUES (?, ?, ?, 60, 0, 1, 'https://meet.example.com/d193-reschedule-test', 1, 'free', ?, ?)`,
			[expertId, startAt, startAt + 3600, uid, Math.floor(Date.now() / 1000)]
		);
		return result.insertId;
	} finally {
		await conn.end();
	}
}

async function deleteTestSlot(slotId: number): Promise<void> {
	if (!slotId) return;
	const conn = await mysql.createConnection(DB);
	try {
		await conn.execute(
			`DELETE FROM ${tn('balance_ledger')} WHERE ref_type = 'booking' AND ref_id IN (SELECT id FROM ${tn('bookings')} WHERE bookable_type='time_slot' AND bookable_id=?)`,
			[slotId]
		);
		await conn.execute(`DELETE FROM ${tn('bookings')} WHERE bookable_type='time_slot' AND bookable_id=?`, [slotId]);
		await conn.execute(`DELETE FROM ${tn('time_slots')} WHERE id=?`, [slotId]);
	} finally {
		await conn.end();
	}
}

async function getSlot(slotId: number): Promise<any> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(`SELECT * FROM ${tn('time_slots')} WHERE id=?`, [slotId]);
		return rows[0];
	} finally {
		await conn.end();
	}
}

async function getBooking(bookingId: number): Promise<any> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(`SELECT * FROM ${tn('bookings')} WHERE id=?`, [bookingId]);
		return rows[0];
	} finally {
		await conn.end();
	}
}

async function ledgerRowCount(): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(`SELECT COUNT(*) AS cnt FROM ${tn('balance_ledger')}`);
		return Number(rows[0]?.cnt ?? 0);
	} finally {
		await conn.end();
	}
}

test.describe('D-193: reschedule a booking through the real UI', () => {
	let slotAId = 0;
	let slotBId = 0;
	let bookingId = 0;

	test.beforeAll(async () => {
		slotAId = await createTestSlot(7);
		slotBId = await createTestSlot(8);
		expect(slotAId).toBeGreaterThan(0);
		expect(slotBId).toBeGreaterThan(0);
	});

	test.afterAll(async () => {
		await deleteTestSlot(slotAId);
		await deleteTestSlot(slotBId);
	});

	test('book slot A via UI', async ({ page }) => {
		if (!slotAId) { test.skip(); return; }
		await page.goto(`/system/bookings/id~${slotAId}/~book`);
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

	test('reschedule to slot B through the modal moves the booking, not the money', async ({ page }) => {
		if (!bookingId) { test.skip(); return; }
		const ledgerBefore = await ledgerRowCount();
		const bookingBefore = await getBooking(bookingId);

		await page.goto('/system/bookings');
		const rescheduleBtn = page.locator(`[data-test-id="reschedule-btn-${bookingId}"]`);
		await expect(rescheduleBtn).toBeVisible({ timeout: 8000 });
		await rescheduleBtn.click();

		const modal = page.locator('[data-test-id="reschedule-modal"]');
		await expect(modal).toBeVisible({ timeout: 5000 });

		const option = page.locator(`[data-test-id="reschedule-option-${slotBId}"] input[type="radio"]`);
		await expect(option).toBeVisible({ timeout: 8000 });
		await option.check();
		await page.locator('[data-test-id="reschedule-modal-submit"]').click();
		await expect(modal).not.toBeVisible({ timeout: 10000 });
		await page.waitForTimeout(500);

		const bookingAfter = await getBooking(bookingId);
		expect(bookingAfter.bookable_id).toBe(slotBId);
		// Never confirmed in this test, so no pending→confirmed asymmetry to
		// exercise — just: reschedule must not silently change the status.
		expect(bookingAfter.status).toBe(bookingBefore.status);

		const slotA = await getSlot(slotAId);
		const slotB = await getSlot(slotBId);
		expect(slotA.status).toBe('free');
		expect(Number(slotA.booked_count)).toBe(0);
		expect(Number(slotB.booked_count)).toBe(1);

		// The whole point of D-193: not one new balance_ledger row.
		expect(await ledgerRowCount()).toBe(ledgerBefore);
	});
});
