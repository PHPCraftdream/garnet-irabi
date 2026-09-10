/**
 * D-163 [MAJOR]: a booking write reserves capacity first
 * (`TimeSlots::reserveSeat()` — `booked_count + 1`) and only inserts the
 * `bookings` row a moment later. A crash in that exact window — a killed
 * worker, OOM, anything PHP's own try/catch cannot intercept, unlike every
 * ordinary failure path in BookingsController/SlotsController which already
 * compensate correctly — leaves `booked_count` incremented forever with no
 * booking row left to ever release it. `status` never leaves 'free' (the CAS
 * flip to 'booked' only runs after a successful insert, which never
 * happened), so the slot LOOKS intact everywhere that only checks `status`.
 *
 * Two things made this genuinely unrecoverable (support ticket #3 — a
 * confirmed no-charge, no-booking incident, three adjacent slots gone from
 * the expert's own slot list with no trace):
 *
 *  1. `ExpertSlotsService::deleteSlot()` only checked the `bookings` table
 *     for active rows — a slot mid-reservation (booked_count > 0, no
 *     bookings row yet) passed that check and got hard-deleted, wiping out
 *     the in-flight booking's target entirely.
 *  2. Nothing ever revisited `booked_count` again on its own — a crash-
 *     orphaned reservation on a slot nobody tried to delete stayed stuck
 *     forever, silently eating a seat with no way back except manually
 *     recreating the slot.
 *
 * Fixed: deleteSlot() now also refuses when booked_count > 0, and a new
 * `reconcile-slot-seats` cron task resyncs booked_count/status from the
 * actual set of active (pending/confirmed) bookings every tick.
 */

import { test, expect, tn, getDbPrefix } from '../helpers/scoped-test';
import mysql from 'mysql2/promise';
import { DB, withConnection } from '../helpers/db';
import { spawnSync } from 'child_process';
import * as path from 'path';

// __dirname = Apps/IRabi/Tests/expert → two levels up → Apps/IRabi
const APP_DIR = path.resolve(__dirname, '../..');

test.describe.configure({ mode: 'serial' });

async function getAccountId(login: string): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(`SELECT id FROM ${tn('accounts')} WHERE login = ?`, [login]);
		return rows[0]?.id ?? 0;
	} finally { await conn.end(); }
}

function generateUid(): string {
	return [...Array(16)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
}

async function createFreeSlot(expertId: number, maxUsers: number, bookedCount: number, offsetDays: number): Promise<number> {
	return withConnection(async (c) => {
		const startAt = Math.floor(Date.now() / 1000) + 86400 * offsetDays;
		const [res]: any = await c.execute(
			`INSERT INTO ${tn('time_slots')}
			 (expert_id, start_at, end_at, duration_min, cost, is_online, location, max_users, booked_count, status, uid, created_at)
			 VALUES (?, ?, ?, 60, 500, 1, 'https://meet.example.com/d163-test', ?, ?, 'free', ?, ?)`,
			[expertId, startAt, startAt + 3600, maxUsers, bookedCount, generateUid(), Math.floor(Date.now() / 1000)],
		);
		return res.insertId;
	});
}

async function createPendingBooking(slotId: number, userId: number): Promise<number> {
	return withConnection(async (c) => {
		const [res]: any = await c.execute(
			`INSERT INTO ${tn('bookings')} (user_id, bookable_type, bookable_id, status, created_at) VALUES (?, 'time_slot', ?, 'pending', ?)`,
			[userId, slotId, Math.floor(Date.now() / 1000)],
		);
		return res.insertId;
	});
}

async function getSlot(slotId: number): Promise<{ status: string; booked_count: number } | null> {
	return withConnection(async (c) => {
		const [rows] = await c.execute<any[]>(`SELECT status, booked_count FROM ${tn('time_slots')} WHERE id = ?`, [slotId]);
		return rows[0] ?? null;
	});
}

async function cleanupSlot(slotId: number): Promise<void> {
	if (!slotId) return;
	await withConnection(async (c) => {
		await c.execute(`DELETE FROM ${tn('bookings')} WHERE bookable_type = 'time_slot' AND bookable_id = ?`, [slotId]);
		await c.execute(`DELETE FROM ${tn('time_slots')} WHERE id = ?`, [slotId]);
	});
}

test.describe('D-163: a slot with an in-flight (crash-orphaned) reservation cannot be deleted', () => {
	let expertId = 0;
	let slotId = 0;

	test.beforeAll(async () => {
		expertId = await getAccountId('testuser_setup_expert@irabi.test');
		expect(expertId).toBeGreaterThan(0);

		// Simulates the exact orphaned state: reserveSeat() incremented
		// booked_count, but the crash happened before the bookings INSERT —
		// so there is deliberately NO bookings row here.
		slotId = await createFreeSlot(expertId, 1, 1, 9);
		expect(slotId).toBeGreaterThan(0);
	});

	test.afterAll(async () => {
		await cleanupSlot(slotId);
	});

	test('POST /expert/~deleteSlot refuses and the slot survives', async ({ expertPage }) => {
		await expertPage.goto('/expert/~slots', { waitUntil: 'domcontentloaded' });

		const result = await expertPage.evaluate(async (args: { slotId: number }) => {
			const csrf = (window as any).__GARNET_CSRF__ || '';
			const fd = new FormData();
			fd.append('CSRF_TOKEN', csrf);
			fd.append('slot_id', String(args.slotId));
			const res = await fetch('/expert/~deleteSlot', { method: 'POST', body: fd });
			return { status: res.status, body: await res.json().catch(() => null) };
		}, { slotId });

		expect(result.status).toBe(400);
		expect(result.body?.error).toBeTruthy();

		const slot = await getSlot(slotId);
		expect(slot).not.toBeNull();
		expect(slot!.booked_count).toBe(1);
	});
});

test.describe('D-163: reconcile-slot-seats cron heals a stuck booked_count', () => {
	let expertId = 0;
	let userId = 0;
	let orphanedSlotId = 0;
	let legitSlotId = 0;
	let legitBookingId = 0;

	test.beforeAll(async () => {
		expertId = await getAccountId('testuser_setup_expert@irabi.test');
		userId = await getAccountId('testuser_setup_user@irabi.test');
		expect(expertId).toBeGreaterThan(0);
		expect(userId).toBeGreaterThan(0);

		// Orphaned: booked_count=1, no bookings row — must be healed back to 0.
		orphanedSlotId = await createFreeSlot(expertId, 1, 1, 10);
		// Control: booked_count=1 backed by a REAL pending booking — must be
		// left exactly alone, proving the cron doesn't clobber a live reservation.
		legitSlotId = await createFreeSlot(expertId, 1, 1, 10);
		legitBookingId = await createPendingBooking(legitSlotId, userId);

		expect(orphanedSlotId).toBeGreaterThan(0);
		expect(legitSlotId).toBeGreaterThan(0);
	});

	test.afterAll(async () => {
		await cleanupSlot(orphanedSlotId);
		await cleanupSlot(legitSlotId);
	});

	test('run real cron reconcile-slot-seats (CronCompletionService)', () => {
		const prefix = getDbPrefix();
		const res = spawnSync('php', ['run_cmd.php', 'cron', 'reconcile-slot-seats'], {
			cwd: APP_DIR,
			env: { ...process.env, DB_PREFIX_OVERRIDE: prefix },
			encoding: 'utf8',
		});
		const out = (res.stdout ?? '') + (res.stderr ?? '');
		console.log('[cron output]', out.trim());
		// Same rationale as booking-time-guards.spec.ts's Fix 7 test: the cron_log
		// INSERT fails in isolated test-worker scopes (table not migrated there),
		// but the reconciliation logic itself has already run by that point.
		expect(out).toContain('Reconciled:');
	});

	test('orphaned reservation is healed: booked_count back to 0, still free', async () => {
		const slot = await getSlot(orphanedSlotId);
		expect(slot).not.toBeNull();
		expect(slot!.booked_count).toBe(0);
		expect(slot!.status).toBe('free');
	});

	test('a legitimate pending booking is left untouched', async () => {
		const slot = await getSlot(legitSlotId);
		expect(slot).not.toBeNull();
		expect(slot!.booked_count).toBe(1);
		expect(slot!.status).toBe('free'); // max_users=1, booked_count=1 → would flip to 'booked' by the normal booking flow, not this cron's concern

		const booking = await withConnection(async (c) => {
			const [rows] = await c.execute<any[]>(`SELECT status FROM ${tn('bookings')} WHERE id = ?`, [legitBookingId]);
			return rows[0];
		});
		expect(booking.status).toBe('pending');
	});
});
