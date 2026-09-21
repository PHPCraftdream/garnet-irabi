/**
 * D-199: деньги идут за словами — неотвеченная заявка снимается в
 * самом начале, а не висит до занятия.
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
    emailQueueMaxId,
    ensureBalance,
    getAccountId,
    getBookingStatus,
    getSlotStatus,
    getUserCancellationKind,
    recalcBalance,
    refundEntryAmount,
    seedBooking,
    seedSlot,
} from './helpers';

test.describe.configure({ mode: 'serial' });

test.describe('D-199: the money follows the words — an unanswered request is dropped at the start', () => {
	const COST = 400;

	let userId = 0;
	let expertId = 0;
	let runningSlotId = 0;
	let runningBookingId = 0;
	let futureSlotId = 0;
	let futureBookingId = 0;
	let emailMaxIdBefore = 0;

	test.beforeAll(async () => {
		userId = await getAccountId('user1@dev.test');
		expertId = await getAccountId('expert1@dev.test');
		expect(userId).toBeGreaterThan(0);
		expect(expertId).toBeGreaterThan(0);

		const now = Math.floor(Date.now() / 1000);

		await ensureBalance(userId, COST + 2000);
		await ensureBalance(expertId, COST + 2000);
		emailMaxIdBefore = await emailQueueMaxId('user1@dev.test');

		// TARGET: the lesson is running RIGHT NOW — started ten minutes ago,
		// fifty still to go — and the expert never answered.
		runningSlotId = await seedSlot({
			expertId,
			startAt: now - 600,
			endAt: now + 3000,
			status: 'free',
			cost: COST,
			maxUsers: 2,
		});
		expect(runningSlotId).toBeGreaterThan(0);
		runningBookingId = await seedBooking({ userId, slotId: runningSlotId, status: 'pending', cost: COST, expertId });
		expect(runningBookingId).toBeGreaterThan(0);

		// CONTROL: same shape, but the lesson has not started. The expert still
		// has every right to take their time answering it.
		const futureStart = now + 86400 * 3;
		futureSlotId = await seedSlot({
			expertId,
			startAt: futureStart,
			endAt: futureStart + 3600,
			status: 'free',
			cost: COST,
			maxUsers: 2,
		});
		expect(futureSlotId).toBeGreaterThan(0);
		futureBookingId = await seedBooking({ userId, slotId: futureSlotId, status: 'pending', cost: COST, expertId });
		expect(futureBookingId).toBeGreaterThan(0);
	});

	test.afterAll(async () => {
		if (runningSlotId) await cleanupSlot(runningSlotId);
		if (futureSlotId) await cleanupSlot(futureSlotId);
		if (emailMaxIdBefore > 0) {
			const conn = await mysql.createConnection(DB);
			try {
				await conn.execute(
					`DELETE FROM ${tn('email_queue')} WHERE recipient_email = ? AND id > ?`,
					['user1@dev.test', emailMaxIdBefore]
				);
			} finally { await conn.end(); }
		}
		if (userId) await recalcBalance(userId);
		if (expertId) await recalcBalance(expertId);
	});

	test('before cron: both requests are still waiting for the expert', async () => {
		if (!runningBookingId) { test.skip(); return; }
		expect(await getBookingStatus(runningBookingId)).toBe('pending');
		expect(await getBookingStatus(futureBookingId)).toBe('pending');
	});

	test('run real cron complete-expired', () => {
		const prefix = getDbPrefix();
		const res = runServerCommand(['cron', 'complete-expired'], prefix);
		const out = res.stdout + res.stderr;
		console.log('[cron output]', out.trim());
		expect(out).toContain('Completed:');
	});

	test('the request on the lesson under way is dropped, with the money returned in full', async () => {
		if (!runningBookingId) { test.skip(); return; }

		// Before the fix this survived until end_at — another fifty minutes of
		// the student's money sitting frozen for a lesson they are not in.
		expect(await getBookingStatus(runningBookingId)).toBe('cancelled');

		// Both sides of the refund, read off THIS booking's own ledger rows
		// rather than account totals: other bookings are refunded in the same
		// pass, and a balance comparison would be measuring their sum.
		expect(await refundEntryAmount(runningBookingId, userId, true)).toBe(COST);
		expect(await refundEntryAmount(runningBookingId, expertId, false)).toBe(COST);

		// Counted as a decline, like every other request the expert let pass.
		expect(await getUserCancellationKind(runningBookingId)).toBe('decline');
	});

	test('D-254: the auto-decline posts the same chat notice a manual decline would', async () => {
		if (!runningBookingId) { test.skip(); return; }

		const conn = await mysql.createConnection(DB);
		try {
			const [convRows] = await conn.execute<any[]>(
				`SELECT id FROM ${tn('im_conversations')}
				 WHERE (participant_a = ? AND participant_b = ?) OR (participant_a = ? AND participant_b = ?)`,
				[expertId, userId, userId, expertId],
			);
			expect(convRows.length).toBeGreaterThan(0);
			const convId = convRows[0].id;

			const [msgRows] = await conn.execute<any[]>(
				`SELECT sender_id, body FROM ${tn('im_messages')}
				 WHERE conversation_id = ? AND sender_id = ? AND body LIKE ?
				 ORDER BY id DESC LIMIT 1`,
				[convId, expertId, '%отклонена%'],
			);
			expect(msgRows.length).toBe(1);
		} finally {
			await conn.end();
		}
	});

	test('control: the lesson in progress itself stays open — only the request died', async () => {
		if (!runningSlotId) { test.skip(); return; }
		// The distinction the fix rests on. The request has no future the
		// moment the lesson starts; the lesson does — it is running right now
		// for whoever was confirmed in time, and must stay open until end_at.
		expect(await getSlotStatus(runningSlotId)).toBe('free');
	});

	test('control: a request on a lesson that has not started is left alone', async () => {
		if (!futureBookingId) { test.skip(); return; }
		expect(await getBookingStatus(futureBookingId)).toBe('pending');
		expect(await refundEntryAmount(futureBookingId, userId, true)).toBe(0);
		expect(await getSlotStatus(futureSlotId)).toBe('free');
	});
});
