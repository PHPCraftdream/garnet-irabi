/**
 * Admin — /admin/finance/?tab=balances — client-side filters
 *
 * Verifies:
 *   A. Account combobox narrows the grid to a single user; reset restores rows.
 *   B. Date range filter (`balances-date-from` set to a far-future date) hides
 *      all rows; reset restores them.
 *   C. The reset button is hidden when no filter is active and appears as soon
 *      as a filter is applied.
 */

import { test, expect } from '../../helpers/scoped-test';
import type { Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

const ROW_SEL = '[data-test-id^="grid-row-"]';

async function openBalances(page: Page) {
	await page.goto('/admin/finance/?tab=balances');
	await page.waitForLoadState('networkidle');
	// AdminGrid renders a <table>; wait until at least the search input or table is on the page.
	await page.locator('table').first().waitFor({ state: 'visible', timeout: 12000 });
}

test.describe('Admin — Balances filters', () => {
	test('A. account combobox narrows the grid; reset restores it', async ({ page }) => {
		await openBalances(page);

		const rows = page.locator(ROW_SEL);
		const initialCount = await rows.count();
		if (initialCount === 0) { test.skip(); return; }

		// Open Combobox.
		await page.locator('[data-test-id="balances-account-filter"]').click();

		// Search the popover for "expert" (matches seed accounts like expert1@dev.test → name "expert1").
		const searchInput = page.locator('[data-test-id="balances-account-filter-search"]');
		await searchInput.waitFor({ state: 'visible', timeout: 5000 });
		await searchInput.fill('expert');

		// Pick the first option whose value is non-empty (skip the "Все" entry which has value="").
		const firstRealOption = page.locator(
			'[data-test-id^="balances-account-filter-option-"]:not([data-test-id="balances-account-filter-option-"])',
		).first();
		const firstOptionExists = await firstRealOption.isVisible({ timeout: 3000 }).catch(() => false);
		if (!firstOptionExists) {
			// No "expert" account in seed — fall back to picking the first non-Все option without filtering.
			await searchInput.fill('');
		}

		await firstRealOption.click();

		// After picking a single account, exactly one balance row remains (one row per account).
		await expect.poll(async () => rows.count(), { timeout: 5000, intervals: [50, 150, 400] }).toBe(1);

		// Reset button is now visible.
		const resetBtn = page.locator('[data-test-id="balances-reset"]');
		await expect(resetBtn).toBeVisible();
		await resetBtn.click();

		// Rows restored.
		await expect.poll(async () => rows.count(), { timeout: 5000, intervals: [50, 150, 400] }).toBe(initialCount);
	});

	test('B. date range filter (far-future) empties the grid; reset restores it', async ({ page }) => {
		await openBalances(page);

		const rows = page.locator(ROW_SEL);
		const initialCount = await rows.count();
		if (initialCount === 0) { test.skip(); return; }

		const dateFrom = page.locator('[data-test-id="balances-date-from"]');
		await dateFrom.fill('2099-01-01');
		// Move focus so the change event commits.
		await dateFrom.blur();

		await expect.poll(async () => rows.count(), { timeout: 5000, intervals: [50, 150, 400] }).toBe(0);

		const resetBtn = page.locator('[data-test-id="balances-reset"]');
		await expect(resetBtn).toBeVisible();
		await resetBtn.click();

		await expect.poll(async () => rows.count(), { timeout: 5000, intervals: [50, 150, 400] }).toBe(initialCount);
	});

	test('C. reset button hidden when no filter active, appears once any is set', async ({ page }) => {
		await openBalances(page);

		const rows = page.locator(ROW_SEL);
		const initialCount = await rows.count();
		if (initialCount === 0) { test.skip(); return; }

		const resetBtn = page.locator('[data-test-id="balances-reset"]');
		// Initially hidden — no filter active.
		await expect.poll(async () => resetBtn.count(), { timeout: 3000, intervals: [50, 150, 400] }).toBe(0);

		// Activate a filter — date_to is the cheapest one (no combobox interaction needed).
		const dateTo = page.locator('[data-test-id="balances-date-to"]');
		await dateTo.fill('2099-12-31');
		await dateTo.blur();

		await expect.poll(async () => resetBtn.count(), { timeout: 5000, intervals: [50, 150, 400] }).toBe(1);
		await expect(resetBtn).toBeVisible();
	});
});
