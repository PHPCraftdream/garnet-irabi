/**
 * D-263 (UAT round, mod-1/Мирьям Штерн): in "Последние действия"
 * (admin dashboard), a "Одобрение комментария" (COMMENT_APPROVE) row's
 * target rendered as plain unlinked text ("comment#19") — unlike a
 * user target, which is a real link. Root cause: admin_action_log
 * stamps target_id=0 for a non-account target and encodes the real
 * entity in target_login as "comment#<id>"; AdminRecentActivity's
 * ActivityPerson only knew "id > 0 → link, else → plain span", with no
 * case for that pattern at all.
 */
import { test, expect, tn } from '../../helpers/scoped-test';
import { resolveStorageStatePath } from '../../helpers/auth/state';
import { newScopedContext } from '../../helpers/scoped-test';
import { withConnection } from '../../helpers/db/db';
import type { BrowserContext, Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

test.describe('D-263: a comment-moderation activity row links to the Comments tab', () => {
    let logId = 0;
    let ctx: BrowserContext;
    let page: Page;
    const MARKER_COMMENT_ID = 900000 + Math.floor(Math.random() * 90000);

    test.beforeAll(async ({ browser }) => {
        logId = await withConnection(async (c) => {
            const [rows] = await c.execute<any[]>(
                `SELECT id FROM ${tn('accounts')} WHERE login = 'testuser_setup_moderator@irabi.test'`,
            );
            const actorId = Number(rows[0]?.id ?? 0);
            expect(actorId).toBeGreaterThan(0);

            const [res]: any = await c.execute(
                `INSERT INTO ${tn('admin_action_log')}
                 (actor_id, actor_login, target_id, target_login, action, old_value, new_value, created_at)
                 VALUES (?, 'testuser_setup_moderator@irabi.test', 0, ?, 'COMMENT_APPROVE', 'pending', 'approved', ?)`,
                [actorId, `comment#${MARKER_COMMENT_ID}`, Math.floor(Date.now() / 1000)],
            );
            return Number(res.insertId);
        });
        expect(logId).toBeGreaterThan(0);

        ctx = await newScopedContext(browser, { storageState: resolveStorageStatePath('moderator') });
        page = await ctx.newPage();
    });

    test.afterAll(async () => {
        await ctx?.close().catch(() => {});
        if (logId) {
            await withConnection(async (c) => {
                await c.execute(`DELETE FROM ${tn('admin_action_log')} WHERE id = ?`, [logId]);
            });
        }
    });

    test('the comment target is a real link to the Comments tab, not plain text', async () => {
        await page.goto('/system/admin/dashboard', { waitUntil: 'domcontentloaded' });
        const row = page.locator(`[data-test-id="admin-dash-log-${logId}"]`);
        await expect(row).toBeVisible({ timeout: 10000 });
        await expect(row).toContainText(`comment#${MARKER_COMMENT_ID}`);

        const link = row.locator(`a:has-text("comment#${MARKER_COMMENT_ID}")`);
        await expect(link).toBeVisible();
        await expect(link).toHaveAttribute('href', /tab=comments/);
    });
});
