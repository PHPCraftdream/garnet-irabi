/**
 * Expert — editSlot must refuse cost / cancellation_penalty_percent changes
 * on a slot that already holds active bookings (audit C-2).
 *
 * A partially-booked multi-slot (max_users > 1) stays status='free' until
 * it fills up, while booked_count > 0 already reflects the active booking.
 * The old editSlot() gate (`status != 'free'`) let the expert retroactively
 * change cost / penalty after some users had already paid the old price.
 * Refund math (BookingsController::computeRefundAmounts) reads the slot's
 * CURRENT cost/penalty, so this was a direct money-manipulation channel.
 *
 * Coverage:
 *   1. Slot with booked_count=1, status='free' (C-2 state): POST editSlot
 *      changing cost OR cancellation_penalty_percent → 400, DB unchanged.
 *   2. Slot with booked_count=0 (no bookings): same edit succeeds and
 *      updates DB — proves the gate does not break the legitimate case.
 *   3. Slot with booked_count=1, status='free': editing a non-money field
 *      (location) still succeeds — proves the gate is scoped to
 *      cost / penalty only, not a blanket edit block.
 *
 * API endpoint: POST /expert/~editSlot (JSON body + CSRF via window.__GARNET_CSRF__).
 */
import { test, expect, tn } from '../helpers/scoped-test';
import mysql from 'mysql2/promise';
import { DB, withConnection } from '../helpers/db';
import type { Page } from '@playwright/test';

// File-level parallel — the three describes are independent (each creates
// its own slot). Each describe pins itself to `mode: 'serial'` below so
// its internal entry→action→assert→exit order is preserved.
test.describe.configure({ mode: 'parallel' });

const EXPERT_LOGIN = 'testuser_setup_expert@irabi.test';
const USER_LOGIN = 'testuser_setup_user@irabi.test';

// ── DB helpers ────────────────────────────────────────────────────────────────

async function getAccountId(login: string): Promise<number> {
	return withConnection(async (c) => {
		const [rows] = await c.execute<any[]>(
			`SELECT id FROM ${tn('accounts')} WHERE login = ?`, [login]
		);
		return Number(rows[0]?.id ?? 0);
	});
}

async function createMultiSlot(
	expertId: number,
	cost: number,
	maxUsers: number,
	penaltyPercent = 10,
): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const startAt = Math.floor(Date.now() / 1000) + 86400 * 5;
		const uid = [...Array(16)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
		const [result]: any = await conn.execute(
			`INSERT INTO ${tn('time_slots')}
			 (expert_id, start_at, end_at, duration_min, cost, is_online, location, max_users, booked_count, status, uid, created_at, cancellation_penalty_percent)
			 VALUES (?, ?, ?, 60, ?, 1, 'https://meet.example.com/original', ?, 0, 'free', ?, ?, ?)`,
			[expertId, startAt, startAt + 3600, cost, maxUsers, uid, Math.floor(Date.now() / 1000), penaltyPercent],
		);
		return Number(result.insertId);
	} finally {
		await conn.end();
	}
}

/**
 * Seed one booking directly and bump booked_count WITHOUT flipping status —
 * reproduces the C-2 partially-booked multi-slot state (1 of N seats taken,
 * status still 'free'), which is exactly the state the old gate let through.
 */
async function seedActiveBooking(
	slotId: number,
	userId: number,
	status: 'pending' | 'confirmed' = 'pending',
): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const now = Math.floor(Date.now() / 1000);
		const [result]: any = await conn.execute(
			`INSERT INTO ${tn('bookings')} (user_id, bookable_type, bookable_id, status, created_at)
			 VALUES (?, 'time_slot', ?, ?, ?)`,
			[userId, slotId, status, now],
		);
		await conn.execute(
			`UPDATE ${tn('time_slots')} SET booked_count = booked_count + 1 WHERE id = ?`,
			[slotId],
		);
		return Number(result.insertId);
	} finally {
		await conn.end();
	}
}

async function getSlot(slotId: number): Promise<any> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT * FROM ${tn('time_slots')} WHERE id = ?`, [slotId]
		);
		return rows[0] ?? null;
	} finally {
		await conn.end();
	}
}

async function cleanup(slotId: number, bookingIds: number[]): Promise<void> {
	const conn = await mysql.createConnection(DB);
	try {
		if (bookingIds.length) {
			const ph = bookingIds.map(() => '?').join(',');
			await conn.execute(`DELETE FROM ${tn('bookings')} WHERE id IN (${ph})`, bookingIds);
		}
		if (slotId) {
			await conn.execute(`DELETE FROM ${tn('time_slots')} WHERE id = ?`, [slotId]);
		}
	} finally {
		await conn.end();
	}
}

/** POST /expert/~editSlot as JSON with the page's CSRF; returns { status, body }. */
async function postEditSlot(
	page: Page,
	body: Record<string, unknown>,
): Promise<{ status: number; body: any }> {
	return page.evaluate(async (payload) => {
		const csrf = (window as any).__GARNET_CSRF__ || '';
		const res = await fetch('/expert/~editSlot', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
			body: JSON.stringify({ ...payload, CSRF_TOKEN: csrf }),
		});
		return { status: res.status, body: await res.json().catch(() => null) };
	}, body);
}

// ── Test 1: slot WITH active booking — cost / penalty edits blocked ──────────

test.describe('C-2: editSlot refuses cost/penalty change when booked_count > 0', () => {
	test.describe.configure({ mode: 'serial' });

	let expertId = 0;
	let userId = 0;
	let slotId = 0;
	let bookingId = 0;

	const ORIGINAL_COST = 200;
	const ORIGINAL_PENALTY = 10;

	// beforeAll/afterAll (not plain tests) — serial mode skips every
	// subsequent test once one fails, so a cleanup step written as a
	// regular test never runs after a mid-flow assertion fails, leaving
	// a stray test slot/booking behind for the rest of this worker's
	// run. Hooks run regardless of test outcome.
	test.beforeAll(async () => {
		expertId = await getAccountId(EXPERT_LOGIN);
		userId = await getAccountId(USER_LOGIN);
		expect(expertId).toBeGreaterThan(0);
		expect(userId).toBeGreaterThan(0);

		slotId = await createMultiSlot(expertId, ORIGINAL_COST, 3, ORIGINAL_PENALTY);
		expect(slotId).toBeGreaterThan(0);
		bookingId = await seedActiveBooking(slotId, userId, 'pending');

		// C-2 invariant: booking exists, slot is still 'free'.
		const slot = await getSlot(slotId);
		expect(slot.status).toBe('free');
		expect(Number(slot.booked_count)).toBe(1);
	});

	test('editSlot changing cost → 400 + DB unchanged', async ({ page }) => {
		test.skip(!slotId, 'setup failed');
		await page.goto('/expert/~slots');
		await page.waitForLoadState('domcontentloaded');

		const { status, body } = await postEditSlot(page, { slot_id: slotId, cost: 999 });

		expect(status).toBe(400);
		expect(body?.error).toMatch(/active bookings/);

		const slot = await getSlot(slotId);
		expect(Number(slot.cost)).toBe(ORIGINAL_COST);
	});

	test('editSlot changing cancellation_penalty_percent → 400 + DB unchanged', async ({ page }) => {
		test.skip(!slotId, 'setup failed');
		await page.goto('/expert/~slots');
		await page.waitForLoadState('domcontentloaded');

		const { status, body } = await postEditSlot(page, {
			slot_id: slotId,
			cancellation_penalty_percent: 99,
		});

		expect(status).toBe(400);
		expect(body?.error).toMatch(/active bookings/);

		const slot = await getSlot(slotId);
		expect(Number(slot.cancellation_penalty_percent)).toBe(ORIGINAL_PENALTY);
	});

	test('editSlot changing BOTH cost and penalty → 400 + DB unchanged', async ({ page }) => {
		test.skip(!slotId, 'setup failed');
		await page.goto('/expert/~slots');
		await page.waitForLoadState('domcontentloaded');

		const { status, body } = await postEditSlot(page, {
			slot_id: slotId,
			cost: 777,
			cancellation_penalty_percent: 50,
		});

		expect(status).toBe(400);
		expect(body?.error).toMatch(/active bookings/);

		const slot = await getSlot(slotId);
		expect(Number(slot.cost)).toBe(ORIGINAL_COST);
		expect(Number(slot.cancellation_penalty_percent)).toBe(ORIGINAL_PENALTY);
	});

	test.afterAll(async () => {
		await cleanup(slotId, bookingId ? [bookingId] : []);
	});
});

// ── Test 2: empty slot (booked_count=0) — cost edit succeeds ─────────────────

test.describe('C-2: editSlot still allows cost change when booked_count = 0', () => {
	test.describe.configure({ mode: 'serial' });

	let expertId = 0;
	let slotId = 0;

	test.beforeAll(async () => {
		expertId = await getAccountId(EXPERT_LOGIN);
		expect(expertId).toBeGreaterThan(0);
		slotId = await createMultiSlot(expertId, 100, 3, 5);
		expect(slotId).toBeGreaterThan(0);

		const slot = await getSlot(slotId);
		expect(Number(slot.booked_count)).toBe(0);
	});

	test('editSlot changing cost on empty slot → success + DB updated', async ({ page }) => {
		test.skip(!slotId, 'setup failed');
		await page.goto('/expert/~slots');
		await page.waitForLoadState('domcontentloaded');

		const { status, body } = await postEditSlot(page, { slot_id: slotId, cost: 500 });

		expect(status).toBe(200);
		expect(body?.success).toBe(true);
		expect(Number(body?.slot?.cost)).toBe(500);

		const slot = await getSlot(slotId);
		expect(Number(slot.cost)).toBe(500);
	});

	test.afterAll(async () => {
		await cleanup(slotId, []);
	});
});

// ── Test 3: slot WITH active booking — non-money field edit succeeds ─────────

test.describe('C-2: editSlot allows non-money field edits with booked_count > 0', () => {
	test.describe.configure({ mode: 'serial' });

	let expertId = 0;
	let userId = 0;
	let slotId = 0;
	let bookingId = 0;

	test.beforeAll(async () => {
		expertId = await getAccountId(EXPERT_LOGIN);
		userId = await getAccountId(USER_LOGIN);
		expect(expertId).toBeGreaterThan(0);
		expect(userId).toBeGreaterThan(0);

		slotId = await createMultiSlot(expertId, 250, 3, 15);
		expect(slotId).toBeGreaterThan(0);
		bookingId = await seedActiveBooking(slotId, userId, 'confirmed');

		const slot = await getSlot(slotId);
		expect(slot.status).toBe('free');
		expect(Number(slot.booked_count)).toBe(1);
	});

	test('editSlot changing location → success + DB updated (gate is scoped to cost/penalty)', async ({ page }) => {
		test.skip(!slotId, 'setup failed');
		await page.goto('/expert/~slots');
		await page.waitForLoadState('domcontentloaded');

		const { status, body } = await postEditSlot(page, {
			slot_id: slotId,
			location: 'https://meet.example.com/updated-by-expert',
		});

		expect(status).toBe(200);
		expect(body?.success).toBe(true);
		expect(body?.slot?.location).toBe('https://meet.example.com/updated-by-expert');

		const slot = await getSlot(slotId);
		expect(slot.location).toBe('https://meet.example.com/updated-by-expert');
		// Money fields untouched.
		expect(Number(slot.cost)).toBe(250);
		expect(Number(slot.cancellation_penalty_percent)).toBe(15);
	});

	test.afterAll(async () => {
		await cleanup(slotId, bookingId ? [bookingId] : []);
	});
});
