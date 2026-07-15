/**
 * M-01 regression (docs/security-audit/09-ms-fresh-authorization-review.md):
 * RegisterController::post__main() used to ignore FwInviteTokenService::consume()'s
 * return value — a limited-use invite token (max_uses=1) could register more
 * accounts than `uses_left` allowed if two clients raced the reg_user POST.
 *
 * The fix moves the atomic consume() CAS to run BEFORE UserDataMiddleware::
 * processPost() and rejects with 409 when consume() returns false, instead of
 * saving the profile unconditionally and consuming the token as an afterthought.
 *
 * This spec drives two genuinely concurrent reg_user submissions (Promise.all,
 * not sequential awaits) against one max_uses=1 token from two distinct
 * already-authenticated `.test` accounts, and asserts:
 *   - exactly one succeeds (200), the other is rejected (409)
 *   - uses_left ends at 0 (never negative)
 *   - exactly one row lands in invite_registrations
 */
import { test, expect, tn } from '../../helpers/scoped-test';
import { newScopedContext } from '../../helpers/scoped-test';
import { withConnection } from '../../helpers/db';
import type { BrowserContext, Page } from '@playwright/test';

const WORKER = process.env.TEST_PARALLEL_INDEX ?? '0';
const EMAIL_A = `test_invrace_a_${WORKER}@irabi.test`;
const EMAIL_B = `test_invrace_b_${WORKER}@irabi.test`;

async function insertToken(token: string, maxUses: number): Promise<number> {
    return withConnection(async (c) => {
        const [res]: any = await c.execute(
            `INSERT INTO ${tn('invite_tokens')} (token, label, expires_at, max_uses, uses_left, is_disabled, created_at, created_by, account_type)
             VALUES (?, ?, NULL, ?, ?, 0, UNIX_TIMESTAMP(), NULL, 'user')`,
            [token, `M-01 race test`, maxUses, maxUses],
        );
        return res.insertId;
    });
}

async function getUsesLeft(tokenId: number): Promise<number> {
    return withConnection(async (c) => {
        const [rows] = await c.execute<any[]>(`SELECT uses_left FROM ${tn('invite_tokens')} WHERE id = ?`, [tokenId]);
        return Number(rows[0]?.uses_left ?? -1);
    });
}

async function countRegistrations(tokenId: number): Promise<number> {
    return withConnection(async (c) => {
        const [rows] = await c.execute<any[]>(
            `SELECT COUNT(*) as cnt FROM ${tn('invite_registrations')} WHERE token_id = ?`, [tokenId],
        );
        return Number(rows[0]?.cnt ?? 0);
    });
}

async function cleanup(): Promise<void> {
    await withConnection(async (c) => {
        for (const email of [EMAIL_A, EMAIL_B]) {
            await c.execute(
                `DELETE ad FROM ${tn('accounts_data')} ad JOIN ${tn('accounts')} a ON a.id = ad.account_id WHERE a.login = ?`,
                [email],
            );
        }
        await c.execute(`DELETE FROM ${tn('accounts')} WHERE login IN (?, ?)`, [EMAIL_A, EMAIL_B]);
        await c.execute(`DELETE FROM ${tn('invite_registrations')} WHERE token_id IN (SELECT id FROM ${tn('invite_tokens')} WHERE label = 'M-01 race test')`);
        await c.execute(`DELETE FROM ${tn('invite_tokens')} WHERE label = 'M-01 race test'`);
    });
}

/** Auth into /first-step/token~X via the real passwordless dev-auth widget. */
async function authIntoInvite(page: Page, token: string, email: string): Promise<void> {
    await page.goto(`/first-step/token~${token}`);
    const loginInput = page.locator('[data-test-id="auth-login-input"]');
    await expect(loginInput).toBeVisible({ timeout: 10000 });
    await loginInput.fill(email);
    await page.locator('[data-test-id="auth-consent-pd"]').check();
    await page.waitForFunction(() => {
        const b = document.querySelector('[data-test-id="auth-submit-btn"]') as HTMLButtonElement | null;
        return !!b && !b.disabled;
    }, { timeout: 8000 });
    await page.locator('[data-test-id="auth-submit-btn"]').click();
    await page.waitForFunction(
        () => document.querySelector('[data-test-id="auth-submit-btn"]') === null,
        { timeout: 15000 },
    );
}

/**
 * POST reg_user from the SAME page authIntoInvite() just authenticated on —
 * no intermediate page.goto(). The auth widget completes via an in-page AJAX
 * call and unmounts itself (React state change), it never navigates away, so
 * the browser is still sitting on `/first-step/token~X` with __GARNET_CSRF__
 * already minted by the widget's startSession() call.
 *
 * A fresh page.goto() to the same URL at this point is NOT equivalent: once
 * the session is fully authenticated (auth phase = DONE), RegisterController
 * treats a plain GET as "nothing to do here" and 302-redirects to `/system/`
 * — so re-navigating before posting would silently submit reg_user against
 * the wrong controller entirely.
 */
async function submitRegUser(page: Page, token: string, name: string): Promise<{ status: number; body: any }> {
    return page.evaluate(async ({ token, name }) => {
        const csrf = (window as any).__GARNET_CSRF__ ?? '';
        const res = await fetch(`/first-step/token~${token}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ action: 'reg_user', name, time_zone: 'UTC', CSRF_TOKEN: csrf }),
        });
        const body = await res.json().catch(() => null);
        return { status: res.status, body };
    }, { token, name });
}

test.describe('M-01: invite token consume() race — reg_user must respect uses_left', () => {
    test.describe.configure({ mode: 'serial' });
    let tokenId = 0;
    let token = '';
    let ctxA: BrowserContext, ctxB: BrowserContext;
    let pageA: Page, pageB: Page;

    test.beforeAll(async () => {
        await cleanup();
    });

    test.afterAll(async () => {
        await ctxA?.close().catch(() => {});
        await ctxB?.close().catch(() => {});
        await cleanup();
    });

    test('setup: seed a max_uses=1 token, authenticate two distinct accounts into it', async ({ browser }) => {
        token = `pwtest_invrace_${WORKER}_${Date.now().toString(36)}`;
        tokenId = await insertToken(token, 1);
        expect(tokenId).toBeGreaterThan(0);

        ctxA = await newScopedContext(browser, { baseURL: process.env.BASE_URL || 'http://localhost:8001' });
        ctxB = await newScopedContext(browser, { baseURL: process.env.BASE_URL || 'http://localhost:8001' });
        pageA = await ctxA.newPage();
        pageB = await ctxB.newPage();

        await authIntoInvite(pageA, token, EMAIL_A);
        await authIntoInvite(pageB, token, EMAIL_B);
    });

    test('two concurrent reg_user submissions: exactly one succeeds, the other is rejected 409', async () => {
        if (!tokenId) { test.skip(); return; }

        const [resA, resB] = await Promise.all([
            submitRegUser(pageA, token, 'Race A'),
            submitRegUser(pageB, token, 'Race B'),
        ]);

        // Exactly one must succeed. The loser is rejected either at the new
        // consume() CAS gate (409, "Invite_Error_Title") or — if the winner's
        // decrement commits before the loser's own validate() SELECT runs —
        // at the earlier `uses_left <= 0` check in FwInviteTokenService::
        // validate() (403, "exhausted"). Both are correct rejections of the
        // same invariant; the real assertion is the DB state checked below.
        const statuses = [resA.status, resB.status];
        expect(statuses.filter((s) => s === 200).length).toBe(1);
        expect(statuses.filter((s) => s === 409 || s === 403).length).toBe(1);
    });

    test('uses_left ends at 0 (never goes negative)', async () => {
        if (!tokenId) { test.skip(); return; }
        const usesLeft = await getUsesLeft(tokenId);
        expect(usesLeft).toBe(0);
    });

    test('exactly one row in invite_registrations for this token', async () => {
        if (!tokenId) { test.skip(); return; }
        const cnt = await countRegistrations(tokenId);
        expect(cnt).toBe(1);
    });
});
