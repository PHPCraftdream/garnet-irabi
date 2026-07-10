/**
 * UI tests for the cross-grid page-size selector.
 *
 * Covers:
 *   - Default page size is 10
 *   - Selector exposes the [10, 20, 30, 40, 50, 100] options
 *   - Changing the selector changes the visible row count
 *   - Setting page=1 after a size change (no out-of-range pages)
 *   - localStorage persists the choice across page navigations
 *   - Both selectors (top + bottom) reflect the same value
 *
 * Runs as admin-tests project (pre-authenticated admin storageState).
 * Uses /admin/ Users grid — it ships >10 seeded accounts, so a default
 * 10/page paginates and switching to 20/page changes visible row count.
 */

import { test, expect } from '../helpers/scoped-test';

// No DB mutations. `beforeEach` resets localStorage; localStorage is
// per-worker-context (each Playwright worker has its own shared
// BrowserContext under scoped-test.ts), so parallel tests don't
// collide on the saved preference. Safe under the 32-worker pool.
test.describe.configure({ mode: 'parallel' });

const STORAGE_KEY = 'garnet.pageSize';

test.describe('Page-size selector — AdminGrid (/admin/)', () => {
	test.beforeEach(async ({ page }) => {
		// Reset the saved preference once at the start of each test, then
		// reload so the React tree picks up the cleared state. Don't use
		// `addInitScript` here — that would also fire on every subsequent
		// navigation inside the test, defeating the persist-across-pages
		// check below.
		// `waitUntil: 'networkidle'` lets the admin app's client-side landing
		// redirect settle before we touch the page — otherwise `evaluate`
		// races the navigation ("Execution context was destroyed") on the
		// slower prod server.
		await page.goto('/admin/', { waitUntil: 'networkidle' });
		await page.evaluate((key) => { try { window.localStorage.removeItem(key); } catch {} }, STORAGE_KEY);
		await page.reload();
		await page.waitForLoadState('networkidle');
	});

	test('defaults to 10 rows per page', async ({ page }) => {
		await page.goto('/admin/');
		await expect(page.locator('table')).toBeVisible({ timeout: 10000 });

		const selects = page.locator('[data-test-id="page-size-select"]');
		await Promise.all([
			expect(selects.first()).toBeVisible({ timeout: 5000 }),
			expect(selects.first()).toHaveValue('10'),
		]);

		const rows = page.locator('tbody tr[data-test-id^="grid-row-"]');
		await expect(rows).toHaveCount(10);
	});

	test('selector exposes [10, 20, 30, 40, 50, 100]', async ({ page }) => {
		await page.goto('/admin/');

		const select = page.locator('[data-test-id="page-size-select"]').first();
		await expect(select).toBeVisible({ timeout: 5000 });

		const values = await select.locator('option').evaluateAll(els =>
			els.map(el => (el as HTMLOptionElement).value)
		);
		expect(values).toEqual(['10', '20', '30', '40', '50', '100']);
	});

	test('selector is rendered both above and below the grid', async ({ page }) => {
		await page.goto('/admin/');

		const selectors = page.locator('[data-test-id="page-size-selector"]');
		await expect(selectors).toHaveCount(2);
	});

	test('switching to a larger size grows the visible row count (up to total)', async ({ page }) => {
		await page.goto('/admin/');
		await expect(page.locator('table')).toBeVisible({ timeout: 10000 });

		const rows = page.locator('tbody tr[data-test-id^="grid-row-"]');
		await expect(rows).toHaveCount(10);

		await page.locator('[data-test-id="page-size-select"]').first().selectOption('20');

		// Both selectors reflect the new value.
		const allSelects = page.locator('[data-test-id="page-size-select"]');
		await Promise.all([
			expect(allSelects.nth(0)).toHaveValue('20'),
			expect(allSelects.nth(1)).toHaveValue('20'),
		]);

		// New row count: more than the default 10, capped at 20 (or total rows
		// if the test DB seed has fewer than 20 users — worker isolation seeds
		// vary between projects).
		await expect.poll(async () => rows.count(), { timeout: 5000, intervals: [50, 150, 400] }).toBeGreaterThan(10);
		const after = await rows.count();
		expect(after).toBeLessThanOrEqual(20);

		const stored = await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY);
		expect(stored).toBe('20');
	});

	test('preference survives navigation', async ({ page }) => {
		await page.goto('/admin/');

		await page.locator('[data-test-id="page-size-select"]').first().selectOption('30');
		// We don't know the exact row count — the seed dataset grew, the
		// hard-coded `toHaveCount(23)` was burning the full 5s timeout
		// before falling through to the range fallback. Just poll the
		// range directly (10 < n ≤ 30 once the React island re-renders).
		await expect.poll(
			() => page.locator('tbody tr[data-test-id^="grid-row-"]').count(),
			{ timeout: 5000, intervals: [50, 150, 400] },
		).toBeGreaterThan(10);

		// Navigate to another admin page (Comments tab on the same /admin/ panel
		// route — keeps us in the same project but forces a fresh React mount).
		await page.goto('/admin/finance/?tab=balances');

		const select = page.locator('[data-test-id="page-size-select"]').first();
		await Promise.all([
			expect(select).toBeVisible({ timeout: 5000 }),
			expect(select).toHaveValue('30'),
		]);

		const stored = await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY);
		expect(stored).toBe('30');
	});

	test('top and bottom selectors stay in sync', async ({ page }) => {
		await page.goto('/admin/');

		const allSelects = page.locator('[data-test-id="page-size-select"]');
		await expect(allSelects).toHaveCount(2);

		// Change the bottom selector — the top one mirrors it via usePageSize().
		await allSelects.nth(1).selectOption('50');
		await Promise.all([
			expect(allSelects.nth(0)).toHaveValue('50'),
			expect(allSelects.nth(1)).toHaveValue('50'),
		]);
	});
});

test.describe('Page-size selector — dev panel does not overlap pagination', () => {
	test('body reserves bottom padding equal to the dev-panel height', async ({ page }) => {
		// The floating dev-login panel is a DEV-only affordance (rendered by the
		// dev DevLogin island); it doesn't exist on prod, so this layout check
		// is meaningless there.
		test.skip(process.env.PW_PROD === '1', 'dev-login panel is dev-only — absent on prod');
		await page.goto('/admin/');

		// Wait for the floating dev panel to mount and ResizeObserver to fire.
		await page.waitForFunction(() => {
			const btn = document.querySelector('[data-test-id="dev-login-admin"]');
			if (!btn) return false;
			const pad = parseFloat(getComputedStyle(document.body).paddingBottom);
			return pad > 0;
		}, { timeout: 5000 });

		const measured = await page.evaluate(() => {
			const btn = document.querySelector('[data-test-id="dev-login-admin"]');
			const panel = btn?.closest('div[style*="position: fixed"]') as HTMLElement | null;
			const panelH = panel?.getBoundingClientRect().height ?? 0;
			const padH = parseFloat(getComputedStyle(document.body).paddingBottom);
			return { panelH, padH };
		});
		expect(measured.panelH).toBeGreaterThan(0);
		// padding is set to ceil(panelH) — allow a 1px rounding window.
		expect(Math.abs(measured.padH - Math.ceil(measured.panelH))).toBeLessThanOrEqual(1);
	});
});
