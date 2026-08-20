/**
 * F-02 (P1, release-review blocker): both expert slot-creation endpoints
 * must refuse a start time in the past — the server used to validate only
 * `DateUtils::parseUserDateTime() > 0` (a parse-success check), never
 * comparing the parsed timestamp against `time()`. That let an expert (or
 * a replayed/stale form submission) create bookable slots that were
 * already unbookable the moment they landed in the DB.
 *
 * Fix under test (ExpertSlotsService.php):
 *   - createSlot()  (single):  reject with 400 when start_at < time().
 *   - batchSlots()  (batch):   reject the WHOLE request with 400 when ANY
 *     row's start_at < time() — no partial creation, matching how the
 *     batch path already whole-rejects on internal overlaps.
 *
 * Coverage:
 *   1. Single create, start time 1 hour in the past → 400, nothing created.
 *   2. Batch create, one past-time row mixed with otherwise-valid future
 *      rows → 400, NOTHING created (not even the valid rows).
 *   3. Boundary: start time 30s in the future (still > time() by the time
 *      the request lands) → succeeds; start time 30s in the past → 400.
 *      Exercised in the expert's configured timezone (Europe/Moscow, see
 *      setup/expert.setup.ts) via DateUtils::parseUserDateTime's date+time
 *      wall-clock parsing — same mechanism createSlot/batchSlots use.
 *
 * API endpoints: POST /expert/~slots, POST /expert/~batchSlots
 * (JSON errors; CSRF via window.__GARNET_CSRF__, same convention as the
 * other expert-panel specs).
 */
import { test, expect, tn } from '../helpers/scoped-test';
import mysql from 'mysql2/promise';
import { DB, withConnection } from '../helpers/db';
import { EXPERT_LOGIN } from '../helpers/logins';
import type { Page } from '@playwright/test';

test.describe.configure({ mode: 'parallel' });

// Expert's timezone per setup/expert.setup.ts — must match so date/time
// strings sent to the endpoints parse to the wall-clock we expect.
const EXPERT_TZ = 'Europe/Moscow';

async function getAccountId(login: string): Promise<number> {
	return withConnection(async (c) => {
		const [rows] = await c.execute<any[]>(
			`SELECT id FROM ${tn('accounts')} WHERE login = ?`, [login]
		);
		return Number(rows[0]?.id ?? 0);
	});
}

async function countSlotsForExpert(expertId: number, sinceCreatedAt: number): Promise<number> {
	return withConnection(async (c) => {
		const [rows] = await c.execute<any[]>(
			`SELECT COUNT(*) as cnt FROM ${tn('time_slots')} WHERE expert_id = ? AND created_at >= ?`,
			[expertId, sinceCreatedAt]
		);
		return Number(rows[0]?.cnt ?? 0);
	});
}

async function deleteSlotsCreatedSince(expertId: number, sinceCreatedAt: number): Promise<void> {
	const conn = await mysql.createConnection(DB);
	try {
		await conn.execute(
			`DELETE FROM ${tn('time_slots')} WHERE expert_id = ? AND created_at >= ?`,
			[expertId, sinceCreatedAt]
		);
	} finally {
		await conn.end();
	}
}

/** Format a JS Date as `Y-m-d` / `H:i` in the given IANA timezone. */
function formatInTz(date: Date, tz: string): { dateStr: string; timeStr: string } {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone: tz,
		year: 'numeric', month: '2-digit', day: '2-digit',
		hour: '2-digit', minute: '2-digit', second: '2-digit',
		hour12: false,
	}).formatToParts(date);
	const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
	return {
		dateStr: `${get('year')}-${get('month')}-${get('day')}`,
		timeStr: `${get('hour')}:${get('minute')}`,
	};
}

function pastDateTime(secondsAgo: number, tz: string) {
	return formatInTz(new Date(Date.now() - secondsAgo * 1000), tz);
}

function futureDateTime(secondsAhead: number, tz: string) {
	return formatInTz(new Date(Date.now() + secondsAhead * 1000), tz);
}

/** POST /expert/~slots as JSON with the page's CSRF; returns { status, body }. */
async function postCreateSlot(
	page: Page,
	body: Record<string, unknown>,
): Promise<{ status: number; body: any }> {
	return page.evaluate(async (payload) => {
		const csrf = (window as any).__GARNET_CSRF__ || '';
		const res = await fetch('/expert/~slots', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
			body: JSON.stringify({ ...payload, CSRF_TOKEN: csrf }),
		});
		return { status: res.status, body: await res.json().catch(() => null) };
	}, body);
}

/** POST /expert/~batchSlots as JSON with the page's CSRF; returns { status, body }. */
async function postBatchSlots(
	page: Page,
	body: Record<string, unknown>,
): Promise<{ status: number; body: any }> {
	return page.evaluate(async (payload) => {
		const csrf = (window as any).__GARNET_CSRF__ || '';
		const res = await fetch('/expert/~batchSlots', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
			body: JSON.stringify({ ...payload, CSRF_TOKEN: csrf }),
		});
		return { status: res.status, body: await res.json().catch(() => null) };
	}, body);
}

// ── Test 1: single-slot create rejects a past start time ─────────────────────

test.describe('F-02: createSlot refuses a past start time', () => {
	test.describe.configure({ mode: 'serial' });

	let expertId = 0;
	let markCreatedAt = 0;

	test.beforeAll(async () => {
		expertId = await getAccountId(EXPERT_LOGIN);
		expect(expertId).toBeGreaterThan(0);
		markCreatedAt = Math.floor(Date.now() / 1000);
	});

	test('createSlot with start 1h in the past → 400, nothing created', async ({ page }) => {
		test.skip(!expertId, 'setup failed');
		await page.goto('/expert/~slots');
		await page.waitForLoadState('domcontentloaded');

		const { dateStr, timeStr } = pastDateTime(3600, EXPERT_TZ);
		const { status, body } = await postCreateSlot(page, {
			date: dateStr,
			time: timeStr,
			duration: 60,
			cost: 500,
		});

		expect(status).toBe(400);
		expect(body?.error).toMatch(/past/i);

		const created = await countSlotsForExpert(expertId, markCreatedAt);
		expect(created).toBe(0);
	});

	test.afterAll(async () => {
		if (expertId) await deleteSlotsCreatedSince(expertId, markCreatedAt);
	});
});

// ── Test 2: batch create whole-rejects when any row is in the past ───────────

test.describe('F-02: batchSlots refuses the WHOLE batch when any row is past', () => {
	test.describe.configure({ mode: 'serial' });

	let expertId = 0;
	let markCreatedAt = 0;

	test.beforeAll(async () => {
		expertId = await getAccountId(EXPERT_LOGIN);
		expect(expertId).toBeGreaterThan(0);
		markCreatedAt = Math.floor(Date.now() / 1000);
	});

	test('batch with one past row among valid future rows → 400, NOTHING created', async ({ page }) => {
		test.skip(!expertId, 'setup failed');
		await page.goto('/expert/~slots');
		await page.waitForLoadState('domcontentloaded');

		const future1 = futureDateTime(3 * 86400, EXPERT_TZ);
		const future2 = futureDateTime(4 * 86400, EXPERT_TZ);
		const past = pastDateTime(2 * 86400, EXPERT_TZ);

		const { status, body } = await postBatchSlots(page, {
			slots: JSON.stringify([
				{ date: future1.dateStr, time: '11:00', duration: 60 },
				{ date: past.dateStr, time: past.timeStr, duration: 60 },
				{ date: future2.dateStr, time: '13:00', duration: 60 },
			]),
			cost: 500,
		});

		expect(status).toBe(400);
		expect(body?.error).toMatch(/past/i);

		// Whole-batch rejection: the two otherwise-valid future rows must
		// NOT have been created either.
		const created = await countSlotsForExpert(expertId, markCreatedAt);
		expect(created).toBe(0);
	});

	test.afterAll(async () => {
		if (expertId) await deleteSlotsCreatedSince(expertId, markCreatedAt);
	});
});

// ── Test 3: boundary — just past vs. just future ──────────────────────────────

test.describe('F-02: createSlot boundary around "now"', () => {
	test.describe.configure({ mode: 'serial' });

	let expertId = 0;
	let markCreatedAt = 0;

	test.beforeAll(async () => {
		expertId = await getAccountId(EXPERT_LOGIN);
		expect(expertId).toBeGreaterThan(0);
		markCreatedAt = Math.floor(Date.now() / 1000);
	});

	test('start time 30s in the past → 400', async ({ page }) => {
		test.skip(!expertId, 'setup failed');
		await page.goto('/expert/~slots');
		await page.waitForLoadState('domcontentloaded');

		const { dateStr, timeStr } = pastDateTime(30, EXPERT_TZ);
		const { status, body } = await postCreateSlot(page, {
			date: dateStr,
			time: timeStr,
			duration: 60,
			cost: 500,
		});

		expect(status).toBe(400);
		expect(body?.error).toMatch(/past/i);
	});

	test('start time comfortably in the future (5 min) → 200, slot created', async ({ page }) => {
		test.skip(!expertId, 'setup failed');
		await page.goto('/expert/~slots');
		await page.waitForLoadState('domcontentloaded');

		// `date`/`time` only carry minute resolution, so "30s ahead" isn't
		// expressible — use a small-but-safe future margin instead to keep
		// this deterministic against request/DB latency.
		const { dateStr, timeStr } = futureDateTime(5 * 60, EXPERT_TZ);
		const { status, body } = await postCreateSlot(page, {
			date: dateStr,
			time: timeStr,
			duration: 60,
			cost: 500,
		});

		expect(status).toBe(200);
		expect(body?.success).toBe(true);

		const created = await countSlotsForExpert(expertId, markCreatedAt);
		expect(created).toBe(1);
	});

	test.afterAll(async () => {
		if (expertId) await deleteSlotsCreatedSince(expertId, markCreatedAt);
	});
});
