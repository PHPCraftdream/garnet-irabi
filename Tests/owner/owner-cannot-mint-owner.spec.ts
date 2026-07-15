/**
 * A-01 regression (docs/security-audit/11-ms-postfix-authorization-review.md):
 * docs/roles.md §4 states "Только Администратор может назначить Владельца"
 * (only an Admin may appoint an Owner), but DashboardUsersController::
 * post__setUserFlag() let any owner (isOwner() true, which also covers
 * admin) set IS_OWNER on a target — a plain owner without IS_ADMIN could
 * mint a second owner from any user/expert/moderator account, since
 * actorMayActOn() only checks the target's CURRENT rank, not the requested
 * privilege change.
 *
 * The fix moves IS_OWNER out of the owner-allowed flag list into the
 * admin-only list (mirroring how IS_ADMIN is already admin-gated).
 * IS_MODERATOR stays owner-settable, matching docs/roles.md's "Владелец
 * или Админ может назначить модератора".
 *
 * Tests run strictly one staff session at a time (login → assert → close)
 * rather than holding owner+admin sessions open concurrently, to avoid
 * exercising a separate, unrelated dev-server-only quirk: the shared
 * `garnet serve` php-S worker pool can serve a stale Account::fromSession()
 * identity across two different concurrently-live sessions that happen to
 * land on the same long-lived worker process.
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

async function getFlag(accountId: number, flag: string): Promise<string | null> {
    return withConnection(async (c) => {
        const [rows] = await c.execute<any[]>(
            `SELECT value FROM ${tn('accounts_data')} WHERE account_id = ? AND param = ?`,
            [accountId, flag],
        );
        return rows[0]?.value ?? null;
    });
}

async function clearFlag(accountId: number, flag: string): Promise<void> {
    await withConnection(async (c) => {
        await c.execute(
            `UPDATE ${tn('accounts_data')} SET value = '0' WHERE account_id = ? AND param = ?`,
            [accountId, flag],
        );
    });
}

async function postSetUserFlag(page: Page, userId: number, flag: string, value: number): Promise<{ status: number; body: any }> {
    return page.evaluate(async ({ userId, flag, value }) => {
        const csrf = (window as any).__GARNET_CSRF__ || '';
        const res = await fetch('/admin/~setUserFlag', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ user_id: userId, flag, value, CSRF_TOKEN: csrf }),
        });
        const text = await res.text();
        let body: any = null;
        try { body = JSON.parse(text); } catch { body = text; }
        return { status: res.status, body };
    }, { userId, flag, value });
}

test.describe('A-01: only admin may grant IS_OWNER', () => {
    test.describe.configure({ mode: 'serial' });
    let targetUserId = 0;

    test.beforeAll(async () => {
        targetUserId = await getAccountId('user1@dev.test');
        expect(targetUserId).toBeGreaterThan(0);
        await clearFlag(targetUserId, 'IS_OWNER');
        await clearFlag(targetUserId, 'IS_MODERATOR');
    });

    test.afterAll(async () => {
        await clearFlag(targetUserId, 'IS_OWNER');
        await clearFlag(targetUserId, 'IS_MODERATOR');
    });

    test('owner (non-admin) POST IS_OWNER=1 on a regular user is rejected, flag unchanged', async ({ browser }) => {
        const { context, page } = await devLogin(browser, 'owner');
        try {
            const before = await getFlag(targetUserId, 'IS_OWNER');
            expect(before === null || before === '0').toBe(true);

            const result = await postSetUserFlag(page, targetUserId, 'IS_OWNER', 1);
            expect(result.status).toBe(400);

            const after = await getFlag(targetUserId, 'IS_OWNER');
            expect(after === null || after === '0').toBe(true);
        } finally {
            await context.close();
        }
    });

    test('owner still can set IS_MODERATOR on a regular user (unchanged behavior)', async ({ browser }) => {
        const { context, page } = await devLogin(browser, 'owner');
        try {
            const result = await postSetUserFlag(page, targetUserId, 'IS_MODERATOR', 1);
            expect(result.status).toBe(200);

            const after = await getFlag(targetUserId, 'IS_MODERATOR');
            expect(after).toBe('1');

            await clearFlag(targetUserId, 'IS_MODERATOR');
        } finally {
            await context.close();
        }
    });

    test('admin CAN set IS_OWNER on a regular user', async ({ browser }) => {
        const { context, page } = await devLogin(browser, 'admin');
        try {
            const result = await postSetUserFlag(page, targetUserId, 'IS_OWNER', 1);
            expect(result.status).toBe(200);

            const after = await getFlag(targetUserId, 'IS_OWNER');
            expect(after).toBe('1');
        } finally {
            await context.close();
        }
    });
});
