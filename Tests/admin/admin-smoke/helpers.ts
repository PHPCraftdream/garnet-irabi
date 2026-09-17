/**
 * Навигация по разделам админки и ожидание таблицы.
 */

import { test, expect } from '../../helpers/scoped-test';

// saved.
export async function openAdminPage(page: any, path: string) {
	await page.goto(path, { waitUntil: 'domcontentloaded' });
	// Wait for the admin React island to actually mount before callers assert
	// on specific controls. `domcontentloaded` returns before the island has
	// rendered its grid/tabs, and on the slower prod server that gap exceeds
	// the per-assertion 5s timeouts. Settle on the first piece of admin chrome
	// (a tab button, a table, or any grid search box); best-effort so a page
	// without these still surfaces the caller's own assertion error.
	await page
		.locator('[data-test-id^="tabnav-btn-"], table, [data-test-id$="-search"]')
		.first()
		.waitFor({ state: 'visible', timeout: 20000 })
		.catch(() => {});
}

// Helper: assert table rendered (at least one th visible)
export async function expectTableVisible(page: any) {
	const table = page.locator('table');
	await expect(table).toBeVisible({ timeout: 10000 });
	const headers = page.locator('thead th');
	await expect(headers.first()).toBeVisible({ timeout: 5000 });
}

// ── /admin/ — Users ──────────────────────────────────────────────────────────
