/**
 * Backend errors that the call site didn't handle must surface as a toast
 * (instead of only a silent "Uncaught (in promise)" in the console). The
 * Framework entry installs a global `unhandledrejection` handler that toasts
 * OUR request errors (RespError / ApiError — they carry a numeric status /
 * response) and ignores unrelated rejections.
 *
 * Uses plain @playwright/test (NOT scoped-test) on purpose: the test
 * deliberately raises console errors, which the console-guard would flag.
 */
import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://localhost:8001';
const WORKER = process.env.TEST_PARALLEL_INDEX ?? '0';

test.use({ extraHTTPHeaders: { 'X-Test-Worker': WORKER } });

test('unhandled backend error shows a toast; unrelated rejections do not', async ({ page }) => {
    await page.goto(`${BASE}/system/`);
    // The Framework entry (which installs the handler) is loaded on the auth page.
    await expect(page.locator('[data-test-id="auth-login-input"]')).toBeVisible({ timeout: 15000 });

    const toast = page.locator('#global-toast [role="alert"]');

    // A backend error (RespError/ApiError shape) → toast carrying its message.
    // NB: don't RETURN the promise from evaluate — that would make Playwright
    // await (and thus "handle") it; we need a genuinely unhandled rejection.
    await page.evaluate(() => {
        void Promise.reject(Object.assign(new Error('Бэкенд упал (500)'), { name: 'RespError', status: 500, response: {} }));
    });
    await expect(toast).toContainText('Бэкенд упал (500)', { timeout: 5000 });

    // An unrelated rejection (plain Error, no status/response) → NOT toasted.
    await page.evaluate(() => {
        void Promise.reject(new Error('не-API reject — не должно тостить'));
    });
    await page.waitForTimeout(400);
    await expect(toast).not.toContainText('не-API reject');
});
