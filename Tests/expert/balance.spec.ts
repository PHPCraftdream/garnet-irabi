/**
 * Expert — Balance / income page tests (US-T01, US-T02)
 *
 * Covers:
 *   US-T01 — expert sees their income balance at /balance
 *   US-T02 — expert sees payment history (ledger)
 *
 * Runs as expert-tests project (pre-authenticated expert storageState).
 */

import { test, expect } from '../helpers/scoped-test';
import type { Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

async function openBalance(page: Page) {
    await page.goto('/balance');
    await page.waitForLoadState('networkidle');
}

// ── Page accessible ────────────────────────────────────────────────────────────

test.describe('Expert — balance page accessible', () => {
    test('returns HTTP 200', async ({ page }) => {
        const response = await page.goto('/balance');
        expect(response?.status()).toBe(200);
    });

    test('shows balance amount', async ({ page }) => {
        await openBalance(page);
        await expect(page.locator('[data-test-id="balance-amount"]')).toBeVisible({ timeout: 8000 });
    });
});

// ── Ledger history ─────────────────────────────────────────────────────────────

test.describe('Expert — income ledger', () => {
    test('ledger section is visible', async ({ page }) => {
        await openBalance(page);
        await expect(page.locator('[data-test-id="ledger-section"]')).toBeVisible({ timeout: 8000 });
    });

    test('balance page loads without error', async ({ page }) => {
        await openBalance(page);
        await expect(page.locator('text=/Fatal|Exception/i')).toHaveCount(0);
    });
});
