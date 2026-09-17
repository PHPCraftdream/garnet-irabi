/**
 * D-147: ссылка на встречу остаётся видна после завершения занятия —
 * человеку она нужна и потом, чтобы вернуться к записи.
 *
 * Часть разобранного booking-time-guards.spec.ts (был один файл на
 * 1259 строк). Последовательный режим сохранён: проверки внутри
 * опираются на состояние, оставленное предыдущей.
 */

import { test, expect, tn, getDbPrefix } from '../../../../helpers/scoped-test';
import { DB } from '../../../../helpers/db/db';
import mysql from 'mysql2/promise';
import { runServerCommand } from '../../../../helpers/db/server-command';
import {
    cleanupSlot,
    devLogin,
    generateUid,
    getAccountId,
    getBookingStatus,
    seedBooking,
    postBookingsPage,
} from './helpers';

test.describe.configure({ mode: 'serial' });

test.describe('D-147: meeting link stays visible after the session (booked slot) completes', () => {
	let userId = 0;
	let expertId = 0;
	let slotId = 0;
	let bookingId = 0;
	const MEETING_URL = 'https://meet.example.com/d147-test';

	test.beforeAll(async () => {
		userId = await getAccountId('user1@dev.test');
		expertId = await getAccountId('expert1@dev.test');
		expect(userId).toBeGreaterThan(0);
		expect(expertId).toBeGreaterThan(0);

		const now = Math.floor(Date.now() / 1000);
		const pastStart = now - 7200;
		const pastEnd = now - 3600;

		// status='booked' (max_users=1, fully booked) — takes the FIRST cron
		// branch (slots.where status='booked'), NOT the D-144 under-subscribed
		// path, keeping this test focused on the confirmed->completed status
		// transition alone.
		const conn = await mysql.createConnection(DB);
		try {
			const [res]: any = await conn.execute(
				`INSERT INTO ${tn('time_slots')}
				 (expert_id, start_at, end_at, duration_min, cost, is_online, location, max_users, booked_count, status, uid, created_at)
				 VALUES (?, ?, ?, 60, 0, 1, ?, 1, 1, 'booked', ?, ?)`,
				[expertId, pastStart, pastEnd, MEETING_URL, generateUid(), Math.floor(Date.now() / 1000)],
			);
			slotId = res.insertId;
		} finally { await conn.end(); }
		expect(slotId).toBeGreaterThan(0);

		bookingId = await seedBooking({ userId, slotId, status: 'confirmed' });
		expect(bookingId).toBeGreaterThan(0);
	});

	test('before cron: booking confirmed, /bookings/~page already shows the real link', async ({ browser }) => {
		if (!bookingId) { test.skip(); return; }
		expect(await getBookingStatus(bookingId)).toBe('confirmed');

		const { context, page } = await devLogin(browser, 'user');
		try {
			const result = await postBookingsPage(page);
			expect(result.status).toBe(200);
			expect(result.body.slots[String(slotId)].location).toBe(MEETING_URL);
		} finally {
			await context.close();
		}
	});

	test('run real cron complete-expired', () => {
		const prefix = getDbPrefix();
		const res = runServerCommand(['cron', 'complete-expired'], prefix);
		const out = res.stdout + res.stderr;
		expect(out).toContain('Completed:');
	});

	test('after cron: booking is completed, but /bookings/~page STILL shows the real link', async ({ browser }) => {
		if (!bookingId) { test.skip(); return; }
		expect(await getBookingStatus(bookingId)).toBe('completed');

		const { context, page } = await devLogin(browser, 'user');
		try {
			const result = await postBookingsPage(page);
			expect(result.status).toBe(200);
			expect(result.body.slots[String(slotId)].location).toBe(MEETING_URL);
		} finally {
			await context.close();
		}
	});

	test.afterAll(async () => {
		if (slotId) await cleanupSlot(slotId);
	});
});
