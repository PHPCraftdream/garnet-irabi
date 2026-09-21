/**
 * D-259 (UAT round, user-6/Рита Ландау): filling "О себе" on
 * /system/~profile_edit and saving it worked fine — the text survived a
 * reload of the edit form itself. It just never showed up anywhere on the
 * student's own /system/~profile page. UserProfilePresenter::buildProps()
 * (the single props builder both /system/~profile and /user/id~X share,
 * D-152) never read `accounts.about` at all — the expert side of the exact
 * same column had its own equivalent bug fixed once already (see
 * ExpertController's D-152-era comment), but nobody had mirrored the fix
 * to the student side.
 */
import { test, expect, tn } from '../../../helpers/scoped-test';
import { newScopedContext } from '../../../helpers/scoped-test';
import { resolveStorageStatePath } from '../../../helpers/auth/state';
import { withConnection } from '../../../helpers/db/db';
import type { BrowserContext, Page } from '@playwright/test';

async function getUserId(): Promise<number> {
    return withConnection(async (c) => {
        const [rows] = await c.execute<any[]>(`SELECT id FROM ${tn('accounts')} WHERE login = 'testuser_setup_user@irabi.test'`);
        return rows[0]?.id ?? 0;
    });
}

async function setAbout(userId: number, about: string | null): Promise<void> {
    await withConnection(async (c) => {
        await c.execute(`UPDATE ${tn('accounts')} SET about = ? WHERE id = ?`, [about, userId]);
    });
}

test.describe.configure({ mode: 'serial' });

test.describe('D-259: a student\'s own "about me" text shows on their own profile page', () => {
    let userId = 0;
    let previousAbout: string | null = null;
    let ctx: BrowserContext;
    let page: Page;

    const ABOUT_TEXT = 'D-259 test: учу немецкий, люблю разговорную практику.';

    test.beforeAll(async ({ browser }) => {
        userId = await getUserId();
        expect(userId).toBeGreaterThan(0);

        previousAbout = await withConnection(async (c) => {
            const [rows] = await c.execute<any[]>(`SELECT about FROM ${tn('accounts')} WHERE id = ?`, [userId]);
            return rows[0]?.about ?? null;
        });
        await setAbout(userId, ABOUT_TEXT);

        ctx = await newScopedContext(browser, { storageState: resolveStorageStatePath('user') });
        page = await ctx.newPage();
    });

    test.afterAll(async () => {
        await ctx?.close().catch(() => {});
        if (userId) await setAbout(userId, previousAbout);
    });

    test('the saved "about" text renders on /system/~profile', async () => {
        await page.goto('/system/~profile', { waitUntil: 'domcontentloaded' });
        await expect(page.getByText(ABOUT_TEXT)).toBeVisible({ timeout: 10000 });
    });

    test('empty "about" shows no section at all', async () => {
        await setAbout(userId, '');
        await page.goto('/system/~profile', { waitUntil: 'domcontentloaded' });
        await expect(page.getByText(ABOUT_TEXT)).toHaveCount(0);
    });
});
