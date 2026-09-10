/**
 * D-137: without `public_catalog_enabled` a logged-out visitor hitting the
 * catalog (/slots) or an expert card (/expert/id~N) is silently swapped to
 * the login form. Owner's decision: guests stay blocked by default, but the
 * behavior must be a raw ini switch.
 *
 *   1. Flag OFF (default): guest sees the login form on both routes —
 *      unchanged behavior, regression guard.
 *   2. Flag ON: guest sees the actual catalog / expert card, no login form.
 *      Booking still requires auth (server-side gate, not just UI).
 *
 * Toggles `public_catalog_enabled` directly in ConfigDev/app.ini (PHP reads
 * the file on every request, no caching). Restores to 0 in afterAll.
 */

import { test, expect, tn } from '../../helpers/scoped-test';
import type { Page, BrowserContext } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { newScopedContext } from '../../helpers/scoped-test';
import { withConnection } from '../../helpers/db';

test.describe.configure({ mode: 'serial' });

const APP_INI = path.resolve(
    process.env.PW_APP_DIR ?? path.resolve(__dirname, '..', '..', '..'),
    'WorkDir', 'ConfigDev', 'app.ini',
);

function setPublicCatalogEnabled(enabled: boolean) {
    let text = fs.readFileSync(APP_INI, 'utf-8');
    text = text.replace(
        /^public_catalog_enabled\s*=\s*\d+/m,
        `public_catalog_enabled = ${enabled ? 1 : 0}`,
    );
    fs.writeFileSync(APP_INI, text, 'utf-8');
}

async function getExpertId(): Promise<number> {
    return withConnection(async (c) => {
        const [rows] = await c.execute<any[]>(`SELECT id FROM ${tn('accounts')} WHERE login = 'expert1@dev.test'`);
        return rows[0]?.id ?? 0;
    });
}

test.describe('Public catalog gate — public_catalog_enabled toggle', () => {
    let expertId = 0;
    let ctx: BrowserContext;
    let page: Page;

    // This spec flips `public_catalog_enabled` in the LOCAL ConfigDev/app.ini.
    // On a remote (PW_PROD) run the server reads ITS OWN app.ini on the box, so
    // a local edit has no effect there — the gate can't be exercised remotely.
    test.skip(process.env.PW_PROD === '1', 'local-only: toggles local app.ini, no effect on the remote server');

    test.beforeAll(async ({ browser }) => {
        expertId = await getExpertId();
        expect(expertId).toBeGreaterThan(0);

        // A fresh, logged-out context — no auth cookies at all, a genuine guest.
        ctx = await newScopedContext(browser);
        page = await ctx.newPage();
    });

    test.afterAll(async () => {
        setPublicCatalogEnabled(false);
        await ctx?.close().catch(() => {});
    });

    test('flag OFF (default): guest hitting /slots sees the login form', async () => {
        setPublicCatalogEnabled(false);

        await page.goto('/slots');
        await expect(page.locator('[data-test-id="auth-title"]')).toBeVisible({ timeout: 8000 });
        await expect(page.locator('[data-test-id="slots-calendar"]')).toHaveCount(0);
    });

    test('flag OFF (default): guest hitting an expert card sees the login form', async () => {
        await page.goto(`/expert/id~${expertId}`);
        await expect(page.locator('[data-test-id="auth-title"]')).toBeVisible({ timeout: 8000 });
    });

    test('flag ON: guest sees the catalog, no login form', async () => {
        setPublicCatalogEnabled(true);

        await page.goto('/slots');
        await expect(page.locator('[data-test-id="auth-title"]')).toHaveCount(0);
        await expect(page.locator('[data-test-id="slots-calendar"]')).toBeVisible({ timeout: 8000 });
    });

    test('flag ON: guest sees the expert card, no login form', async () => {
        await page.goto(`/expert/id~${expertId}`);
        await expect(page.locator('[data-test-id="auth-title"]')).toHaveCount(0);
        await expect(page.locator('[data-test-id="expert-profile"]')).toBeVisible({ timeout: 8000 });
    });

    test('flag ON: booking still requires auth — server-side, not just hidden UI', async () => {
        const result = await page.evaluate(async () => {
            const res = await fetch('/slots/~bookData', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ slot_id: 1 }),
            });
            return { status: res.status };
        });
        // 401 = the controller itself rejects (Account::fromSession() null);
        // 403 = blocked even earlier by CSRF/origin. Either way the request
        // never reaches the business logic that would actually book a slot.
        expect([401, 403]).toContain(result.status);
    });

    test('flag ON: a real login from the public catalog still works', async () => {
        // authOptional() only skips the login SWAP for a plain GET with no
        // in-flight auth action. Posting `auth_email` from the same page must
        // still route through the normal login machinery — a guest hasn't
        // lost the ability to sign in from a page that no longer forces it.
        const result = await page.evaluate(async () => {
            const res = await fetch(window.location.href, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({ auth_email: 'nobody-in-particular@example.com' }),
            });
            return { status: res.status };
        });
        // Any non-guest-swap status proves the request reached the auth
        // machinery instead of being silently ignored (200 = code sent,
        // 403 = registrations disabled — both are "handled", not "skipped").
        expect([200, 403]).toContain(result.status);
    });
});
