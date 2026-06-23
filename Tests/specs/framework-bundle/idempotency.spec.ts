/**
 * Idempotency middleware — server-side dedup of retried POSTs.
 *
 * The framework middleware reserves a row in idempotency_keys
 * when an authenticated POST carries an `X-Idempotency-Key` header,
 * captures the response in `finalize()` after the controller runs,
 * and replays the cached row on every subsequent hit of the same
 * (account_id, idem_key, route_path) triple.
 *
 * Spec uses /system/bookings/id~999999/~cancel as the probe — it
 * always 404s, has no side effects, and runs the full middleware
 * pipeline. We auto-login a .test email so the auth+CSRF gate
 * passes and the idempotency middleware actually fires.
 */

import { test, expect, tn } from '../../helpers/scoped-test';
import type { Page, BrowserContext } from '@playwright/test';
import mysql from 'mysql2/promise';

import { newScopedContext } from '../../helpers/scoped-test';
import { DB } from '../../helpers/db';
import { tickPdConsent } from '../../helpers/auth';
test.describe.configure({ mode: 'serial' });

const TEST_EMAIL = `test_idem_${process.env.TEST_PARALLEL_INDEX ?? "0"}@irabi.test`;

async function getAccountId(login: string): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(`SELECT id FROM ${tn('accounts')} WHERE login = ?`, [login]);
		return rows[0]?.id ?? 0;
	} finally { await conn.end(); }
}

async function countKeys(accountId: number, key: string): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT COUNT(*) as c FROM ${tn('idempotency_keys')} WHERE account_id = ? AND idem_key = ?`,
			[accountId, key],
		);
		return Number(rows[0]?.c ?? 0);
	} finally { await conn.end(); }
}

async function readKey(accountId: number, key: string): Promise<any | null> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT * FROM ${tn('idempotency_keys')} WHERE account_id = ? AND idem_key = ?`,
			[accountId, key],
		);
		return rows[0] ?? null;
	} finally { await conn.end(); }
}

async function insertInFlight(accountId: number, key: string, routePath: string): Promise<void> {
	const conn = await mysql.createConnection(DB);
	try {
		const now = Math.floor(Date.now() / 1000);
		await conn.execute(
			`INSERT INTO ${tn('idempotency_keys')}
			 (account_id, idem_key, route_path, http_status, content_type, response_body, created_at, finalized_at)
			 VALUES (?, ?, ?, 0, NULL, NULL, ?, 0)`,
			[accountId, key, routePath, now],
		);
	} finally { await conn.end(); }
}

/** Pre-test purge — runs before login when no account exists yet. */
async function purgeFromPriorRun() {
	const conn = await mysql.createConnection(DB);
	try {
		// Clean idempotency rows for any account that ever used this exact
		// login. JOIN-via-subselect handles the "account already deleted"
		// case from earlier failures.
		await conn.execute(
			`DELETE FROM ${tn('idempotency_keys')}
			 WHERE account_id IN (SELECT id FROM ${tn('accounts')} WHERE login = ?)`,
			[TEST_EMAIL],
		);
		await conn.execute(`DELETE FROM ${tn('accounts')} WHERE login = ?`, [TEST_EMAIL]);
	} finally { await conn.end(); }
}

/** Post-test purge — account still exists, accountId is known. */
async function cleanup(accountId: number) {
	const conn = await mysql.createConnection(DB);
	try {
		await conn.execute(`DELETE FROM ${tn('idempotency_keys')} WHERE account_id = ?`, [accountId]);
		await conn.execute(`DELETE FROM ${tn('accounts')} WHERE login = ?`, [TEST_EMAIL]);
	} finally { await conn.end(); }
}

/**
 * Send a POST through the page context (cookies + CSRF live there).
 * Returns parsed JSON-ish body when possible plus the X-Idempotent-Replay
 * marker the middleware sets on cache hits.
 */
async function postProbe(page: Page, path: string, idemKey?: string): Promise<{
	status: number;
	bodyText: string;
	replay: string | null;
}> {
	return await page.evaluate(async ({ path, idemKey }) => {
		const csrf = (window as any).__GARNET_CSRF__ || '';
		const fd = new FormData();
		fd.append('CSRF_TOKEN', csrf);
		fd.append('reason', 'idempotency-spec');
		const headers: Record<string, string> = {};
		if (idemKey) headers['X-Idempotency-Key'] = idemKey;
		const res = await fetch(path, { method: 'POST', headers, body: fd });
		return {
			status: res.status,
			bodyText: await res.text(),
			replay: res.headers.get('X-Idempotent-Replay'),
		};
	}, { path, idemKey });
}

const PROBE_PATH = '/system/bookings/id~999999/~cancel';

// Different route, same response shape (404), used to verify per-route isolation.
const PROBE_PATH_B = '/system/bookings/id~888888/~cancel';

test.describe('Idempotency middleware', () => {
	let page: Page;
	let context: BrowserContext;
	let accountId = 0;

	test.beforeAll(async ({ browser }) => {
		// Wipe leftovers from prior failed runs BEFORE creating a new
		// account — otherwise we'd delete the freshly registered one.
		await purgeFromPriorRun();

		context = await newScopedContext(browser);
		page = await context.newPage();

		// Dev auto-login: any *.test email auto-authenticates.
		await page.goto('/system/');
		const loginInput = page.locator('[data-test-id="auth-login-input"]');
		await expect(loginInput).toBeVisible({ timeout: 10000 });
		await loginInput.fill(TEST_EMAIL);
		await tickPdConsent(page);
		await Promise.all([
			page.waitForResponse(r => r.request().method() === 'POST', { timeout: 15000 }),
			page.locator('[data-test-id="auth-submit-btn"]').click(),
		]);
		// Land on an authenticated screen so __GARNET_CSRF__ is present in the page.
		await page.goto('/system/bookings');
		await page.waitForLoadState('networkidle');

		accountId = await getAccountId(TEST_EMAIL);
		expect(accountId).toBeGreaterThan(0);
	});

	test.afterAll(async () => {
		if (accountId > 0) await cleanup(accountId);
		await context.close();
	});

	test('without key: each POST runs the controller, no row stored', async () => {
		const r1 = await postProbe(page, PROBE_PATH);
		const r2 = await postProbe(page, PROBE_PATH);
		expect(r1.status).toBe(404);
		expect(r2.status).toBe(404);
		expect(r1.replay).toBeNull();
		expect(r2.replay).toBeNull();
		// No row could have been stored — there's no key to identify one.
	});

	test('first hit runs controller, second hit replays from cache', async () => {
		const key = `spec-idem-replay-${Date.now()}-aaaaaaaa`;
		const r1 = await postProbe(page, PROBE_PATH, key);
		expect(r1.status).toBe(404);
		expect(r1.replay).toBeNull();

		const r2 = await postProbe(page, PROBE_PATH, key);
		expect(r2.status).toBe(404);
		expect(r2.replay).toBe('1');
		expect(r2.bodyText).toBe(r1.bodyText);

		expect(await countKeys(accountId, key)).toBe(1);
		const row = await readKey(accountId, key);
		expect(row).not.toBeNull();
		expect(Number(row.http_status)).toBe(404);
		expect(Number(row.finalized_at)).toBeGreaterThan(0);
		expect(row.route_path).toBe(PROBE_PATH);
	});

	test('content-type and body are preserved on replay', async () => {
		const key = `spec-idem-content-${Date.now()}-bbbbbbbb`;
		const r1 = await postProbe(page, PROBE_PATH, key);
		const r2 = await postProbe(page, PROBE_PATH, key);
		expect(r2.bodyText).toBe(r1.bodyText);
		const row = await readKey(accountId, key);
		expect(row.content_type).toContain('application/json');
		expect(row.response_body).toBe(r1.bodyText);
	});

	test('different keys produce independent rows', async () => {
		const keyA = `spec-idem-multi-A-${Date.now()}-cccccccc`;
		const keyB = `spec-idem-multi-B-${Date.now()}-dddddddd`;
		await postProbe(page, PROBE_PATH, keyA);
		await postProbe(page, PROBE_PATH, keyB);
		expect(await countKeys(accountId, keyA)).toBe(1);
		expect(await countKeys(accountId, keyB)).toBe(1);
	});

	test('same key on a different route stores its own row', async () => {
		const key = `spec-idem-route-${Date.now()}-eeeeeeee`;
		const r1 = await postProbe(page, PROBE_PATH, key);
		const r2 = await postProbe(page, PROBE_PATH_B, key);
		expect(r1.replay).toBeNull();
		expect(r2.replay).toBeNull(); // first hit on the second route — no replay
		const conn = await mysql.createConnection(DB);
		try {
			const [rows] = await conn.execute<any[]>(
				`SELECT route_path FROM ${tn('idempotency_keys')} WHERE account_id = ? AND idem_key = ? ORDER BY route_path`,
				[accountId, key],
			);
			expect(rows.length).toBe(2);
			expect(rows.map((r: any) => r.route_path).sort()).toEqual([PROBE_PATH_B, PROBE_PATH].sort());
		} finally { await conn.end(); }
	});

	test('in-flight reservation returns 409 to a second caller', async () => {
		const key = `spec-idem-inflight-${Date.now()}-ffffffff`;
		await insertInFlight(accountId, key, PROBE_PATH);
		const r = await postProbe(page, PROBE_PATH, key);
		expect(r.status).toBe(409);
		expect(r.bodyText).toContain('Operation in progress');
	});

	test('keys shorter than 16 chars are ignored (back-compat)', async () => {
		const shortKey = 'too-short';
		const r1 = await postProbe(page, PROBE_PATH, shortKey);
		const r2 = await postProbe(page, PROBE_PATH, shortKey);
		expect(r1.replay).toBeNull();
		expect(r2.replay).toBeNull();
		expect(await countKeys(accountId, shortKey)).toBe(0);
	});

	test('keys with disallowed chars are ignored (back-compat)', async () => {
		const badKey = 'bad/key with spaces and slash';
		const r1 = await postProbe(page, PROBE_PATH, badKey);
		const r2 = await postProbe(page, PROBE_PATH, badKey);
		expect(r1.replay).toBeNull();
		expect(r2.replay).toBeNull();
		expect(await countKeys(accountId, badKey)).toBe(0);
	});

	test('GET requests pass through unchanged (no row stored)', async () => {
		const key = `spec-idem-get-${Date.now()}-gggggggg`;
		await page.evaluate(async ({ key }) => {
			await fetch('/system/bookings', { method: 'GET', headers: { 'X-Idempotency-Key': key } });
		}, { key });
		expect(await countKeys(accountId, key)).toBe(0);
	});
});
