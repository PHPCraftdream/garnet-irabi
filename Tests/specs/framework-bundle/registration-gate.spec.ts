/**
 * Registration gate — when registrations_enabled=0 in app.ini:
 *
 *   1. Unknown email → 403 "регистрация отключена"
 *   2. Known/existing email → 200 (re-login allowed)
 *   3. Re-enable → unknown email → 200 (code sent)
 *
 * Toggles registrations_enabled directly in ConfigDev/app.ini (PHP reads
 * the file on every request, no caching). Restores to 1 in afterAll.
 */

import { test, expect, tn } from '../../helpers/scoped-test';
import type { Page, BrowserContext } from '@playwright/test';
import mysql from 'mysql2/promise';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { newScopedContext } from '../../helpers/scoped-test';
import { DB } from '../../helpers/db';
import { tickPdConsent } from '../../helpers/auth';

test.describe.configure({ mode: 'serial' });

// The harness lives inside the app at `<app>/Tests/specs/framework-bundle/`,
// so the app root is three levels up. PW_APP_DIR (set by playwright.config.ts)
// is the authoritative app dir; fall back to the relative walk.
const APP_INI = path.resolve(
    process.env.PW_APP_DIR ?? path.resolve(__dirname, '..', '..', '..'),
    'WorkDir', 'ConfigDev', 'app.ini',
);

// Non-.test emails so they go through the real auth flow (gate check),
// NOT the dev auto-login bypass that .test emails get.
const EXISTING_EMAIL = `test_gate_existing_${process.env.TEST_PARALLEL_INDEX ?? '0'}@example.com`;
const UNKNOWN_EMAIL  = `test_gate_unknown_${process.env.TEST_PARALLEL_INDEX ?? '0'}@example.com`;

function setRegistrationsEnabled(enabled: boolean) {
    let text = fs.readFileSync(APP_INI, 'utf-8');
    text = text.replace(
        /^registrations_enabled\s*=\s*\d+/m,
        `registrations_enabled = ${enabled ? 1 : 0}`,
    );
    fs.writeFileSync(APP_INI, text, 'utf-8');
}

async function ensureAccount(login: string) {
    const conn = await mysql.createConnection(DB);
    try {
        const [rows] = await conn.execute<any[]>(
            `SELECT id FROM ${tn('accounts')} WHERE login = ?`, [login],
        );
        if (rows.length === 0) {
            await conn.execute(
                `INSERT INTO ${tn('accounts')} (login, login_type) VALUES (?, 'email')`,
                [login],
            );
        }
    } finally {
        await conn.end();
    }
}

async function cleanup() {
    const conn = await mysql.createConnection(DB);
    try {
        await conn.execute(`DELETE FROM ${tn('mail_log')} WHERE recipient_email IN (?, ?)`,
            [EXISTING_EMAIL, UNKNOWN_EMAIL]);
        for (const email of [EXISTING_EMAIL, UNKNOWN_EMAIL]) {
            await conn.execute(
                `DELETE ad FROM ${tn('accounts_data')} ad JOIN ${tn('accounts')} a ON a.id = ad.account_id WHERE a.login = ?`,
                [email],
            );
        }
        await conn.execute(`DELETE FROM ${tn('accounts')} WHERE login IN (?, ?)`,
            [EXISTING_EMAIL, UNKNOWN_EMAIL]);
    } finally {
        await conn.end();
    }
}

/** POST auth_email via fetch, including CSRF token. */
async function postAuthEmail(page: Page, email: string) {
    return page.evaluate(async (email: string) => {
        const csrf = (window as any).__GARNET_CSRF__ ?? '';
        const payload: Record<string, string> = { auth_email: email };
        if (csrf) payload.CSRF_TOKEN = csrf;
        const res = await fetch(window.location.href, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify(payload),
        });
        return { status: res.status, body: await res.json() };
    }, email);
}

test.describe('Registration gate — registrations_enabled toggle', () => {
    let page: Page;
    let context: BrowserContext;

    // This spec flips `registrations_enabled` in the LOCAL ConfigDev/app.ini.
    // On a remote (PW_PROD) run the server reads ITS OWN app.ini on the box, so
    // a local edit has no effect there — the gate can't be exercised remotely.
    // Covered by the local suite; skip against an external box.
    test.skip(process.env.PW_PROD === '1', 'local-only: toggles local app.ini, no effect on the remote server');

    test.beforeAll(async ({ browser }) => {
        await cleanup();
        await ensureAccount(EXISTING_EMAIL);
        context = await newScopedContext(browser, {
            baseURL: process.env.BASE_URL || 'http://localhost:8001',
        });
        page = await context.newPage();
        await page.goto('/balance');
        // 152-ФЗ consent gate: CSRF is not minted until the user ticks the PD
        // consent (which fires `start-session`). The manual fetch in
        // postAuthEmail needs the token, so drive the consent flow before any
        // assertions run.
        await tickPdConsent(page);
        await page.waitForFunction(
            () => !!(window as any).__GARNET_CSRF__,
            { timeout: 10000 },
        );
    });

    test.afterAll(async () => {
        setRegistrationsEnabled(true);
        await cleanup();
        await context.close();
    });

    test('with registrations OFF: unknown email is blocked with 403', async () => {
        setRegistrationsEnabled(false);

        const result = await postAuthEmail(page, UNKNOWN_EMAIL);
        expect(result.status).toBe(403);
        expect(result.body.message).toBeTruthy();
        // Message should mention registration disabled
        expect(typeof result.body.message).toBe('string');
    });

    test('with registrations OFF: existing email is allowed (re-login)', async () => {
        // Still disabled from previous test
        const result = await postAuthEmail(page, EXISTING_EMAIL);
        expect(result.status).toBe(200);
        expect(result.body.message).toBeTruthy();
        expect(result.body.codeLifeTime).toBeGreaterThan(0);
    });

    test('with registrations ON: unknown email is allowed', async () => {
        setRegistrationsEnabled(true);

        const result = await postAuthEmail(page, UNKNOWN_EMAIL);
        expect(result.status).toBe(200);
        expect(result.body.message).toBeTruthy();
    });
});
