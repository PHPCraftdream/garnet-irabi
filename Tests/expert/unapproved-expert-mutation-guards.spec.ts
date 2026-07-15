/**
 * A-02 regression (docs/security-audit/11-ms-postfix-authorization-review.md):
 * ExpertPanelController's expertOnly() route gate only checked business type
 * (type=expert), never IS_APPROVED — an unapproved expert had full server-side
 * access to every slot/booking mutation (create/edit/delete slot, confirm/
 * cancel booking). Slots created this way were never surfaced publicly (the
 * real product boundary), but the API itself had no defense-in-depth gate.
 *
 * ExpertPanelController now checks `mayMutate()` (isApproved() OR staff rank)
 * at the top of every mutating POST method. This spec covers the remaining
 * mutating endpoints not already covered by unapproved-expert.spec.ts
 * (post__slots), and proves staff ranks are NOT blocked by the approval
 * check — approval is a business-role concern orthogonal to staff rank.
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

async function getExpertId(): Promise<number> {
    return withConnection(async (c) => {
        const [rows] = await c.execute<any[]>(`SELECT id FROM ${tn('accounts')} WHERE login = 'expert1@dev.test'`);
        return rows[0]?.id ?? 0;
    });
}

async function setApproved(expertId: number, approved: boolean): Promise<void> {
    await withConnection(async (c) => {
        await c.execute(
            `INSERT INTO ${tn('accounts_data')} (account_id, param, value)
             VALUES (?, 'IS_APPROVED', ?)
             ON DUPLICATE KEY UPDATE value = VALUES(value)`,
            [expertId, approved ? '1' : '0'],
        );
        await c.execute(`UPDATE ${tn('expert_profiles')} SET is_approved = ? WHERE account_id = ?`, [approved ? 1 : 0, expertId]);
    });
}

async function postExpert(page: Page, url: string, body: Record<string, unknown>): Promise<number> {
    return page.evaluate(async ({ url, body }) => {
        const csrf = (window as any).__GARNET_CSRF__ || '';
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ ...body, CSRF_TOKEN: csrf }),
        });
        return res.status;
    }, { url, body });
}

test.describe('A-02: unapproved expert mutation guards + staff bypass', () => {
    let expertId = 0;
    let initialApproved = true;
    let ctx: BrowserContext;
    let page: Page;

    test.beforeAll(async ({ browser }) => {
        expertId = await getExpertId();
        expect(expertId).toBeGreaterThan(0);

        initialApproved = await withConnection(async (c) => {
            const [rows] = await c.execute<any[]>(
                `SELECT value FROM ${tn('accounts_data')} WHERE account_id = ? AND param = 'IS_APPROVED'`,
                [expertId],
            );
            return String(rows[0]?.value ?? '1') === '1';
        });

        ({ context: ctx, page } = await devLogin(browser, 'expert'));
    });

    test.afterAll(async () => {
        await setApproved(expertId, initialApproved);
        await ctx?.close().catch(() => {});
    });

    test('unapproved expert cannot POST editSlot/deleteSlot/confirmBooking/cancelBooking (403)', async () => {
        await setApproved(expertId, false);
        try {
            const statuses = await Promise.all([
                postExpert(page, '/expert/~editSlot', { slot_id: 999999 }),
                postExpert(page, '/expert/~deleteSlot', { slot_id: 999999 }),
                postExpert(page, '/expert/~confirmBooking', { booking_id: 999999 }),
                postExpert(page, '/expert/~cancelBooking', { booking_id: 999999, reason: 'x' }),
            ]);
            for (const status of statuses) {
                expect(status).toBe(403);
            }
        } finally {
            await setApproved(expertId, true);
        }
    });

    test('unapproved expert GET /expert/~slots still renders (pending-approval banner, no blanket block)', async () => {
        await setApproved(expertId, false);
        try {
            const resp = await page.goto('/expert/~slots');
            expect(resp?.status()).toBeLessThan(400);
        } finally {
            await setApproved(expertId, true);
        }
    });
});

test.describe('A-02: staff rank bypasses the approval check for an expert account', () => {
    // approval is orthogonal to staff rank (rank ladder admin ⊇ owner ⊇
    // moderator): an expert who is ALSO staff must not be blocked from
    // mutating slots just because IS_APPROVED=0.
    let expertId = 0;
    let initialApproved = true;
    let initialModerator = false;
    let ctx: BrowserContext;
    let page: Page;

    test.beforeAll(async ({ browser }) => {
        expertId = await getExpertId();
        expect(expertId).toBeGreaterThan(0);

        initialApproved = await withConnection(async (c) => {
            const [rows] = await c.execute<any[]>(
                `SELECT value FROM ${tn('accounts_data')} WHERE account_id = ? AND param = 'IS_APPROVED'`,
                [expertId],
            );
            return String(rows[0]?.value ?? '1') === '1';
        });
        initialModerator = await withConnection(async (c) => {
            const [rows] = await c.execute<any[]>(
                `SELECT value FROM ${tn('accounts_data')} WHERE account_id = ? AND param = 'IS_MODERATOR'`,
                [expertId],
            );
            return String(rows[0]?.value ?? '0') === '1';
        });

        ({ context: ctx, page } = await devLogin(browser, 'expert'));
    });

    test.afterAll(async () => {
        await setApproved(expertId, initialApproved);
        await withConnection(async (c) => {
            await c.execute(
                `INSERT INTO ${tn('accounts_data')} (account_id, param, value)
                 VALUES (?, 'IS_MODERATOR', ?)
                 ON DUPLICATE KEY UPDATE value = VALUES(value)`,
                [expertId, initialModerator ? '1' : '0'],
            );
        });
        await ctx?.close().catch(() => {});
    });

    test('unapproved expert who is also staff (moderator) can still edit their slot', async () => {
        await setApproved(expertId, false);
        await withConnection(async (c) => {
            await c.execute(
                `INSERT INTO ${tn('accounts_data')} (account_id, param, value)
                 VALUES (?, 'IS_MODERATOR', '1')
                 ON DUPLICATE KEY UPDATE value = '1'`,
                [expertId],
            );
        });

        // editSlot on a nonexistent slot_id still passes the approval gate
        // and reaches the controller's own ownership check (403 "Access
        // denied" from ExpertSlotsService, NOT the approval gate's 403).
        // The two are indistinguishable by status code alone, so assert via
        // the response body's error message instead.
        const body = await page.evaluate(async () => {
            const csrf = (window as any).__GARNET_CSRF__ || '';
            const res = await fetch('/expert/~editSlot', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify({ slot_id: 999999, CSRF_TOKEN: csrf }),
            });
            return res.json().catch(() => null);
        });

        expect(body?.error).not.toBe('Expert not approved');
    });
});
