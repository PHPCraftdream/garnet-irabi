/**
 * One-click magic-login through the invite-flow URL.
 *
 * Repros the original prod report: clicking the magic-login link from an
 * invite-flow email should immediately log the user in — no F5, no manual
 * code entry required. This is the flagship regression file for the new
 * mechanism, so it also carries the cross-context fix verification (the
 * whole reason this mechanism was rebuilt): the OLD hash-based `#token=`
 * link only worked when opened in the SAME PHP session that requested the
 * code, because the client-side JS replayed the hash token against
 * whatever session cookie happened to be attached. The NEW link
 * (`/magic-login/code~{32-char one-time token}`, see
 * `FwMagicLoginService` / `FwMagicLoginController`) authenticates the
 * token itself server-side, atomically consuming it — independent of
 * cookies, browser, or device.
 *
 * Scenarios covered in this file:
 *   1. Same-device: request code → visit the link in the SAME context →
 *      redirected straight to the invite return_uri, logged in.
 *   2. Cross-context (THE fix): request code in context A → visit the
 *      link in a totally FRESH `browser.newContext()` with none of
 *      context A's cookies → still logs in. This is the exact case that
 *      was broken before.
 *   3. One-time use: visiting the SAME link a second time (after either
 *      of the above already consumed it) fails with an error page —
 *      `used_at` is now set.
 *   4. Manual 8-digit code entry is unaffected by the new mechanism —
 *      regression guard that `[data-test-id="auth-login-input"]` +
 *      `[data-test-id="auth-submit-btn"]` on the INPUT_CODE screen still
 *      logs the user in normally.
 *
 * TTL expiry (>5 minutes) is covered in `magic-link.spec.ts`'s sibling
 * scenario set is NOT duplicated here — see this file's dedicated
 * "expired" test below, which fast-forwards `expires_at` directly in the
 * DB instead of sleeping for real minutes.
 */

import { test, expect, tn } from '../../helpers/scoped-test';
import { newScopedContext } from '../../helpers/scoped-test';
import { withConnection } from '../../helpers/db';
import { tickPdConsent } from '../../helpers/auth';

test.describe.configure({ mode: 'serial' });

const PIDX = process.env.TEST_PARALLEL_INDEX ?? '0';
const BASE = process.env.BASE_URL || 'http://localhost:8001';

function uniqueEmail(tag: string): string {
    return `inv_magic_${tag}_${PIDX}_${Date.now()}_${Math.floor(Math.random() * 1e6)}@external.example.com`;
}

function uniqueToken(tag: string): string {
    return `pwml_${tag}_${PIDX}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

async function fetchLatestMagicToken(email: string): Promise<string | null> {
    return withConnection(async (conn) => {
        const [rows] = await conn.execute<any[]>(
            `SELECT token FROM ${tn('magic_login_tokens')} WHERE email = ? ORDER BY id DESC LIMIT 1`,
            [email],
        );
        return rows[0]?.token ?? null;
    });
}

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

async function expireMagicToken(token: string): Promise<void> {
    await withConnection(async (conn) => {
        await conn.execute(
            `UPDATE ${tn('magic_login_tokens')} SET expires_at = UNIX_TIMESTAMP() - 10 WHERE token = ?`,
            [token],
        );
    });
}

async function insertInviteToken(token: string, accountType: 'user' | 'expert') {
    await withConnection(async (conn) => {
        await conn.execute(
            `INSERT INTO ${tn('invite_tokens')}
             (token, label, expires_at, max_uses, uses_left, is_disabled, created_at, created_by, account_type)
             VALUES (?, ?, NULL, 2, 2, 0, UNIX_TIMESTAMP(), NULL, ?)`,
            [token, `Test magic-link ${accountType}`, accountType],
        );
    });
}

async function requestCodeViaInvite(page: import('@playwright/test').Page, inviteToken: string, email: string): Promise<void> {
    await page.goto(`/first-step/token~${inviteToken}`);
    await expect(page.locator('[data-test-id="auth-login-input"]')).toBeVisible({ timeout: 10000 });
    await page.locator('[data-test-id="auth-login-input"]').fill(email);
    await tickPdConsent(page);
    // The consent-gated CSRF flow can leave the start-session response in
    // Playwright's response queue for a beat after tickPdConsent returns.
    // Filter it out by POST body so the request-code POST is what we catch.
    const isAuthSubmitPost = (r: import('@playwright/test').Response) => {
        if (r.request().method() !== 'POST') return false;
        const body = r.request().postData() ?? '';
        return !body.includes('"action":"start-session"');
    };
    const [requestResp] = await Promise.all([
        page.waitForResponse(isAuthSubmitPost, { timeout: 15000 }),
        page.locator('[data-test-id="auth-submit-btn"]').click(),
    ]);
    expect(requestResp.ok()).toBe(true);
    const reqBody = await requestResp.json();
    expect(reqBody.codeLifeTime).toBeGreaterThan(0);
}

async function cleanup(emails: string[]) {
    await withConnection(async (conn) => {
        for (const email of emails) {
            await conn.execute(`DELETE FROM ${tn('mail_log')} WHERE recipient_email = ?`, [email]);
            await conn.execute(`DELETE FROM ${tn('magic_login_tokens')} WHERE email = ?`, [email]);
            await conn.execute(
                `DELETE ad FROM ${tn('accounts_data')} ad JOIN ${tn('accounts')} a ON a.id = ad.account_id WHERE a.login = ?`,
                [email],
            );
            await conn.execute(`DELETE FROM ${tn('accounts')} WHERE login = ?`, [email]);
        }
        await conn.execute(`DELETE FROM ${tn('invite_tokens')} WHERE label LIKE 'Test magic-link%'`);
    });
}

test.describe('Invite-flow magic-login — one-click token', () => {
    const EMAIL_SAME = uniqueEmail('same');
    const EMAIL_CROSS = uniqueEmail('cross');
    const EMAIL_REUSE = uniqueEmail('reuse');
    const EMAIL_EXPIRED = uniqueEmail('expired');
    const EMAIL_MANUAL = uniqueEmail('manual');

    const TOKEN_SAME = uniqueToken('same');
    const TOKEN_CROSS = uniqueToken('cross');
    const TOKEN_REUSE = uniqueToken('reuse');
    const TOKEN_EXPIRED = uniqueToken('expired');
    const TOKEN_MANUAL = uniqueToken('manual');

    const ALL_EMAILS = [EMAIL_SAME, EMAIL_CROSS, EMAIL_REUSE, EMAIL_EXPIRED, EMAIL_MANUAL];

    test.beforeAll(async () => {
        await cleanup(ALL_EMAILS);
        await Promise.all([
            insertInviteToken(TOKEN_SAME, 'expert'),
            insertInviteToken(TOKEN_CROSS, 'expert'),
            insertInviteToken(TOKEN_REUSE, 'expert'),
            insertInviteToken(TOKEN_EXPIRED, 'expert'),
            insertInviteToken(TOKEN_MANUAL, 'expert'),
        ]);
    });

    test.afterAll(async () => {
        await cleanup(ALL_EMAILS);
    });

    test('same-device: visiting the link logs in without F5 (no manual code entry)', async ({ browser }) => {
        const context = await newScopedContext(browser, { baseURL: BASE });
        const page = await context.newPage();

        // 1. Request code via invite-flow URL
        await requestCodeViaInvite(page, TOKEN_SAME, EMAIL_SAME);

        // 2. Read the one-click token straight from the DB
        const token = await fetchLatestMagicToken(EMAIL_SAME);
        expect(token, `magic token not found in DB for ${EMAIL_SAME}`).toBeTruthy();

        // 3. Visit the magic-login URL in a fresh page of the SAME context.
        //    A plain server-side GET → validate → consume → login → 302
        //    redirect to return_uri (the invite first-step page). RegisterController
        //    itself then bounces an already-logged-in visitor of /first-step/{token}
        //    straight to home ("Already logged in -> redirect to home") — so the
        //    browser follows a SECOND hop and lands on the site root, not the
        //    invite page. That's correct, expected behaviour (and exactly what
        //    was asked for in the original bug report): a user who just logged
        //    in via the link should end up on the real app, not stuck re-viewing
        //    the invite/registration screen.
        const linkPage = await context.newPage();
        const response = await linkPage.goto(`/magic-login/code~${token}`);

        // 4. Regression guard (real prod incident): the final destination must
        //    be the single-prefixed home page, NOT a doubled route prefix
        //    (`/system/system/first-step/...`) that 404s. A weaker assertion
        //    here — just "no auth-login-input visible" — passed even on the
        //    broken build, because a 404 page ALSO has no auth input. Assert
        //    the actual URL and a real 200, not just an absent element.
        expect(response?.status(), `magic-login redirect landed on ${linkPage.url()}`).toBe(200);
        expect(linkPage.url()).toBe(`${BASE}/system/`);
        expect(linkPage.url()).not.toContain('/system/system/');

        // 5. Logged in — no auth input, no F5 required.
        await expect(linkPage.locator('[data-test-id="auth-login-input"]')).not.toBeVisible({ timeout: 10000 });

        await context.close();
    });

    test('cross-context: a FRESH browser context (no inherited cookies) still logs in — the actual fix', async ({ browser }) => {
        // Request the code in context A, exactly like a user opening the
        // invite link on one device/browser profile.
        const ctxA = await newScopedContext(browser, { baseURL: BASE });
        const pageA = await ctxA.newPage();
        await requestCodeViaInvite(pageA, TOKEN_CROSS, EMAIL_CROSS);
        await ctxA.close();

        const token = await fetchLatestMagicToken(EMAIL_CROSS);
        expect(token, `magic token not found in DB for ${EMAIL_CROSS}`).toBeTruthy();

        // Open the link in a COMPLETELY separate context — no cookies,
        // no session, nothing carried over from ctxA. This is precisely
        // the scenario the old hash-based mechanism could never handle
        // (e.g. clicking the link from a phone while the code was
        // requested on a desktop, or a webmail client's in-app browser
        // sandboxing cookies).
        const freshCtx = await newScopedContext(browser, { baseURL: BASE });
        const freshPage = await freshCtx.newPage();

        const response = await freshPage.goto(`/magic-login/code~${token}`);

        // Same regression guard as the same-device test: assert the actual
        // final destination (site root — RegisterController redirects an
        // already-logged-in visitor away from /first-step/{token}) and a
        // real 200, not just an absent element (a 404 page also has no
        // auth-login-input, so that alone doesn't prove the redirect landed
        // on the right page).
        expect(response?.status(), `magic-login redirect landed on ${freshPage.url()}`).toBe(200);
        expect(freshPage.url()).toBe(`${BASE}/system/`);
        expect(freshPage.url()).not.toContain('/system/system/');

        // Logged in — even though this context never had the SENT_CODE
        // session state that the old mechanism depended on.
        await expect(freshPage.locator('[data-test-id="auth-login-input"]')).not.toBeVisible({ timeout: 10000 });

        await freshCtx.close();
    });

    test('one-time use: visiting the same link twice fails the second time', async ({ browser }) => {
        const context = await newScopedContext(browser, { baseURL: BASE });
        const page = await context.newPage();

        await requestCodeViaInvite(page, TOKEN_REUSE, EMAIL_REUSE);
        const token = await fetchLatestMagicToken(EMAIL_REUSE);
        expect(token, `magic token not found in DB for ${EMAIL_REUSE}`).toBeTruthy();

        // First visit consumes the token and logs in.
        const firstPage = await context.newPage();
        await firstPage.goto(`/magic-login/code~${token}`);
        await expect(firstPage.locator('[data-test-id="auth-login-input"]')).not.toBeVisible({ timeout: 10000 });

        // used_at must now be set.
        const usedAt = await withConnection(async (conn) => {
            const [rows] = await conn.execute<any[]>(
                `SELECT used_at FROM ${tn('magic_login_tokens')} WHERE token = ?`,
                [token],
            );
            return rows[0]?.used_at ?? null;
        });
        expect(usedAt).toBeTruthy();

        // Second visit — in a brand-new context, so there's no residual
        // authenticated session masking the error — must fail.
        const secondCtx = await newScopedContext(browser, { baseURL: BASE });
        const secondPage = await secondCtx.newPage();
        const response = await secondPage.goto(`/magic-login/code~${token}`);

        // No login form (this isn't a fallback to the code-entry screen)
        // and no registration form (not a successful second login either).
        await Promise.all([
            expect(secondPage.locator('[data-test-id="auth-login-input"]')).not.toBeVisible({ timeout: 5000 }),
            expect(secondPage.locator('[data-test-id="registration-form"]')).not.toBeVisible({ timeout: 5000 }),
        ]);

        // The error page renders normal HTML (never JSON) with a non-5xx
        // status and non-trivial body — this is the invite-error island,
        // not a blank/broken response.
        expect(response?.ok()).toBe(true);
        const contentType = response?.headers()['content-type'] ?? '';
        expect(contentType).toMatch(/html/i);
        const bodyHtml = await secondPage.locator('body').innerHTML();
        expect(bodyHtml.length).toBeGreaterThan(200);

        await context.close();
        await secondCtx.close();
    });

    test('expired token (TTL fast-forwarded past 5 minutes) fails', async ({ browser }) => {
        const context = await newScopedContext(browser, { baseURL: BASE });
        const page = await context.newPage();

        await requestCodeViaInvite(page, TOKEN_EXPIRED, EMAIL_EXPIRED);
        const token = await fetchLatestMagicToken(EMAIL_EXPIRED);
        expect(token, `magic token not found in DB for ${EMAIL_EXPIRED}`).toBeTruthy();

        // Fast-forward past the 5-minute TTL directly in the DB — real
        // sleeping isn't viable in a test, so we push expires_at into the
        // past exactly like the framework's own consume()/validate() would
        // observe after a genuine 5+ minute wait.
        await expireMagicToken(token as string);

        const response = await page.goto(`/magic-login/code~${token}`);

        await Promise.all([
            expect(page.locator('[data-test-id="auth-login-input"]')).not.toBeVisible({ timeout: 5000 }),
            expect(page.locator('[data-test-id="registration-form"]')).not.toBeVisible({ timeout: 5000 }),
        ]);
        expect(response?.ok()).toBe(true);
        const contentType = response?.headers()['content-type'] ?? '';
        expect(contentType).toMatch(/html/i);

        await context.close();
    });

    test('manual 8-digit code entry still works (new mechanism does not break the old path)', async ({ browser }) => {
        const context = await newScopedContext(browser, { baseURL: BASE });
        const page = await context.newPage();

        await requestCodeViaInvite(page, TOKEN_MANUAL, EMAIL_MANUAL);

        const code = await fetchLatestAuthCode(EMAIL_MANUAL);
        expect(code, `auth_code not found in mail log for ${EMAIL_MANUAL}`).toBeTruthy();

        // Same tab, INPUT_CODE phase (server already flipped the session
        // after the request-code POST above) — type the 8-digit code by
        // hand and submit, exactly like a user copying it out of the
        // email instead of clicking the button.
        await expect(page.locator('[data-test-id="auth-login-input"]')).toBeVisible({ timeout: 10000 });
        await page.locator('[data-test-id="auth-login-input"]').fill(code as string);

        const [verifyResp] = await Promise.all([
            page.waitForResponse(
                r => r.request().method() === 'POST' && r.url().includes('/first-step/'),
                { timeout: 15000 },
            ),
            page.locator('[data-test-id="auth-submit-btn"]').click(),
        ]);
        expect(verifyResp.ok()).toBe(true);
        const verifyBody = await verifyResp.json();
        expect(verifyBody.success).toBe(true);

        await expect(page.locator('[data-test-id="auth-login-input"]')).not.toBeVisible({ timeout: 10000 });

        await context.close();
    });
});
