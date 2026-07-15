/**
 * H-01 regression (docs/security-audit/10-ms-postfix-authorization-review.md):
 * the legacy FwAccountsController route registered at DashboardAccountsController
 * ::URL ('/dashboard/') was reachable under only `moderatorOnly`, with zero
 * rank/self checks and manageFormFields() exposing IS_ADMIN/IS_MODERATOR/
 * IS_APPROVED/IS_DISABLED. Any moderator could POST `/dashboard/~save_user`
 * with their own id and IS_ADMIN=1 to self-promote to admin — a full bypass
 * of the properly-guarded /admin/~setUserFlag endpoint.
 *
 * The route was entirely unused by the frontend (no menu, no link, no
 * fetch call anywhere), so the fix removes its registration outright rather
 * than trying to bolt a rank guard onto dead code.
 *
 * This spec proves the endpoint is gone: a moderator's POST now 404s, and
 * the moderator's own IS_ADMIN flag is untouched in the DB.
 */
import { test, expect, tn } from '../helpers/scoped-test';
import { newScopedContext } from '../helpers/scoped-test';
import { withConnection } from '../helpers/db';
import { roleLogin } from '../helpers/role-login';
import type { BrowserContext, Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

let moderatorContext: BrowserContext;
let moderatorPage: Page;
let moderatorAccountId = 0;

async function devLogin(browser: any, role: string): Promise<{ context: BrowserContext; page: Page }> {
    const context = await newScopedContext(browser);
    const page = await context.newPage();
    await page.goto('/');
    await roleLogin(page, role);
    await page.goto('/');
    return { context, page };
}

async function getIsAdmin(accountId: number): Promise<number> {
    return withConnection(async (c) => {
        const [rows] = await c.execute<any[]>(
            `SELECT value FROM ${tn('accounts_data')} WHERE account_id = ? AND param = 'IS_ADMIN'`,
            [accountId],
        );
        return Number(rows[0]?.value ?? 0);
    });
}

test.describe('H-01: legacy /dashboard/~save_user self-promotion route is removed', () => {
    test.beforeAll(async ({ browser }) => {
        ({ context: moderatorContext, page: moderatorPage } = await devLogin(browser, 'moderator'));

        const accountId = await withConnection(async (c) => {
            const [rows] = await c.execute<any[]>(`SELECT id FROM ${tn('accounts')} WHERE login = 'moderator@dev.test'`);
            return rows[0]?.id ?? 0;
        });
        moderatorAccountId = accountId;
    });

    test.afterAll(async () => {
        await moderatorContext?.close().catch(() => {});
    });

    test('POST /dashboard/~save_user with self id + IS_ADMIN=1 is 404 (route removed)', async () => {
        expect(moderatorAccountId).toBeGreaterThan(0);
        const before = await getIsAdmin(moderatorAccountId);
        expect(before).toBe(0);

        const result = await moderatorPage.evaluate(async ({ id }) => {
            const csrf = (window as any).__GARNET_CSRF__ || '';
            const res = await fetch('/dashboard/~save_user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify({ id, IS_ADMIN: 1, IS_MODERATOR: 1, CSRF_TOKEN: csrf }),
            });
            return { status: res.status };
        }, { id: moderatorAccountId });

        expect(result.status).toBe(404);

        const after = await getIsAdmin(moderatorAccountId);
        expect(after).toBe(0);
    });
});
