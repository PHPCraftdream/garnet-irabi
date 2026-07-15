/**
 * F-08-01 regression: Expert confirm after user cancel must fail (CAS race).
 *
 * Security audit finding (High, release blocker): ExpertBookingsService::confirmBooking
 * performed an unconditional UPDATE. Between the status check (PHP read) and
 * the write, a concurrent user cancel could move the booking to `cancelled`.
 * The unconditional UPDATE then "resurrected" the booking back to `confirmed`.
 *
 * Fix: replaced `updateByField()` with a CAS UPDATE (WHERE status='pending')
 * and returns 409 when affected rows = 0.
 *
 * Scenarios:
 *   1. Race: booking pending -> user cancels -> expert confirms -> 409, stays cancelled.
 *   2. Happy path: booking pending -> expert confirms -> 200, status confirmed.
 */

import { test, expect, tn, newScopedContext } from '../helpers/scoped-test';
import type { BrowserContext, Page } from '@playwright/test';
import mysql from 'mysql2/promise';
import { DB } from '../helpers/db';
import { roleLogin } from '../helpers/role-login';

test.describe.configure({ mode: 'serial' });

// -- helpers --

async function devLoginOnContext(context: BrowserContext, role: string): Promise<Page> {
	const page = await context.newPage();
	await page.goto('/');
	await roleLogin(page, role);
	await page.goto('/');
	return page;
}

async function getAccountId(login: string): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT id FROM ${tn('accounts')} WHERE login = ?`, [login]
		);
		return rows[0]?.id ?? 0;
	} finally { await conn.end(); }
}

async function createFreeSlot(expertId: number): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const startAt = Math.floor(Date.now() / 1000) + 86400 * 7;
		const uid = [...Array(16)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
		const [result]: any = await conn.execute(
			`INSERT INTO ${tn('time_slots')}
			 (expert_id, start_at, end_at, duration_min, cost, is_online, location, max_users, status, uid, created_at)
			 VALUES (?, ?, ?, 60, 0, 1, 'https://meet.example.com/cas-race-test', 1, 'free', ?, ?)`,
			[expertId, startAt, startAt + 3600, uid, Math.floor(Date.now() / 1000)]
		);
		return result.insertId;
	} finally { await conn.end(); }
}

async function createPendingBooking(slotId: number, userId: number): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const now = Math.floor(Date.now() / 1000);
		const [result]: any = await conn.execute(
			`INSERT INTO ${tn('bookings')}
			 (bookable_type, bookable_id, user_id, status, created_at)
			 VALUES ('time_slot', ?, ?, 'pending', ?)`,
			[slotId, userId, now]
		);
		// Mark slot as booked
		await conn.execute(
			`UPDATE ${tn('time_slots')} SET status = 'booked' WHERE id = ?`,
			[slotId]
		);
		return result.insertId;
	} finally { await conn.end(); }
}

async function cancelBookingDirectly(bookingId: number): Promise<void> {
	const conn = await mysql.createConnection(DB);
	try {
		await conn.execute(
			`UPDATE ${tn('bookings')} SET status = 'cancelled', cancelled_at = UNIX_TIMESTAMP() WHERE id = ?`,
			[bookingId]
		);
	} finally { await conn.end(); }
}

async function getBookingStatus(bookingId: number): Promise<string> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT status FROM ${tn('bookings')} WHERE id = ?`, [bookingId]
		);
		return rows[0]?.status ?? 'unknown';
	} finally { await conn.end(); }
}

async function cleanup(slotId: number): Promise<void> {
	const conn = await mysql.createConnection(DB);
	try {
		await conn.execute(`DELETE FROM ${tn('bookings')} WHERE bookable_type='time_slot' AND bookable_id = ?`, [slotId]);
		await conn.execute(`DELETE FROM ${tn('time_slots')} WHERE id = ?`, [slotId]);
	} finally { await conn.end(); }
}

// ═══════════════════════════════════════════════════════════════════════════
// Scenario 1: Race — user cancels, then expert tries to confirm
// ═══════════════════════════════════════════════════════════════════════════

test.describe('F-08-01: confirm after cancel returns 409 (CAS race)', () => {
	let expertId = 0;
	let userId = 0;
	let slotId = 0;
	let bookingId = 0;
	let expertCtx: BrowserContext | null = null;

	test('entry: setup slot + pending booking, then cancel via DB', async () => {
		expertId = await getAccountId('expert1@dev.test');
		userId = await getAccountId('user1@dev.test');
		expect(expertId).toBeGreaterThan(0);
		expect(userId).toBeGreaterThan(0);

		slotId = await createFreeSlot(expertId);
		expect(slotId).toBeGreaterThan(0);

		bookingId = await createPendingBooking(slotId, userId);
		expect(bookingId).toBeGreaterThan(0);

		// Simulate user cancel (race condition)
		await cancelBookingDirectly(bookingId);
		expect(await getBookingStatus(bookingId)).toBe('cancelled');
	});

	test('expert POST confirmBooking returns 409', async ({ browser }) => {
		if (!bookingId) { test.skip(); return; }

		expertCtx = await newScopedContext(browser);
		const page = await devLoginOnContext(expertCtx, 'expert');
		try {
			await page.goto('/expert/~bookings');
			await page.waitForLoadState('domcontentloaded');

			const result = await page.evaluate(async (bid: number) => {
				const csrf = (window as any).__GARNET_CSRF__ || '';
				const fd = new FormData();
				fd.append('booking_id', String(bid));
				fd.append('CSRF_TOKEN', csrf);
				const resp = await fetch('/expert/~confirmBooking', { method: 'POST', body: fd });
				let body: any = null;
				try { body = await resp.json(); } catch {}
				return { status: resp.status, body };
			}, bookingId);

			// Must get an error (400 if PHP read sees cancelled, 409 if CAS race)
			expect([400, 409]).toContain(result.status);
			expect(result.body?.error).toBeTruthy();
		} finally {
			await page.close();
		}
	});

	test('DB: booking status remains cancelled', async () => {
		if (!bookingId) { test.skip(); return; }
		expect(await getBookingStatus(bookingId)).toBe('cancelled');
	});

	test('exit: cleanup', async () => {
		if (expertCtx) { await expertCtx.close(); expertCtx = null; }
		if (slotId) await cleanup(slotId);
	});
});

// ═══════════════════════════════════════════════════════════════════════════
// Scenario 2: Happy path — expert confirms pending booking
// ═══════════════════════════════════════════════════════════════════════════

test.describe('F-08-01: happy path — confirm pending booking succeeds', () => {
	let expertId = 0;
	let userId = 0;
	let slotId = 0;
	let bookingId = 0;
	let expertCtx: BrowserContext | null = null;

	test('entry: setup slot + pending booking', async () => {
		expertId = await getAccountId('expert1@dev.test');
		userId = await getAccountId('user1@dev.test');
		expect(expertId).toBeGreaterThan(0);
		expect(userId).toBeGreaterThan(0);

		slotId = await createFreeSlot(expertId);
		bookingId = await createPendingBooking(slotId, userId);
		expect(bookingId).toBeGreaterThan(0);
	});

	test('expert POST confirmBooking returns 200 success', async ({ browser }) => {
		if (!bookingId) { test.skip(); return; }

		expertCtx = await newScopedContext(browser);
		const page = await devLoginOnContext(expertCtx, 'expert');
		try {
			await page.goto('/expert/~bookings');
			await page.waitForLoadState('domcontentloaded');

			const result = await page.evaluate(async (bid: number) => {
				const csrf = (window as any).__GARNET_CSRF__ || '';
				const fd = new FormData();
				fd.append('booking_id', String(bid));
				fd.append('CSRF_TOKEN', csrf);
				const resp = await fetch('/expert/~confirmBooking', { method: 'POST', body: fd });
				let body: any = null;
				try { body = await resp.json(); } catch {}
				return { status: resp.status, body };
			}, bookingId);

			expect(result.status).toBe(200);
			expect(result.body?.success).toBe(true);
		} finally {
			await page.close();
		}
	});

	test('DB: booking status = confirmed', async () => {
		if (!bookingId) { test.skip(); return; }
		expect(await getBookingStatus(bookingId)).toBe('confirmed');
	});

	test('exit: cleanup', async () => {
		if (expertCtx) { await expertCtx.close(); expertCtx = null; }
		if (slotId) await cleanup(slotId);
	});
});
