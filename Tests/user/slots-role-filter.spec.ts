/**
 * User — /slots — role-based status filter chip set
 *
 * As a regular user the filter row is flat:
 *   - slot-status-filter-all       (default active)
 *   - slot-status-filter-free
 *   - slot-status-filter-mine-label  ("Мои:" plain-text label)
 *   - slot-status-filter-pending / -confirmed / -cancelled
 *
 * There is no separate "mine" tab and no nested sub-row.
 */

import { test, expect } from '../helpers/scoped-test';

test.describe.configure({ mode: 'serial' });

test.describe('User — /slots — flat status filter with "Мои:" group', () => {
	test('row exposes all + free + the three mine-status chips', async ({ page }) => {
		await page.goto('/slots');
		await expect(page.locator('[data-test-id="slots-calendar"]')).toBeVisible({ timeout: 8000 });

		await Promise.all([
			expect(page.locator('[data-test-id="slot-status-filter-all"]')).toBeVisible({ timeout: 5000 }),
			expect(page.locator('[data-test-id="slot-status-filter-free"]')).toBeVisible({ timeout: 5000 }),
			expect(page.locator('[data-test-id="slot-status-filter-mine-label"]')).toBeVisible({ timeout: 5000 }),
			expect(page.locator('[data-test-id="slot-status-filter-pending"]')).toBeVisible({ timeout: 5000 }),
			expect(page.locator('[data-test-id="slot-status-filter-confirmed"]')).toBeVisible({ timeout: 5000 }),
			expect(page.locator('[data-test-id="slot-status-filter-cancelled"]')).toBeVisible({ timeout: 5000 }),
		]);

		// The old "mine" tab and nested sub-row no longer exist.
		await expect(page.locator('[data-test-id="slot-status-filter-mine"]')).toHaveCount(0);
		await expect(page.locator('[data-test-id="slot-status-filters-mine-sub"]')).toHaveCount(0);
	});

	test('"all" is the default active tab', async ({ page }) => {
		await page.goto('/slots');
		const allTab = page.locator('[data-test-id="slot-status-filter-all"]');
		await expect(allTab).toBeVisible({ timeout: 8000 });
		await expect(allTab).toHaveAttribute('aria-selected', 'true');
	});

	test('the three mine-status chips are clickable', async ({ page }) => {
		await page.goto('/slots');
		await expect(page.locator('[data-test-id="slot-status-filter-pending"]')).toBeVisible({ timeout: 8000 });
		for (const key of ['pending', 'confirmed', 'cancelled']) {
			const chip = page.locator(`[data-test-id="slot-status-filter-${key}"]`);
			await expect(chip).toBeEnabled();
			await chip.click();
			await expect(chip).toHaveAttribute('aria-selected', 'true');
		}
	});
});
