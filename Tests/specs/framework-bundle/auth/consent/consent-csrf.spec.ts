/**
 * Consent-gated CSRF: verifies that no cookies are set on cold page
 * loads, that the consent checkbox triggers the start-session endpoint,
 * and that the submit button is disabled until consent is given.
 */

import { test, expect } from '../../../../helpers/scoped-test';
import { newScopedContext } from '../../../../helpers/scoped-test';
import { createDiagnostics } from '../../../../helpers/guards/failure-diagnostics';
import type { Page, Request } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://localhost:8001';

// Requests still running when the test ends: a page that never reaches network idle shows them here.
const inFlight = new Map<Request, { method: string; url: string; startedAt: number }>();
let lastActivityAt = 0;
let probedPage: Page | null = null;
const diag = createDiagnostics(async () => ({
    inFlight: [...inFlight.values()].map(({ startedAt, ...info }) => ({ ...info, ageMs: Date.now() - startedAt })),
    // What the browser itself knows about the page: resources without an end, state, other frames.
    browser: probedPage && !probedPage.isClosed() ? await probedPage.evaluate(() => ({
        readyState: document.readyState,
        url: location.href,
        unfinished: (performance.getEntriesByType('resource') as PerformanceResourceTiming[]).filter((e) => e.responseEnd === 0).map((e) => e.name),
        resources: performance.getEntriesByType('resource').length,
        frames: window.frames.length,
        serviceWorker: !!navigator.serviceWorker?.controller,
    })) : null,
}));
test.beforeEach(() => { diag.reset(); inFlight.clear(); lastActivityAt = Date.now(); });
test.afterEach(async ({}, testInfo) => { await diag.report(testInfo); });

test.describe('Consent-gated CSRF', () => {
    test('cold load /privacy: no cookies, no CSRF marker', async ({ browser }) => {
        const context = await newScopedContext(browser, { baseURL: BASE });
        const page = await context.newPage();
        probedPage = page;
        page.on('request', (request) => {
            lastActivityAt = Date.now();
            inFlight.set(request, { method: request.method(), url: request.url(), startedAt: Date.now() });
        });
        page.on('requestfinished', (request) => {
            const info = inFlight.get(request);
            inFlight.delete(request);
            lastActivityAt = Date.now();
            if (info) diag.note('request finished', { ...info, ms: Date.now() - info.startedAt });
        });
        page.on('requestfailed', (request) => {
            const info = inFlight.get(request);
            inFlight.delete(request);
            if (info) diag.note('request failed', { ...info, ms: Date.now() - info.startedAt, failure: request.failure()?.errorText });
        });

        await page.goto('/privacy');
        // Quiet = nothing running and nothing new for 500 ms, read from the page's own request events.
        // The browser's networkidle event did not come once in 60 although every request had ended
        // (failure report: nothing in flight, last request done 1.8 s into the load).
        await expect.poll(() => inFlight.size === 0 && Date.now() - lastActivityAt >= 500, { timeout: 15000 }).toBe(true);

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
