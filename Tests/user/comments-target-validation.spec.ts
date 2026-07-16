/**
 * L-01 regression (docs/security-audit/12-ms-postfix-authorization-review.md):
 * CommentsController::post__create() validated the comment target only by
 * the existence of an expert_profiles row, not whether that account is
 * currently a public (type=expert, approved, not disabled) expert.
 *
 * The fix gates on UserEntityConfig::isApprovedActiveExpert($entityId).
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

async function postCreateComment(page: Page, entityId: number, body: string): Promise<{ status: number; body: any }> {
    return page.evaluate(async ({ entityId, body }) => {
        const csrf = (window as any).__GARNET_CSRF__ || '';
        const res = await fetch('/comments/~create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ entity_type: 'expert', entity_id: entityId, body, CSRF_TOKEN: csrf }),
        });
        const respBody = await res.json().catch(() => null);
        return { status: res.status, body: respBody };
    }, { entityId, body });
}

async function countComments(entityId: number): Promise<number> {
    return withConnection(async (c) => {
        const [rows] = await c.execute<any[]>(
            `SELECT COUNT(*) as cnt FROM ${tn('comments')} WHERE entity_type = 'expert' AND entity_id = ?`,
            [entityId],
        );
        return Number(rows[0]?.cnt ?? 0);
    });
}

async function cleanupComments(entityId: number): Promise<void> {
    await withConnection(async (c) => {
        await c.execute(`DELETE FROM ${tn('comments')} WHERE entity_type = 'expert' AND entity_id = ?`, [entityId]);
    });
}

test.describe('L-01: comments only accept an active approved expert target', () => {
    test.describe.configure({ mode: 'serial' });
    let expertId = 0;
    let ctx: BrowserContext;
    let page: Page;

    test.beforeAll(async ({ browser }) => {
        expertId = await getAccountId('expert1@dev.test');
        expect(expertId).toBeGreaterThan(0);
        await cleanupComments(expertId);

        ({ context: ctx, page } = await devLogin(browser, 'user'));
    });

    test.afterAll(async () => {
        await cleanupComments(expertId);
        await setAccountFlag(expertId, 'IS_DISABLED', '0');
        await setAccountFlag(expertId, 'IS_APPROVED', '1');
        await withConnection(async (c) => {
            await c.execute(`UPDATE ${tn('accounts')} SET type = 'expert' WHERE id = ?`, [expertId]);
        });
        await ctx?.close().catch(() => {});
    });

    test('baseline: comment on an active approved expert succeeds', async () => {
        const before = await countComments(expertId);
        const result = await postCreateComment(page, expertId, 'L-01 baseline comment');
        expect(result.status).toBe(200);
        const after = await countComments(expertId);
        expect(after).toBe(before + 1);
    });

    test('comment on a disabled expert is rejected (404)', async () => {
        await setAccountFlag(expertId, 'IS_DISABLED', '1');
        try {
            const before = await countComments(expertId);
            const result = await postCreateComment(page, expertId, 'Should be rejected (disabled)');
            expect(result.status).toBe(404);
            expect(await countComments(expertId)).toBe(before);
        } finally {
            await setAccountFlag(expertId, 'IS_DISABLED', '0');
        }
    });

    test('comment on an unapproved expert is rejected (404)', async () => {
        await setAccountFlag(expertId, 'IS_APPROVED', '0');
        try {
            const before = await countComments(expertId);
            const result = await postCreateComment(page, expertId, 'Should be rejected (unapproved)');
            expect(result.status).toBe(404);
            expect(await countComments(expertId)).toBe(before);
        } finally {
            await setAccountFlag(expertId, 'IS_APPROVED', '1');
        }
    });

    test('comment on a demoted (type=user) expert-profile account is rejected (404)', async () => {
        await withConnection(async (c) => {
            await c.execute(`UPDATE ${tn('accounts')} SET type = 'user' WHERE id = ?`, [expertId]);
        });
        try {
            const before = await countComments(expertId);
            const result = await postCreateComment(page, expertId, 'Should be rejected (demoted)');
            expect(result.status).toBe(404);
            expect(await countComments(expertId)).toBe(before);
        } finally {
            await withConnection(async (c) => {
                await c.execute(`UPDATE ${tn('accounts')} SET type = 'expert' WHERE id = ?`, [expertId]);
            });
        }
    });
});
