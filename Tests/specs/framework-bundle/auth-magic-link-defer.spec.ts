/**
 * Magic-link auto-login from a completely fresh browser context.
 *
 * This used to test "deferred hash-token capture" — a workaround for the
 * OLD hash-based (`#token=`) mechanism, which needed the client to hold
 * onto a captured code across a server-side phase transition (INPUT_EMAIL
 * → INPUT_CODE) because the hash fragment never reached the server and
 * only worked inside the SAME session that requested the code.
 *
 * That whole concept is gone. The new magic-login link
 * (`/magic-login/code~{32-char token}`, minted by
 * `FwMagicLoginService::generate()` in `EmailAuthMiddleware::sendCode()`)
 * is a plain server-side GET: the token itself is the credential, atomically
 * consumed and validated on the server, independent of any PHP session.
 * There's nothing to "defer" or "capture" — opening the link is the whole
 * flow, in any context, with no email re-entry step.
 *
 * This file now covers exactly that reduced case: a FRESH context with no
 * cookies from the context that requested the code still logs in immediately
 * by visiting the magic-login URL directly.
 */

import { test, expect, tn } from '../../helpers/scoped-test';
import { newScopedContext } from '../../helpers/scoped-test';
import { withConnection } from '../../helpers/db';
import { tickPdConsent } from '../../helpers/auth';

test.describe.configure({ mode: 'serial' });

const PIDX = process.env.TEST_PARALLEL_INDEX ?? '0';
const EMAIL = `defer_fresh_${PIDX}_${Date.now()}@external.example.com`;
const BASE = process.env.BASE_URL || 'http://localhost:8001';

async function fetchLatestMagicToken(email: string): Promise<string | null> {
    return withConnection(async (conn) => {
        const [rows] = await conn.execute<any[]>(
            `SELECT token FROM ${tn('magic_login_tokens')} WHERE email = ? ORDER BY id DESC LIMIT 1`,
            [email],
        );
        return rows[0]?.token ?? null;
    });
}

async function cleanup() {
    await withConnection(async (conn) => {
        await conn.execute(`DELETE FROM ${tn('mail_log')} WHERE recipient_email = ?`, [EMAIL]);
        await conn.execute(`DELETE FROM ${tn('magic_login_tokens')} WHERE email = ?`, [EMAIL]);
        await conn.execute(`DELETE FROM ${tn('accounts')} WHERE login = ?`, [EMAIL]);
    });
}

test.describe('Magic-link — fresh context needs no deferred capture', () => {
    test.beforeAll(async () => {
        await cleanup();
    });

    test.afterAll(async () => {
        await cleanup();
    });

    test('fresh context with no session cookie: link alone logs in, no email re-entry', async ({ browser }) => {
        // Request the code in context A.
        const ctxA = await newScopedContext(browser, { baseURL: BASE });
        const pageA = await ctxA.newPage();
        await pageA.goto('/system/');
        await expect(pageA.locator('[data-test-id="auth-login-input"]')).toBeVisible({ timeout: 10000 });
        await pageA.locator('[data-test-id="auth-login-input"]').fill(EMAIL);
        await tickPdConsent(pageA);

        const [requestResp] = await Promise.all([
            pageA.waitForResponse(
                r => r.request().method() === 'POST' && r.url().includes('/system/'),
                { timeout: 15000 },
            ),
            pageA.locator('[data-test-id="auth-submit-btn"]').click(),
        ]);
        expect(requestResp.ok()).toBe(true);
        await ctxA.close();

        const token = await fetchLatestMagicToken(EMAIL);
        expect(token, `magic token not found for ${EMAIL}`).toBeTruthy();

        // Fresh context — NO cookies from ctxA at all. If the old
        // session-bound mechanism were still in play this would render
        // INPUT_EMAIL and require re-entering the address; the new
        // mechanism logs in directly off the token alone.
        const freshCtx = await newScopedContext(browser, { baseURL: BASE });
        const page = await freshCtx.newPage();

        await page.goto(`/magic-login/code~${token}`);

        // No intermediate email form — we land already authenticated.
        await expect(page.locator('[data-test-id="auth-login-input"]')).not.toBeVisible({ timeout: 10000 });

        await freshCtx.close();
    });
});
