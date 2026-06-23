/**
 * Moderator — ExpertProfileSM approval cycle
 *
 * State machine: ExpertProfileSM × AdminActionLogSM
 *
 * Entry: moderator authenticated, setup:expert exists (not yet approved by this test).
 * Cycle:
 *   ExpertProfileSM: not_approved(0) → approved(1) → not_approved(0)
 *   AdminActionLogSM: two immutable entries written (approve + revoke)
 * Exit: expert approval state restored to what it was before the test.
 *
 * Uses data-test-id: flag-IS_APPROVED-{accountId}  (locale-independent)
 */

import { test, expect, tn } from '../helpers/scoped-test';
import mysql from 'mysql2/promise';
import { DB } from '../helpers/db';
test.describe.configure({ mode: 'serial' });

async function getExpertId(): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT id FROM ${tn('accounts')} WHERE login = 'testuser_setup_expert@irabi.test'`
		);
		return rows[0]?.id ?? 0;
	} finally { await conn.end(); }
}

async function getExpertApprovalState(): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT is_approved FROM ${tn('expert_profiles')}
			 WHERE account_id = (SELECT id FROM ${tn('accounts')} WHERE login = 'testuser_setup_expert@irabi.test')`
		);
		return rows[0]?.is_approved ?? 0;
	} finally { await conn.end(); }
}

async function countActionLogEntries(expertLogin: string, action: string): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT COUNT(*) AS cnt FROM ${tn('admin_action_log')}
			 WHERE target_login = ? AND action = ?`,
			[expertLogin, action]
		);
		return rows[0]?.cnt ?? 0;
	} finally { await conn.end(); }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('ExpertProfileSM: not_approved → approved → not_approved', () => {
	let expertId = 0;
	let initialApprovalState = 0;
	let logCountBefore = 0;

	test('entry: record initial state and ensure expert is not_approved', async () => {
		expertId = await getExpertId();
		expect(expertId).toBeGreaterThan(0);

		initialApprovalState = await getExpertApprovalState();
		logCountBefore = await countActionLogEntries('testuser_setup_expert@irabi.test', 'IS_APPROVED');

		// Set to not_approved for clean test start
		const conn = await mysql.createConnection(DB);
		try {
			await conn.execute(
				`UPDATE ${tn('expert_profiles')} SET is_approved = 0
				 WHERE account_id = ?`, [expertId]
			);
			await conn.execute(
				`INSERT INTO ${tn('accounts_data')} (account_id, param, value)
				 SELECT id, 'IS_APPROVED', '0' FROM ${tn('accounts')} WHERE login = 'testuser_setup_expert@irabi.test'
				 ON DUPLICATE KEY UPDATE value = '0'`
			);
		} finally { await conn.end(); }
	});

	test('admin panel shows flag-IS_APPROVED button for expert', async ({ page }) => {
		if (!expertId) { test.skip(); return; }

		await page.goto('/admin/');
		await page.waitForSelector('table', { timeout: 12000 });

		// Switch to teachers tab
		await page.locator('[data-test-id="filter-tab-experts"]').click();

		const approveBtn = page.locator(`[data-test-id="flag-IS_APPROVED-${expertId}"]`);
		await expect(approveBtn).toBeVisible({ timeout: 8000 });
	});

	test('ExpertProfileSM: not_approved → approved (moderator approves)', async ({ page }) => {
		if (!expertId) { test.skip(); return; }

		await page.goto('/admin/');
		await page.waitForSelector('table', { timeout: 12000 });

		await page.locator('[data-test-id="filter-tab-experts"]').click();

		const approveBtn = page.locator(`[data-test-id="flag-IS_APPROVED-${expertId}"]`);
		await expect(approveBtn).toBeVisible({ timeout: 8000 });
		// Click + wait for the approval XHR before the next test reads DB.
		await Promise.all([
			page.waitForResponse(r => r.request().method() === 'POST' && r.status() < 500, { timeout: 10000 }),
			approveBtn.click(),
		]);
	});

	test('ExpertProfileSM: is_approved = 1 in DB after approve', async () => {
		if (!expertId) { test.skip(); return; }
		const state = await getExpertApprovalState();
		expect(state).toBe(1);
	});

	test('AdminActionLogSM: approve action logged', async () => {
		if (!expertId) { test.skip(); return; }
		const count = await countActionLogEntries('testuser_setup_expert@irabi.test', 'IS_APPROVED');
		expect(count).toBeGreaterThan(logCountBefore);
	});

	test('ExpertProfileSM: approved → not_approved (moderator revokes)', async ({ page }) => {
		if (!expertId) { test.skip(); return; }

		await page.goto('/admin/');
		await page.waitForSelector('table', { timeout: 12000 });

		await page.locator('[data-test-id="filter-tab-experts"]').click();

		const revokeBtn = page.locator(`[data-test-id="flag-IS_APPROVED-${expertId}"]`);
		await expect(revokeBtn).toBeVisible({ timeout: 8000 });
		await Promise.all([
			page.waitForResponse(r => r.request().method() === 'POST' && r.status() < 500, { timeout: 10000 }),
			revokeBtn.click(),
		]);
	});

	test('ExpertProfileSM: is_approved = 0 in DB after revoke', async () => {
		if (!expertId) { test.skip(); return; }
		const state = await getExpertApprovalState();
		expect(state).toBe(0);
	});

	test('AdminActionLogSM: two IS_APPROVED entries total (approve + revoke)', async () => {
		if (!expertId) { test.skip(); return; }
		const count = await countActionLogEntries('testuser_setup_expert@irabi.test', 'IS_APPROVED');
		expect(count).toBeGreaterThanOrEqual(logCountBefore + 2);
	});

	test('exit: restore expert to initial approval state', async () => {
		if (!expertId) return;
		const conn = await mysql.createConnection(DB);
		try {
			await conn.execute(
				`UPDATE ${tn('expert_profiles')} SET is_approved = ? WHERE account_id = ?`,
				[initialApprovalState, expertId]
			);
			await conn.execute(
				`INSERT INTO ${tn('accounts_data')} (account_id, param, value)
				 SELECT id, 'IS_APPROVED', ? FROM ${tn('accounts')} WHERE login = 'testuser_setup_expert@irabi.test'
				 ON DUPLICATE KEY UPDATE value = VALUES(value)`,
				[String(initialApprovalState)]
			);
		} finally { await conn.end(); }
	});
});
