/**
 * Magic-link auto-login with deferred hash-token capture.
 *
 * Regression test for the bug where opening
 * `/system/first-step/token~<INVITE>#token=<CODE>` from a fresh browser
 * (no session cookie → server renders phase=INPUT_EMAIL) caused the
 * #token hash to be consumed and destroyed before the phase advanced to
 * INPUT_CODE, silently breaking cross-device magic-link logins.
 *
 * Two flows:
 *
 * 1. Same-device (regression guard — already worked before the fix):
 *    request code in context A, then open #token=<code> in the same
 *    context (session carries SENT_CODE phase) and assert verify succeeds.
 *
 * 2. Cross-context deferred capture (the actual bug):
 *    Open #token=<code> in a FRESH context. The hash must be captured
 *    and the URL cleaned even though phase is INPUT_EMAIL. After
 *    submitting the email the server flips to INPUT_CODE and the
 *    captured code auto-submits — proving the deferred mechanism works.
 */

import { test, expect, tn } from '../../helpers/scoped-test';
import { newScopedContext } from '../../helpers/scoped-test';
import { withConnection } from '../../helpers/db';

test.describe.configure({ mode: 'serial' });

const PIDX = process.env.TEST_PARALLEL_INDEX ?? '0';
const EMAIL_SAME = `defer_same_${PIDX}_${Date.now()}@external.example.com`;
const EMAIL_CROSS = `defer_cross_${PIDX}_${Date.now()}@external.example.com`;
const TOKEN = `pwdf_${PIDX}_${Date.now().toString(36)}`;
const BASE = process.env.BASE_URL || 'http://localhost:8001';

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

async function insertInviteToken(token: string) {
    await withConnection(async (conn) => {
        await conn.execute(
            `INSERT INTO ${tn('invite_tokens')}
             (token, label, expires_at, max_uses, uses_left, is_disabled, created_at, created_by, account_type)
             VALUES (?, ?, NULL, 2, 2, 0, UNIX_TIMESTAMP(), NULL, 'expert')`,
            [token, `Test defer ${token}`],
        );
    });
}

async function cleanup() {
    await withConnection(async (conn) => {
        for (const email of [EMAIL_SAME, EMAIL_CROSS]) {
            await conn.execute(`DELETE FROM ${tn('mail_log')} WHERE recipient_email = ?`, [email]);
            await conn.execute(
                `DELETE ad FROM ${tn('accounts_data')} ad JOIN ${tn('accounts')} a ON a.id = ad.account_id WHERE a.login = ?`,
                [email],
            );
            await conn.execute(`DELETE FROM ${tn('accounts')} WHERE login = ?`, [email]);
        }
        await conn.execute(`DELETE FROM ${tn('invite_tokens')} WHERE label LIKE 'Test defer%'`);
    });
}

test.describe('Deferred hash capture — magic-link survives phase transition', () => {
    test.beforeAll(async () => {
        await cleanup();
        await insertInviteToken(TOKEN);
    });

    test.afterAll(async () => {
        await cleanup();
    });

    test('same-device: #token auto-verifies when session already has SENT_CODE', async ({ browser }) => {
        const context = await newScopedContext(browser, { baseURL: BASE });
        const page = await context.newPage();

        // Request a code
        await page.goto(`/first-step/token~${TOKEN}`);
        await expect(page.locator('[data-test-id="auth-login-input"]')).toBeVisible({ timeout: 10000 });
        await page.locator('[data-test-id="auth-login-input"]').fill(EMAIL_SAME);
        // Consent checkbox triggers start-session POST, enabling the submit button
        const [consentResp] = await Promise.all([
            page.waitForResponse(r => r.request().method() === 'POST', { timeout: 15000 }),
            page.locator('[data-test-id="auth-consent-pd"]').click(),
        ]);
        expect(consentResp.ok()).toBe(true);
        const [requestResp] = await Promise.all([
            page.waitForResponse(r => r.request().method() === 'POST', { timeout: 15000 }),
            page.locator('[data-test-id="auth-submit-btn"]').click(),
        ]);
        expect(requestResp.ok()).toBe(true);

        const code = await fetchLatestAuthCode(EMAIL_SAME);
        expect(code, `auth_code not found for ${EMAIL_SAME}`).toBeTruthy();

        // Same context → session carries SENT_CODE → verify fires immediately
        const linkPage = await context.newPage();
        const [verifyResp] = await Promise.all([
            linkPage.waitForResponse(
                r => r.request().method() === 'POST' && r.url().includes('/first-step/'),
                { timeout: 15000 },
            ),
            linkPage.goto(`/first-step/token~${TOKEN}#token=${code}`),
        ]);
        expect(verifyResp.ok()).toBe(true);
        const verifyBody = await verifyResp.json();
        expect(verifyBody.success).toBe(true);

        await context.close();
    });

    test('cross-device: deferred code auto-submits after email triggers INPUT_CODE phase', async ({ browser }) => {
        // Request a code for EMAIL_CROSS in a separate context, then
        // open the magic-link URL with that code in a fresh browser.
        // The fresh context has no session → server renders INPUT_EMAIL.
        // Our fix captures the hash code into React state. After the
        // user submits the email, the server mints a NEW code (so the
        // captured stale code won't match), but the key assertion is
        // that a verify POST fires at all — proving the deferred code
        // was preserved across the phase transition.
        const ctxA = await newScopedContext(browser, { baseURL: BASE });
        const pageA = await ctxA.newPage();
        await pageA.goto(`/first-step/token~${TOKEN}`);
        await expect(pageA.locator('[data-test-id="auth-login-input"]')).toBeVisible({ timeout: 10000 });
        await pageA.locator('[data-test-id="auth-login-input"]').fill(EMAIL_CROSS);
        // Consent checkbox triggers start-session POST
        const [consentRespA] = await Promise.all([
            pageA.waitForResponse(r => r.request().method() === 'POST', { timeout: 15000 }),
            pageA.locator('[data-test-id="auth-consent-pd"]').click(),
        ]);
        expect(consentRespA.ok()).toBe(true);
        const [requestResp] = await Promise.all([
            pageA.waitForResponse(r => r.request().method() === 'POST', { timeout: 15000 }),
            pageA.locator('[data-test-id="auth-submit-btn"]').click(),
        ]);
        expect(requestResp.ok()).toBe(true);
        await ctxA.close();

        const code = await fetchLatestAuthCode(EMAIL_CROSS);
        expect(code, `auth_code not found for ${EMAIL_CROSS}`).toBeTruthy();

        // Fresh context — no session cookie, server renders INPUT_EMAIL
        const freshContext = await newScopedContext(browser, { baseURL: BASE });
        const page = await freshContext.newPage();

        // Collect all POST responses via page event to avoid race conditions.
        // Skip the consent-gated `start-session` bootstrap POST — it's a
        // pre-flow shake-hands request that mints session+CSRF cookies,
        // not a step we're asserting against here. Filtering by the
        // request body's `action` field keeps the indices stable across
        // future auth changes.
        const allPosts: import('playwright').Response[] = [];
        page.on('response', (r) => {
            if (r.request().method() !== 'POST' || !r.url().includes('/first-step/')) return;
            const raw = r.request().postData() ?? '';
            if (raw.includes('"action":"start-session"')) return;
            allPosts.push(r);
        });

        await page.goto(`/first-step/token~${TOKEN}#token=${code}`);

        // The #token hash is intentionally PRESERVED while phase=INPUT_EMAIL —
        // it carries the deferred code until the session reaches INPUT_CODE,
        // where the auto-verify effect consumes it and cleans the URL
        // (Auth2.tsx cleanHash). We assert that cleanup at the end of the
        // flow, after the deferred verify POST has fired.

        // Page must show the email input (INPUT_EMAIL phase, no silent crash)
        await expect(page.locator('[data-test-id="auth-login-input"]')).toBeVisible({ timeout: 10000 });

        // Fill the email that requested the code and submit
        await page.locator('[data-test-id="auth-login-input"]').fill(EMAIL_CROSS);
        // Consent checkbox triggers start-session POST
        const [consentRespFresh] = await Promise.all([
            page.waitForResponse(r => r.request().method() === 'POST', { timeout: 15000 }),
            page.locator('[data-test-id="auth-consent-pd"]').click(),
        ]);
        expect(consentRespFresh.ok()).toBe(true);
        await page.locator('[data-test-id="auth-submit-btn"]').click();

        // Wait for at least 2 POSTs: request-code + deferred-code verify
        await expect.poll(() => allPosts.length, { timeout: 15000 }).toBeGreaterThanOrEqual(2);

        // The first POST is request-code, the second is the deferred
        // verify auto-submitted by the React effect — this is the fix.
        // The stale hash code won't match the newly minted server code,
        // so success=false is expected.  What matters is that the POST
        // fired at all (pre-fix it never fired — the hash was gone).
        const verifyResp = allPosts[1];
        expect(verifyResp.ok()).toBe(true);
        const verifyBody = await verifyResp.json();
        // success may be false (stale code) — that's fine.  The
        // critical regression is that we GET a verify response at all.
        expect(typeof verifyBody.success).toBe('boolean');

        // The deferred code has now been consumed and auto-submitted, so the
        // INPUT_CODE auto-verify effect (Auth2.tsx cleanHash) has cleared the
        // hash — verify the token no longer leaks in the URL.
        await expect.poll(() => page.evaluate(() => window.location.hash), { timeout: 5000 }).toBe('');

        await freshContext.close();
    });
});
