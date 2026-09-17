/**
 * D-182 [P0]: the deployed HTML referenced a JS bundle that did not exist on
 * the server. The app's own bundle name is derived from the sources at render
 * time, so shipping PHP/templates without re-publishing the built assets makes
 * the page ask for `foreground.foreground.<newHash>.gen.js` while only the
 * previously built `<oldHash>` file is on disk — the request 404s.
 *
 * What made it expensive: nothing looked broken from the outside. Anonymous
 * pages (home, catalogue, login) only need the framework/auth bundles, which
 * WERE published, so they kept rendering. Only pages whose islands live in the
 * app bundle — i.e. the entire signed-in cabinet — silently failed to hydrate
 * and showed a blank page. The server still answered 200 with correct data, no
 * PHP error was logged, and no JS error was raised (the script never loaded),
 * so every automatic signal stayed green while the cabinet was unusable for
 * ~12 hours.
 *
 * This spec is deliberately about the CLASS of failure rather than that one
 * hash: on every page a real role actually uses, every static asset the page
 * requests must come back OK. A manifest/file desync of any kind — app bundle,
 * framework bundle, lazy chunk, stylesheet — fails it.
 */
import { test, expect } from '../helpers/scoped-test';
import type { Page } from '@playwright/test';

/** Asset requests the page itself made, which the server did not serve. */
async function collectBrokenAssets(page: Page, url: string): Promise<string[]> {
    const broken: string[] = [];

    const onResponse = (res: { status: () => number; url: () => string }): void => {
        const u = res.url();
        if (!u.includes('/assets/')) return;
        if (res.status() >= 400) broken.push(`${res.status()} ${u}`);
    };

    page.on('response', onResponse);
    try {
        await page.goto(url, { waitUntil: 'networkidle' });
    } finally {
        page.off('response', onResponse);
    }

    return broken;
}

/**
 * Second, stricter check on the same page: every <script src> / stylesheet the
 * HTML declares must be fetchable. `response` events alone can miss an asset
 * the browser served from its own cache, which is exactly the state a warm
 * session is in right after a bad deploy.
 */
async function collectUnfetchableDeclaredAssets(page: Page): Promise<string[]> {
    const declared = await page.evaluate(() => {
        const scripts = [...document.querySelectorAll('script[src]')].map(s => (s as HTMLScriptElement).src);
        const styles = [...document.querySelectorAll('link[rel="stylesheet"][href]')].map(l => (l as HTMLLinkElement).href);
        return [...scripts, ...styles].filter(u => u.includes('/assets/'));
    });

    expect(declared.length, 'page declared no /assets/ resources at all — selector or page is wrong').toBeGreaterThan(0);

    const bad: string[] = [];
    for (const url of declared) {
        const res = await page.request.get(url);
        if (!res.ok()) bad.push(`${res.status()} ${url}`);
    }

    return bad;
}

async function assertAssetsIntact(page: Page, url: string, label: string): Promise<void> {
    const brokenDuringLoad = await collectBrokenAssets(page, url);
    const unfetchable = await collectUnfetchableDeclaredAssets(page);

    const all = [...new Set([...brokenDuringLoad, ...unfetchable])];
    expect(all, `${label} (${url}) references assets the server does not serve:\n${all.join('\n')}`).toHaveLength(0);
}

test.describe('D-182: published assets match what the rendered HTML asks for', () => {
    // A green "nothing is broken" assertion proves nothing on its own — it
    // stays green just as happily if the check itself stopped working. So
    // first plant an asset reference that cannot resolve and require the
    // check to notice it. If this test ever passes while the real ones do
    // too, the suite is meaningful; if this one starts failing, the checker
    // has gone blind and the others' green means nothing.
    test('the check itself catches a missing asset', async ({ page }) => {
        await page.goto('/');

        await page.evaluate(() => {
            const s = document.createElement('script');
            // Hashed name that no build will ever produce.
            s.src = '/assets/slotbook/gen/js/deliberately-absent-0000000000000000.gen.js';
            document.body.appendChild(s);
        });

        const bad = await collectUnfetchableDeclaredAssets(page);
        expect(bad.join('\n')).toContain('deliberately-absent-0000000000000000');
    });

    test('anonymous landing page', async ({ page }) => {
        await assertAssetsIntact(page, '/', 'anonymous landing');
    });

    // The regression that motivated this spec was invisible on anonymous pages
    // and total on signed-in ones — so each role's own entry page is checked.
    test('signed-in user cabinet', async ({ userPage }) => {
        await assertAssetsIntact(userPage, '/system/', 'user cabinet');
    });

    test('expert cabinet', async ({ expertPage }) => {
        await assertAssetsIntact(expertPage, '/system/expert/~slots', 'expert cabinet');
    });

    test('admin dashboard', async ({ adminPage }) => {
        await assertAssetsIntact(adminPage, '/admin', 'admin dashboard');
    });
});
