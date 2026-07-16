/**
 * /user/id~N access policy (security audit report 14 decision).
 *
 * A regular user profile is a PUBLIC surface: name + aggregate booking/
 * cancellation counters are visible to any authenticated account. This is
 * consistent with /users/~preview, which exposes the same aggregate
 * counters — the two profile surfaces are intentionally aligned (the
 * earlier M-03 self/staff/counterparty gate was reverted so they don't
 * contradict each other). Disabled accounts are still anonymised.
 */
import { test, expect, tn } from '../helpers/scoped-test';
import { newScopedContext } from '../helpers/scoped-test';
import { withConnection } from '../helpers/db';
import { roleLogin } from '../helpers/role-login';
import type { BrowserContext, Page } from '@playwright/test';

async function devLogin(browser: any, role: string): Promise<{ context: BrowserContext; page: Page }> {
    const context = await newScopedContext(browser);
    const page = await context.newPage();
    await page.goto('/');
    await roleLogin(page, role);
    await page.goto('/');
    return { context, page };
}

async function getAccountId(login: string): Promise<number> {
    return withConnection(async (c) => {
        const [rows] = await c.execute<any[]>(`SELECT id FROM ${tn('accounts')} WHERE login = ?`, [login]);
        return rows[0]?.id ?? 0;
    });
}

async function getViaPage(page: Page, path: string): Promise<{ status: number; body: string }> {
    return page.evaluate(async (path: string) => {
        const res = await fetch(path);
        return { status: res.status, body: await res.text() };
    }, path);
}

async function setAccountFlag(accountId: number, flag: string, value: string): Promise<void> {
    await withConnection(async (c) => {
        await c.execute(
            `INSERT INTO ${tn('accounts_data')} (account_id, param, value)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE value = VALUES(value)`,
            [accountId, flag, value],
        );
    });
}

test.describe('/user/id~N is a public profile surface (any authenticated actor)', () => {
    let user1Ctx: BrowserContext;
    let user1Page: Page;
    let moderatorCtx: BrowserContext;
    let moderatorPage: Page;
    let expertCtx: BrowserContext;
    let expertPage: Page;
    let user2Id = 0;

    test.beforeAll(async ({ browser }) => {
        ({ context: user1Ctx, page: user1Page } = await devLogin(browser, 'user'));
        ({ context: moderatorCtx, page: moderatorPage } = await devLogin(browser, 'moderator'));
        ({ context: expertCtx, page: expertPage } = await devLogin(browser, 'expert'));
        user2Id = await getAccountId('user2@dev.test');
        expect(user2Id).toBeGreaterThan(0);
    });

    test.afterAll(async () => {
        await setAccountFlag(user2Id, 'IS_DISABLED', '0');
        await user1Ctx?.close().catch(() => {});
        await moderatorCtx?.close().catch(() => {});
        await expertCtx?.close().catch(() => {});
    });

    test('an unrelated user CAN view another regular user profile', async () => {
        const status = (await getViaPage(user1Page, `/user/id~${user2Id}`)).status;
        expect(status).toBe(200);
    });

    test('a user CAN view their own profile', async () => {
        const selfId = await getAccountId('user1@dev.test');
        const status = (await getViaPage(user1Page, `/user/id~${selfId}`)).status;
        expect(status).toBe(200);
    });

    test('a moderator CAN view any regular user profile', async () => {
        const status = (await getViaPage(moderatorPage, `/user/id~${user2Id}`)).status;
        expect(status).toBe(200);
    });

    test('an unrelated expert CAN view a regular user profile', async () => {
        const status = (await getViaPage(expertPage, `/user/id~${user2Id}`)).status;
        expect(status).toBe(200);
    });

    test('a disabled user profile is anonymised (placeholder name, real name absent)', async () => {
        const realName = await withConnection(async (c) => {
            const [rows] = await c.execute<any[]>(`SELECT name FROM ${tn('accounts')} WHERE id = ?`, [user2Id]);
            return String(rows[0]?.name ?? '');
        });
        await setAccountFlag(user2Id, 'IS_DISABLED', '1');
        try {
            const { status, body } = await getViaPage(user1Page, `/user/id~${user2Id}`);
            expect(status).toBe(200);
            expect(body).toContain(`#${user2Id}`);
            if (realName.trim() !== '') {
                expect(body).not.toContain(realName);
            }
        } finally {
            await setAccountFlag(user2Id, 'IS_DISABLED', '0');
        }
    });
});
