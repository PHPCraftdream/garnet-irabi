/**
 * Custom 404 page (StaticPagesService::renderNotFoundBody()) no longer
 * carries a "go home" link/button.
 *
 * That link used to render via a `StaticPages_NotFound_Home` i18n string
 * on `<a href="/" class="sp-notfound-home">{{ home }}</a>`. Removed at the
 * user's explicit request after it showed up empty in production (found
 * while chasing the magic-login double-redirect-prefix incident, which
 * routed through this exact page en route to a 404). Regression guard: the
 * 404 body still renders (title + text), just without that link.
 *
 * No login needed: 404s are anonymous by definition.
 */

import { test, expect } from '../../helpers/scoped-test';
import { newScopedContext } from '../../helpers/scoped-test';

test.describe('Custom 404 page — no "go home" button', () => {
    test('visiting a nonexistent path renders the branded 404 body without sp-notfound-home', async ({ browser }) => {
        const context = await newScopedContext(browser);
        const page = await context.newPage();

        const response = await page.goto('/this-path-does-not-exist-1785350000');
        expect(response?.status()).toBe(404);

        // The removed button/link must be gone entirely.
        await expect(page.locator('.sp-notfound-home')).toHaveCount(0);

        // The rest of the branded 404 body is still there.
        await expect(page.locator('.sp-notfound')).toBeVisible();
        await expect(page.locator('.sp-notfound-code')).toHaveText('404');
        await expect(page.locator('.sp-notfound-title')).not.toBeEmpty();
        await expect(page.locator('.sp-notfound-text')).not.toBeEmpty();

        await context.close();
    });
});
