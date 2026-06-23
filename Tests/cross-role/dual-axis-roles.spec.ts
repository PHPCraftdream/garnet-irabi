/**
 * Dual-axis role tests: business role (expert/user) + staff role
 * (admin/moderator/owner) are orthogonal. Staff flags must NOT hide
 * business UI — an expert-moderator sees expert features AND staff
 * dashboard, an expert-admin sees expert features AND admin panel.
 */

import { test, expect, newScopedContext } from '../helpers/scoped-test';
import { resolveStorageStatePath } from '../helpers/state';

test.describe.configure({ mode: 'parallel' });

test.describe('Expert-Moderator dual-axis', () => {
	test('sees expert business menu + staff dashboard link', async ({ browser }) => {
		const ctx = await newScopedContext(browser, { storageState: resolveStorageStatePath('expert-moderator') });
		const page = await ctx.newPage();
		try {
			await page.goto('/system/');

			await Promise.all([
				expect(page.locator('nav a[href*="expert/~slots"]').first()).toBeAttached({ timeout: 8000 }),
				expect(page.locator('nav a[href*="bookings"]').first()).toBeAttached({ timeout: 8000 }),
				expect(page.locator('nav a[href*="admin"]').first()).toBeAttached({ timeout: 8000 }),
			]);
		} finally {
			await page.close();
			await ctx.close();
		}
	});

	test('homepage renders user dashboard, not admin redirect', async ({ browser }) => {
		const ctx = await newScopedContext(browser, { storageState: resolveStorageStatePath('expert-moderator') });
		const page = await ctx.newPage();
		try {
			await page.goto('/system/');
			await expect(page.locator('[data-test-id="dashboard"]')).toBeVisible({ timeout: 10000 });
		} finally {
			await page.close();
			await ctx.close();
		}
	});

	test('can access /expert/~slots (business-expert route)', async ({ browser }) => {
		const ctx = await newScopedContext(browser, { storageState: resolveStorageStatePath('expert-moderator') });
		const page = await ctx.newPage();
		try {
			const resp = await page.goto('/expert/~slots');
			expect(resp?.status()).toBe(200);
		} finally {
			await page.close();
			await ctx.close();
		}
	});

	test('can access /admin/ (staff route)', async ({ browser }) => {
		const ctx = await newScopedContext(browser, { storageState: resolveStorageStatePath('expert-moderator') });
		const page = await ctx.newPage();
		try {
			const resp = await page.goto('/admin/');
			expect(resp?.status()).toBe(200);
		} finally {
			await page.close();
			await ctx.close();
		}
	});
});

test.describe('Expert-Admin dual-axis', () => {
	test('sees expert business menu + staff dashboard link', async ({ browser }) => {
		const ctx = await newScopedContext(browser, { storageState: resolveStorageStatePath('expert-admin') });
		const page = await ctx.newPage();
		try {
			await page.goto('/system/');

			await Promise.all([
				expect(page.locator('nav a[href*="expert/~slots"]').first()).toBeAttached({ timeout: 8000 }),
				expect(page.locator('nav a[href*="bookings"]').first()).toBeAttached({ timeout: 8000 }),
				expect(page.locator('nav a[href*="admin"]').first()).toBeAttached({ timeout: 8000 }),
			]);
		} finally {
			await page.close();
			await ctx.close();
		}
	});

	test('homepage renders user dashboard, not admin redirect', async ({ browser }) => {
		const ctx = await newScopedContext(browser, { storageState: resolveStorageStatePath('expert-admin') });
		const page = await ctx.newPage();
		try {
			await page.goto('/system/');
			await expect(page.locator('[data-test-id="dashboard"]')).toBeVisible({ timeout: 10000 });
		} finally {
			await page.close();
			await ctx.close();
		}
	});
});
