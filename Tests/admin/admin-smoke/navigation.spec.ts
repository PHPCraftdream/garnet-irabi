/**
 * Поддержка, навигация и верхний блок счётчиков.
 *
 * Часть разобранного admin-smoke.spec.ts. Режим параллельный, как и был:
 * группы независимы и ничего друг другу не оставляют.
 */

import { test, expect } from '../../helpers/scoped-test';
import {
    openAdminPage,
} from './helpers';

test.describe.configure({ mode: 'parallel' });

test.describe('Admin — Support page (/admin/support/)', () => {
	test('page loads and returns 200', async ({ page }) => {
		const response = await page.goto('/admin/support/');
		expect(response?.status()).toBe(200);
		await expect(page.locator('text=/Fatal|Exception/i')).toHaveCount(0);
	});

	test('has status filter buttons', async ({ page }) => {
		await openAdminPage(page, '/admin/support/');
		// The "All" filter should always be visible
		await expect(page.locator('[data-test-id="support-filter-all"]')).toBeVisible({ timeout: 8000 });
	});
});

test.describe('Admin — Navigation links', () => {
	const adminPages = [
		'/admin/',
		'/admin/bookings/',
		'/admin/finance/',
		'/admin/balances/',
		'/admin/logs/',
		'/admin/cancellations/',
		'/admin/support/',
		'/admin/pages/',
	];

	for (const path of adminPages) {
		test(`${path} returns 200 for admin user`, async ({ page }) => {
			const response = await page.goto(path);
			expect(response?.status()).toBe(200);
		});
	}
});

test.describe('Admin — header utility cluster (Balance / IM / Support)', () => {
	test('balance pill IS rendered for admin', async ({ page }) => {
		await openAdminPage(page, '/admin/');
		await expect(page.locator('[data-test-id="util-balance"]')).toBeVisible({ timeout: 5000 });
	});

	test('messages icon IS rendered for admin', async ({ page }) => {
		await openAdminPage(page, '/admin/');
		await expect(page.locator('[data-test-id="util-messages"]')).toBeVisible({ timeout: 5000 });
	});

	test('support icon IS rendered for admin', async ({ page }) => {
		await openAdminPage(page, '/admin/');
		await expect(page.locator('[data-test-id="util-support"]')).toBeVisible({ timeout: 5000 });
	});

	test('mobile drawer balance/messages/support entries ARE rendered for admin', async ({ page }) => {
		await openAdminPage(page, '/admin/');
		// MobileMenu mounts via island too; assert count, not visibility — the
		// drawer is display:none until toggled, but the DOM nodes exist.
		await expect.poll(
			async () => page.locator('[data-test-id="mobile-drawer-balance"]').count(),
			{ timeout: 5000 },
		).toBeGreaterThan(0);
		await Promise.all([
			expect(page.locator('[data-test-id="mobile-drawer-messages"]')).toHaveCount(1),
			expect(page.locator('[data-test-id="mobile-drawer-support"]')).toHaveCount(1),
		]);
	});

	test('direct /balance/ navigation as admin returns 200 (no longer redirected)', async ({ page }) => {
		// Since commit e1fb5d82 admins get the full Balance/IM/Support cluster
		// (same as regular users), so /balance/ is served, not redirected away.
		const response = await page.goto('/balance/');
		expect(response?.status()).toBe(200);
		expect(page.url()).toContain('/balance');
	});

	// IM and Support pages are NOT redirected for staff anymore — commit
	// `e1fb5d82 refactor(nav): restore IM + Support visibility for moderators
	// and above` re-enabled staff access. The top/mobile-drawer icons stay
	// gated through their own testids; only direct /im/ + /support/ work.
	test('direct /im/ navigation as admin returns 200 (no longer redirected)', async ({ page }) => {
		const response = await page.goto('/im/');
		expect(response?.status()).toBe(200);
		expect(page.url()).toContain('/im');
	});

	test('direct /support/ navigation as admin returns 200 (no longer redirected)', async ({ page }) => {
		const response = await page.goto('/support/');
		expect(response?.status()).toBe(200);
		expect(page.url()).toContain('/support');
	});
});
