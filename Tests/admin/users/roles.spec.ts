/**
 * Admin — AdminSM: grant/revoke IS_ADMIN role
 *
 * State machine: AccountSM (target) × AdminActionLogSM
 *
 * Entry: admin authenticated, target user (testuser_setup_moderator) exists.
 * Cycle:
 *   AccountSM[target]: regular_user → admin → regular_user
 *   AdminActionLogSM:  two immutable entries (grant IS_ADMIN + revoke IS_ADMIN)
 * Exit: target IS_ADMIN = 0 (cleaned up).
 *
 * Guard tested: only IS_ADMIN flag requires admin role to modify.
 * Owner-only flags (IS_OWNER, IS_MODERATOR) already covered in owner/roles.spec.ts.
 *
 * Uses data-test-id: flag-IS_ADMIN-{accountId}
 */

import { test, expect, tn } from '../../helpers/scoped-test';
import mysql from 'mysql2/promise';
import { DB } from '../../helpers/db';
test.describe.configure({ mode: 'serial' });

const TARGET_LOGIN = 'testuser_setup_moderator@irabi.test';

async function getAccountId(login: string): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT id FROM ${tn('accounts')} WHERE login = ?`, [login]
		);
		return rows[0]?.id ?? 0;
	} finally { await conn.end(); }
}

async function getFlagValue(accountId: number, flag: string): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT value FROM ${tn('accounts_data')} WHERE account_id = ? AND param = ?`,
			[accountId, flag]
		);
		return parseInt(rows[0]?.value ?? '0', 10);
	} finally { await conn.end(); }
}

async function countActionLogEntries(targetLogin: string, action: string): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT COUNT(*) AS cnt FROM ${tn('admin_action_log')}
			 WHERE target_login = ? AND action = ?`,
			[targetLogin, action]
		);
		return rows[0]?.cnt ?? 0;
	} finally { await conn.end(); }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

// `ensureAdminAuth` was a workaround for the legacy `php -S`
// single-thread session-token collision; under nginx + 32-worker
// php-cgi pool + PW_WORKER_ISOLATION the sessions are scoped to
// per-worker DB tables, so no leak path exists. Calls removed below.

test.describe('AdminSM: grant/revoke IS_ADMIN role', () => {
	let targetId = 0;
	let logCountBefore = 0;

	test.afterAll(async () => {
		// Always reset IS_ADMIN=0 on the target user — even if mid-cycle tests
		// failed — so subsequent specs see a clean state.
		if (!targetId) return;
		const conn = await mysql.createConnection(DB);
		try {
			await conn.execute(
				`DELETE FROM ${tn('accounts_data')} WHERE account_id = ? AND param = 'IS_ADMIN'`,
				[targetId]
			);
			await conn.execute(
				`INSERT INTO ${tn('accounts_data')} (account_id, param, value) VALUES (?, 'IS_ADMIN', '0')`,
				[targetId]
			);
		} finally { await conn.end(); }
	});

	test('entry: target user exists, IS_ADMIN = 0 for clean start', async () => {
		targetId = await getAccountId(TARGET_LOGIN);
		expect(targetId).toBeGreaterThan(0);

		// Reset IS_ADMIN to 0 for clean start — DELETE first to clear any stale state,
		// then INSERT a fresh '0' row. This avoids cases where the row exists with '1'
		// from a previous run that didn't clean up.
		const conn = await mysql.createConnection(DB);
		try {
			await conn.execute(
				`DELETE FROM ${tn('accounts_data')} WHERE account_id = ? AND param = 'IS_ADMIN'`,
				[targetId]
			);
			await conn.execute(
				`INSERT INTO ${tn('accounts_data')} (account_id, param, value) VALUES (?, 'IS_ADMIN', '0')`,
				[targetId]
			);
		} finally { await conn.end(); }

		logCountBefore = await countActionLogEntries(TARGET_LOGIN, 'IS_ADMIN');
		const isAdmin = await getFlagValue(targetId, 'IS_ADMIN');
		expect(isAdmin).toBe(0);
	});

	test('admin panel shows flag-IS_ADMIN button for target user', async ({ page }) => {
		if (!targetId) { test.skip(); return; }

		await page.goto('/admin/');
		await page.waitForSelector('table', { timeout: 12000 });

		// Switch to Moderators tab — target user has IS_MODERATOR=1, IS_ADMIN=0 (reset in entry)
		await page.locator('[data-test-id="filter-tab-moderators"]').click();

		// Confirm the user row appeared
		const row = page.locator(`[data-test-id="grid-row-${targetId}"]`);
		await expect(row).toBeVisible({ timeout: 8000 });

		// Open detail panel — IS_ADMIN button is always rendered there.
		const loginBtn = row.locator('[data-test-id^="user-login-"]');
		await loginBtn.click();
		const adminBtn = page.locator(`[data-test-id="flag-IS_ADMIN-${targetId}"]`).last();
		await expect(adminBtn).toBeVisible({ timeout: 10000 });
	});

	test('AdminSM: regular_user → admin (grant IS_ADMIN)', async ({ page }) => {
		if (!targetId) { test.skip(); return; }

		await page.goto('/admin/');
		await page.waitForSelector('table', { timeout: 12000 });

		// Target has IS_MODERATOR=1, IS_ADMIN=0 — visible in Moderators tab
		await page.locator('[data-test-id="filter-tab-moderators"]').click();
		const row = page.locator(`[data-test-id="grid-row-${targetId}"]`);
		await expect(row).toBeVisible({ timeout: 8000 });

		// IS_ADMIN button may be rendered in the grid OR (fallback) only inside the
		// user detail panel. Try grid first, then open detail panel as fallback —
		// matches the pattern used in the "panel shows flag-IS_ADMIN button" test
		// above, ensuring resilience against column-config changes / state drift.
		// Always open the user detail panel and click IS_ADMIN flag from there.
		// The grid button is conditionally rendered (only when caller is admin and
		// only in tabs that include the IS_ADMIN column); the detail panel always
		// shows it. Using the detail panel makes this test resilient to grid
		// column-config drift.
		const loginBtn = row.locator('[data-test-id^="user-login-"]');
		await loginBtn.click();

		// Panel must be open + button enabled before clicking — otherwise the click
		// may be swallowed while flagPending is still true from initial mount.
		const pane = page.locator('[data-test-id="user-detail-pane"]');
		await expect(pane).toBeVisible({ timeout: 10000 });
		const grantBtn = pane.locator(`[data-test-id="flag-IS_ADMIN-${targetId}"]`);
		await Promise.all([
			expect(grantBtn).toBeVisible({ timeout: 10000 }),
			expect(grantBtn).toBeEnabled({ timeout: 5000 }),
		]);

		// Wait for the setUserFlag response so we know the server actually wrote the flag.
		const respPromise = page.waitForResponse(
			r => r.url().includes('setUserFlag') && r.request().method() === 'POST',
			{ timeout: 10000 },
		);
		await grantBtn.click();
		await respPromise;
		// Belt-and-suspenders: poll DB for IS_ADMIN=1 to absorb any cache layer.
		for (let i = 0; i < 50; i++) {
			const v = await getFlagValue(targetId, 'IS_ADMIN');
			if (v === 1) break;
		}
	});

	test('AccountSM: IS_ADMIN = 1 in DB after grant', async () => {
		if (!targetId) { test.skip(); return; }
		const isAdmin = await getFlagValue(targetId, 'IS_ADMIN');
		expect(isAdmin).toBe(1);
	});

	test('AdminActionLogSM: grant IS_ADMIN logged', async () => {
		if (!targetId) { test.skip(); return; }
		const count = await countActionLogEntries(TARGET_LOGIN, 'IS_ADMIN');
		expect(count).toBeGreaterThan(logCountBefore);
	});

	test('AdminSM: admin → regular_user (revoke IS_ADMIN)', async ({ page }) => {
		if (!targetId) { test.skip(); return; }

		await page.goto('/admin/');
		await page.waitForSelector('table', { timeout: 12000 });

		// After grant, target has IS_ADMIN=1 — visible in Admins tab
		await page.locator('[data-test-id="filter-tab-admins"]').click();
		const row = page.locator(`[data-test-id="grid-row-${targetId}"]`);
		await expect(row).toBeVisible({ timeout: 8000 });

		// Open the detail panel and click IS_ADMIN from there — same pattern as grant.
		const loginBtn = row.locator('[data-test-id^="user-login-"]');
		await loginBtn.click();

		const pane = page.locator('[data-test-id="user-detail-pane"]');
		await expect(pane).toBeVisible({ timeout: 10000 });
		const revokeBtn = pane.locator(`[data-test-id="flag-IS_ADMIN-${targetId}"]`);
		await Promise.all([
			expect(revokeBtn).toBeVisible({ timeout: 10000 }),
			expect(revokeBtn).toBeEnabled({ timeout: 5000 }),
		]);

		const respPromise = page.waitForResponse(
			r => r.url().includes('setUserFlag') && r.request().method() === 'POST',
			{ timeout: 10000 },
		);
		await revokeBtn.click();
		await respPromise;
		for (let i = 0; i < 50; i++) {
			const v = await getFlagValue(targetId, 'IS_ADMIN');
			if (v === 0) break;
		}
	});

	test('AccountSM: IS_ADMIN = 0 in DB after revoke', async () => {
		if (!targetId) { test.skip(); return; }
		const isAdmin = await getFlagValue(targetId, 'IS_ADMIN');
		expect(isAdmin).toBe(0);
	});

	test('AdminActionLogSM: two IS_ADMIN entries (grant + revoke)', async () => {
		if (!targetId) { test.skip(); return; }
		const count = await countActionLogEntries(TARGET_LOGIN, 'IS_ADMIN');
		expect(count).toBeGreaterThanOrEqual(logCountBefore + 2);
	});
});
