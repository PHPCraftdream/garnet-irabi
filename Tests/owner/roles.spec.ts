/**
 * Owner — OwnerSM: grant/revoke IS_MODERATOR
 *
 * State machine: AccountSM (target) × AdminActionLogSM
 *
 * Entry: owner authenticated, a target regular user exists (created in test).
 * Cycle:
 *   AccountSM[target]: regular_user → moderator → regular_user
 *   AdminActionLogSM: two entries (grant + revoke IS_MODERATOR)
 * Exit: target user has IS_MODERATOR = 0 (cleaned up).
 *
 * Guard tested: owner cannot grant IS_ADMIN (button absent or action rejected).
 *
 * Uses data-test-id: flag-IS_MODERATOR-{accountId}
 */

import { test, expect, tn } from '../helpers/scoped-test';
import mysql from 'mysql2/promise';
import { DB } from '../helpers/db';
test.describe.configure({ mode: 'serial' });

// Force max page-size so seed accounts (testuser_setup_*) stay on the first
// page of the admin grid where `flag-IS_MODERATOR-{id}` is looked up.
test.beforeEach(async ({ page }) => {
	await page.addInitScript(() => {
		try { localStorage.setItem('garnet.pageSize', '100'); } catch {}
	});
});

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

test.describe('OwnerSM: grant/revoke IS_MODERATOR role', () => {
	let targetId = 0;
	let logCountBefore = 0;

	test('entry: target user exists, IS_MODERATOR = 0 for clean start', async () => {
		targetId = await getAccountId(TARGET_LOGIN);
		expect(targetId).toBeGreaterThan(0);

		// Reset to not-moderator for clean start
		const conn = await mysql.createConnection(DB);
		try {
			await conn.execute(
				`INSERT INTO ${tn('accounts_data')} (account_id, param, value)
				 SELECT id, 'IS_MODERATOR', '0' FROM ${tn('accounts')} WHERE login = ?
				 ON DUPLICATE KEY UPDATE value = '0'`,
				[TARGET_LOGIN]
			);
		} finally { await conn.end(); }

		logCountBefore = await countActionLogEntries(TARGET_LOGIN, 'IS_MODERATOR');
		const isMod = await getFlagValue(targetId, 'IS_MODERATOR');
		expect(isMod).toBe(0);
	});

	test('admin panel shows flag-IS_MODERATOR button for target user', async ({ page }) => {
		if (!targetId) { test.skip(); return; }

		await page.goto('/admin/');
		await page.waitForSelector('table', { timeout: 12000 });

		const grantBtn = page.locator(`[data-test-id="flag-IS_MODERATOR-${targetId}"]`);
		await expect(grantBtn).toBeVisible({ timeout: 8000 });
	});

	test('OwnerSM: regular_user → moderator (grant IS_MODERATOR)', async ({ page }) => {
		if (!targetId) { test.skip(); return; }

		await page.goto('/admin/');
		await page.waitForSelector('table', { timeout: 12000 });

		const grantBtn = page.locator(`[data-test-id="flag-IS_MODERATOR-${targetId}"]`);
		await expect(grantBtn).toBeVisible({ timeout: 8000 });
		// Click + wait for the flag-toggle XHR before the next test reads DB.
		await Promise.all([
			page.waitForResponse(r => r.request().method() === 'POST' && r.status() < 500, { timeout: 10000 }),
			grantBtn.click(),
		]);
	});

	test('AccountSM: IS_MODERATOR = 1 in DB after grant', async () => {
		if (!targetId) { test.skip(); return; }
		const isMod = await getFlagValue(targetId, 'IS_MODERATOR');
		expect(isMod).toBe(1);
	});

	test('AdminActionLogSM: grant IS_MODERATOR logged', async () => {
		if (!targetId) { test.skip(); return; }
		const count = await countActionLogEntries(TARGET_LOGIN, 'IS_MODERATOR');
		expect(count).toBeGreaterThan(logCountBefore);
	});

	test('owner cannot grant IS_ADMIN (button absent or access denied)', async ({ page }) => {
		if (!targetId) { test.skip(); return; }

		await page.goto('/admin/');
		await page.waitForSelector('table', { timeout: 12000 });

		// IS_ADMIN button should not be visible for owner (only admin can grant IS_ADMIN)
		// If it's hidden, test passes. If it's visible, we verify clicking it is denied.
		const adminBtn = page.locator(`[data-test-id="flag-IS_ADMIN-${targetId}"]`);
		const isVisible = await adminBtn.isVisible().catch(() => false);
		if (isVisible) {
			// Button exists — owner must be blocked. Try clicking and expect no DB change.
			const isAdminBefore = await getFlagValue(targetId, 'IS_ADMIN');
			await adminBtn.click();
			const isAdminAfter = await getFlagValue(targetId, 'IS_ADMIN');
			expect(isAdminAfter).toBe(isAdminBefore); // No change
		} else {
			console.log('IS_ADMIN button correctly hidden for owner role');
		}
	});

	test('OwnerSM: moderator → regular_user (revoke IS_MODERATOR)', async ({ page }) => {
		if (!targetId) { test.skip(); return; }

		await page.goto('/admin/');
		await page.waitForSelector('table', { timeout: 12000 });

		const revokeBtn = page.locator(`[data-test-id="flag-IS_MODERATOR-${targetId}"]`);
		await expect(revokeBtn).toBeVisible({ timeout: 8000 });
		await Promise.all([
			page.waitForResponse(r => r.request().method() === 'POST' && r.status() < 500, { timeout: 10000 }),
			revokeBtn.click(),
		]);
	});

	test('AccountSM: IS_MODERATOR = 0 in DB after revoke', async () => {
		if (!targetId) { test.skip(); return; }
		const isMod = await getFlagValue(targetId, 'IS_MODERATOR');
		expect(isMod).toBe(0);
	});

	test('AdminActionLogSM: two IS_MODERATOR entries (grant + revoke)', async () => {
		if (!targetId) { test.skip(); return; }
		const count = await countActionLogEntries(TARGET_LOGIN, 'IS_MODERATOR');
		expect(count).toBeGreaterThanOrEqual(logCountBefore + 2);
	});
});
