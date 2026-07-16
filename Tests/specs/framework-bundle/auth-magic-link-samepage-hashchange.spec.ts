/**
 * Magic-link auto-verify must fire on a hash-only navigation within an
 * ALREADY-OPEN tab, not just on first mount.
 *
 * Bug: a magic link differs from the page already open only by its
 * `#token=` fragment. Pasting it into the address bar of a tab already
 * sitting on the code-entry screen is a same-document navigation in most
 * browsers (no reload — see the same note in magic-link.spec.ts and
 * auth-magic-link-defer.spec.ts, both of which deliberately open a FRESH
 * page/context to avoid this exact case). Auth2Island used to read the
 * hash-token only once via `useState(() => getCodeFromHash())` at mount,
 * with no `hashchange` listener — so on a same-document navigation the
 * component never remounts, the new token is never seen, and sign-in
 * silently never completes for that tab. Reported symptom: the link
 * "does nothing" in a tab that already had the code-entry form open,
 * while a fresh tab/window worked fine.
 *
 * Fix: Auth2Island now also listens for `hashchange` and re-captures the
 * token, re-triggering the auto-verify effect without a page reload.
 *
 * This test drives that exact path: request a code (arrives at
 * INPUT_CODE phase), then set `window.location.hash` directly via
 * page.evaluate() on the SAME page object — a same-document navigation,
 * never a `page.goto()`/reload — and assert the verify POST still fires
 * and succeeds.
 */

import { test, expect, tn } from '../../helpers/scoped-test';
import { newScopedContext } from '../../helpers/scoped-test';
import { withConnection } from '../../helpers/db';
import { tickPdConsent } from '../../helpers/auth';

test.describe.configure({ mode: 'serial' });

const PIDX = process.env.TEST_PARALLEL_INDEX ?? '0';
const EMAIL = `magic_samepage_${PIDX}_${Date.now()}@external.example.com`;

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

test.describe('Magic-link auto-verify on a same-document hash change (no reload)', () => {
    test.beforeAll(async () => {
        await cleanup(EMAIL);
    });

    test.afterAll(async () => {
        await cleanup(EMAIL);
    });

    test('same tab already on the code-entry screen: hashchange alone triggers verify', async ({ browser }) => {
        const context = await newScopedContext(browser);
        const page = await context.newPage();

        // ── 1. Request a code — lands the tab on the INPUT_CODE screen ───
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
        expect(requestResponse.ok()).toBe(true);

        const code = await fetchLatestAuthCode(EMAIL);
        expect(code, `auth_code not found in mail log for ${EMAIL}`).toBeTruthy();

        // Confirm we're genuinely on the code-entry screen before mutating
        // the hash — this is the "tab already open on the waiting-for-code
        // page" precondition from the bug report.
        await expect(page.locator('[data-test-id="auth-login-input"]')).toBeVisible();

        // ── 2. Simulate pasting the magic link into the SAME tab's address
        //     bar: set the hash directly via history/location, exactly what
        //     a same-document navigation does — no page.goto(), no reload,
        //     no new page/context. This is the one path the two existing
        //     magic-link specs explicitly avoid.
        const [verifyResponse] = await Promise.all([
            page.waitForResponse(
                r => r.request().method() === 'POST' && r.url().includes('/system/'),
                { timeout: 15000 },
            ),
            page.evaluate((tok: string) => {
                window.location.hash = `token=${tok}`;
            }, code as string),
        ]);

        expect(verifyResponse.ok()).toBe(true);
        const verifyBody = await verifyResponse.json();
        expect(verifyBody.success).toBe(true);

        // Hash must be cleared after the deferred verify consumes it —
        // same cleanup Auth2.tsx already does on the mount-time path.
        await expect.poll(() => page.evaluate(() => window.location.hash), { timeout: 5000 }).toBe('');

        await context.close();
    });
});
