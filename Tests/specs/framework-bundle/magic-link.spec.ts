/**
 * Magic-link verify flow (non-.test email, normal code-sending path).
 *
 * Covers two regressions that landed together:
 *
 * 1. #175 — the account row must NOT exist until verify-success. The
 *    pre-fix code created it on the request-code POST via
 *    Account::fromSession() → touchAccount().
 * 2. #176 — clicking the magic link rendered a white screen. PageLoader
 *    truncated the body to a few hundred bytes during SPA navigation.
 *
 * Flow under test:
 *   POST /system/  { auth_email: <real email> } → 200 "Код отправлен"
 *   (assert: no row in accounts yet)
 *   read auth_code from mail_log.meta JSON
 *   GET /system/#token=<code>  (Auth2 island reads hash, POSTs verify)
 *   (assert: verify POST returns success=true)
 *   (assert: body is fully populated — at least registration-form
 *    appears for a first-time user)
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
        await conn.execute(`DELETE FROM ${tn('accounts')} WHERE login = ?`, [email]);
    });
}

test.describe('Magic-link verify — code path + SPA-replace', () => {
    test.beforeAll(async () => {
        await cleanup(EMAIL);
    });

    test.afterAll(async () => {
        await cleanup(EMAIL);
    });

    test('full flow: request-code does NOT create account, verify does, no white screen', async ({ browser }) => {
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

        // ── 3. Read code from mail log ───────────────────────────────────
        const code = await fetchLatestAuthCode(EMAIL);
        expect(code, `auth_code not found in mail log for ${EMAIL}`).toBeTruthy();

        // ── 4. Navigate via magic link (Auth2 reads #token from hash) ────
        //     Open a fresh page in the SAME context — session cookie carries
        //     over, but a fresh page guarantees a full reload (page.goto on
        //     a same-origin URL that only changes the hash does NOT reload).
        const linkPage = await context.newPage();
        const [verifyResponse] = await Promise.all([
            linkPage.waitForResponse(
                r => r.request().method() === 'POST' && r.url().includes('/system/'),
                { timeout: 15000 },
            ),
            linkPage.goto(`/system/#token=${code}`),
        ]);
        expect(verifyResponse.ok()).toBe(true);
        const verifyBody = await verifyResponse.json();
        expect(verifyBody.success).toBe(true);

        // ── 5. #176 guard: SPA-replaced body must be fully populated ────
        //     A fresh account on verify-success is sent through RegMiddleware
        //     and rendered with the registration form. If the white-screen
        //     bug regressed, the body would shrink to ~500 bytes and the
        //     form-field test ids would be missing.
        await expect(linkPage.locator('[data-test-id="registration-form"]')).toBeVisible({ timeout: 10000 });
        await expect(linkPage.locator('[data-test-id="form-field-name"]')).toBeVisible();

        // Belt-and-braces: real body content size is well above the
        // truncated-body footprint (~500 bytes was the failure mode).
        const bodyText = await linkPage.locator('body').innerHTML();
        expect(bodyText.length).toBeGreaterThan(2000);

        // ── 6. #175 post-verify: account now exists ──────────────────────
        expect(await countAccounts(EMAIL)).toBe(1);

        await context.close();
    });
});
