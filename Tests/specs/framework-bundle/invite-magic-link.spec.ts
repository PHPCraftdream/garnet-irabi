/**
 * Magic-link auto-login through the invite-flow URL.
 *
 * Repros the prod report: clicking
 * `/system/first-step/token~<INVITE>#token=<CODE>` from an unauthenticated
 * browser should immediately log the user in — F5 should NOT be required.
 *
 * Flow:
 *   1. Seed an invite token in DB.
 *   2. Open /system/first-step/token~<INVITE> in a fresh context.
 *   3. POST email (non-.test so the real send-code path fires) → 200.
 *   4. Read auth_code from mail_log meta.
 *   5. Visit /system/first-step/token~<INVITE>#token=<CODE> in a new page
 *      of the SAME context (session cookie carries the SENT_CODE phase).
 *   6. Assert the verify POST resolves OK with success=true (no SyntaxError
 *      from a stray redirect HTML body landing in JSON.parse) AND that the
 *      page ends up on the registration form (i.e. logged in, no auth
 *      input visible).
 */

import { test, expect, tn } from '../../helpers/scoped-test';
import { newScopedContext } from '../../helpers/scoped-test';
import { withConnection } from '../../helpers/db';
import { tickPdConsent } from '../../helpers/auth';

test.describe.configure({ mode: 'serial' });

const PIDX = process.env.TEST_PARALLEL_INDEX ?? '0';
const EMAIL = `inv_magic_${PIDX}_${Date.now()}@external.example.com`;
const TOKEN = `pwml_${PIDX}_${Date.now().toString(36)}`;

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

async function insertInviteToken(token: string, accountType: 'user' | 'expert') {
    await withConnection(async (conn) => {
        await conn.execute(
            `INSERT INTO ${tn('invite_tokens')}
             (token, label, expires_at, max_uses, uses_left, is_disabled, created_at, created_by, account_type)
             VALUES (?, ?, NULL, 1, 1, 0, UNIX_TIMESTAMP(), NULL, ?)`,
            [token, `Test magic-link ${accountType}`, accountType],
        );
    });
}

async function cleanup() {
    await withConnection(async (conn) => {
        await conn.execute(`DELETE FROM ${tn('mail_log')} WHERE recipient_email = ?`, [EMAIL]);
        await conn.execute(
            `DELETE ad FROM ${tn('accounts_data')} ad JOIN ${tn('accounts')} a ON a.id = ad.account_id WHERE a.login = ?`,
            [EMAIL],
        );
        await conn.execute(`DELETE FROM ${tn('accounts')} WHERE login = ?`, [EMAIL]);
        await conn.execute(`DELETE FROM ${tn('invite_tokens')} WHERE label LIKE 'Test magic-link%'`);
    });
}

test.describe('Invite-flow magic-link — auto-login from #token= hash', () => {
    test.beforeAll(async () => {
        await cleanup();
        await insertInviteToken(TOKEN, 'expert');
    });

    test.afterAll(async () => {
        await cleanup();
    });

    test('email-submit → magic-link click logs the user in without F5', async ({ browser }) => {
        const context = await newScopedContext(browser, {
            baseURL: process.env.BASE_URL || 'http://localhost:8001',
        });
        const page = await context.newPage();

        // 1. Request code via invite-flow URL
        await page.goto(`/first-step/token~${TOKEN}`);
        await expect(page.locator('[data-test-id="auth-login-input"]')).toBeVisible({ timeout: 10000 });
        await page.locator('[data-test-id="auth-login-input"]').fill(EMAIL);
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

        // 2. Read code from mail log
        const code = await fetchLatestAuthCode(EMAIL);
        expect(code, `auth_code not found in mail log for ${EMAIL}`).toBeTruthy();

        // 3. Open the magic-link URL in a fresh page (cookies preserved)
        const linkPage = await context.newPage();
        const [verifyResp] = await Promise.all([
            linkPage.waitForResponse(
                r => r.request().method() === 'POST' && r.url().includes('/first-step/'),
                { timeout: 15000 },
            ),
            linkPage.goto(`/first-step/token~${TOKEN}#token=${code}`),
        ]);

        // 4. Verify POST must be JSON success — NOT an HTML redirect
        expect(verifyResp.ok()).toBe(true);
        const contentType = verifyResp.headers()['content-type'] ?? '';
        expect(contentType, `expected JSON, got ${contentType}`).toMatch(/json/i);
        const verifyBody = await verifyResp.json();
        expect(verifyBody.success).toBe(true);

        // 5. After redirect/SPA-replace, no more auth input — user is logged in
        await expect(linkPage.locator('[data-test-id="auth-login-input"]')).not.toBeVisible({ timeout: 10000 });

        await context.close();
    });
});
