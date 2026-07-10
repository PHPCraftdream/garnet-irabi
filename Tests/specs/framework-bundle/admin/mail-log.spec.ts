/**
 * Admin — Mail Log page tests
 *
 * Covers:
 * - Page renders with correct structure (tab, columns, search)
 * - Empty state message
 * - Inserted test data appears as rows
 * - Search filters and clears correctly
 * - Sort by status column
 * - Status badge texts render
 *
 * Uses DevLogin (not TOTP) for authentication.
 * Selectors use data-test-id — never text content (locale-independent).
 */

import { test, expect, tn } from '../../../helpers/scoped-test';
import type { Page, BrowserContext } from '@playwright/test';
import mysql from 'mysql2/promise';

import { newScopedContext } from '../../../helpers/scoped-test';
import { roleLogin } from '../../../helpers/role-login';
import { DB } from '../../../helpers/db';
test.describe.configure({ mode: 'serial' });

// ── DB helpers ───────────────────────────────────────────────────────────────

async function dbQuery(sql: string, params: any[] = []) {
    const conn = await mysql.createConnection(DB);
    try {
        const [rows] = await conn.execute<any[]>(sql, params);
        return rows;
    } finally { await conn.end(); }
}

async function dbExec(sql: string, params: any[] = []) {
    const conn = await mysql.createConnection(DB);
    try {
        await conn.execute(sql, params);
    } finally { await conn.end(); }
}

// ── Auth helper (DevLogin, not TOTP) ─────────────────────────────────────────

async function loginAsAdmin(page: Page) {
    // roleLogin handles both worlds: dev → /dev-login POST, prod → real
    // `.test` email auto-login (the dev-login floating panel doesn't exist on
    // the server, so the old `dev-login-admin` button wait timed out there).
    await roleLogin(page, 'admin');
}

// ── Page helper ──────────────────────────────────────────────────────────────

// Mail Log moved into /admin/logs/?tab=mails after the unified Logs viewer landed.
// /admin/mail-log/ still works (it 302-redirects), but pointing tests at the new
// canonical URL avoids redirect chains.
const MAIL_LOG_URL = '/admin/logs/?tab=mails';
const ROW_SELECTOR = 'tbody tr:not(:has(td[colspan]))';
const TEST_EMAIL_DOMAIN = '@test-mail-log.test';

async function openMailLog(page: Page) {
    await page.goto(MAIL_LOG_URL);
    // Mails tab loads lazily — wait for the section to mount.
    await page.locator('[data-test-id="tabnav-btn-mails"]').waitFor({ state: 'visible', timeout: 10000 });
    if (await page.locator('[data-test-id="tabnav-btn-mails"]').getAttribute('aria-selected') !== 'true') {
        await page.locator('[data-test-id="tabnav-btn-mails"]').click();
    }
    await page.waitForSelector('tbody', { timeout: 10000 });
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe('Admin Mail Log', () => {
    let page: Page;
    let context: BrowserContext;

    test.beforeAll(async ({ browser }) => {
        // Clean up any leftover test data before starting
        await dbExec(`DELETE FROM ${tn('mail_log')} WHERE recipient_email LIKE ?`, [`%${TEST_EMAIL_DOMAIN}`]);

        context = await newScopedContext(browser);
        page = await context.newPage();
        await loginAsAdmin(page);
    });

    test.afterAll(async () => {
        await dbExec(`DELETE FROM ${tn('mail_log')} WHERE recipient_email LIKE ?`, [`%${TEST_EMAIL_DOMAIN}`]);
        await context.close();
    });

    // ── 1. Page renders ──────────────────────────────────────────────────────

    test('page renders with mails tab active, columns, search, and sidebar Logs item', async () => {
        await openMailLog(page);

        // Mails tab is selected within the unified Logs viewer
        const mailsTab = page.locator('[data-test-id="tabnav-btn-mails"]');
        await expect(mailsTab).toHaveAttribute('aria-selected', 'true', { timeout: 5000 });

        // 6 data columns — inline expand chevron was replaced by row-click modal.
        const headers = page.locator('thead th');
        await expect(headers).toHaveCount(6, { timeout: 5000 });

        // Search input visible
        const search = page.locator('[data-test-id="admin-grid-search"]');
        await expect(search).toBeVisible({ timeout: 5000 });

        // Mails-tab-specific filter widgets are present on the page.
        await Promise.all([
        	expect(page.locator('[data-test-id="mails-recipient-filter"]')).toBeVisible({ timeout: 5000 }),
        	expect(page.locator('[data-test-id="mails-type-filter"]')).toBeVisible({ timeout: 5000 }),
        	expect(page.locator('[data-test-id="mails-status-filter"]')).toBeVisible({ timeout: 5000 }),
        	expect(page.locator('[data-test-id="mails-subject-filter"]')).toBeVisible({ timeout: 5000 }),
        ]);

        // Sidebar now has a single "Логи" item (mail-log was folded into it).
        // Desktop sidebar item — distinct from the mobile `mobile-sidebar-логи`.
        // (Don't over-scope to the aside wrapper; its responsive classes changed.)
        const sidebarItem = page.locator('[data-test-id="sidebar-логи"]').first();
        await Promise.all([
        	expect(sidebarItem).toBeAttached({ timeout: 5000 }),
        	expect(sidebarItem).toHaveClass(/text-accent|nav-side-link-active/, { timeout: 5000 }),
        ]);
    });

    // ── 2. Empty state ───────────────────────────────────────────────────────

    test('shows empty state when no data', async () => {
        await openMailLog(page);

        // The dev DB carries unrelated mail-log rows (auth codes from setup,
        // earlier test runs). Apply a search that no real recipient matches
        // so we exercise the empty-state cell deterministically.
        const search = page.locator('[data-test-id="admin-grid-search"]');
        await expect(search).toBeVisible({ timeout: 5000 });
        await search.fill('zzz-no-match-' + Date.now());

        const tbody = page.locator('tbody');
        await expect(tbody).toBeVisible({ timeout: 5000 });

        const emptyCell = page.locator('tbody td[colspan]');
        await expect(emptyCell).toBeVisible({ timeout: 5000 });

        // Reset the search so subsequent tests start from a clean filter.
        await search.fill('');
    });

    // ── 3. Insert test data + verify rows ────────────────────────────────────

    test('inserted test data appears as rows', async () => {
        // Insert 3 test records
        await dbExec(
            `INSERT INTO ${tn('mail_log')} (account_id, recipient_email, mail_type, subject, status, created_at)
             VALUES (NULL, ?, 'auth_code', 'Auth code', 'sent', UNIX_TIMESTAMP()),
                    (NULL, ?, 'general', 'Welcome', 'skipped_dev', UNIX_TIMESTAMP()-100),
                    (NULL, ?, 'auth_code', 'Auth code', 'failed', UNIX_TIMESTAMP()-200)`,
            [
                `user1${TEST_EMAIL_DOMAIN}`,
                `user2${TEST_EMAIL_DOMAIN}`,
                `user3${TEST_EMAIL_DOMAIN}`,
            ]
        );

        // Refresh page and narrow the grid to only our test rows — the dev
        // DB carries unrelated auth-code emails that would otherwise inflate
        // the count and break the strict toHaveCount(3) assertion.
        await openMailLog(page);
        const search = page.locator('[data-test-id="admin-grid-search"]');
        await expect(search).toBeVisible({ timeout: 5000 });
        await search.fill(TEST_EMAIL_DOMAIN);

        const rows = page.locator(ROW_SELECTOR);
        await expect(rows).toHaveCount(3, { timeout: 10000 });

        await search.fill('');
    });

    // ── 4. Search filters ────────────────────────────────────────────────────

    test('recipient combobox filters rows independently of admin-grid-search', async () => {
        // Insert a record bound to a real account so the recipient combobox has a non-empty option.
        // Pick the seeded admin account — guaranteed to exist after global setup.
        const conn = await mysql.createConnection(DB);
        let adminAccountId = 0;
        try {
            const [rows] = await conn.execute<any[]>(
                `SELECT id FROM ${tn('accounts')} WHERE login = ?`, ['testuser_setup_admin@irabi.test']
            );
            adminAccountId = rows[0]?.id ?? 0;
        } finally { await conn.end(); }
        if (adminAccountId === 0) test.skip();

        await dbExec(
            `INSERT INTO ${tn('mail_log')} (account_id, recipient_email, mail_type, subject, status, created_at)
             VALUES (?, ?, 'auth_code', 'Recipient combobox test', 'sent', UNIX_TIMESTAMP())`,
            [adminAccountId, `combobox-test${TEST_EMAIL_DOMAIN}`]
        );

        await openMailLog(page);

        const rows = page.locator(ROW_SELECTOR);
        const totalBefore = await rows.count();
        expect(totalBefore).toBeGreaterThanOrEqual(1);

        // Open Combobox trigger
        const trigger = page.locator('[data-test-id="mails-recipient-filter"]');
        await expect(trigger).toBeVisible({ timeout: 5000 });
        await trigger.click();

        // Combobox renders one option-button per unique recipient. Pick the seeded admin id.
        const option = page.locator(`[data-test-id="mails-recipient-filter-option-${adminAccountId}"]`);
        await expect(option).toBeVisible({ timeout: 5000 });
        await option.click();

        // Filter narrowed list — only the row(s) belonging to that recipient should remain
        await expect.poll(async () => rows.count(), { timeout: 5000, intervals: [50, 150, 400] }).toBeLessThan(totalBefore);
        const filteredCount = await rows.count();
        expect(filteredCount).toBeGreaterThanOrEqual(1);

        // Clean up the inserted row
        await dbExec(`DELETE FROM ${tn('mail_log')} WHERE recipient_email = ?`, [`combobox-test${TEST_EMAIL_DOMAIN}`]);
    });

    test('search filters rows and clearing restores all', async () => {
        await openMailLog(page);

        const search = page.locator('[data-test-id="admin-grid-search"]');
        const rows = page.locator(ROW_SELECTOR);

        // Filter to only our test rows so the dev-DB clutter doesn't break
        // strict count assertions below.
        await search.fill(`user1${TEST_EMAIL_DOMAIN}`);
        await expect(rows).toHaveCount(1, { timeout: 5000 });

        const rowText = await rows.first().textContent();
        expect(rowText).toContain(`user1${TEST_EMAIL_DOMAIN}`);

        // Switch the search to the shared test-domain — should restore all
        // 3 inserted test rows (clearing entirely would also surface dev data).
        await search.fill(TEST_EMAIL_DOMAIN);
        await expect(rows).toHaveCount(3, { timeout: 5000 });

        await search.fill('');
    });

    // ── 5. Sort by status ────────────────────────────────────────────────────

    test('sort by status changes row order', async () => {
        await openMailLog(page);

        // Narrow the grid to our 3 inserted test rows so sorting is observable
        // — without the filter, dev-DB rows dominate and order is dictated by
        // those instead.
        const search = page.locator('[data-test-id="admin-grid-search"]');
        await search.fill(TEST_EMAIL_DOMAIN);

        const rows = page.locator(ROW_SELECTOR);
        await expect(rows).toHaveCount(3, { timeout: 5000 });

        // Get initial order of status texts
        const getStatusTexts = async () => {
            const count = await rows.count();
            const texts: string[] = [];
            for (let i = 0; i < count; i++) {
                const row = rows.nth(i);
                const statusCell = row.locator('td').nth(4); // status is 5th column (0-indexed: 4)
                texts.push((await statusCell.textContent())?.trim() ?? '');
            }
            return texts;
        };

        const initialOrder = await getStatusTexts();

        // Click sort-col-status
        const sortBtn = page.locator('[data-test-id="sort-col-status"]');
        await expect(sortBtn).toBeVisible({ timeout: 5000 });
        await sortBtn.click();

        const sortedAsc = await getStatusTexts();

        // Click again for descending
        await sortBtn.click();

        const sortedDesc = await getStatusTexts();

        // At least one sort direction should differ from the other
        const ascStr = sortedAsc.join(',');
        const descStr = sortedDesc.join(',');
        expect(ascStr).not.toBe(descStr);
    });

    // ── 6. Status badges render ──────────────────────────────────────────────

    test('status badges render with correct texts', async () => {
        await openMailLog(page);

        const tbody = page.locator('tbody');
        await expect(tbody).toBeVisible({ timeout: 5000 });

        const bodyText = await tbody.textContent();

        // All three statuses should be present
        expect(bodyText).toContain('sent');
        expect(bodyText).toContain('skipped_dev');
        expect(bodyText).toContain('failed');
    });

    // ── 7. Admin sees body/meta; moderator does not ──────────────────────────

    test('admin: expand row shows meta and body for auth_code entry', async () => {
        // Insert a record with meta and body_html
        await dbExec(
            `INSERT INTO ${tn('mail_log')} (account_id, recipient_email, mail_type, subject, body_html, meta, status, created_at)
             VALUES (NULL, ?, 'auth_code', 'Auth', '<b>code: SECRET</b>', '{"auth_code":"SECRET"}', 'skipped_dev', UNIX_TIMESTAMP())`,
            [`admin-body-test${TEST_EMAIL_DOMAIN}`]
        );

        await openMailLog(page);

        const rows = page.locator(ROW_SELECTOR);
        const count = await rows.count();
        // Find the row with our test email
        let rowIndex = -1;
        for (let i = 0; i < count; i++) {
            const text = await rows.nth(i).textContent();
            if (text?.includes('admin-body-test')) { rowIndex = i; break; }
        }
        expect(rowIndex).toBeGreaterThanOrEqual(0);

        // Click the row to expand
        await rows.nth(rowIndex).click();

        // meta pre block should appear
        const metaBlock = page.locator('[data-test-id^="mail-meta-"]');
        await expect(metaBlock).toBeVisible({ timeout: 5000 });
        const metaText = await metaBlock.textContent();
        expect(metaText).toContain('auth_code');
        expect(metaText).toContain('SECRET');

        // body iframe should appear
        const bodyFrame = page.locator('[data-test-id^="mail-body-"]');
        await expect(bodyFrame).toBeVisible({ timeout: 5000 });
    });
});

// ── Access control: moderator cannot see body/meta ────────────────────────────

async function devLoginAs(browser: any, role: string) {
    const ctx = await newScopedContext(browser);
    const pg = await ctx.newPage();
    await pg.goto('/');
    await pg.waitForLoadState('networkidle');
    await roleLogin(pg, role);
    await pg.goto('/');
    await pg.waitForLoadState('networkidle');
    return { ctx, pg };
}

test.describe('Mail Log — role access (body/meta visibility)', () => {
    const DOMAIN = '@access-test-mail.test';

    test.beforeAll(async () => {
        await dbExec(`DELETE FROM ${tn('mail_log')} WHERE recipient_email LIKE ?`, [`%${DOMAIN}`]);
        await dbExec(
            `INSERT INTO ${tn('mail_log')} (account_id, recipient_email, mail_type, subject, body_html, meta, status, created_at)
             VALUES (NULL, ?, 'auth_code', 'Auth', '<b>SECRET_BODY</b>', '{"auth_code":"SECRET_CODE"}', 'skipped_dev', UNIX_TIMESTAMP())`,
            [`test${DOMAIN}`]
        );
    });

    test.afterAll(async () => {
        await dbExec(`DELETE FROM ${tn('mail_log')} WHERE recipient_email LIKE ?`, [`%${DOMAIN}`]);
    });

    test('moderator: page renders rows but expand has no body/meta', async ({ browser }) => {
        const { ctx, pg } = await devLoginAs(browser, 'moderator');
        try {
            await pg.goto(MAIL_LOG_URL);

            // Row must be visible
            const row = pg.locator(ROW_SELECTOR).first();
            await expect(row).toBeVisible({ timeout: 8000 });
            await row.click();

            // No meta or body testids should appear
            await Promise.all([
            	expect(pg.locator('[data-test-id^="mail-meta-"]')).not.toBeVisible({ timeout: 2000 }),
            	expect(pg.locator('[data-test-id^="mail-body-"]')).not.toBeVisible({ timeout: 2000 }),
            ]);
        } finally {
            // Wipe cookies before closing — Playwright sometimes returns the same
            // cookie value on a subsequent newContext() call when the underlying
            // browser process keeps a session pool alive, which can later override
            // an unrelated context's session in the DB. Clearing cookies here
            // breaks that link.
            await ctx.clearCookies();
            await ctx.close();
        }
    });
});
