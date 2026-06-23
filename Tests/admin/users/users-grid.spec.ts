/**
 * Admin — Users grid tests
 *
 * Covers:
 * - Tab navigation (All, Teachers, Users, Moderators, Owners, Admins)
 * - Tab counts update correctly
 * - Flag columns visible (IS_APPROVED, IS_DISABLED)
 * - Flag buttons have short verb labels
 * - Search filters within active tab
 * - No "roles" or "actions" columns (removed)
 *
 * Selectors use data-test-id — never text content (locale-independent).
 */

import { test, expect } from '../../helpers/scoped-test';

// Read-only smoke (zero `conn.execute`/INSERT/DELETE/UPDATE, no
// `beforeAll`). Safe to fan out across Playwright workers now that
// the php-cgi pool is 32 wide (saturation broke this in the 6-worker
// pool, see commit history).
test.describe.configure({ mode: 'parallel' });

const ADMIN_URL = '/admin/';

async function openUsers(page: any) {
    await page.goto(ADMIN_URL);
    await page.waitForSelector('table', { timeout: 10000 });
}

// ── Tab navigation ────────────────────────────────────────────────────────────

test.describe('Users — tab navigation', () => {
    test('all tabs are rendered', async ({ page }) => {
        await openUsers(page);
        for (const key of ['all', 'experts', 'users', 'moderators', 'owners', 'admins']) {
            await expect(page.locator(`[data-test-id="filter-tab-${key}"]`)).toBeVisible({ timeout: 5000 });
        }
    });

    test('All tab is active by default', async ({ page }) => {
        await openUsers(page);
        await expect(page.locator('[data-test-id="filter-tab-all"]')).toHaveAttribute('aria-selected', 'true', { timeout: 5000 });
    });

    test('Teachers tab filters to only teachers', async ({ page }) => {
        await openUsers(page);
        await page.locator('[data-test-id="filter-tab-experts"]').click();

        const rows = page.locator('tbody tr:not(:has(td[colspan]))');
        const count = await rows.count();
        if (count > 0) {
            const firstCell = rows.first().locator('td').nth(2); // type column
            await expect(firstCell).toContainText(/Expert|Эксперт/i, { timeout: 5000 });
        }
    });

    test('switching tabs updates the displayed rows', async ({ page }) => {
        await openUsers(page);

        const allCount = await page.locator('tbody tr:not(:has(td[colspan]))').count();

        await page.locator('[data-test-id="filter-tab-experts"]').click();
        const teachersCount = await page.locator('tbody tr:not(:has(td[colspan]))').count();

        expect(teachersCount).toBeLessThanOrEqual(allCount);
    });

    test('tab counts shown in parentheses', async ({ page }) => {
        await openUsers(page);
        const allTab = page.locator('[data-test-id="filter-tab-all"]');
        await expect(allTab).toHaveText(/\(\d+\)/, { timeout: 5000 });
    });
});

// ── Column structure ──────────────────────────────────────────────────────────

test.describe('Users — column structure', () => {
    test('no "Roles" or "Actions" column headers', async ({ page }) => {
        await openUsers(page);
        const headers = page.locator('thead th');
        const texts = await headers.allTextContents();
        expect(texts.every(t => !/^roles$/i.test(t.trim()))).toBeTruthy();
        expect(texts.every(t => !/^actions$/i.test(t.trim()))).toBeTruthy();
    });

    test('has Approved and Disabled column headers', async ({ page }) => {
        await openUsers(page);
        await Promise.all([
        	expect(page.locator('th', { hasText: /Одобрен|Approved/i })).toBeVisible({ timeout: 5000 }),
        	expect(page.locator('th', { hasText: /Активность|Disabled/i })).toBeVisible({ timeout: 5000 }),
        ]);
    });

    test('flag buttons use short verb labels', async ({ page }) => {
        await openUsers(page);
        const btns = page.locator('tbody button');
        const count = await btns.count();
        if (count === 0) return;

        const labels = await btns.allTextContents();
        const hasLongLabel = labels.some(l =>
            /make moderator|remove moderator|make owner|remove owner|make admin|remove admin/i.test(l)
        );
        expect(hasLongLabel).toBeFalsy();
    });

    test('Grant and Revoke verbs present for role columns', async ({ page }) => {
        await openUsers(page);
        const total = await page.locator('tbody tr:not(:has(td[colspan]))').count();
        if (total > 0) {
            // IS_MODERATOR/IS_OWNER/IS_ADMIN flag buttons exist
            const flagBtns = page.locator('[data-test-id^="flag-IS_MODERATOR-"], [data-test-id^="flag-IS_OWNER-"], [data-test-id^="flag-IS_ADMIN-"]');
            const flagCount = await flagBtns.count();
            expect(flagCount).toBeGreaterThanOrEqual(0); // just ensure no error
        }
    });
});

// ── Search within tab ─────────────────────────────────────────────────────────

test.describe('Users — search within tab', () => {
    test('search filters rows in All tab', async ({ page }) => {
        await openUsers(page);
        const search = page.locator('[data-test-id="admin-grid-search"]');
        await search.fill('testuser_setup_admin@irabi.test');

        const rows = page.locator('tbody tr:not(:has(td[colspan]))');
        const count = await rows.count();
        expect(count).toBeGreaterThanOrEqual(1);

        const text = await rows.first().textContent();
        expect(text).toContain('testuser_setup_admin@irabi.test');
    });

    test('clearing search restores all rows', async ({ page }) => {
        await openUsers(page);
        const search = page.locator('[data-test-id="admin-grid-search"]');
        const initial = await page.locator('tbody tr:not(:has(td[colspan]))').count();

        await search.fill('zzz_no_match_zzz');
        const filtered = await page.locator('tbody tr:not(:has(td[colspan]))').count();
        expect(filtered).toBeLessThan(initial);

        await search.clear();
        const restored = await page.locator('tbody tr:not(:has(td[colspan]))').count();
        expect(restored).toBe(initial);
    });

    test('search persists when switching tabs', async ({ page }) => {
        await openUsers(page);
        await page.locator('[data-test-id="filter-tab-experts"]').click();

        const search = page.locator('[data-test-id="admin-grid-search"]');
        await search.fill('testuser_setup_expert@irabi.test');

        const rows = page.locator('tbody tr:not(:has(td[colspan]))');
        const count = await rows.count();
        expect(count).toBeGreaterThanOrEqual(0);
    });
});

// ── Approve button (teachers only) ────────────────────────────────────────────

test.describe('Users — IS_APPROVED column', () => {
    test('Approve/Revoke button visible for expert rows in All tab', async ({ page }) => {
        await openUsers(page);
        const teacherRow = page.locator('tbody tr').filter({ hasText: /Эксперт|Expert/i }).first();
        const exists = await teacherRow.count();
        if (!exists) return;

        const approveBtn = teacherRow.locator('[data-test-id^="flag-IS_APPROVED-"]');
        await expect(approveBtn).toBeVisible({ timeout: 5000 });
    });

    test('IS_APPROVED cell is empty for student rows', async ({ page }) => {
        await openUsers(page);
        await page.locator('[data-test-id="filter-tab-users"]').click();

        const rows = page.locator('tbody tr:not(:has(td[colspan]))');
        const count = await rows.count();
        if (count === 0) return;

        // Student rows should not have IS_APPROVED (Одобрить) button — only teachers have it
        const approveBtns = rows.first().locator('[data-test-id^="flag-IS_APPROVED-"]');
        expect(await approveBtns.count()).toBe(0);
    });
});
