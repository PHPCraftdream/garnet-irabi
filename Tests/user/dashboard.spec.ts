/**
 * User — Dashboard tests (US-S06, US-S07)
 *
 * Covers:
 *   US-S06 -- dashboard shows welcome card with balance
 *   US-S07 -- dashboard shows upcoming bookings section
 *   US-S08 -- dashboard shows quick links section
 *
 * Selectors use data-test-id -- never text content (locale-independent).
 *
 * UI changes:
 *   - DashboardIsland renders WelcomeCard with data-test-id="welcome-card"
 *     (contains balance display + "balance-link" button)
 *   - Upcoming bookings section: data-test-id="upcoming-bookings"
 *   - Quick links section: data-test-id="quick-links"
 *   - Top-up is XHR-based (no page reload)
 */

import { test, expect } from '../helpers/scoped-test';
import type { Page } from '@playwright/test';

// All tests are read-only assertions on the rendered dashboard.
test.describe.configure({ mode: 'parallel' });

async function openDashboard(page: Page) {
    // Every caller follows up with `expect(...).toBeVisible()` which has
    // its own polling — the explicit networkidle was dead time.
    await page.goto('/system/', { waitUntil: 'domcontentloaded' });
}

// -- Welcome card with balance --

test.describe('Dashboard -- welcome card', () => {
    test('welcome card is visible on dashboard', async ({ page }) => {
        await openDashboard(page);
        await expect(page.locator('[data-test-id="welcome-card"]')).toBeVisible({ timeout: 8000 });
    });

    test('welcome card contains a number (balance)', async ({ page }) => {
        await openDashboard(page);
        const text = await page.locator('[data-test-id="welcome-card"]').textContent();
        expect(text).toMatch(/\d/);
    });

    test('welcome card has link to /balance', async ({ page }) => {
        await openDashboard(page);
        const link = page.locator('[data-test-id="balance-link"]');
        await Promise.all([
        	expect(link).toBeVisible({ timeout: 8000 }),
        	expect(link).toHaveAttribute('href', /balance/),
        ]);
    });
});

// QuickLinks block was removed (commit 8f1be69b — no audience left).
// Tests that referenced data-test-id="quick-links" no longer apply.

// -- Upcoming bookings --

test.describe('Dashboard -- upcoming bookings', () => {
    test('dashboard renders without error', async ({ page }) => {
        await openDashboard(page);
        await expect(page.locator('text=/Fatal|Error|Exception/i')).toHaveCount(0);
    });

    test('dashboard container is visible', async ({ page }) => {
        await openDashboard(page);
        await expect(page.locator('[data-test-id="dashboard"]')).toBeVisible({ timeout: 8000 });
    });

    test('upcoming bookings section is visible', async ({ page }) => {
        await openDashboard(page);
        // For user role, upcoming-bookings is always shown
        await expect(page.locator('[data-test-id="upcoming-bookings"]')).toBeVisible({ timeout: 8000 });
    });

});
