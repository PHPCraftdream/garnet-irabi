/**
 * Regression: an invalid, expired or already-used magic-login link must
 * render an error PAGE — with the site's own header — and never a 500.
 *
 * How it broke in production: the error branch rendered the layout with
 * empty menus, and the page was then given a real menu via `Menu::main()`.
 * That helper calls `UserEntityConfig::isModerator()`, which dereferenced
 * `Account::fromSession()` without a null check — and whoever follows a
 * stale login link is, by definition, not logged in. The role predicates
 * now answer `false` for "no session" instead of throwing, which is the
 * honest answer to "is this visitor a moderator".
 *
 * The header assertion is the point: the screen must look like the site, so
 * the visitor can walk to the login page from it. A bare error message on a
 * blank background reads as a broken site, not as a handled failure — that
 * is exactly what a UAT persona reported before the fix.
 *
 * Self-contained (main-tests project): no auth state, anonymous by design.
 */
import { test, expect } from './helpers/scoped-test';
import { newScopedContext } from './helpers/scoped-test';

// 32 hex chars: shaped like a real token, guaranteed not to exist.
const DEAD_TOKEN = 'f'.repeat(32);

test('a dead magic-login link renders the error page with the site header', async ({ browser }) => {
    const context = await newScopedContext(browser);

    try {
        const page = await context.newPage();
        const serverErrors: string[] = [];
        page.on('response', (res) => {
            if (res.status() >= 500) serverErrors.push(`${res.status()} ${res.url()}`);
        });

        const response = await page.goto(`/magic-login/code~${DEAD_TOKEN}`);

        expect(response?.status(), 'dead login link must not blow up the server').toBeLessThan(500);
        expect(serverErrors, `server errors while rendering:\n${serverErrors.join('\n')}`).toHaveLength(0);

        await expect(page.locator('[data-test-id="invite-error"]')).toBeVisible({ timeout: 15000 });

        // The site chrome has to be there, and the property that matters to a
        // human is a way out — at least one internal link. Asserting that
        // rather than a header class keeps the test independent of layout
        // markup: the error card itself offers only mailto:/tel:/https
        // contacts, so any in-site link necessarily comes from the chrome.
        const internalLinks = await page.locator('a[href^="/"]').count();
        expect(internalLinks, 'error page must keep the site chrome, not dead-end the visitor').toBeGreaterThan(0);
    } finally {
        await context.close();
    }
});
