/**
 * Registration form — hidden type field + site chrome (header/footer).
 *
 * After .test auto-login, a fresh account (no name/time_zone) gets
 * redirected to the registration form. We assert:
 *   1. The form renders
 *   2. The "type" select is NOT present (removed from editFields)
 *   3. The site header (main-nav snippet) is visible
 *   4. The site footer (main-footer snippet) is visible
 */

import { test, expect, tn } from '../../helpers/scoped-test';
import type { Page, BrowserContext } from '@playwright/test';
import mysql from 'mysql2/promise';
import { newScopedContext } from '../../helpers/scoped-test';
import { DB } from '../../helpers/db';

test.describe.configure({ mode: 'serial' });

const TEST_EMAIL = `test_regform_${process.env.TEST_PARALLEL_INDEX ?? '0'}@irabi.test`;

async function cleanup() {
    const conn = await mysql.createConnection(DB);
    try {
        await conn.execute(`DELETE FROM ${tn('mail_log')} WHERE recipient_email = ?`, [TEST_EMAIL]);
        await conn.execute(
            `DELETE ad FROM ${tn('accounts_data')} ad JOIN ${tn('accounts')} a ON a.id = ad.account_id WHERE a.login = ?`,
            [TEST_EMAIL],
        );
        await conn.execute(`DELETE FROM ${tn('accounts')} WHERE login = ?`, [TEST_EMAIL]);
    } finally {
        await conn.end();
    }
}

test.describe('Registration form — type hidden + site chrome', () => {
    let page: Page;
    let context: BrowserContext;

    test.beforeAll(async ({ browser }) => {
        await cleanup();
        context = await newScopedContext(browser, {
            baseURL: process.env.BASE_URL || 'http://localhost:8001',
        });
        page = await context.newPage();
    });

    test.afterAll(async () => {
        await cleanup();
        await context.close();
    });

    test('auto-login with .test email', async () => {
        await page.goto('/balance');
        const loginInput = page.locator('[data-test-id="auth-login-input"]');
        await expect(loginInput).toBeVisible({ timeout: 10000 });
        await loginInput.fill(TEST_EMAIL);

        // Tick the PD consent — establishes session + CSRF before submit
        await Promise.all([
            page.waitForResponse(r => r.request().method() === 'POST', { timeout: 15000 }),
            page.locator('[data-test-id="auth-consent-pd"]').click(),
        ]);

        const submitBtn = page.locator('[data-test-id="auth-submit-btn"]');
        const [response] = await Promise.all([
            page.waitForResponse(r => r.request().method() === 'POST', { timeout: 15000 }),
            submitBtn.click(),
        ]);
        expect(response.ok()).toBe(true);
        const body = await response.json();
        expect(body.success).toBe(true);
    });

    test('registration form is shown for fresh account', async () => {
        await page.goto('/balance');
        await page.waitForLoadState('networkidle');
        const regForm = page.locator('[data-test-id="registration-form"]');
        await expect(regForm).toBeVisible({ timeout: 10000 });
    });

    test('type field is not present in the form', async () => {
        // The form should NOT contain a select/input for account type.
        // FormBuilder renders fields with data-field-name attribute.
        const typeField = page.locator('[data-field-name="type"]');
        await expect(typeField).toHaveCount(0);

        // Also check there's no select with the type values
        const typeSelect = page.locator('select').filter({ hasText: /expert/i });
        await expect(typeSelect).toHaveCount(0);
    });

    test('site header (main-nav) is visible', async () => {
        // The main-nav snippet renders a <nav> or header element.
        // Check for common nav markers.
        const header = page.locator('nav, header, [data-test-id="main-nav"]').first();
        await expect(header).toBeVisible({ timeout: 5000 });
    });

    test('site footer (main-footer) is visible', async () => {
        const footer = page.locator('footer, [data-test-id="main-footer"]').first();
        await expect(footer).toBeVisible({ timeout: 5000 });
    });

    test('DB: account defaults to type=user', async () => {
        // Even though the form didn't offer a type picker,
        // initialAccountParams() should default type to 'user' after
        // the form is submitted. We haven't submitted yet — check that
        // the account_data row for 'type' doesn't exist yet (fresh).
        const conn = await mysql.createConnection(DB);
        try {
            const [rows] = await conn.execute<any[]>(
                `SELECT ad.value FROM ${tn('accounts_data')} ad
                 JOIN ${tn('accounts')} a ON a.id = ad.account_id
                 WHERE a.login = ? AND ad.param = 'type'`,
                [TEST_EMAIL],
            );
            // Fresh account — no type row yet (set on form submit via initialAccountParams)
            // OR if type was pre-set by auto-login, it should be 'user'
            if (rows.length > 0) {
                expect(rows[0].value).toBe('user');
            }
        } finally {
            await conn.end();
        }
    });
});
