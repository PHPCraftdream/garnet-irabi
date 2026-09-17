/**
 * Смоук основных разделов: пользователи, брони, финансы, балансы.
 *
 * Часть разобранного admin-smoke.spec.ts. Режим параллельный, как и был:
 * группы независимы и ничего друг другу не оставляют.
 */

import { test, expect } from '../../helpers/scoped-test';
import {
    openAdminPage,
    expectTableVisible,
} from './helpers';

test.describe.configure({ mode: 'parallel' });

test.describe('Admin — Users page (/admin/)', () => {
	test('page loads and shows table', async ({ page }) => {
		await openAdminPage(page, '/admin/');
		await expectTableVisible(page);
	});

	test('has expected column headers', async ({ page }) => {
		await openAdminPage(page, '/admin/');
		await Promise.all([
			expect(page.locator('[data-test-id="sort-col-id"]')).toBeVisible({ timeout: 5000 }),
			expect(page.locator('[data-test-id="sort-col-login"]')).toBeVisible(),
		]);
	});

	test('has search input', async ({ page }) => {
		await openAdminPage(page, '/admin/');
		await expect(page.locator('[data-test-id="admin-grid-search"]')).toBeVisible({ timeout: 5000 });
	});

	test('admin user row is visible', async ({ page }) => {
		await openAdminPage(page, '/admin/');
		const tbody = page.locator('tbody');
		await expect(tbody).toBeVisible({ timeout: 5000 });
		const rowCount = await page.locator('tbody tr:not(:has(td[colspan]))').count();
		expect(rowCount).toBeGreaterThan(0);
	});

	test('search for admin login filters results', async ({ page }) => {
		await openAdminPage(page, '/admin/');
		const searchInput = page.locator('[data-test-id="admin-grid-search"]');
		await searchInput.fill('testuser_setup_admin@irabi.test');

		const rows = page.locator('tbody tr:not(:has(td[colspan]))');
		const count = await rows.count();
		expect(count).toBeGreaterThanOrEqual(1);
		const bodyText = await page.locator('tbody').textContent();
		expect(bodyText).toContain('testuser_setup_admin@irabi.test');
	});

	test('searching nonexistent user shows empty state', async ({ page }) => {
		await openAdminPage(page, '/admin/');
		await page.locator('[data-test-id="admin-grid-search"]').fill('xyzzy_no_such_user_abc');
		await expect(page.locator('tbody td[colspan]')).toBeVisible();
	});

	test('sidebar navigation is visible', async ({ page }) => {
		await openAdminPage(page, '/admin/');
		// Two <aside>s coexist now: mobile drawer + desktop sidebar — at
		// least one must be present. `expect.poll` so we re-check while
		// the React island mounts; bare `.count()` is a snapshot and was
		// racing the `domcontentloaded`-only goto.
		await expect.poll(() => page.locator('aside').count(), { timeout: 5000, intervals: [50, 150, 400] }).toBeGreaterThan(0);
	});

	test('sidebar has slots item', async ({ page }) => {
		await openAdminPage(page, '/admin/');
		await expect(page.locator('[data-test-id="sidebar-слоты"]').first()).toBeVisible({ timeout: 5000 });
	});

	test('sidebar no longer renders the legacy "брони" item', async ({ page }) => {
		await openAdminPage(page, '/admin/');
		// Bookings was renamed/folded into the slots group — old testid must be gone.
		// Wait for the sidebar to mount first (positive assertion polls)
		// before asserting the negative — otherwise we just see "0" because
		// the React island hadn't mounted yet at all.
		await Promise.all([
			expect(page.locator('[data-test-id="sidebar-слоты"]').first()).toBeVisible({ timeout: 5000 }),
			expect(page.locator('[data-test-id="sidebar-брони"]')).toHaveCount(0),
		]);
	});
});

test.describe('Admin — Bookings page (/admin/bookings/)', () => {
	test('page loads and shows tab nav', async ({ page }) => {
		await openAdminPage(page, '/admin/bookings/');
		await expect(page.locator('[data-test-id="admin-bookings-section-tabs"]')).toBeVisible({ timeout: 8000 });
	});

	test('has all four tabs', async ({ page }) => {
		await openAdminPage(page, '/admin/bookings/');
		await Promise.all([
			expect(page.locator('[data-test-id="tabnav-btn-slots"]')).toBeVisible({ timeout: 5000 }),
			expect(page.locator('[data-test-id="tabnav-btn-bookings"]')).toBeVisible(),
			expect(page.locator('[data-test-id="tabnav-btn-expert-cancellations"]')).toBeVisible(),
			expect(page.locator('[data-test-id="tabnav-btn-user-cancellations"]')).toBeVisible(),
		]);
	});

	test('slots tab is active by default', async ({ page }) => {
		await openAdminPage(page, '/admin/bookings/');
		await Promise.all([
			expect(page.locator('[data-test-id="tabnav-btn-slots"]')).toHaveAttribute('aria-selected', 'true'),
			expect(page.locator('[data-test-id="admin-slots-tab"]')).toBeVisible({ timeout: 5000 }),
		]);
	});

	test('slots tab has search input', async ({ page }) => {
		await openAdminPage(page, '/admin/bookings/');
		await expect(page.locator('[data-test-id="admin-slots-search"]')).toBeVisible({ timeout: 5000 });
	});

	test('bookings tab has search input', async ({ page }) => {
		await openAdminPage(page, '/admin/bookings/?tab=bookings');
		await expect(page.locator('[data-test-id="admin-bookings-search"]')).toBeVisible({ timeout: 5000 });
	});

	test('bookings tab exposes expert/user/status/reset filter controls', async ({ page }) => {
		await openAdminPage(page, '/admin/bookings/?tab=bookings');
		await Promise.all([
			expect(page.locator('[data-test-id="admin-bookings-tab"]')).toBeVisible({ timeout: 8000 }),
			expect(page.locator('[data-test-id="admin-bookings-expert"]')).toBeVisible({ timeout: 5000 }),
			expect(page.locator('[data-test-id="admin-bookings-user"]')).toBeVisible({ timeout: 5000 }),
			expect(page.locator('[data-test-id="admin-bookings-status"]')).toBeVisible({ timeout: 5000 }),
			expect(page.locator('[data-test-id="admin-bookings-reset"]')).toBeVisible({ timeout: 5000 }),
		]);
	});
});

test.describe('Admin — Finance page (/admin/finance/)', () => {
	test('page loads and shows table', async ({ page }) => {
		await openAdminPage(page, '/admin/finance/');
		await expectTableVisible(page);
	});

	test('has expected column headers', async ({ page }) => {
		await openAdminPage(page, '/admin/finance/');
		// Finance grid has columns: amount, entry_type, created_at etc
		const firstHeader = page.locator('thead th').first();
		await expect(firstHeader).toBeVisible({ timeout: 5000 });
	});
});

test.describe('Admin — Balances page (/admin/balances/)', () => {
	test('page loads and shows table', async ({ page }) => {
		await openAdminPage(page, '/admin/balances/');
		await expectTableVisible(page);
	});

	test('has expected column headers', async ({ page }) => {
		await openAdminPage(page, '/admin/balances/');
		// balance and updated_at are sortable; login/name are not
		await Promise.all([
			expect(page.locator('[data-test-id="sort-col-balance"]')).toBeVisible({ timeout: 5000 }),
			expect(page.locator('[data-test-id="sort-col-updated_at"]')).toBeVisible(),
		]);
	});
});
