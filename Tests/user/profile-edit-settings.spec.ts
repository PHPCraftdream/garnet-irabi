/**
 * User — Personal profile-edit page: hidden ID, "My profile" link, and the
 * email-notification preferences panel (3 categories × frequency).
 */

import { test, expect, tn } from '../helpers/scoped-test';
import mysql from 'mysql2/promise';
import { DB } from '../helpers/db';

test.describe.configure({ mode: 'serial' });

const USER_LOGIN = 'testuser_setup_user@irabi.test';
let userId = 0;

test.describe('Profile-edit — hidden ID, My-profile link, notification prefs', () => {

    test.beforeAll(async () => {
        const conn = await mysql.createConnection(DB);
        try {
            const [rows] = await conn.execute<any[]>(
                `SELECT id FROM ${tn('accounts')} WHERE login = ?`, [USER_LOGIN],
            );
            if (rows.length > 0) userId = Number(rows[0].id);
        } finally { await conn.end(); }
    });

    test('ID is hidden and the My-profile link + notif panel are present', async ({ page }) => {
        test.skip(userId === 0, 'setup user not found');
        await page.goto('/system/~profile_edit', { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('[data-test-id="registration-form"]', { timeout: 15_000 });

        // The numeric account ID must never be rendered as an editable field.
        await expect(page.locator('[data-test-id="form-field-id"]')).toHaveCount(0);

        await expect(page.locator('[data-test-id="profile-my-profile-link"]')).toBeVisible();
        await expect(page.locator('[data-test-id="notif-prefs"]')).toBeVisible();
        await expect(page.locator('[data-test-id="notif-row-messages"]')).toBeVisible();
        await expect(page.locator('[data-test-id="notif-row-support"]')).toBeVisible();
        await expect(page.locator('[data-test-id="notif-row-bookings"]')).toBeVisible();
    });

    test('changing preferences persists to accounts_data', async ({ page }) => {
        test.skip(userId === 0, 'setup user not found');
        await page.goto('/system/~profile_edit', { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('[data-test-id="notif-prefs"]', { timeout: 15_000 });

        // messages → hourly (triggers a save)
        await Promise.all([
            page.waitForResponse(r => r.url().includes('/~saveNotifPrefs') && r.request().method() === 'POST' && r.status() === 200),
            page.locator('[data-test-id="notif-freq-messages"]').selectOption('hourly'),
        ]);

        // bookings → off (uncheck the enable checkbox, triggers another save)
        await Promise.all([
            page.waitForResponse(r => r.url().includes('/~saveNotifPrefs') && r.request().method() === 'POST' && r.status() === 200),
            page.locator('[data-test-id="notif-enable-bookings"]').uncheck(),
        ]);

        const conn = await mysql.createConnection(DB);
        try {
            const [rows] = await conn.execute<any[]>(
                `SELECT value FROM ${tn('accounts_data')} WHERE account_id = ? AND param = 'email_notif_prefs'`,
                [userId],
            );
            expect(rows.length).toBe(1);
            const prefs = JSON.parse(rows[0].value);
            expect(prefs.messages).toBe('hourly');
            expect(prefs.bookings).toBe('off');
            expect(prefs.support).toBe('each');
        } finally { await conn.end(); }
    });

    test('exit: cleanup', async () => {
        if (userId === 0) return;
        const conn = await mysql.createConnection(DB);
        try {
            await conn.execute(
                `DELETE FROM ${tn('accounts_data')} WHERE account_id = ? AND param = 'email_notif_prefs'`,
                [userId],
            );
        } finally { await conn.end(); }
    });
});
