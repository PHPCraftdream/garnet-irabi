/**
 * D-128: two things about an approved review were invisible before this fix.
 *
 *   1. Approving a review never produced a news-feed event for its author —
 *      every other feed-worthy thing (a booking confirmed, a reply posted)
 *      does. The only way to learn a review went live was reopening the
 *      expert's page and re-reading your own status label.
 *   2. Reviews lived nowhere but the expert page they were written on — no
 *      count, no list, no link back to "my reviews" from the author's own
 *      profile.
 */

import { test, expect, tn } from '../helpers/scoped-test';
import { newScopedContext } from '../helpers/scoped-test';
import { resolveStorageStatePath } from '../helpers/state';
import { withConnection } from '../helpers/db';
import type { BrowserContext, Page } from '@playwright/test';

async function getIds(): Promise<{ expertId: number; userId: number }> {
    return withConnection(async (c) => {
        const [er] = await c.execute<any[]>(`SELECT id FROM ${tn('accounts')} WHERE login = 'expert1@dev.test'`);
        // The 'user' storage state (resolveStorageStatePath('user')) logs in
        // as USER_LOGIN, not the dev-seed sample account 'user1@dev.test' —
        // the news feed is filtered by the SESSION's account id, so the
        // comment's author_id must match this login, not a look-alike one.
        const [ur] = await c.execute<any[]>(`SELECT id FROM ${tn('accounts')} WHERE login = 'testuser_setup_user@irabi.test'`);
        return { expertId: er[0]?.id ?? 0, userId: ur[0]?.id ?? 0 };
    });
}

async function insertPendingComment(authorId: number, expertId: number): Promise<number> {
    return withConnection(async (c) => {
        const [res]: any = await c.execute(
            `INSERT INTO ${tn('comments')} (author_id, entity_type, entity_id, body, created_at, moderation_status)
             VALUES (?, 'expert', ?, ?, ?, 'pending')`,
            [authorId, expertId, 'D-128 test review', Math.floor(Date.now() / 1000)],
        );
        return res.insertId;
    });
}

async function deleteComment(id: number): Promise<void> {
    await withConnection(async (c) => {
        await c.execute(`DELETE FROM ${tn('comments')} WHERE id = ?`, [id]);
        await c.execute(`DELETE FROM ${tn('news_events')} WHERE event_type = 'comment_approved' AND payload LIKE ?`, [`%"expert_id"%`]);
    });
}

test.describe.configure({ mode: 'serial' });

test.describe('D-128: approved reviews are visible in the news feed and on the author\'s own profile', () => {
    let expertId = 0;
    let userId = 0;
    let commentId = 0;
    let modCtx: BrowserContext;
    let modPage: Page;
    let userCtx: BrowserContext;
    let userPage: Page;

    test.beforeAll(async ({ browser }) => {
        ({ expertId, userId } = await getIds());
        expect(expertId).toBeGreaterThan(0);
        expect(userId).toBeGreaterThan(0);

        commentId = await insertPendingComment(userId, expertId);
        expect(commentId).toBeGreaterThan(0);

        modCtx = await newScopedContext(browser, { storageState: resolveStorageStatePath('moderator') });
        modPage = await modCtx.newPage();
        await modPage.goto('/admin/');

        userCtx = await newScopedContext(browser, { storageState: resolveStorageStatePath('user') });
        userPage = await userCtx.newPage();
        await userPage.goto('/balance');
    });

    test.afterAll(async () => {
        await modCtx?.close().catch(() => {});
        await userCtx?.close().catch(() => {});
        await deleteComment(commentId);
    });

    test('moderator approves the review', async () => {
        const result = await modPage.evaluate(async ({ id }) => {
            const csrf = (window as any).__GARNET_CSRF__ ?? '';
            const res = await fetch('/admin/comments/~approve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, CSRF_TOKEN: csrf }),
            });
            return { status: res.status, body: await res.json() };
        }, { id: commentId });
        expect(result.status).toBe(200);
        expect(result.body.success).toBe(true);
    });

    test('the author sees a comment_approved event in their news feed', async () => {
        const result = await userPage.evaluate(async () => {
            const csrf = (window as any).__GARNET_CSRF__ ?? '';
            const res = await fetch('/news/~feed', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ page: 1, perPage: 20, CSRF_TOKEN: csrf }),
            });
            return { status: res.status, body: await res.json() };
        });
        expect(result.status).toBe(200);
        const items: any[] = result.body.items ?? result.body.data?.items ?? [];
        const found = items.find((it) => it.event_type === 'comment_approved' && it.payload?.expert_id === expertId);
        expect(found).toBeTruthy();
    });

    test('the review appears in "My reviews" on the author\'s own profile', async () => {
        await userPage.goto(`/user/id~${userId}`);
        await expect(userPage.locator('[data-test-id="my-reviews-section"]')).toBeVisible({ timeout: 10000 });
        await expect(userPage.locator('[data-test-id="my-reviews-count"]')).toHaveText(/[1-9]\d*/);
        await expect(userPage.locator(`[data-test-id="my-review-${commentId}"]`)).toBeVisible();
    });
});
