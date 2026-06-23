/**
 * Invite tokens carry an account_type that pins the new account's `type`.
 *
 * Two flows in this spec:
 *   1. Token with account_type='expert' → registered account has type='expert' in DB.
 *   2. Token with account_type='user'   → registered account has type='user'   in DB.
 *
 * Setup uses a direct INSERT into invite_tokens (faster than UI), then
 * navigates the user through /first-step/token~XXXX, fills the profile
 * form, and asserts the DB state.
 */

import { test, expect, tn } from '../../helpers/scoped-test';
import type { Page, BrowserContext } from '@playwright/test';
import mysql from 'mysql2/promise';
import { newScopedContext } from '../../helpers/scoped-test';
import { DB } from '../../helpers/db';
import { tickPdConsent } from '../../helpers/auth';

test.describe.configure({ mode: 'serial' });

const WORKER = process.env.TEST_PARALLEL_INDEX ?? '0';
const EXPERT_EMAIL = `test_invite_expert_${WORKER}@irabi.test`;
const USER_EMAIL   = `test_invite_user_${WORKER}@irabi.test`;

async function insertToken(token: string, accountType: 'user' | 'expert'): Promise<number> {
    const conn = await mysql.createConnection(DB);
    try {
        const [res] = await conn.execute<any>(
            `INSERT INTO ${tn('invite_tokens')} (token, label, expires_at, max_uses, uses_left, is_disabled, created_at, created_by, account_type)
             VALUES (?, ?, NULL, 1, 1, 0, UNIX_TIMESTAMP(), NULL, ?)`,
            [token, `Test ${accountType}`, accountType],
        );
        return res.insertId;
    } finally {
        await conn.end();
    }
}

async function getAccountType(login: string): Promise<string | null> {
    const conn = await mysql.createConnection(DB);
    try {
        const [rows] = await conn.execute<any[]>(
            `SELECT type FROM ${tn('accounts')} WHERE login = ?`, [login],
        );
        return rows[0]?.type ?? null;
    } finally {
        await conn.end();
    }
}

async function cleanup() {
    const conn = await mysql.createConnection(DB);
    try {
        for (const email of [EXPERT_EMAIL, USER_EMAIL]) {
            await conn.execute(`DELETE FROM ${tn('mail_log')} WHERE recipient_email = ?`, [email]);
            await conn.execute(
                `DELETE ad FROM ${tn('accounts_data')} ad JOIN ${tn('accounts')} a ON a.id = ad.account_id WHERE a.login = ?`,
                [email],
            );
        }
        await conn.execute(`DELETE FROM ${tn('accounts')} WHERE login IN (?, ?)`, [EXPERT_EMAIL, USER_EMAIL]);
        await conn.execute(`DELETE FROM ${tn('invite_tokens')} WHERE label LIKE 'Test %'`);
    } finally {
        await conn.end();
    }
}

async function registerViaInvite(page: Page, token: string, email: string) {
    await page.goto(`/first-step/token~${token}`);
    const loginInput = page.locator('[data-test-id="auth-login-input"]');
    await expect(loginInput).toBeVisible({ timeout: 10000 });
    await loginInput.fill(email);
    await tickPdConsent(page);
    await page.locator('[data-test-id="auth-submit-btn"]').click();
    // Wait for the form to disappear (auto-login done)
    await page.waitForFunction(
        () => document.querySelector('[data-test-id="auth-submit-btn"]') === null,
        { timeout: 15000 },
    );
}

test.describe('Invite tokens — account_type pins registered account type', () => {
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

    test('expert invite → registered account has type=expert', async () => {
        const token = `pwtest_expert_${WORKER}_${Date.now().toString(36)}`;
        await insertToken(token, 'expert');

        await registerViaInvite(page, token, EXPERT_EMAIL);

        // initialAccountParams() fires inside RegMiddleware::processPost when
        // the user submits the registration form. Since the form requires
        // name/time_zone, simulate a submit via direct DB UPDATE then re-trigger
        // processPost by re-POSTing reg_user — OR just check that after the
        // user navigates / on a fresh account, the form is shown and type is
        // set by us (touchAccount path) on the next reg POST.
        //
        // Simpler: we POST reg_user with required fields straight through fetch.
        await page.goto(`/first-step/token~${token}`);
        await page.waitForLoadState('networkidle');
        await page.waitForFunction(() => !!(window as any).__GARNET_CSRF__, { timeout: 10000 });
        const submitResult = await page.evaluate(async () => {
            const csrf = (window as any).__GARNET_CSRF__ ?? '';
            const res = await fetch(window.location.href, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({
                    action: 'reg_user',
                    name: 'Expert Test',
                    time_zone: 'UTC',
                    CSRF_TOKEN: csrf,
                }),
            });
            return { status: res.status, body: await res.json() };
        });
        expect(submitResult.status).toBe(200);

        const type = await getAccountType(EXPERT_EMAIL);
        expect(type).toBe('expert');
    });

    test('user invite → registered account has type=user', async () => {
        // Need a fresh anonymous context — previous test left a session.
        await context.clearCookies();
        const token = `pwtest_user_${WORKER}_${Date.now().toString(36)}`;
        await insertToken(token, 'user');

        await registerViaInvite(page, token, USER_EMAIL);

        await page.goto(`/first-step/token~${token}`);
        await page.waitForLoadState('networkidle');
        await page.waitForFunction(() => !!(window as any).__GARNET_CSRF__, { timeout: 10000 });
        const submitResult = await page.evaluate(async () => {
            const csrf = (window as any).__GARNET_CSRF__ ?? '';
            const res = await fetch(window.location.href, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({
                    action: 'reg_user',
                    name: 'User Test',
                    time_zone: 'UTC',
                    CSRF_TOKEN: csrf,
                }),
            });
            return { status: res.status, body: await res.json() };
        });
        expect(submitResult.status).toBe(200);

        const type = await getAccountType(USER_EMAIL);
        expect(type).toBe('user');
    });
});
