/**
 * User — Balance page tests (US-S01, US-S02, US-S03)
 *
 * Covers:
 *   US-S01 -- user sees their balance at /balance
 *   US-S02 -- user sees ledger history
 *   US-S03 -- user can top-up balance
 *
 * Selectors use data-test-id -- never text content (locale-independent).
 *
 * UI changes:
 *   - Top-up is XHR-based (sendPost), reactive update -- no page reload
 *   - Balance amount and ledger update in-place after top-up
 *   - Toast shows descriptive success message after top-up
 */

import { test, expect } from '../helpers/scoped-test';
import type { Page } from '@playwright/test';

// File-level parallel — `page loads` and `top-up form` describes are
// purely read-only, only `top-up action` mutates DB state and opts
// back into serial via its own describe.configure below.
test.describe.configure({ mode: 'parallel' });

async function openBalance(page: Page) {
    // No networkidle — every caller immediately calls
    // `expect(locator).toBeVisible()` which has its own polling, so the
    // 500ms-quiet idle wait is dead time × 10 callers.
    await page.goto('/balance', { waitUntil: 'domcontentloaded' });
}

// -- Page loads --

test.describe('Balance -- page loads', () => {
    test('returns HTTP 200', async ({ page }) => {
        const response = await page.goto('/balance');
        expect(response?.status()).toBe(200);
    });

    test('shows balance amount element', async ({ page }) => {
        await openBalance(page);
        await expect(page.locator('[data-test-id="balance-amount"]')).toBeVisible({ timeout: 8000 });
    });

    test('balance amount is a number', async ({ page }) => {
        await openBalance(page);
        const text = await page.locator('[data-test-id="balance-amount"]').textContent();
        expect(text).toMatch(/\d/);
    });

    test('shows ledger section', async ({ page }) => {
        await openBalance(page);
        await expect(page.locator('[data-test-id="ledger-section"]')).toBeVisible({ timeout: 8000 });
    });
});

// -- Top-up form --

test.describe('Balance -- top-up form', () => {
    test('top-up form is visible', async ({ page }) => {
        await openBalance(page);
        await expect(page.locator('[data-test-id="topup-form"]')).toBeVisible({ timeout: 8000 });
    });

    test('amount input is present', async ({ page }) => {
        await openBalance(page);
        await expect(page.locator('[data-test-id="topup-amount-input"]')).toBeVisible({ timeout: 8000 });
    });

    test('submit button is present', async ({ page }) => {
        await openBalance(page);
        await expect(page.locator('[data-test-id="topup-submit"]')).toBeVisible({ timeout: 8000 });
    });
});

// -- Top-up action --

test.describe('Balance -- top-up action', () => {
    // Each test in this describe writes to the same user's balance via XHR.
    // Running them in parallel risks reading the same `before` value, then
    // both top-ups land and the test that ran second's "balance increased"
    // assertion still passes — but the third test that asserts a fresh
    // ledger row may see a row from a sibling top-up. Keep serial.
    test.describe.configure({ mode: 'serial' });

    test('submitting top-up form increases balance (XHR, reactive)', async ({ page }) => {
        await openBalance(page);
        const beforeText = await page.locator('[data-test-id="balance-amount"]').textContent() ?? '0';
        const before = parseInt(beforeText.replace(/\D/g, ''), 10) || 0;

        await page.locator('[data-test-id="topup-amount-input"]').fill('500');
        await page.locator('[data-test-id="topup-submit"]').click();

        // XHR-based -- wait for the balance text to change reactively
        await expect(async () => {
            const afterText = await page.locator('[data-test-id="balance-amount"]').textContent() ?? '0';
            const after = parseInt(afterText.replace(/\D/g, ''), 10) || 0;
            expect(after).toBeGreaterThan(before);
        }).toPass({ timeout: 10000 });
    });

    test('after top-up a ledger row appears (reactive)', async ({ page }) => {
        await openBalance(page);
        await page.locator('[data-test-id="topup-amount-input"]').fill('100');
        await page.locator('[data-test-id="topup-submit"]').click();

        // XHR-based -- wait for ledger row to appear reactively
        await expect(page.locator('[data-test-id="ledger-row"]').first()).toBeVisible({ timeout: 8000 });
    });

    test('top-up does not reload the page (XHR)', async ({ page }) => {
        await openBalance(page);
        // Mark the page with a transient state
        await page.evaluate(() => (window as any).__topupTestMarker = true);

        await page.locator('[data-test-id="topup-amount-input"]').fill('50');
        await page.locator('[data-test-id="topup-submit"]').click();

        // If page reloaded, our marker would be gone
        const marker = await page.evaluate(() => (window as any).__topupTestMarker);
        expect(marker).toBe(true);
    });
});
