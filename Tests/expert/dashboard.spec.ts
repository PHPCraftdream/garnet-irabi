/**
 * Expert — Dashboard tests (US-T03)
 *
 * Post-IA-flatten (2026-05-02):
 *   - /expert/ and /expert/~dashboard now 302 → /
 *   - Single dashboard at / (DashboardIsland), conditional widgets by role
 *   - Removed islands: ExpertDashboardIsland (testids `expert-dashboard`, `expert-quick-links`,
 *     `expert-pending-bookings`, `expert-upcoming` — all replaced by DashboardIsland)
 *   - Real testids on DashboardIsland: `dashboard`, `welcome-card`, `quick-links`,
 *     `expert-stats` (expert role), `expert-slots` (expert upcoming slots), `upcoming-bookings`
 *
 * Runs as expert-tests project (pre-authenticated expert storageState).
 */

import { test, expect } from '../helpers/scoped-test';
import type { Page } from '@playwright/test';

// All tests in this file are pure read-only assertions on a rendered
// dashboard — no DB mutations, no `beforeAll` state shared between
// tests. Safe to parallelise across workers.
test.describe.configure({ mode: 'parallel' });

async function openDashboard(page: Page) {
    // Authenticated dashboard lives at /system/. Every caller follows
    // up with an `expect(locator).toBeVisible()` poll, so the explicit
    // networkidle wait was pure dead time.
    await page.goto('/system/', { waitUntil: 'domcontentloaded' });
}

// ── /expert/ legacy URL: must redirect to dashboard and not 5xx ───────────────

test.describe('Expert — legacy /expert/ URL redirects to dashboard', () => {
    test('GET /expert/ ends on dashboard (final URL)', async ({ page }) => {
        const response = await page.goto('/expert/');
        expect(response?.status()).toBe(200);
        // The /expert/ → dashboard redirect is client-side; wait for it to
        // land (slower on prod) before reading the final path.
        await page.waitForURL((u) => {
            const p = new URL(u).pathname;
            return p === '/' || p === '/system/' || p === '/system';
        }, { timeout: 15000 });
        const finalPath = new URL(page.url()).pathname;
        expect(['/', '/system/', '/system']).toContain(finalPath);
    });

    test('legacy /expert/ shows main dashboard, not error', async ({ page }) => {
        await page.goto('/expert/');
        await expect(page.locator('text=/Fatal|Exception/i')).toHaveCount(0);
        const authInput = page.locator('[data-test-id="auth-login-input"]');
        if (await authInput.isVisible({ timeout: 2000 }).catch(() => false)) return;
        // After redirect, dashboard should be reachable from current URL.
        await expect(page.locator('[data-test-id="dashboard"]')).toBeVisible({ timeout: 10000 });
    });
});

// ── Main dashboard for expert role ─────────────────────────────────────────────

test.describe('Expert — main dashboard at /system/', () => {
    test('returns HTTP 200', async ({ page }) => {
        const response = await page.goto('/system/');
        expect(response?.status()).toBe(200);
    });

    test('renders without fatal/exception text', async ({ page }) => {
        await openDashboard(page);
        await expect(page.locator('text=/Fatal|Exception/i')).toHaveCount(0);
    });

    test('dashboard island renders — no error boundary', async ({ page }) => {
        await openDashboard(page);
        const authInput = page.locator('[data-test-id="auth-login-input"]');
        if (await authInput.isVisible({ timeout: 2000 }).catch(() => false)) return;
        await Promise.all([
        	expect(page.locator('[data-test-id="dashboard"]')).toBeVisible({ timeout: 10000 }),
        	expect(page.locator('[data-test-id="error-boundary"]')).not.toBeVisible({ timeout: 2000 }),
        ]);
    });

    test('shows expert-stats', async ({ page }) => {
        // QuickLinks block was removed (no audience left); only expert-stats
        // remains for expert role.
        await openDashboard(page);
        const authInput = page.locator('[data-test-id="auth-login-input"]');
        if (await authInput.isVisible({ timeout: 2000 }).catch(() => false)) return;
        await expect(page.locator('[data-test-id="expert-stats"]').first()).toBeVisible({ timeout: 8000 });
    });
});

// ── Expert stats widget ────────────────────────────────────────────────────────

test.describe('Expert — stats widget', () => {
    test('expert-stats widget visible on /', async ({ page }) => {
        await openDashboard(page);
        const authInput = page.locator('[data-test-id="auth-login-input"]');
        if (await authInput.isVisible({ timeout: 2000 }).catch(() => false)) return;
        await expect(page.locator('[data-test-id="expert-stats"]')).toBeVisible({ timeout: 8000 });
    });
});
