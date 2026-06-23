/**
 * Admin — promote/demote between user and expert
 *
 * State machine: AccountSM[target].type × AdminActionLogSM(action='set_type')
 *
 * Entry: admin authenticated, target = testuser_setup_user (type='user' by seed).
 * Cycle:
 *   AccountSM[target].type: 'user' → 'expert' → 'user'
 *   AdminActionLogSM: two immutable entries with action='set_type'
 *                    (old→new = user→expert, expert→user)
 * Exit: target.type='user' (cleaned up).
 *
 * Uses data-test-id: set-type-{accountId}
 */

import { test, expect, tn } from '../../helpers/scoped-test';
import mysql from 'mysql2/promise';
import { DB } from '../../helpers/db';
import { USER_LOGIN } from '../../helpers/logins';

test.describe.configure({ mode: 'serial' });

async function getAccountId(login: string): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT id FROM ${tn('accounts')} WHERE login = ?`, [login]
		);
		return rows[0]?.id ?? 0;
	} finally { await conn.end(); }
}

async function getType(accountId: number): Promise<string> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT type FROM ${tn('accounts')} WHERE id = ?`, [accountId]
		);
		return (rows[0]?.type ?? '') as string;
	} finally { await conn.end(); }
}

async function setType(accountId: number, type: string): Promise<void> {
	const conn = await mysql.createConnection(DB);
	try {
		await conn.execute(
			`UPDATE ${tn('accounts')} SET type = ? WHERE id = ?`, [type, accountId]
		);
	} finally { await conn.end(); }
}

async function countActionLog(targetLogin: string, action: string): Promise<number> {
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

test.describe('AdminSM: promote/demote expert', () => {
	let targetId = 0;
	let logBefore = 0;

	test.afterAll(async () => {
		if (!targetId) return;
		// Restore the seeded type so subsequent specs see a clean state.
		await setType(targetId, 'user');
	});

	test('entry: target is type=user', async () => {
		targetId = await getAccountId(USER_LOGIN);
		expect(targetId).toBeGreaterThan(0);
		await setType(targetId, 'user');
		logBefore = await countActionLog(USER_LOGIN, 'set_type');
		expect(await getType(targetId)).toBe('user');
	});

	test('AdminSM: user → expert (promote)', async ({ page }) => {
		if (!targetId) { test.skip(); return; }

		await page.goto('/admin/');
		await page.waitForSelector('table', { timeout: 12000 });

		// "Pure" user shows up under the "users" tab.
		await page.locator('[data-test-id="filter-tab-users"]').click();

		const row = page.locator(`[data-test-id="grid-row-${targetId}"]`);
		await expect(row).toBeVisible({ timeout: 8000 });

		const promoteBtn = row.locator(`[data-test-id="set-type-${targetId}"]`);
		await Promise.all([
			expect(promoteBtn).toBeVisible({ timeout: 10000 }),
			expect(promoteBtn).toBeEnabled({ timeout: 5000 }),
		]);

		const respPromise = page.waitForResponse(
			r => r.url().includes('setUserType') && r.request().method() === 'POST',
			{ timeout: 10000 },
		);
		await promoteBtn.click();
		const resp = await respPromise;
		expect(resp.ok()).toBe(true);

		// Poll DB until the type flips — absorbs any flush lag.
		for (let i = 0; i < 50; i++) {
			if ((await getType(targetId)) === 'expert') break;
		}
	});

	test('AccountSM: type=expert in DB after promote', async () => {
		if (!targetId) { test.skip(); return; }
		expect(await getType(targetId)).toBe('expert');
	});

	test('AdminActionLogSM: set_type entry logged after promote', async () => {
		if (!targetId) { test.skip(); return; }
		expect(await countActionLog(USER_LOGIN, 'set_type')).toBeGreaterThan(logBefore);
	});

	test('AdminSM: expert → user (demote)', async ({ page }) => {
		if (!targetId) { test.skip(); return; }

		await page.goto('/admin/');
		await page.waitForSelector('table', { timeout: 12000 });

		// Now the target lives in the "experts" tab.
		await page.locator('[data-test-id="filter-tab-experts"]').click();

		const row = page.locator(`[data-test-id="grid-row-${targetId}"]`);
		await expect(row).toBeVisible({ timeout: 8000 });

		const demoteBtn = row.locator(`[data-test-id="set-type-${targetId}"]`);
		await Promise.all([
			expect(demoteBtn).toBeVisible({ timeout: 10000 }),
			expect(demoteBtn).toBeEnabled({ timeout: 5000 }),
		]);

		const respPromise = page.waitForResponse(
			r => r.url().includes('setUserType') && r.request().method() === 'POST',
			{ timeout: 10000 },
		);
		await demoteBtn.click();
		const resp = await respPromise;
		expect(resp.ok()).toBe(true);

		for (let i = 0; i < 50; i++) {
			if ((await getType(targetId)) === 'user') break;
		}
	});

	test('AccountSM: type=user in DB after demote', async () => {
		if (!targetId) { test.skip(); return; }
		expect(await getType(targetId)).toBe('user');
	});

	test('AdminActionLogSM: two set_type entries (promote + demote)', async () => {
		if (!targetId) { test.skip(); return; }
		expect(await countActionLog(USER_LOGIN, 'set_type')).toBeGreaterThanOrEqual(logBefore + 2);
	});
});
