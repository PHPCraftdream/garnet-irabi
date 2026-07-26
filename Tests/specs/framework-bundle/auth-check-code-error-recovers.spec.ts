/**
 * Auth code-verify — a failed check-code request must NOT freeze the form.
 *
 * Regression test for: HandleCheckCode's promise chain had no .catch()
 * (unlike HandleRequestCode's, which already handled this). Any rejection —
 * network failure, CSRF not ready, 4xx/5xx, maintenance 503 — left
 * `isSendingRequest` stuck at `true` forever, since only the success/failure
 * branches inside `.then()` ever reset it. The magic-link auto-verify effect
 * in Auth2Island calls handleCheckCode with zero user interaction, so this
 * was reported live as "clicking the email link — nothing happens for a
 * long time" (the form was actually frozen, not merely slow).
 *
 * Also covers the paired UX fix: while `isSendingRequest` is true, the
 * input/button are hidden behind a loader (`auth-loading`) instead of just
 * being disabled, so a slow-but-succeeding request doesn't look inert either.
 *
 * Strategy: request a real code, then open the magic link with the verify
 * POST intercepted to return 500 after a short delay (long enough to assert
 * the loader is visible mid-flight). Confirm the loader appears, then the
 * form recovers — input/button become visible again, not stuck frozen.
 */

import { test, expect, tn } from '../../helpers/scoped-test';
import { newScopedContext } from '../../helpers/scoped-test';
import { withConnection } from '../../helpers/db';
import { tickPdConsent } from '../../helpers/auth';

test.describe.configure({ mode: 'serial' });

const PIDX = process.env.TEST_PARALLEL_INDEX ?? '0';
const EMAIL = `checkcode_err_${PIDX}_${Date.now()}@external.example.com`;

async function fetchLatestAuthCode(email: string): Promise<string | null> {
    return withConnection(async (conn) => {
        const [rows] = await conn.execute<any[]>(
            `SELECT meta FROM ${tn('mail_log')} WHERE recipient_email = ? ORDER BY id DESC LIMIT 1`,
            [email],
        );
        const meta = rows[0]?.meta;
        if (!meta) return null;
        try {
            const parsed = JSON.parse(meta);
            return typeof parsed.auth_code === 'string' ? parsed.auth_code : null;
        } catch {
            return null;
        }
    });
}

async function cleanup(email: string) {
    await withConnection(async (conn) => {
        await conn.execute(`DELETE FROM ${tn('mail_log')} WHERE recipient_email = ?`, [email]);
        await conn.execute(`DELETE FROM ${tn('accounts')} WHERE login = ?`, [email]);
    });
}

test.describe('Auth code-verify — a failed request recovers instead of freezing', () => {
    test.beforeAll(async () => {
        await cleanup(EMAIL);
    });

    test.afterAll(async () => {
        await cleanup(EMAIL);
    });

    test('500 on the verify POST: loader shows, then the form recovers (not frozen)', async ({ browser }) => {
        const context = await newScopedContext(browser);
        const page = await context.newPage();

        // ── 1. Request a real code ───────────────────────────────────────
        await page.goto('/system/');
        await expect(page.locator('[data-test-id="auth-login-input"]')).toBeVisible({ timeout: 10000 });
        await page.locator('[data-test-id="auth-login-input"]').fill(EMAIL);
        await tickPdConsent(page);
        await Promise.all([
            page.waitForResponse(r => r.request().method() === 'POST' && r.url().includes('/system/'), { timeout: 15000 }),
            page.locator('[data-test-id="auth-submit-btn"]').click(),
        ]);

        const code = await fetchLatestAuthCode(EMAIL);
        expect(code, `auth_code not found in mail log for ${EMAIL}`).toBeTruthy();

        // ── 2. Open the magic link with the verify POST forced to fail ──
        //     Delay the failure slightly so there's a reliable window to
        //     assert the loader is visible before the request resolves.
        const linkPage = await context.newPage();
        await linkPage.route('**/*', async (route, request) => {
            if (request.method() === 'POST' && request.url().includes('/system/')) {
                await new Promise((r) => setTimeout(r, 400));
                await route.fulfill({ status: 500, body: 'simulated error' });
                return;
            }
            await route.continue();
        });
        await linkPage.goto(`/system/#token=${code}`);

        // ── 3. Loader visible, input/button hidden while the request is
        //     in flight (the auto-verify effect fires with no click at all).
        await expect(linkPage.locator('[data-test-id="auth-loading"]')).toBeVisible({ timeout: 5000 });
        await expect(linkPage.locator('[data-test-id="auth-login-input"]')).toBeHidden();
        await expect(linkPage.locator('[data-test-id="auth-submit-btn"]')).toBeHidden();

        // ── 4. The whole point of the regression: after the 500, the form
        //     recovers — loader gone, input/button visible again. Before the
        //     fix this hung forever (isSendingRequest never reset to false).
        await expect(linkPage.locator('[data-test-id="auth-loading"]')).toBeHidden({ timeout: 10000 });
        await expect(linkPage.locator('[data-test-id="auth-login-input"]')).toBeVisible({ timeout: 5000 });
        await expect(linkPage.locator('[data-test-id="auth-submit-btn"]')).toBeVisible();
        await expect(linkPage.locator('[data-test-id="auth-submit-btn"]')).toBeEnabled();

        await context.close();
    });
});
