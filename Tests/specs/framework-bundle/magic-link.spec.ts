/**
 * Magic-link verify flow (non-.test email, normal code-sending path).
 *
 * Covers regression #175: the account row must NOT exist until
 * verify-success. The pre-fix code created it on the request-code POST
 * via Account::fromSession() → touchAccount(). This property is
 * independent of which link mechanism does the verifying, so it's kept
 * here, adapted to the new one-click flow.
 *
 * Regression #176 ("clicking the magic link rendered a white screen",
 * caused by PageLoader truncating the body during a client-side SPA
 * navigation) is NOT applicable anymore and is intentionally dropped:
 * the new magic-login link is consumed entirely server-side
 * (`FwMagicLoginController::get__main()` → validate → consume → login →
 * HTTP 302 redirect to `return_uri`). There is no client-side JSON
 * response, no SPA-replace, no PageLoader step in this path at all — the
 * whole class of bug is structurally impossible here.
 *
 * Flow under test:
 *   POST /system/  { auth_email: <real email> } → 200 "Код отправлен"
 *   (assert: no row in accounts yet)
 *   read the 32-char magic token from magic_login_tokens
 *   GET /magic-login/code~<token>  → 302 redirect to return_uri (/system/)
 *   (assert: end up logged in — auth-login-input gone)
 *   (assert: row in accounts now exists)
 */

import { test, expect, tn } from '../../helpers/scoped-test';
import { newScopedContext } from '../../helpers/scoped-test';
import { withConnection } from '../../helpers/db';
import { tickPdConsent } from '../../helpers/auth';

test.describe.configure({ mode: 'serial' });

const PIDX = process.env.TEST_PARALLEL_INDEX ?? '0';
// Unique per run — request-code rate-limit (5 hits / 10min on the same
// address) outlives test cleanup, so a fixed email goes 429 on rerun.
const EMAIL = `magic_${PIDX}_${Date.now()}@external.example.com`;

async function fetchLatestMagicToken(email: string): Promise<string | null> {
    return withConnection(async (conn) => {
        const [rows] = await conn.execute<any[]>(
            `SELECT token FROM ${tn('magic_login_tokens')} WHERE email = ? ORDER BY id DESC LIMIT 1`,
            [email],
        );
        return rows[0]?.token ?? null;
    });
}

async function countAccounts(email: string): Promise<number> {
    return withConnection(async (conn) => {
        const [rows] = await conn.execute<any[]>(
            `SELECT COUNT(*) AS n FROM ${tn('accounts')} WHERE login = ?`,
            [email],
        );
        return Number(rows[0]?.n ?? 0);
    });
}

async function cleanup(email: string) {
    await withConnection(async (conn) => {
        await conn.execute(`DELETE FROM ${tn('mail_log')} WHERE recipient_email = ?`, [email]);
        await conn.execute(`DELETE FROM ${tn('magic_login_tokens')} WHERE email = ?`, [email]);
        await conn.execute(`DELETE FROM ${tn('accounts')} WHERE login = ?`, [email]);
    });
}

test.describe('Magic-link verify — one-click token path', () => {
    test.beforeAll(async () => {
        await cleanup(EMAIL);
    });

    test.afterAll(async () => {
        await cleanup(EMAIL);
    });

    test('full flow: request-code does NOT create account, visiting the link does', async ({ browser }) => {
        const context = await newScopedContext(browser);
        const page = await context.newPage();

        // ── 1. Request-code POST ─────────────────────────────────────────
        await page.goto('/system/');
        await expect(page.locator('[data-test-id="auth-login-input"]')).toBeVisible({ timeout: 10000 });
        await page.locator('[data-test-id="auth-login-input"]').fill(EMAIL);
        await tickPdConsent(page);

        const [requestResponse] = await Promise.all([
            page.waitForResponse(
                r => r.request().method() === 'POST' && r.url().includes('/system/'),
                { timeout: 15000 },
            ),
            page.locator('[data-test-id="auth-submit-btn"]').click(),
        ]);
        if (!requestResponse.ok()) {
            const body = await requestResponse.text();
            throw new Error(`request-code POST failed: ${requestResponse.status()} ${body}`);
        }
        const requestBody = await requestResponse.json();
        expect(requestBody.message).toBeTruthy();
        expect(requestBody.codeLifeTime).toBeGreaterThan(0);

        // ── 2. #175 guard: account must NOT exist yet ────────────────────
        expect(await countAccounts(EMAIL)).toBe(0);

        // ── 3. Read the one-click token straight from the DB ─────────────
        const token = await fetchLatestMagicToken(EMAIL);
        expect(token, `magic token not found in DB for ${EMAIL}`).toBeTruthy();

        // ── 4. Visit the magic-login URL — a plain server-side GET that
        //     validates + atomically consumes the token, logs the user in,
        //     and 302-redirects to return_uri. No client JS/JSON involved,
        //     so the old #176 "white screen from truncated SPA-replace body"
        //     class of bug can't occur on this path at all.
        const linkPage = await context.newPage();
        const response = await linkPage.goto(`/magic-login/code~${token}`);

        // ── 5. Regression guard (real prod incident): the redirect target
        //     must be the single-prefixed page, not a doubled route prefix
        //     (`/system/system/...`) that 404s. A bare "auth-login-input
        //     not visible" check would pass on a 404 page too — assert the
        //     actual URL and a real 200 instead.
        expect(response?.status(), `magic-login redirect landed on ${linkPage.url()}`).toBe(200);
        expect(linkPage.url()).not.toContain('/system/system/');

        // ── 6. Logged in — auth input is gone.
        await expect(linkPage.locator('[data-test-id="auth-login-input"]')).not.toBeVisible({ timeout: 10000 });

        // ── 7. #175 post-verify: account now exists ──────────────────────
        expect(await countAccounts(EMAIL)).toBe(1);

        await context.close();
    });
});
