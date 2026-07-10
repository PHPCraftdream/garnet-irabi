/**
 * Moderator — /slots — role-based filter chip set
 *
 * For moderators (and admin/owner) the top row has only:
 *   - slot-status-filter-all
 *   - slot-status-filter-free
 * No "mine" chip — moderators don't book slots themselves.
 */

import { test, expect } from '../helpers/scoped-test';

test.describe.configure({ mode: 'serial' });

test.describe('Moderator — /slots — chips reflect role', () => {
	test('top row exposes only "all" and "free"; no "mine" chip', async ({ page }) => {
		await page.goto('/slots');
		await expect(page.locator('[data-test-id="slots-calendar"]')).toBeVisible({ timeout: 8000 });

		await Promise.all([
			expect(page.locator('[data-test-id="slot-status-filter-all"]')).toBeVisible({ timeout: 5000 }),
			expect(page.locator('[data-test-id="slot-status-filter-free"]')).toBeVisible({ timeout: 5000 }),
		]);

		// "Mine" chip is regular-user-only.
		await expect(page.locator('[data-test-id="slot-status-filter-mine"]')).toHaveCount(0);
	});
});
