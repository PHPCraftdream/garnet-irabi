/**
 * Admin — "Remove photo" on a user. The endpoint moves the file out of the
 * public folder into a private archive (verified separately); here we assert
 * the admin-facing contract: the photo fields are cleared in the DB and the
 * action is recorded in the account's entity history (which admin / what).
 *
 * Uses the stored `admin` auth state. Target = user2@dev.test (kept distinct
 * from the user-project avatar test which uses user1).
 */
import { test, expect, tn } from '../helpers/scoped-test';
import { DB } from '../helpers/db';
import mysql from 'mysql2/promise';

test.describe.configure({ mode: 'serial' });

const LOGIN = 'user2@dev.test';
const PHOTO = 'photo_e2e_rm.png';
const PHOTO_SQ = 'photo_e2e_rm_sq.png';

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

test.beforeAll(async () => {
    const rows = await dbQuery(`SELECT id FROM ${tn('accounts')} WHERE login = ? LIMIT 1`, [LOGIN]);
    accountId = Number(rows[0]?.id ?? 0);
    expect(accountId).toBeGreaterThan(0);

    await dbExec(
        `UPDATE ${tn('accounts')} SET photo = ?, photo_cropped = ?, crop_info = ? WHERE id = ?`,
        [PHOTO, PHOTO_SQ, '{"x":0,"y":0,"w":1,"h":1}', accountId],
    );
    await dbExec(`DELETE FROM ${tn('entity_history')} WHERE entity_type = 'account' AND entity_id = ? AND action = 'remove_photo'`, [accountId]);
});

test.afterAll(async () => {
    await dbExec(
        `UPDATE ${tn('accounts')} SET photo = NULL, photo_cropped = NULL, crop_info = NULL WHERE id = ?`,
        [accountId],
    );
    await dbExec(`DELETE FROM ${tn('entity_history')} WHERE entity_type = 'account' AND entity_id = ? AND action = 'remove_photo'`, [accountId]);
});

test('admin removes a user photo: DB cleared + history logged', async ({ page }) => {
    // Open the target user's detail pane directly via the hash deep-link —
    // robust against grid pagination (the row may not be on page 1).
    await page.goto(`/system/admin/#user=${accountId}`);

    // Avatar image + remove button are present (admin reads the photo fresh).
    const avatar = page.locator('[data-test-id="user-detail-pane"] .admin-user-avatar-img');
    await expect(avatar).toBeVisible({ timeout: 10000 });
    const removeBtn = page.locator(`[data-test-id="remove-user-photo-${accountId}"]`);
    await expect(removeBtn).toBeVisible();

    // Accept the confirm() dialog, then click — capture the endpoint response.
    page.on('dialog', d => d.accept());
    const respP = page.waitForResponse(r => r.url().includes('~removeUserPhoto') && r.request().method() === 'POST', { timeout: 10000 });
    await removeBtn.click();
    const resp = await respP;
    expect(resp.ok()).toBe(true);
    const body = await resp.json();
    expect(body.success).toBe(true);

    // The remove button disappears once the photo is gone.
    await expect(removeBtn).toHaveCount(0, { timeout: 8000 });

    // DB fields cleared.
    const after = await dbQuery(`SELECT photo, photo_cropped, crop_info FROM ${tn('accounts')} WHERE id = ?`, [accountId]);
    expect(after[0].photo).toBeNull();
    expect(after[0].photo_cropped).toBeNull();
    expect(after[0].crop_info).toBeNull();

    // History recorded (which admin / what action).
    const hist = await dbQuery(
        `SELECT action, actor_login, diff_json FROM ${tn('entity_history')}
         WHERE entity_type = 'account' AND entity_id = ? AND action = 'remove_photo' ORDER BY id DESC LIMIT 1`,
        [accountId],
    );
    expect(hist.length).toBe(1);
    expect(hist[0].actor_login).toContain('@');
});
