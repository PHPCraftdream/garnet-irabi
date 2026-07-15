/**
 * F-PRIV-01 regression: preview endpoints must not leak the identity of
 * disabled accounts, and must never fall back to login/email as a display name.
 *
 * Covers both surfaces cited in the audit:
 *   - /users/~preview            (UsersController::post__preview)
 *   - /expert/~userPreview       (ExpertSlotsService::userPreview)
 *
 * Invariants asserted:
 *   1. A disabled account previews as the "User #{id} disabled" placeholder,
 *      with a null avatar and no expertProfile — never its real name/photo/bio.
 *   2. When an account's display name is empty, the response returns the
 *      "#{id}" placeholder, NOT the account's login/email.
 */
import { test, expect, tn } from '../helpers/scoped-test';
import { newScopedContext } from '../helpers/scoped-test';
import { DB, withConnection } from '../helpers/db';
import { roleLogin } from '../helpers/role-login';
import mysql from 'mysql2/promise';
import type { BrowserContext, Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

const BASE_URL = process.env.BASE_URL || 'http://localhost:8001';

let userContext: BrowserContext;
let expertContext: BrowserContext;
let userPage: Page;
let expertPage: Page;

let EXPERT_ID = 0;
let USER_ID = 0;
let expertRealName = '';
let userRealName = '';
let userLogin = '';

async function devLogin(context: BrowserContext, role: string): Promise<Page> {
    const page = await context.newPage();
    await page.goto(`${BASE_URL}/`);
    await roleLogin(page, role);
    await page.goto(`${BASE_URL}/`);
    return page;
}

/** POST a preview endpoint as JSON, carrying the page's CSRF token. */
async function apiPreview(page: Page, url: string, userId: number): Promise<{ status: number; body: any }> {
    return page.evaluate(async ({ url, userId }) => {
        const w = window as any;
        const res = await fetch(url, {
            method: 'POST',
            headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, CSRF_TOKEN: w.__GARNET_CSRF__ || '' }),
        });
        const body = await res.json().catch(() => null);
        return { status: res.status, body };
    }, { url, userId });
}

async function setDisabled(accountId: number, disabled: boolean): Promise<void> {
    await withConnection(async (c) => {
        await c.execute(
            `INSERT INTO ${tn('accounts_data')} (account_id, param, value)
             VALUES (?, 'IS_DISABLED', ?)
             ON DUPLICATE KEY UPDATE value = VALUES(value)`,
            [accountId, disabled ? '1' : '0'],
        );
    });
}

async function setAccountName(accountId: number, name: string): Promise<void> {
    await withConnection(async (c) => {
        await c.execute(`UPDATE ${tn('accounts')} SET name = ? WHERE id = ?`, [name, accountId]);
    });
}

/** Placeholder for a disabled account: contains "#{id}" and the localized word. */
function looksLikeDisabledPlaceholder(name: string, id: number): boolean {
    return name.includes(`#${id}`) && (/disabled/i.test(name) || name.includes('отключён'));
}

test.describe('F-PRIV-01: preview endpoints anonymise disabled accounts', () => {

    test.beforeAll(async ({ browser }) => {
        userContext = await newScopedContext(browser);
        expertContext = await newScopedContext(browser);

        userPage = await devLogin(userContext, 'user');
        expertPage = await devLogin(expertContext, 'expert');

        const conn = await mysql.createConnection(DB);
        try {
            const [eRows] = await conn.execute<any[]>(
                `SELECT id, name FROM ${tn('accounts')} WHERE login = 'expert1@dev.test'`,
            );
            const [uRows] = await conn.execute<any[]>(
                `SELECT id, name, login FROM ${tn('accounts')} WHERE login = 'user1@dev.test'`,
            );
            EXPERT_ID = eRows[0]?.id ?? 0;
            expertRealName = eRows[0]?.name ?? '';
            USER_ID = uRows[0]?.id ?? 0;
            userRealName = uRows[0]?.name ?? '';
            userLogin = uRows[0]?.login ?? '';
        } finally {
            await conn.end();
        }

        // Ensure clean enabled state before we start.
        if (EXPERT_ID) await setDisabled(EXPERT_ID, false);
        if (USER_ID) await setDisabled(USER_ID, false);
    });

    test.afterAll(async () => {
        // Restore any mutated state.
        if (EXPERT_ID) await setDisabled(EXPERT_ID, false);
        if (USER_ID) await setDisabled(USER_ID, false);
        if (USER_ID && userRealName) await setAccountName(USER_ID, userRealName);
        await userContext?.close().catch(() => {});
        await expertContext?.close().catch(() => {});
    });

    // ── /users/~preview ─────────────────────────────────────────────

    test('baseline: enabled expert previews with real name', async () => {
        expect(EXPERT_ID).toBeGreaterThan(0);
        const r = await apiPreview(userPage, '/users/~preview', EXPERT_ID);
        expect(r.status).toBe(200);
        expect(r.body?.user?.name).toBe(expertRealName);
        expect(looksLikeDisabledPlaceholder(String(r.body?.user?.name ?? ''), EXPERT_ID)).toBe(false);
    });

    test('disabled expert previews as placeholder — no name/avatar/profile leak', async () => {
        await setDisabled(EXPERT_ID, true);
        try {
            const r = await apiPreview(userPage, '/users/~preview', EXPERT_ID);
            expect(r.status).toBe(200);
            const name = String(r.body?.user?.name ?? '');
            expect(name).not.toBe(expertRealName);
            expect(looksLikeDisabledPlaceholder(name, EXPERT_ID)).toBe(true);
            // Identity fully suppressed: no avatar, no expert profile.
            expect(r.body?.user?.avatar ?? null).toBeNull();
            expect(r.body?.user?.expertProfile ?? null).toBeNull();
        } finally {
            await setDisabled(EXPERT_ID, false);
        }
    });

    // ── /expert/~userPreview ────────────────────────────────────────

    test('disabled user previews as placeholder via expert endpoint', async () => {
        expect(USER_ID).toBeGreaterThan(0);
        await setDisabled(USER_ID, true);
        try {
            const r = await apiPreview(expertPage, '/expert/~userPreview', USER_ID);
            expect(r.status).toBe(200);
            const name = String(r.body?.user?.name ?? '');
            expect(looksLikeDisabledPlaceholder(name, USER_ID)).toBe(true);
            expect(name).not.toContain('@'); // never leak login/email
        } finally {
            await setDisabled(USER_ID, false);
        }
    });

    test('empty-name user does NOT fall back to login/email', async () => {
        // Force an empty display name — the old code returned `name ?: login`,
        // which would leak the login handle. The fix returns "#{id}" instead.
        await setAccountName(USER_ID, '');
        try {
            const r = await apiPreview(expertPage, '/expert/~userPreview', USER_ID);
            expect(r.status).toBe(200);
            const name = String(r.body?.user?.name ?? '');
            expect(name).toBe(`#${USER_ID}`);
            expect(name).not.toBe(userLogin);
            expect(name).not.toContain('@');
        } finally {
            await setAccountName(USER_ID, userRealName);
        }
    });
});
