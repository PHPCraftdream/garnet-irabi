/**
 * Central smooth navigation.
 *
 * Every eligible internal <a href> — not only the ones tagged .hot-click — is
 * intercepted and routed through the cross-fade SPA navigation. And a newer
 * click supersedes an in-flight one, so a slow/failed previous request can't
 * yank the user off the page they just chose.
 *
 * The "no full reload" check uses a window marker: it survives a hot (SPA)
 * navigation but is wiped by a real document load.
 */

import { test, expect } from '../helpers/scoped-test';

test.describe.configure({ mode: 'parallel' });

test.describe('Central smooth navigation', () => {
    test('a plain internal link navigates without a full reload', async ({ page }) => {
        await page.goto('/system/');

        const balance = page.locator('[data-test-id="balance-link"]');
        await expect(balance).toBeVisible({ timeout: 10000 });
        // It's a styled button-link, NOT tagged .hot-click — so this exercises the
        // central interception path, not the legacy class-based one.
        await expect(balance).not.toHaveClass(/hot-click/);

        await page.evaluate(() => { (window as unknown as { __navMarker?: string }).__navMarker = 'alive'; });
        await balance.click({ noWaitAfter: true });

        await page.waitForURL(u => new URL(u).pathname.includes('/balance'), { timeout: 10000 });
        const survived = await page.evaluate(() => (window as unknown as { __navMarker?: string }).__navMarker);
        expect(survived, 'marker survives → it was a hot nav, not a full reload').toBe('alive');
    });

    test('a newer click supersedes a slow previous navigation', async ({ page }) => {
        await page.goto('/system/');

        await expect(page.locator('[data-test-id="balance-link"]')).toBeVisible({ timeout: 10000 });
        // The desktop top bar link (the mobile drawer one is hidden on this viewport).
        const slotsLink = page.locator('.nav-topbar a[href="/system/slots"]').first();
        await expect(slotsLink).toBeVisible({ timeout: 10000 });

        // Delay the FIRST navigation's HTML fetch so the second click can win.
        await page.route('**/system/balance', async route => {
            await new Promise(r => setTimeout(r, 1500));
            await route.continue();
        });

        await page.locator('[data-test-id="balance-link"]').click({ noWaitAfter: true });  // A — slow
        await slotsLink.click({ noWaitAfter: true });                                       // B — fast, wins

        await page.waitForURL(u => new URL(u).pathname.endsWith('/slots'), { timeout: 8000 });
        await expect(page.locator('[data-test-id="slots-calendar"]')).toBeVisible({ timeout: 8000 });

        // After A's slow response finally lands, it must NOT override B.
        await page.waitForTimeout(2000);
        expect(new URL(page.url()).pathname).toContain('/slots');
        expect(new URL(page.url()).pathname).not.toContain('/balance');
    });
});
