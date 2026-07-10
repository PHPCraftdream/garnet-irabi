/**
 * Auth form — email must NOT be cleared when the request fails.
 *
 * Regression test for: when /<login-page>/ POST (request a login link)
 * fails for any reason — network error, 500, server-side JSON {success: false}
 * surfaced through a thrown error — the previous code did
 *
 *     .finally(() => { inputRef.current.value = ''; ... })
 *
 * which wiped the user's email regardless of outcome. The fix moves the
 * clear into the success branch only (when phase actually advances to
 * INPUT_CODE), so retries don't force the user to retype the address.
 *
 * Strategy: intercept the auth POST via page.route() and respond with 500.
 * Then assert the input still holds the email after the React state
 * transitions to INPUT_EMAIL_REQUEST_ERROR.
 */

import { test, expect } from '../../helpers/scoped-test';
import { tickPdConsent } from '../../helpers/auth';

test.describe.configure({ mode: 'serial' });

const EMAIL = 'auth-error-preserves@irabi.test';

test.describe('Auth form — email value survives a failed request', () => {
    test('500 on POST keeps the email in the input + lets the user retry', async ({ page }) => {
        // Block ALL POSTs to the current URL with 500. We don't know the
        // exact action endpoint up front (it goes back to the same URL
        // the user landed on), so we install the route before navigation
        // and gate by method only.
        let postCount = 0;
        await page.route('**/*', async (route, request) => {
            if (request.method() === 'POST') {
                // The consent-gated CSRF flow fires a `start-session` POST when
                // the PD checkbox is ticked. That call must succeed so the
                // submit button enables; only the actual request-code submit
                // should land in the 500 mock.
                const body = request.postData() ?? '';
                if (body.includes('"action":"start-session"')) {
                    await route.continue();
                    return;
                }
                postCount++;
                await route.fulfill({ status: 500, body: 'simulated error' });
                return;
            }
            await route.continue();
        });

        await page.goto('/balance');

        const input = page.locator('[data-test-id="auth-login-input"]');
        await expect(input).toBeVisible({ timeout: 10000 });

        await input.fill(EMAIL);
        await tickPdConsent(page);
        await page.locator('[data-test-id="auth-submit-btn"]').click();

        // Wait until at least one POST was intercepted (the form
        // submitted), then give React a tick to flush state.
        await expect.poll(() => postCount, { timeout: 5000 }).toBeGreaterThanOrEqual(1);
        await page.waitForTimeout(150);

        // The whole point of the regression: email must still be there.
        await expect(input).toHaveValue(EMAIL);

        // And the form must still be the email phase — i.e. the input
        // is still semantically an email field, not the code field.
        // Placeholder/type guarantees this without depending on i18n strings.
        await expect(input).toHaveAttribute('type', 'email');
    });

    test('429 with {message} surfaces the server message in the hint', async ({ page }) => {
        const SERVER_MSG = 'Слишком много запросов кода. Пожалуйста, повторите позже.';
        await page.route('**/*', async (route, request) => {
            if (request.method() === 'POST') {
                const body = request.postData() ?? '';
                if (body.includes('"action":"start-session"')) {
                    await route.continue();
                    return;
                }
                await route.fulfill({
                    status: 429,
                    contentType: 'application/json',
                    body: JSON.stringify({ message: SERVER_MSG }),
                });
                return;
            }
            await route.continue();
        });

        await page.goto('/balance');
        const input = page.locator('[data-test-id="auth-login-input"]');
        await expect(input).toBeVisible({ timeout: 10000 });
        await input.fill(EMAIL);
        await tickPdConsent(page);
        await page.locator('[data-test-id="auth-submit-btn"]').click();

        // The hint paragraph sits right below the input as a sibling div
        // inside the same .input-form wrapper. Scope the locator to "any
        // visible text containing the server message" — robust to layout
        // changes.
        await expect(page.locator('text=' + SERVER_MSG)).toBeVisible({ timeout: 5000 });

        // Email still preserved (regression coverage for the previous fix).
        await expect(input).toHaveValue(EMAIL);
    });

    test('retry after error: email persists, second request also fires', async ({ page }) => {
        let postCount = 0;
        await page.route('**/*', async (route, request) => {
            if (request.method() === 'POST') {
                // The consent-gated CSRF flow fires a `start-session` POST when
                // the PD checkbox is ticked. That call must succeed so the
                // submit button enables; only the actual request-code submit
                // should land in the 500 mock.
                const body = request.postData() ?? '';
                if (body.includes('"action":"start-session"')) {
                    await route.continue();
                    return;
                }
                postCount++;
                await route.fulfill({ status: 500, body: 'simulated error' });
                return;
            }
            await route.continue();
        });

        await page.goto('/balance');
        const input = page.locator('[data-test-id="auth-login-input"]');
        const submit = page.locator('[data-test-id="auth-submit-btn"]');

        await expect(input).toBeVisible({ timeout: 10000 });
        await input.fill(EMAIL);
        await tickPdConsent(page);
        await submit.click();

        await expect.poll(() => postCount, { timeout: 5000 }).toBe(1);
        await page.waitForTimeout(150);

        // Email survived the first error.
        await expect(input).toHaveValue(EMAIL);

        // Click submit again without retyping — handleRequestCode should
        // pick up the same value and fire another POST.
        await submit.click();
        await expect.poll(() => postCount, { timeout: 5000 }).toBe(2);

        // Still preserved after the second failure too.
        await page.waitForTimeout(150);
        await expect(input).toHaveValue(EMAIL);
    });
});
