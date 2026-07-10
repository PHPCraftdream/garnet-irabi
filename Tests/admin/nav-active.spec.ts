/**
 * Admin — active highlight in the left sidebar + the top "Управление" item,
 * plus the styled PageHeader on admin sections (today's changes). Read-only,
 * stored `admin` auth state.
 */
import { test, expect } from '../helpers/scoped-test';

test.describe.configure({ mode: 'parallel' });

test.describe('Admin sidebar / top-menu active highlight', () => {
    test('finance page: sidebar Finance + top Управление are active, hero shows', async ({ page }) => {
        await page.goto('/system/admin/finance');

        const fin = page.locator('[data-test-id="sidebar-финансы"]');
        await expect(fin).toBeVisible({ timeout: 10000 });
        await expect(fin).toHaveClass(/nav-side-link-active/);

        // A different sidebar item is not active.
        await expect(page.locator('[data-test-id="sidebar-пользователи"]')).toHaveClass(/nav-side-link(?!-active)/);

        // Top menu reflects the admin section.
        await expect(page.locator('[data-test-id="nav-управление"]')).toHaveClass(/nav-top-link-active/);

        // Styled header.
        const hero = page.locator('.page-hero').first();
        await expect(hero).toBeVisible();
        await expect(hero.locator('.page-hero-title')).toHaveText('Финансы');
    });

    test('users page: sidebar Users is active', async ({ page }) => {
        await page.goto('/system/admin');
        const users = page.locator('[data-test-id="sidebar-пользователи"]');
        await expect(users).toBeVisible({ timeout: 10000 });
        await expect(users).toHaveClass(/nav-side-link-active/);
    });
});
