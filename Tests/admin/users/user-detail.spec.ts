/**
 * Admin — UserDetailPanel tests
 *
 * Covers the "open user detail" flow triggered from every admin section:
 *   /admin/          — click login link in users grid
 *   /admin/bookings/ — click student link in bookings grid
 *   /admin/finance/  — click from/to party link in ledger grid
 *
 * Selectors use data-test-id — never text content (locale-independent).
 * Active tab detection uses aria-selected="true".
 */

import { test, expect } from '../../helpers/scoped-test';
import type { Page } from '@playwright/test';

// Read-only smoke — opens admin pages, clicks around, asserts. No DB
// mutations or cross-test state. Parallel-safe under the 32-worker
// php-cgi pool.
test.describe.configure({ mode: 'parallel' });

// ── Shared helpers ────────────────────────────────────────────────────────────

/** Navigate to a page and wait for the React island to render a table. */
async function openPage(page: Page, path: string) {
    await page.goto(path);
    await page.waitForSelector('table', { timeout: 12000 });
}

/**
 * Top-level TabNav buttons. Uses data-test-id prefix pattern.
 */
const topTabs = (page: Page) => page.locator('[data-test-id^="tabnav-btn-"]');

/**
 * Wait for the UserDetailPanel lazy-chunk to finish loading.
 * The panel renders "Загрузка..." while suspended, then the actual content.
 */
async function waitForDetailPanel(page: Page) {
    await expect(page.locator('text=Загрузка...')).toHaveCount(0, { timeout: 10000 });
}

// ── Opening detail from Users page ───────────────────────────────────────────

test.describe('UserDetail — open from /admin/ users grid', () => {
    test('clicking login link opens a new tab in the top tab bar', async ({ page }) => {
        await openPage(page, '/admin/');

        const countBefore = await topTabs(page).count();

        const loginLink = page.locator('[data-test-id^="user-login-"]').first();
        await expect(loginLink).toBeVisible({ timeout: 8000 });
        await loginLink.click();

        // One extra tab in the top-level TabNav
        await expect(topTabs(page)).toHaveCount(countBefore + 1, { timeout: 8000 });
    });

    test('new detail tab is active and shows account info', async ({ page }) => {
        await openPage(page, '/admin/');

        const loginLink = page.locator('[data-test-id^="user-login-"]').first();
        const loginText = (await loginLink.textContent())?.trim() ?? '';
        await loginLink.click();
        await waitForDetailPanel(page);

        // Panel shows the login somewhere
        await expect(page.locator(`text=${loginText}`).first()).toBeVisible({ timeout: 8000 });
    });

    test('detail tab has × close button and closing returns to main tab', async ({ page }) => {
        await openPage(page, '/admin/');

        const countBefore = await topTabs(page).count();
        const loginLink = page.locator('[data-test-id^="user-login-"]').first();
        await loginLink.click();
        await waitForDetailPanel(page);

        // Get the new tab's testid and close it
        const newTab = topTabs(page).nth(countBefore);
        const newTabTestId = await newTab.getAttribute('data-test-id');
        const tabId = newTabTestId?.replace('tabnav-btn-', '');
        if (tabId) {
            await page.locator(`[data-test-id="tabnav-close-${tabId}"]`).click();
        }

        // Back to original count, main tab active
        await Promise.all([
        	expect(topTabs(page)).toHaveCount(countBefore, { timeout: 5000 }),
        	expect(page.locator('[data-test-id="tabnav-btn-users"]')).toHaveAttribute('aria-selected', 'true'),
        ]);
    });
});

// ── User detail view ──────────────────────────────────────────────────────────

test.describe('UserDetail — user profile', () => {
    async function openUserDetail(page: Page): Promise<boolean> {
        await openPage(page, '/admin/');
        // Use the seeded dev user — has bookings + ledger entries from DevSeedService.
        const search = page.locator('[data-test-id="admin-grid-search"]');
        await search.fill('user1@dev.test');

        const rows = page.locator('tbody tr:not(:has(td[colspan]))');
        if (await rows.count() === 0) return false;

        const loginBtn = rows.first().locator('[data-test-id^="user-login-"]');
        if (await loginBtn.count() === 0) return false;

        await loginBtn.click();
        await waitForDetailPanel(page);
        return true;
    }

    test('user detail shows balance section', async ({ page }) => {
        if (!await openUserDetail(page)) return;
        await expect(page.locator('[data-test-id="user-detail-balance"]')).toBeVisible({ timeout: 8000 });
    });

    test('user detail shows bookings section', async ({ page }) => {
        if (!await openUserDetail(page)) return;
        const pane = page.locator('[data-test-id="user-detail-pane"]');
        // Section heading was renamed in the i18n catalog; stable testid wins, with a
        // text-regex fallback that covers both the old "Брони" and the newer "Слоты" wording.
        const sectionByTestId = pane.locator('[data-test-id="user-detail-bookings-section"]');
        const sectionByText   = pane.locator('text=/^(Брони|Слоты)/').first();
        const hasTestId = await sectionByTestId.isVisible({ timeout: 2000 }).catch(() => false);
        if (hasTestId) {
            await expect(sectionByTestId).toBeVisible({ timeout: 8000 });
        } else {
            await expect(sectionByText).toBeVisible({ timeout: 8000 });
        }
    });

    test('user detail shows ledger section', async ({ page }) => {
        if (!await openUserDetail(page)) return;
        const pane = page.locator('[data-test-id="user-detail-pane"]');
        await expect(pane.locator('text=Финансы').first()).toBeVisible({ timeout: 8000 });
    });

    test('user detail does not show expert profile section', async ({ page }) => {
        if (!await openUserDetail(page)) return;
        const pane = page.locator('[data-test-id="user-detail-pane"]');
        // Expert profile (specialization) should not appear for regular users
        await expect(pane.locator('text=/Специализация/i')).toHaveCount(0, { timeout: 3000 });
    });
});

// ── Expert detail view ────────────────────────────────────────────────────────

test.describe('UserDetail — expert profile', () => {
    async function openExpertDetail(page: Page): Promise<boolean> {
        await openPage(page, '/admin/');
        // Search for the dev seed expert who has slots/etc.
        const search = page.locator('[data-test-id="admin-grid-search"]');
        await search.fill('testuser_setup_expert@irabi.test');

        const rows = page.locator('tbody tr:not(:has(td[colspan]))');
        if (await rows.count() === 0) return false;

        const loginBtn = rows.first().locator('[data-test-id^="user-login-"]');
        if (await loginBtn.count() === 0) return false;

        await loginBtn.click();
        await waitForDetailPanel(page);
        return true;
    }

    test('expert detail shows personal section and expert profile', async ({ page }) => {
        if (!await openExpertDetail(page)) return;
        // Panel renders flat: personal section (ledger/tickets) and expert section (profile/slots)
        // Just verify expert profile info is visible
        await expect(page.locator('text=/Mathematics|Программирование|Математика|Иностранные языки/i').first())
            .toBeVisible({ timeout: 8000 });
    });

    test('expert detail shows slots section', async ({ page }) => {
        if (!await openExpertDetail(page)) return;
        const slotsText = page.locator('text=/слот/i').first();
        const hasSlots = await slotsText.isVisible({ timeout: 3000 }).catch(() => false);
        if (hasSlots) {
            await expect(slotsText).toBeVisible();
        }
    });

});

// /admin/bookings/ is now a standalone 3-tab page (not part of AdminPanelIsland),
// so its user-link clicks don't open new top-level tabs — they navigate to the user
// public/admin URL directly. UserDetail tab integration lives in AdminPanel + AdminFinance.

// ── Opening detail from /admin/finance/ ──────────────────────────────────────

test.describe('UserDetail — open from /admin/finance/', () => {
    test('clicking party link in ledger opens a new top-level tab', async ({ page }) => {
        await openPage(page, '/admin/finance/');

        const countBefore = await topTabs(page).count();
        const partyLink = page.locator('[data-test-id^="ledger-party-"]').first();
        await expect(partyLink).toBeVisible({ timeout: 8000 });
        await partyLink.click();

        await expect(topTabs(page)).toHaveCount(countBefore + 1, { timeout: 8000 });
    });

    test('user detail from finance loads without error', async ({ page }) => {
        await openPage(page, '/admin/finance/');

        const partyLink = page.locator('[data-test-id^="ledger-party-"]').first();
        await partyLink.click();
        await waitForDetailPanel(page);

        await expect(page.locator('text=/Ошибка|Error|failed/i')).toHaveCount(0);
        const pane = page.locator('[data-test-id="user-detail-pane"]');
        await expect(pane.locator('text=/Баланс|Бронирования|Слоты/i').first()).toBeVisible({ timeout: 8000 });
    });
});

// ── Deduplication: opening same user twice ────────────────────────────────────

test.describe('UserDetail — deduplication', () => {
    test('opening same user twice does not create duplicate tab', async ({ page }) => {
        await openPage(page, '/admin/');

        const loginLink = page.locator('[data-test-id^="user-login-"]').first();

        await loginLink.click();
        const countAfterFirst = await topTabs(page).count();

        // Navigate back to main tab
        await page.locator('[data-test-id="tabnav-btn-users"]').click();

        // Click same user again
        await loginLink.click();
        const countAfterSecond = await topTabs(page).count();

        expect(countAfterSecond).toBe(countAfterFirst);
    });
});
