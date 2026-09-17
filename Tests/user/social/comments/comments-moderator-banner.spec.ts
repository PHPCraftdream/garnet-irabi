/**
 * D-119: a moderator opening an expert's public profile sees every review —
 * approved, pending, rejected, flagged — with nothing on the page saying so.
 * A regular visitor sees only approved reviews. mod-1 rejected/flagged two
 * reviews, reopened the page, saw them still sitting there, and concluded her
 * actions hadn't taken effect (they had — she just couldn't tell who else
 * could see what she saw).
 *
 * `CommentsSection` now shows a banner ("comments-moderator-notice") whenever
 * `isModerator` is true, regardless of what's on the current page — the
 * server-side query is already unfiltered for a moderator the moment they're
 * logged in, so the banner states the rule, not a claim about this
 * particular list.
 */

import { test, expect, tn } from '../../../helpers/scoped-test';
import { newScopedContext } from '../../../helpers/scoped-test';
import { resolveStorageStatePath } from '../../../helpers/auth/state';
import { withConnection } from '../../../helpers/db/db';
import type { BrowserContext, Page } from '@playwright/test';

async function getExpertId(): Promise<number> {
    return withConnection(async (c) => {
        const [rows] = await c.execute<any[]>(`SELECT id FROM ${tn('accounts')} WHERE login = 'expert1@dev.test'`);
        return rows[0]?.id ?? 0;
    });
}

test.describe('D-119: moderator-view banner on the expert profile comments section', () => {
    test.describe.configure({ mode: 'serial' });
    let expertId = 0;
    let modCtx: BrowserContext;
    let modPage: Page;
    let userCtx: BrowserContext;
    let userPage: Page;

    test.beforeAll(async ({ browser }) => {
        expertId = await getExpertId();
        expect(expertId).toBeGreaterThan(0);

        modCtx = await newScopedContext(browser, { storageState: resolveStorageStatePath('moderator') });
        modPage = await modCtx.newPage();

        userCtx = await newScopedContext(browser, { storageState: resolveStorageStatePath('user') });
        userPage = await userCtx.newPage();
    });

    test.afterAll(async () => {
        await modCtx?.close().catch(() => {});
        await userCtx?.close().catch(() => {});
    });

    test('moderator sees the banner on an expert profile', async () => {
        await modPage.goto(`/expert/id~${expertId}`);
        await expect(modPage.locator('[data-test-id="comments-section"]')).toBeVisible({ timeout: 10000 });
        await expect(modPage.locator('[data-test-id="comments-moderator-notice"]')).toBeVisible();
    });

    test('a regular user sees no such banner on the same page', async () => {
        await userPage.goto(`/expert/id~${expertId}`);
        await expect(userPage.locator('[data-test-id="comments-section"]')).toBeVisible({ timeout: 10000 });
        await expect(userPage.locator('[data-test-id="comments-moderator-notice"]')).toHaveCount(0);
    });
});
