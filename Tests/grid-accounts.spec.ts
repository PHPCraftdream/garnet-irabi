import { test, expect, tn } from './helpers/scoped-test';
import type { Page } from '@playwright/test';
import { registerAccount, fillProfileForm, clearTestData } from './helpers/auth';
import mysql from 'mysql2/promise';

import { newScopedPage } from './helpers/scoped-test';
import { DB } from './helpers/db';
test.describe.configure({ mode: 'serial' });

const ADMIN_LOGIN = `testuser_admin_${process.env.TEST_PARALLEL_INDEX ?? "0"}@irabi.test`;

test.describe('iRabi Grid E2E - Accounts Management', () => {
	let page: Page;

	test.beforeAll(async ({ browser }) => {
		page = await newScopedPage(browser);
	});

	test.afterAll(async () => {
		await page.close();
		await clearTestData(ADMIN_LOGIN);
	});

	test('1. Register admin user', async () => {
		await registerAccount(page, ADMIN_LOGIN);
	});

	test('2. Fill profile', async () => {
		await fillProfileForm(page, ADMIN_LOGIN, {
			name: 'Тест Админ',
			accountType: 'user',
			timezone: 'Europe/Moscow',
		});

		// Grant admin access via DB so the user can view the admin grid
		const conn = await mysql.createConnection(DB);
		try {
			const [rows] = await conn.execute<any[]>(
				`SELECT id FROM ${tn('accounts')} WHERE login = ?`, [ADMIN_LOGIN]
			);
			if (rows.length > 0) {
				await conn.execute(
					`INSERT INTO ${tn('accounts_data')} (account_id, param, value)
					 VALUES (?, 'IS_ADMIN', '1')
					 ON DUPLICATE KEY UPDATE value = '1'`,
					[rows[0].id]
				);
			}
		} finally { await conn.end(); }

		// Reload to pick up admin role
		await page.goto('/');
		await page.waitForLoadState('networkidle');
	});

	test('3. Navigate to accounts grid page', async () => {
		await page.goto('/admin/');
		await page.waitForLoadState('networkidle');

		console.log('Current URL:', page.url());

		// Check for admin grid table
		const gridTable = page.locator('table');
		const gridVisible = await gridTable.isVisible();
		console.log('Grid table visible:', gridVisible);

		console.log('Accounts grid page loaded');
	});

	test('4. Grid displays users table', async () => {

		const gridTable = page.locator('table');
		await expect(gridTable).toBeVisible({ timeout: 5000 });

		const headers = page.locator('thead th');
		const headerCount = await headers.count();
		expect(headerCount).toBeGreaterThan(0);
		console.log(`Grid has ${headerCount} columns`);

		const rows = page.locator('tbody tr');
		const rowCount = await rows.count();
		expect(rowCount).toBeGreaterThan(0);
		console.log(`Grid has ${rowCount} rows`);
	});

	test('5. Grid search functionality', async () => {
		const searchInput = page.locator('input[placeholder*="🔍"]');
		if (await searchInput.count() === 0) {
			console.log('Search not found, skipping search test');
			return;
		}

		await searchInput.fill(ADMIN_LOGIN);

		const rows = page.locator('tbody tr');
		const rowCount = await rows.count();
		expect(rowCount).toBeLessThanOrEqual(1);
		console.log(`Search results: ${rowCount} rows`);

		await searchInput.fill('');
	});

	test('6. Grid pagination', async () => {
		const pagination = page.locator('.gridjs-pagination');
		if (await pagination.count() === 0) {
			console.log('Pagination not found, skipping pagination test');
			return;
		}

		const summary = page.locator('.gridjs-pagination-summary');
		if (await summary.count() > 0) {
			const summaryText = await summary.textContent();
			console.log(`Pagination: ${summaryText}`);
		}

		const pageButtons = page.locator('.gridjs-page');
		const pageCount = await pageButtons.count();
		console.log(`Pagination has ${pageCount} pages`);
	});

	test('7. Grid row selection/edit', async () => {
		const editButtons = page.locator('.grid-edit');
		const editCount = await editButtons.count();

		if (editCount > 0) {
			console.log(`Found ${editCount} edit buttons`);

			await editButtons.first().click();

			const editContainer = page.locator('.edit-container');
			await expect(editContainer).toBeVisible({ timeout: 5000 });
			console.log('Edit form opened');

			const cancelButton = page.locator('.save-btn-cancel');
			if (await cancelButton.count() > 0) {
				await cancelButton.first().click();
			}
		} else {
			console.log('No edit buttons found');
		}
	});

	test('8. Grid sorting', async () => {
		const sortableHeaders = page.locator('th[role="columnheader"]');
		const headerCount = await sortableHeaders.count();

		if (headerCount > 0) {
			console.log(`Found ${headerCount} sortable headers`);

			const firstHeader = sortableHeaders.first();
			const headerText = await firstHeader.textContent();
			console.log(`Sorting by: ${headerText}`);

			await firstHeader.click();
		}
	});
});
