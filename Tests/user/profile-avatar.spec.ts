/**
 * User — uploaded profile photo is displayed on the dashboard (WelcomeCard)
 * and on the profile page (UserProfileIsland).
 *
 * Robust across environments: the logged-in account differs between the local
 * isolation harness and the prod scope (and roleLogin may switch accounts), so
 * we read the CURRENT account id at runtime and seed the photo on THAT row,
 * then re-login so the dashboard's session snapshot picks it up. The avatar
 * circle has a fixed CSS footprint, so it is asserted by presence + src (the
 * physical file lives in a scoped upload dir we don't touch here).
 */
import { test, expect, tn } from '../helpers/scoped-test';
import { DB } from '../helpers/db';
import { roleLogin } from '../helpers/role-login';
import mysql from 'mysql2/promise';

test.describe.configure({ mode: 'serial' });

const PHOTO = 'photo_e2e_avatar.png';
const PHOTO_SQ = 'photo_e2e_avatar_sq.png';

async function dbQuery(sql: string, params: any[] = []): Promise<any[]> {
    const conn = await mysql.createConnection(DB);
    try { const [rows] = await conn.execute<any[]>(sql, params); return rows; }
    finally { await conn.end(); }
}
async function dbExec(sql: string, params: any[] = []): Promise<void> {
    const conn = await mysql.createConnection(DB);
    try { await conn.execute(sql, params); }
    finally { await conn.end(); }
}

let accountId = 0;
let token16 = '';

test.afterAll(async () => {
    if (accountId) {
        await dbExec(
            `UPDATE ${tn('accounts')} SET photo = NULL, photo_cropped = NULL, crop_info = NULL WHERE id = ?`,
            [accountId],
        );
    }
});

test('dashboard WelcomeCard shows the uploaded avatar', async ({ page }) => {
    // Log in (consistent account across envs) and discover which account it is.
    await roleLogin(page, 'user');
    await page.goto('/system/');
    accountId = Number(await page.evaluate(() => (window as any).__GARNET_ACCOUNT_ID__ ?? 0));
    expect(accountId).toBeGreaterThan(0);

    const row = await dbQuery(`SELECT token16 FROM ${tn('accounts')} WHERE id = ? LIMIT 1`, [accountId]);
    token16 = String(row[0]?.token16 ?? '');
    expect(token16).not.toBe('');

    // Seed a photo on the logged-in account, then re-login so the dashboard's
    // session snapshot includes it.
    await dbExec(
        `UPDATE ${tn('accounts')} SET photo = ?, photo_cropped = ?, crop_info = ? WHERE id = ?`,
        [PHOTO, PHOTO_SQ, '{"x":0,"y":0,"w":1,"h":1}', accountId],
    );
    await roleLogin(page, 'user');

    await page.goto('/system/');
    const img = page.locator('[data-test-id="welcome-avatar"]');
    await expect(img).toBeVisible({ timeout: 10000 });
    await expect(img).toHaveAttribute('src', new RegExp(`/f/${token16}/${PHOTO_SQ}$`));
});

test('profile page shows the uploaded avatar', async ({ page }) => {
    // Same account is needed here; the user-tests storageState may differ from
    // the roleLogin account, so authenticate the same way before asserting.
    await roleLogin(page, 'user');
    await page.goto('/system/~profile');
    const img = page.locator('[data-test-id="user-avatar"]');
    await expect(img).toBeVisible({ timeout: 10000 });
    await expect(img).toHaveAttribute('src', new RegExp(`/f/${token16}/${PHOTO_SQ}$`));
});
