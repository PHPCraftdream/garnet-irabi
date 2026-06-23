/**
 * Admin — /admin/logs/?tab=cron — Cron tab
 *
 * Verifies:
 *   - cron tab is reachable from the unified Logs viewer
 *   - cron-task-filter, cron-date-from, cron-date-to widgets exist
 *   - either the cron table renders or an empty-state placeholder is shown
 */

import { test, expect } from '../../../helpers/scoped-test';
import type { Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

async function openLogsCronTab(page: Page) {
	await page.goto('/admin/logs/?tab=cron');
	await page.waitForSelector('[data-test-id="admin-logs-viewer"]', { timeout: 10000 });
	// Lazy load — cron section may need an extra tick to mount.
	await page.locator('[data-test-id="tabnav-btn-cron"]').waitFor({ state: 'visible', timeout: 5000 });
	if (await page.locator('[data-test-id="tabnav-btn-cron"]').getAttribute('aria-selected') !== 'true') {
		await page.locator('[data-test-id="tabnav-btn-cron"]').click();
	}
}

test.describe('Admin — Logs viewer — cron tab', () => {
	test('cron tab is visible in the tab strip', async ({ page }) => {
		await page.goto('/admin/logs/');
		await page.waitForSelector('[data-test-id="admin-logs-viewer"]', { timeout: 10000 });
		await expect(page.locator('[data-test-id="tabnav-btn-cron"]')).toBeVisible({ timeout: 8000 });
	});

	test('opening cron tab activates it and exposes the task filter', async ({ page }) => {
		await openLogsCronTab(page);

		await expect(page.locator('[data-test-id="tabnav-btn-cron"]')).toHaveAttribute('aria-selected', 'true', { timeout: 5000 });

		// Filters always visible
		await Promise.all([
			expect(page.locator('[data-test-id="cron-task-filter"]')).toBeVisible({ timeout: 5000 }),
			expect(page.locator('[data-test-id="cron-date-from"]')).toBeVisible({ timeout: 5000 }),
			expect(page.locator('[data-test-id="cron-date-to"]')).toBeVisible({ timeout: 5000 }),
		]);
	});

	test('cron tab shows table with rows or an empty-state placeholder', async ({ page }) => {
		await openLogsCronTab(page);

		// AdminLogGrid renders <table> for both populated and empty (with colspan empty cell) states.
		const grid = page.locator('[data-test-id="tabnav-btn-cron"]').first();
		await expect(grid).toBeVisible();

		// Either we have at least one cron-row-* OR a tbody with td[colspan] (empty state).
		const rowCount = await page.locator('[data-test-id^="cron-row-"]').count();
		const hasEmpty = await page.locator('tbody td[colspan]').isVisible({ timeout: 2000 }).catch(() => false);
		expect(rowCount > 0 || hasEmpty).toBeTruthy();
	});
});
