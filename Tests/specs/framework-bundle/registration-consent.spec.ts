/**
 * Registration consent — the 152-ФЗ consent checkboxes must live INSIDE the
 * form, and submitting without ticking the (required) personal-data consent
 * must be blocked with a visible error (no POST, stays on the form).
 *
 * Mirrors registration-form.spec.ts: a fresh `.test` account auto-logs in and
 * is redirected to the registration form.
 */
import { test, expect, tn } from '../../helpers/scoped-test';
import type { Page, BrowserContext } from '@playwright/test';
import mysql from 'mysql2/promise';
import { newScopedContext } from '../../helpers/scoped-test';
import { DB } from '../../helpers/db';

test.describe.configure({ mode: 'serial' });

const TEST_EMAIL = `test_regconsent_${process.env.TEST_PARALLEL_INDEX ?? '0'}@irabi.test`;

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

test.describe('Registration consent — inside form + submit gating', () => {
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

    test('auto-login with .test email reaches the registration form', async () => {
        await page.goto('/balance');
        const loginInput = page.locator('[data-test-id="auth-login-input"]');
        await expect(loginInput).toBeVisible({ timeout: 10000 });
        await loginInput.fill(TEST_EMAIL);

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

        await page.goto('/balance');
        await expect(page.locator('[data-test-id="registration-form"]')).toBeVisible({ timeout: 10000 });
    });

    test('consent block is rendered INSIDE the form', async () => {
        const inside = await page.evaluate(() => {
            const form = document.querySelector('[data-test-id="registration-form"] form');
            const block = document.querySelector('[data-test-id="reg-consent-block"]');
            return !!(form && block && form.contains(block));
        });
        expect(inside).toBe(true);
    });

    test('submit without consent is blocked and shows an error (no navigation)', async () => {
        // No POST must be issued when consent is missing.
        let posted = false;
        const onReq = (r: any) => { if (r.method() === 'POST') posted = true; };
        page.on('request', onReq);

        await page.locator('[data-test-id="form-save-btn"]').click();

        const err = page.locator('[data-test-id="reg-consent-error"]');
        await expect(err).toBeVisible({ timeout: 4000 });
        await expect(err).toHaveText(/.+/);

        // Still on the registration form (submission was blocked).
        await expect(page.locator('[data-test-id="registration-form"]')).toBeVisible();

        await page.waitForTimeout(300);
        page.off('request', onReq);
        expect(posted).toBe(false);
    });

    test('ticking the consent clears the error', async () => {
        await page.locator('[data-test-id="reg-consent-pd"]').check();
        await expect(page.locator('[data-test-id="reg-consent-error"]')).toHaveCount(0);
    });
});
