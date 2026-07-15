/**
 * H-02 regression (docs/security-audit/10-ms-postfix-authorization-review.md):
 * IS_DISABLED was never checked by any role gate (isModerator/isOwner/isAdmin/
 * isExpert/isUser) or by the shared authenticated middleware chain — only
 * UserEntityConfig::isApprovedActiveExpert() checked it, and only for the
 * expert being BOOKED, never for the acting session account itself. A
 * disabled account with a still-valid session retained full access to every
 * protected route: booking, comments, support, IM, expert slot management,
 * and even admin actions for disabled staff.
 *
 * The fix adds UserDataMiddleware::notDisabled(), wired into the shared
 * `$common` middleware chain immediately after auth, before any business or
 * staff-rank check — so it uniformly covers every authenticated route.
 *
 * This spec proves three previously-reachable mutations are now blocked for
 * a disabled account: a regular user's comment creation, a disabled expert's
 * slot creation, and a disabled moderator's admin flag-set action. In every
 * case the no-access gate returns the shared HTML deny page (200, text/html)
 * instead of the controller's normal JSON response — the real invariant
 * asserted is that the mutation never happens in the DB.
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

async function setDisabled(accountId: number, disabled: boolean): Promise<void> {
    await withConnection(async (c) => {
        await c.execute(
            `INSERT INTO ${tn('accounts_data')} (account_id, param, value)
             VALUES (?, 'IS_DISABLED', ?)
             ON DUPLICATE KEY UPDATE value = VALUES(value)`,
            [accountId, disabled ? '1' : '0'],
        );
    });
}

/** POST via page.evaluate with the page's own CSRF; reports whether the
 *  response looks like the shared HTML no-access page rather than the
 *  controller's normal JSON API response. */
async function postAndCheckBlocked(page: Page, url: string, body: Record<string, unknown>): Promise<{ blocked: boolean; status: number; contentType: string }> {
    return page.evaluate(async ({ url, body }) => {
        const csrf = (window as any).__GARNET_CSRF__ || '';
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ ...body, CSRF_TOKEN: csrf }),
        });
        const contentType = res.headers.get('content-type') || '';
        const blocked = contentType.includes('text/html');
        return { blocked, status: res.status, contentType };
    }, { url, body });
}

test.describe('H-02: disabled accounts are server-side denied on every authenticated route', () => {

    test('disabled regular user cannot POST /comments/~create', async ({ browser }) => {
        const { context, page } = await devLogin(browser, 'user');
        const userId = await getAccountId('user1@dev.test');
        expect(userId).toBeGreaterThan(0);

        await setDisabled(userId, true);
        try {
            const commentCountBefore = await withConnection(async (c) => {
                const [rows] = await c.execute<any[]>(`SELECT COUNT(*) as cnt FROM ${tn('comments')} WHERE author_id = ?`, [userId]);
                return Number(rows[0]?.cnt ?? 0);
            });

            const result = await postAndCheckBlocked(page, '/comments/~create', {
                entity_type: 'expert',
                entity_id: 1,
                body: 'H-02 regression: should never be created',
            });
            expect(result.blocked).toBe(true);

            const commentCountAfter = await withConnection(async (c) => {
                const [rows] = await c.execute<any[]>(`SELECT COUNT(*) as cnt FROM ${tn('comments')} WHERE author_id = ?`, [userId]);
                return Number(rows[0]?.cnt ?? 0);
            });
            expect(commentCountAfter).toBe(commentCountBefore);
        } finally {
            await setDisabled(userId, false);
            await context.close();
        }
    });

    test('disabled expert cannot POST /expert/~slots (createSlot)', async ({ browser }) => {
        const { context, page } = await devLogin(browser, 'expert');
        const expertId = await getAccountId('expert1@dev.test');
        expect(expertId).toBeGreaterThan(0);

        await setDisabled(expertId, true);
        try {
            const slotCountBefore = await withConnection(async (c) => {
                const [rows] = await c.execute<any[]>(`SELECT COUNT(*) as cnt FROM ${tn('time_slots')} WHERE expert_id = ?`, [expertId]);
                return Number(rows[0]?.cnt ?? 0);
            });

            const startAt = Math.floor(Date.now() / 1000) + 86400 * 7;
            const date = new Date(startAt * 1000).toISOString().slice(0, 10);
            const result = await postAndCheckBlocked(page, '/expert/~slots', {
                date,
                time: '10:00',
                duration: 60,
                cost: 0,
            });
            expect(result.blocked).toBe(true);

            const slotCountAfter = await withConnection(async (c) => {
                const [rows] = await c.execute<any[]>(`SELECT COUNT(*) as cnt FROM ${tn('time_slots')} WHERE expert_id = ?`, [expertId]);
                return Number(rows[0]?.cnt ?? 0);
            });
            expect(slotCountAfter).toBe(slotCountBefore);
        } finally {
            await setDisabled(expertId, false);
            await context.close();
        }
    });

    test('disabled moderator cannot POST /admin/~setUserFlag', async ({ browser }) => {
        const { context, page } = await devLogin(browser, 'moderator');
        const moderatorId = await getAccountId('moderator@dev.test');
        const targetUserId = await getAccountId('user1@dev.test');
        expect(moderatorId).toBeGreaterThan(0);
        expect(targetUserId).toBeGreaterThan(0);

        await setDisabled(moderatorId, true);
        try {
            const before = await withConnection(async (c) => {
                const [rows] = await c.execute<any[]>(
                    `SELECT value FROM ${tn('accounts_data')} WHERE account_id = ? AND param = 'IS_APPROVED'`,
                    [targetUserId],
                );
                return rows[0]?.value ?? null;
            });

            const result = await postAndCheckBlocked(page, '/admin/~setUserFlag', {
                user_id: targetUserId,
                flag: 'IS_APPROVED',
                value: 1,
            });
            expect(result.blocked).toBe(true);

            const after = await withConnection(async (c) => {
                const [rows] = await c.execute<any[]>(
                    `SELECT value FROM ${tn('accounts_data')} WHERE account_id = ? AND param = 'IS_APPROVED'`,
                    [targetUserId],
                );
                return rows[0]?.value ?? null;
            });
            expect(after).toBe(before);
        } finally {
            await setDisabled(moderatorId, false);
            await context.close();
        }
    });
});
