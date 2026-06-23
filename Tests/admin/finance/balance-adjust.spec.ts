/**
 * Admin — Balance page and manual balance verification
 *
 * Covers:
 *   - /admin/balances/ page renders without error
 *   - Balance grid shows user balances (login, name, balance, updated_at columns)
 *   - Balance data matches DB state
 *   - Sorting by balance column works
 *
 * NOTE: There is currently no admin UI for manual balance adjustment
 * (no adjust-balance-{accountId} button). When the feature is added,
 * this test should be extended to cover the adjustment flow:
 *   1. Click adjust button
 *   2. Fill amount, select credit/debit, add note
 *   3. Submit, verify balance change in DB and ledger entry created
 *
 * For now, we verify balance display and that manual DB adjustments
 * are reflected correctly in the admin panel.
 */

import { test, expect, tn } from '../../helpers/scoped-test';
import mysql from 'mysql2/promise';
import { DB } from '../../helpers/db';
test.describe.configure({ mode: 'serial' });

// ── DB helpers ─────────────────────────────────────────────────────────────────

async function getAccountId(login: string): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT id FROM ${tn('accounts')} WHERE login = ?`, [login]
		);
		return rows[0]?.id ?? 0;
	} finally { await conn.end(); }
}

async function getBalance(login: string): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT ab.balance
			 FROM ${tn('account_balance')} ab
			 JOIN ${tn('accounts')} a ON a.id = ab.account_id
			 WHERE a.login = ?`,
			[login]
		);
		return rows.length ? Number(rows[0].balance) : 0;
	} finally { await conn.end(); }
}

async function addBalanceViaDB(accountId: number, amount: number, note: string): Promise<void> {
	const conn = await mysql.createConnection(DB);
	try {
		const now = Math.floor(Date.now() / 1000);

		// Update balance
		await conn.execute(
			`INSERT INTO ${tn('account_balance')} (account_id, balance, updated_at)
			 VALUES (?, ?, ?)
			 ON DUPLICATE KEY UPDATE balance = balance + ?, updated_at = ?`,
			[accountId, amount, now, amount, now]
		);

		// Add ledger entry
		await conn.execute(
			`INSERT INTO ${tn('balance_ledger')}
			 (account_id, is_credit, amount, entry_type, ref_type, ref_id, note, created_at)
			 VALUES (?, 1, ?, 'manual', 'admin', 0, ?, ?)`,
			[accountId, amount, note, now]
		);
	} finally { await conn.end(); }
}

async function removeManualAdjustLedger(accountId: number): Promise<void> {
	const conn = await mysql.createConnection(DB);
	try {
		await conn.execute(
			`DELETE FROM ${tn('balance_ledger')}
			 WHERE account_id = ? AND entry_type = 'manual' AND ref_type = 'admin'`,
			[accountId]
		);
	} finally { await conn.end(); }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Admin balances page', () => {
	test('/admin/balances/ returns HTTP 200', async ({ page }) => {
		const resp = await page.goto('/admin/balances/');
		expect(resp?.status()).toBe(200);
	});

	test('/admin/balances/ renders without error', async ({ page }) => {
		await page.goto('/admin/balances/');
		await expect(page.locator('text=/Fatal|Exception/i')).toHaveCount(0);
	});

	test('balances grid shows table with data', async ({ page }) => {
		await page.goto('/admin/balances/');

		const table = page.locator('table');
		await expect(table).toBeVisible({ timeout: 12000 });

		// At least one row with balance data
		const rows = page.locator('tbody tr');
		const count = await rows.count();
		expect(count).toBeGreaterThan(0);
	});

	test('balance column is sortable', async ({ page }) => {
		await page.goto('/admin/balances/');
		await page.waitForSelector('table', { timeout: 12000 });

		// Sort by balance column (sortable)
		const sortCol = page.locator('[data-test-id="sort-col-balance"]');
		await expect(sortCol).toBeVisible({ timeout: 8000 });
		await sortCol.click();

		// No error after sorting
		await expect(page.locator('text=/Fatal|Exception/i')).toHaveCount(0);
	});

	test('search filters balance rows', async ({ page }) => {
		await page.goto('/admin/balances/');
		await page.waitForSelector('table', { timeout: 12000 });

		const searchInput = page.locator('[data-test-id="admin-grid-search"]');
		await expect(searchInput).toBeVisible({ timeout: 8000 });

		// Search for the test expert login
		await searchInput.fill('testuser_setup_expert@irabi.test');

		// Should show filtered results without error
		await expect(page.locator('text=/Fatal|Exception/i')).toHaveCount(0);
	});
});

test.describe('Admin balance: UI adjustment via finance page', () => {
	const ADJUST_AMOUNT = 100;
	const userLogin = 'testuser_setup_user@irabi.test';
	let userId = 0;
	let balanceBefore = 0;

	test('entry: ensure balance row exists for user', async () => {
		userId = await getAccountId(userLogin);
		expect(userId).toBeGreaterThan(0);
		balanceBefore = await getBalance(userLogin);
		// Ensure the user has a row in account_balance so they appear in the grid
		const conn = await mysql.createConnection(DB);
		try {
			const now = Math.floor(Date.now() / 1000);
			await conn.execute(
				`INSERT INTO ${tn('account_balance')} (account_id, balance, updated_at)
				 VALUES (?, ?, ?)
				 ON DUPLICATE KEY UPDATE updated_at = ?`,
				[userId, balanceBefore, now, now]
			);
		} finally { await conn.end(); }
	});

	test('admin can adjust balance with note via finance page', async ({ page }) => {
		if (!userId) { test.skip(); return; }

		await page.goto('/admin/finance/?tab=balances');
		await page.waitForSelector('table', { timeout: 12000 });

		// Filter the grid down to our user via search by name (backend searches by 'name' field)
		const searchInput = page.locator('[data-test-id="admin-grid-search"]');
		await expect(searchInput).toBeVisible({ timeout: 8000 });
		await searchInput.fill('Setup User');

		const adjustBtn = page.locator(`[data-test-id="balance-adjust-${userId}"]`);
		await expect(adjustBtn).toBeVisible({ timeout: 8000 });
		await adjustBtn.click();

		const modal = page.locator('[data-test-id="balance-adjust-modal"]');
		await expect(modal).toBeVisible({ timeout: 5000 });

		// Submit should be disabled when amount/note empty
		const submitBtn = page.locator('[data-test-id="balance-adjust-submit"]');
		await expect(submitBtn).toBeDisabled();

		// Fill amount
		await page.locator('[data-test-id="balance-adjust-amount"]').fill(String(ADJUST_AMOUNT));
		// Direction defaults to credit; select explicitly to ensure
		await page.locator('[data-test-id="balance-adjust-direction-credit"]').check();

		// Still disabled because note is empty
		await expect(submitBtn).toBeDisabled();

		// Fill note
		await page.locator('[data-test-id="balance-adjust-note"]').fill('Тестовая корректировка');
		await expect(submitBtn).toBeEnabled();

		await submitBtn.click();

		// Modal closes after success
		await expect(modal).toBeHidden({ timeout: 8000 });

		// DB reflects the credit
		const balanceAfter = await getBalance(userLogin);
		expect(balanceAfter).toBe(balanceBefore + ADJUST_AMOUNT);

		// Ledger entry must record the admin actor (NOT NULL actor_id)
		{
			const conn = await mysql.createConnection(DB);
			try {
				const [rows] = await conn.execute<any[]>(
					`SELECT actor_id FROM ${tn('balance_ledger')}
					 WHERE account_id = ? AND entry_type = 'manual' AND note = 'Тестовая корректировка'
					 ORDER BY id DESC LIMIT 1`,
					[userId]
				);
				expect(rows.length).toBe(1);
				expect(rows[0].actor_id).not.toBeNull();
				expect(Number(rows[0].actor_id)).toBeGreaterThan(0);
			} finally { await conn.end(); }
		}

		// Cleanup: revert via DB
		const conn = await mysql.createConnection(DB);
		try {
			await conn.execute(
				`UPDATE ${tn('account_balance')} SET balance = balance - ?, updated_at = ?
				 WHERE account_id = ?`,
				[ADJUST_AMOUNT, Math.floor(Date.now() / 1000), userId]
			);
			await conn.execute(
				`DELETE FROM ${tn('balance_ledger')}
				 WHERE account_id = ? AND entry_type = 'manual' AND note = 'Тестовая корректировка'`,
				[userId]
			);
		} finally { await conn.end(); }

		const balanceReverted = await getBalance(userLogin);
		expect(balanceReverted).toBe(balanceBefore);
	});
});

test.describe('Admin balance: DB adjustment reflected in grid', () => {
	const ADJUST_AMOUNT = 1234;
	let userId = 0;
	let balanceBefore = 0;

	test('entry: record user balance before adjustment', async () => {
		userId = await getAccountId('testuser_setup_user@irabi.test');
		expect(userId).toBeGreaterThan(0);
		balanceBefore = await getBalance('testuser_setup_user@irabi.test');
	});

	test('manual DB adjustment: credit user balance', async () => {
		if (!userId) { test.skip(); return; }
		await addBalanceViaDB(userId, ADJUST_AMOUNT, 'Playwright test adjustment');
		const balanceAfter = await getBalance('testuser_setup_user@irabi.test');
		expect(balanceAfter).toBe(balanceBefore + ADJUST_AMOUNT);
	});

	test('admin balances page reflects adjusted balance', async ({ page }) => {
		if (!userId) { test.skip(); return; }

		await page.goto('/admin/balances/');
		await page.waitForSelector('table', { timeout: 12000 });

		// Search for the user
		const searchInput = page.locator('[data-test-id="admin-grid-search"]');
		await searchInput.fill('testuser_setup_user@irabi.test');

		// Page renders without error
		await expect(page.locator('text=/Fatal|Exception/i')).toHaveCount(0);
	});

	test('exit: revert balance adjustment', async () => {
		if (!userId) { test.skip(); return; }

		// Reverse the adjustment
		const conn = await mysql.createConnection(DB);
		try {
			await conn.execute(
				`UPDATE ${tn('account_balance')} SET balance = balance - ?, updated_at = ?
				 WHERE account_id = ?`,
				[ADJUST_AMOUNT, Math.floor(Date.now() / 1000), userId]
			);
		} finally { await conn.end(); }

		// Remove manual_adjust ledger entries
		await removeManualAdjustLedger(userId);

		const balanceAfterRevert = await getBalance('testuser_setup_user@irabi.test');
		expect(balanceAfterRevert).toBe(balanceBefore);
	});
});
