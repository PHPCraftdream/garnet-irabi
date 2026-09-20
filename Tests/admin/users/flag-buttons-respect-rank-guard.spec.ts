/**
 * D-237 (UAT 20.09): a moderator's admin panel showed active, clickable
 * "Одобрить"/"Отключить" buttons for an account outranking the moderator
 * (admin/owner) — clicking got a server-side "Access denied" (403, and in
 * English inside an otherwise Russian UI) instead of the button simply not
 * inviting the click in the first place.
 *
 * `DashboardUsersController::actorMayActOn()` already rejects ANY flag
 * change on a target whose rank exceeds the caller's — this is a
 * client-only fix: `flagDefs.IS_APPROVED`/`IS_DISABLED` in
 * `UsersSection.tsx` now carry the same `lockedBy` rank check that
 * `IS_MODERATOR`/`IS_OWNER` already had, plus a translated tooltip
 * (`Admin_Flag_TargetOutranksYou`) explaining why.
 */
import { test, expect } from '../../helpers/scoped-test';
import { newScopedContext } from '../../helpers/scoped-test';
import { withConnection } from '../../helpers/db/db';
import { roleLogin } from '../../helpers/auth/role-login';
import { tn } from '../../helpers/scoped-test';
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

async function getAccountType(accountId: number): Promise<string> {
    return withConnection(async (c) => {
        const [rows] = await c.execute<any[]>(`SELECT type FROM ${tn('accounts')} WHERE id = ?`, [accountId]);
        return rows[0]?.type ?? '';
    });
}

async function setFlag(accountId: number, flag: string, value: 0 | 1): Promise<void> {
    await withConnection(async (c) => {
        await c.execute(
            `INSERT INTO ${tn('accounts_data')} (account_id, param, value) VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE value = VALUES(value)`,
            [accountId, flag, String(value)],
        );
    });
}

test.describe('D-237: flag buttons respect the actorMayActOn rank guard', () => {
    test.describe.configure({ mode: 'serial' });
    let expertId = 0;

    test.beforeAll(async () => {
        // expert1@dev.test is type=expert already — give it IS_ADMIN=1 so
        // it outranks the moderator viewing the panel below, matching the
        // exact "expert + admin" combination D-237 was found on.
        expertId = await getAccountId('expert1@dev.test');
        expect(expertId).toBeGreaterThan(0);
        expect(await getAccountType(expertId)).toBe('expert');
        await setFlag(expertId, 'IS_ADMIN', 1);
    });

    test.afterAll(async () => {
        if (expertId) await setFlag(expertId, 'IS_ADMIN', 0);
    });

    test('moderator sees IS_APPROVED/IS_DISABLED disabled with an explanatory title for an admin-rank target', async ({ browser }) => {
        const { context, page } = await devLogin(browser, 'moderator');
        try {
            await page.goto('/admin/');
            await page.waitForSelector('table', { timeout: 12000 });
            // "experts" tab, not "admins": UsersSection strips the IS_APPROVED
            // column from gridConfig for every tab except experts/all, so an
            // admins-tab row would never expose that button regardless of the fix.
            await page.locator('[data-test-id="filter-tab-experts"]').click();

            const row = page.locator(`[data-test-id="grid-row-${expertId}"]`);
            await expect(row).toBeVisible({ timeout: 8000 });

            const approveBtn = row.locator(`[data-test-id="flag-IS_APPROVED-${expertId}"]`);
            await expect(approveBtn).toBeVisible();
            await expect(approveBtn).toBeDisabled();
            await expect(approveBtn).toHaveAttribute('title', 'Недоступно: у этого аккаунта более высокая роль, чем у вас');

            const disableBtn = row.locator(`[data-test-id="flag-IS_DISABLED-${expertId}"]`);
            await expect(disableBtn).toBeVisible();
            await expect(disableBtn).toBeDisabled();
            await expect(disableBtn).toHaveAttribute('title', 'Недоступно: у этого аккаунта более высокая роль, чем у вас');
        } finally {
            await context.close();
        }
    });

    test('moderator still sees IS_APPROVED enabled for a regular (non-outranking) expert', async ({ browser }) => {
        const { context, page } = await devLogin(browser, 'moderator');
        try {
            const regularExpertId = await getAccountId('expert2@dev.test');
            expect(regularExpertId).toBeGreaterThan(0);

            await page.goto('/admin/');
            await page.waitForSelector('table', { timeout: 12000 });
            await page.locator('[data-test-id="filter-tab-experts"]').click();

            const row = page.locator(`[data-test-id="grid-row-${regularExpertId}"]`);
            await expect(row).toBeVisible({ timeout: 8000 });

            const approveBtn = row.locator(`[data-test-id="flag-IS_APPROVED-${regularExpertId}"]`);
            await expect(approveBtn).toBeVisible();
            await expect(approveBtn).toBeEnabled();
        } finally {
            await context.close();
        }
    });
});
