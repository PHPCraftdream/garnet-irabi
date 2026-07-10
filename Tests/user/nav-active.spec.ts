/**
 * User — active nav highlight (under the dynamic /system prefix) + styled
 * PageHeader. Today's changes:
 *   - Menu::main() strips the scope prefix so the current section highlights.
 *   - Every page renders a styled .page-hero header.
 *
 * Read-only — stored `user` auth state.
 */
import { test, expect } from '../helpers/scoped-test';

test.describe.configure({ mode: 'parallel' });

test.describe('Top-menu active highlight (dynamic prefix)', () => {
    test('on /system/slots the Slots item is active', async ({ page }) => {
        await page.goto('/system/slots');
        const slots = page.locator('[data-test-id="nav-обзор-слотов"]');
        await expect(slots).toBeVisible({ timeout: 10000 });
        await expect(slots).toHaveClass(/nav-top-link-active/);

        // …and a different item (Home) is NOT active.
        await expect(page.locator('[data-test-id="nav-главная-страница"]')).toHaveClass(/nav-top-link(?!-active)/);
    });

    test('on /system/ the Home item is active', async ({ page }) => {
        await page.goto('/system/');
        const home = page.locator('[data-test-id="nav-главная-страница"]');
        await expect(home).toBeVisible({ timeout: 10000 });
        await expect(home).toHaveClass(/nav-top-link-active/);
    });
});

test.describe('Styled PageHeader (.page-hero)', () => {
    for (const [path, title] of [
        ['/system/slots', 'Доступные слоты'],
        ['/system/balance', 'Мой баланс'],
        ['/system/support', 'Центр поддержки'],
    ] as const) {
        test(`page hero renders on ${path}`, async ({ page }) => {
            await page.goto(path);
            const hero = page.locator('.page-hero').first();
            await expect(hero).toBeVisible({ timeout: 10000 });
            await expect(hero.locator('.page-hero-title')).toHaveText(title);
        });
    }
});
