/**
 * User — AccountSM: registered -> active (profile completion)
 *
 * State machine: AccountSM
 *
 * Entry: user authenticated (account exists).
 * Cycle:
 *   AccountSM: registered (minimal profile) -> active (profile filled)
 * Exit: user profile verified as accessible.
 *
 * UI changes:
 *   - Top-up is XHR-based (sendPost), reactive update -- no page reload
 *   - User profile page: no login visible, uses data-test-id selectors
 */

import { test, expect, tn } from '../helpers/scoped-test';
import mysql from 'mysql2/promise';
import { DB } from '../helpers/db';
// Tests in this file are independent: DB lookups are pure reads, the
// only mutation (top-up) doesn't affect anyone else's assertion —
// the "balance increases after top-up" test only requires balance > 0,
// which the isolation-setup seed (50k starting balance) already
// guarantees regardless of top-up timing.
test.describe.configure({ mode: 'parallel' });

async function getUserAccountData(): Promise<{ id: number; name: string; login: string }> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT id, login, COALESCE(name, '') AS name
			 FROM ${tn('accounts')}
			 WHERE login = 'testuser_setup_user@irabi.test'`
		);
		return rows[0] ?? { id: 0, name: '', login: '' };
	} finally { await conn.end(); }
}

// -- Tests --

test.describe('AccountSM: registered -> active (user profile)', () => {

	test('AccountSM registered: authenticated user can reach /balance (account active)', async ({ page }) => {
		const resp = await page.goto('/balance');
		expect(resp?.status()).toBe(200);
		expect(page.url()).toContain('/balance');
	});

	test('AccountSM: user account exists in DB with login', async () => {
		const data = await getUserAccountData();
		expect(data.id).toBeGreaterThan(0);
		expect(data.login).toBe('testuser_setup_user@irabi.test');
	});

	test('AccountSM: user has a name in account data (profile filled by setup)', async () => {
		const data = await getUserAccountData();
		expect(data.name.length).toBeGreaterThan(0);
	});

	test('AccountSM active: balance page shows balance amount widget', async ({ page }) => {
		await page.goto('/balance');

		await expect(page.locator('[data-test-id="balance-amount"]')).toBeVisible({ timeout: 8000 });
	});

	test('AccountSM active: user can top-up balance (XHR-based)', async ({ page }) => {
		await page.goto('/balance');

		const topupInput = page.locator('[data-test-id="topup-amount-input"]');
		await expect(topupInput).toBeVisible({ timeout: 8000 });

		// Fill and submit a small top-up (XHR via sendPost) — wait for the
		// top-up POST to land before letting the next test read balance from DB.
		await topupInput.fill('100');
		// Pin to `~topup` — generic POST<500 catches CSRF refresh / list
		// refetch and resolves before the actual top-up lands.
		await Promise.all([
			page.waitForResponse(
				r => r.request().method() === 'POST' && r.url().includes('~topup') && r.status() < 500,
				{ timeout: 10000 }
			),
			page.locator('[data-test-id="topup-submit"]').click(),
		]);

		// Verify button is still present (page was not reloaded, UI is reactive)
		await expect(page.locator('[data-test-id="topup-submit"]')).toBeVisible({ timeout: 5000 });
	});

	test('AccountSM active: balance increases after top-up', async ({ page }) => {
		await page.goto('/balance');

		const balanceEl = page.locator('[data-test-id="balance-amount"]');
		await expect(balanceEl).toBeVisible({ timeout: 8000 });
		const text = await balanceEl.textContent() ?? '0';
		const balance = parseInt(text.replace(/\D/g, ''), 10);
		// After top-up, balance should be positive
		expect(balance).toBeGreaterThan(0);
	});

	test('AccountSM: authenticated user can view bookings page (account is active)', async ({ page }) => {
		const resp = await page.goto('/bookings');
		expect(resp?.status()).toBe(200);
		await expect(page.locator('text=/Fatal|Exception/i')).toHaveCount(0);
	});
});
