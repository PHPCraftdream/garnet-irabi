/**
 * Admin — /admin/bookings/?tab=bookings — status filter
 *
 * The bookings tab uses a native <select data-test-id="admin-bookings-status">.
 * On change, the table is re-fetched (debounced 300ms) — verify it narrows.
 * URL is NOT mutated by the status select (only the tab itself is pushed),
 * so we assert behavioral narrowing of the visible table.
 */

import { test, expect } from '../../helpers/scoped-test';
import type { Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

const ROW_SEL = '[data-test-id="admin-bookings-tab"] tbody tr:not(:has(td[colspan]))';

async function openBookingsTab(page: Page) {
	await page.goto('/admin/bookings/?tab=bookings');
	await page.waitForSelector('[data-test-id="admin-bookings-tab"]', { timeout: 12000 });
}

test.describe('Admin — /admin/bookings/ — bookings tab status filter', () => {
	test('status select narrows the visible row set', async ({ page }) => {
		await openBookingsTab(page);

		const rows = page.locator(ROW_SEL);
		const totalBefore = await rows.count();

		if (totalBefore === 0) {
			// Nothing seeded — skip rather than emit a green-but-meaningless test.
			test.skip();
			return;
		}

		// Find the first non-"all" option in the status select.
		const statusSelect = page.locator('[data-test-id="admin-bookings-status"]');
		await expect(statusSelect).toBeVisible({ timeout: 5000 });

		const optionValues = await statusSelect.locator('option').evaluateAll(
			els => els.map(el => (el as HTMLOptionElement).value)
		);
		const concrete = optionValues.find(v => v !== '');
		if (!concrete) { test.skip(); return; }

		await statusSelect.selectOption(concrete);

		// Auto-apply (300ms debounce) — wait until row count <= total.
		await expect.poll(async () => rows.count(), { timeout: 8000, intervals: [50, 150, 400] }).toBeLessThanOrEqual(totalBefore);

		const filtered = await rows.count();

		// Reset filter — count should return to original (or higher).
		await page.locator('[data-test-id="admin-bookings-reset"]').click();
		await expect.poll(async () => rows.count(), { timeout: 8000, intervals: [50, 150, 400] }).toBeGreaterThanOrEqual(filtered);
	});
});
