/**
 * Consent-gated CSRF: verifies that no cookies are set on cold page
 * loads, that the consent checkbox triggers the start-session endpoint,
 * and that the submit button is disabled until consent is given.
 */

import { test, expect } from '../../helpers/scoped-test';
import { newScopedContext } from '../../helpers/scoped-test';

const BASE = process.env.BASE_URL || 'http://localhost:8001';

test.describe('Consent-gated CSRF', () => {
    test('cold load /privacy: no cookies, no CSRF marker', async ({ browser }) => {
        const context = await newScopedContext(browser, { baseURL: BASE });
        const page = await context.newPage();

        await page.goto('/privacy');
        await page.waitForLoadState('networkidle');

        const cookies = await context.cookies();
        const sessionCookie = cookies.find(c => c.name === 'session');
        const csrfCookie = cookies.find(c => c.name === 'CSRF_TOKEN');
        expect(sessionCookie).toBeUndefined();
        expect(csrfCookie).toBeUndefined();

        const hasCsrf = await page.evaluate(() => !!(window as any).__GARNET_CSRF__);
        expect(hasCsrf).toBe(false);

        await context.close();
    });

    test('auth form: cookies appear after checking the consent box', async ({ browser }) => {
        const context = await newScopedContext(browser, { baseURL: BASE });
        const page = await context.newPage();

        await page.goto('/system/');
        await expect(page.locator('[data-test-id="auth-login-input"]')).toBeVisible({ timeout: 10000 });

        // Before consent: no session or CSRF cookies
        const cookiesBefore = await context.cookies();
        expect(cookiesBefore.find(c => c.name === 'session')).toBeUndefined();
        expect(cookiesBefore.find(c => c.name === 'CSRF_TOKEN')).toBeUndefined();

        // Click consent checkbox — triggers start-session POST
        const [startSessResp] = await Promise.all([
            page.waitForResponse(
                r => r.request().method() === 'POST' && r.url().includes('/system/'),
                { timeout: 15000 },
            ),
            page.locator('[data-test-id="auth-consent-pd"]').click(),
        ]);
        expect(startSessResp.ok()).toBe(true);
        const body = await startSessResp.json();
        expect(body.success).toBe(true);
        expect(typeof body.csrf).toBe('string');
        expect(body.csrf.length).toBeGreaterThan(0);

        // After consent: both cookies should exist
        const cookiesAfter = await context.cookies();
        expect(cookiesAfter.find(c => c.name === 'session')).toBeDefined();
        expect(cookiesAfter.find(c => c.name === 'CSRF_TOKEN')).toBeDefined();

        // window.__GARNET_CSRF__ should be set
        const csrfValue = await page.evaluate(() => (window as any).__GARNET_CSRF__);
        expect(typeof csrfValue).toBe('string');
        expect(csrfValue.length).toBeGreaterThan(0);

        await context.close();
    });

    test('submit blocked without consent', async ({ browser }) => {
        const context = await newScopedContext(browser, { baseURL: BASE });
        const page = await context.newPage();

        await page.goto('/system/');
        await expect(page.locator('[data-test-id="auth-login-input"]')).toBeVisible({ timeout: 10000 });

        await page.locator('[data-test-id="auth-login-input"]').fill('test@example.com');

        const submitBtn = page.locator('[data-test-id="auth-submit-btn"]');
        await expect(submitBtn).toBeDisabled();

        await context.close();
    });
});
