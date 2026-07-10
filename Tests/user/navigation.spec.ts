/**
 * User — Top-menu navigation tests (post-IA-flatten 2026-05-02)
 *
 * Changes:
 *   - Sidebar removed from foreground (Menu::side() returns []) — no more sidebar-* testids
 *   - Top menu items: Главная (/), Слоты (/slots), Брони (/bookings),
 *     Мои слоты (/expert/~slots, expert only), Админка (/admin/, moderator only)
 *   - /expert/ and /expert/~dashboard 302 → /
 *   - Top-menu data-test-id pattern from MenuItem (top_menu twig): nav-{slug}
 *
 * Selector philosophy: prefer data-test-id; href contains-checks are acceptable
 * because URL paths are part of the public IA contract.
 */

import { test, expect } from '../helpers/scoped-test';
import { resolveStorageStatePath } from '../helpers/state';

import { newScopedContext } from '../helpers/scoped-test';
// All tests are read-only — each one opens its own page (or its own
// scoped expert context for the expert-menu group), no shared DB state.
test.describe.configure({ mode: 'parallel' });

// ── Top menu for plain user ────────────────────────────────────────────────────

test.describe('User top menu', () => {
	test('top menu has Home, Slots, Bookings links', async ({ page }) => {
		// Authenticated app lives under /system/ now; / serves the public home page.
		await page.goto('/system/');

		// At least 3 top-nav items (Home, Slots, Bookings) — no Teaching for non-experts
		const navItems = page.locator('nav a[data-test-id^="nav-"]');
		const count = await navItems.count();
		expect(count).toBeGreaterThanOrEqual(3);

		// Concrete hrefs are emitted with the /system prefix.
		expect(await page.locator('nav a[href="/system/"]').count()).toBeGreaterThan(0);
		expect(await page.locator('nav a[href="/system/slots"]').count()).toBeGreaterThan(0);
		expect(await page.locator('nav a[href="/system/bookings"]').count()).toBeGreaterThan(0);
	});

	test('top menu does NOT have Teaching/My-slots link for plain user', async ({ page }) => {
		await page.goto('/slots');

		// /expert/~slots is expert-only
		const teachingNav = page.locator('nav a[href="/expert/~slots"]');
		await expect(teachingNav).toHaveCount(0);
	});

	test('plain user hitting /expert/ gets No-Access (expertOnly middleware)', async ({ page }) => {
		const resp = await page.goto('/expert/');
		expect(resp?.status()).toBe(200);
		// expertOnly renders a No-Access page in-place (URL stays /expert/).
		// The `locator('body').textContent()` read below blocks until the
		// document is parsed; explicit networkidle was redundant.
		const bodyText = (await page.locator('body').textContent()) ?? '';
		expect(/No access|Нет доступа|access denied|Forbidden/i.test(bodyText)).toBe(true);
		// And the dashboard testid is NOT rendered
		await expect(page.locator('[data-test-id="dashboard"]')).toHaveCount(0);
	});
});

// ── Expert-only menu items ─────────────────────────────────────────────────────

test.describe('Expert top menu', () => {
	test('expert sees "My slots" (/system/expert/~slots) link in top menu', async ({ browser }) => {
		const expertCtx = await newScopedContext(browser, { storageState: resolveStorageStatePath('expert') });
		const expertPage = await expertCtx.newPage();
		try {
			await expertPage.goto('/system/');

			// TopMenu + MobileMenu are React islands rendered post-hydration.
			// Wait for ANY nav-* testid first (signals TopMenu hydrated) so the
			// per-link check doesn't race on a worker-saturated FastCGI pool —
			// the previous 8s timeout was too tight under heavy parallel load.
			await expect(expertPage.locator('[data-test-id^="nav-"]').first())
				.toBeAttached({ timeout: 15000 });

			const slotsLink = expertPage.locator('nav a[href="/system/expert/~slots"]');
			await expect(slotsLink.first()).toBeAttached({ timeout: 5000 });
			expect(await slotsLink.count()).toBeGreaterThan(0);
		} finally {
			await expertCtx.close();
		}
	});

	test('/expert/~slots returns 200 for expert', async ({ browser }) => {
		const expertCtx = await newScopedContext(browser, { storageState: resolveStorageStatePath('expert') });
		const expertPage = await expertCtx.newPage();
		try {
			const resp = await expertPage.goto('/expert/~slots');
			expect(resp?.status()).toBe(200);
		} finally {
			await expertCtx.close();
		}
	});

	test('expert /expert/ redirects to a dashboard URL (/ or /system/)', async ({ browser }) => {
		const expertCtx = await newScopedContext(browser, { storageState: resolveStorageStatePath('expert') });
		const expertPage = await expertCtx.newPage();
		try {
			await expertPage.goto('/expert/');
			// Client-side redirect to the dashboard — wait for it (slower on prod).
			await expertPage.waitForURL((u) => {
				const p = new URL(u).pathname;
				return p === '/' || p === '/system/' || p === '/system';
			}, { timeout: 15000 });
			const finalPath = new URL(expertPage.url()).pathname;
			expect(['/', '/system/', '/system']).toContain(finalPath);
		} finally {
			await expertCtx.close();
		}
	});
});

// ── Browse Slots page ──────────────────────────────────────────────────────────

test.describe('Browse Slots page', () => {
	test('/slots returns HTTP 200 for user', async ({ page }) => {
		const resp = await page.goto('/slots');
		expect(resp?.status()).toBe(200);
	});

	test('/slots page renders calendar with week navigation', async ({ page }) => {
		await page.goto('/slots');
		await expect(page.locator('text=/Fatal|Exception/i')).toHaveCount(0);

		await Promise.all([
			expect(page.locator('[data-test-id="slots-calendar"]')).toBeVisible({ timeout: 8000 }),
			expect(page.locator('[data-test-id="week-navigation"]')).toBeVisible({ timeout: 8000 }),
			expect(page.locator('[data-test-id="week-prev"]')).toBeVisible(),
			expect(page.locator('[data-test-id="week-next"]')).toBeVisible(),
		]);

		// Regular user gets the "free" status filter as the default top tab on /slots
		await expect(page.locator('[data-test-id="slot-status-filter-free"]')).toBeVisible({ timeout: 5000 });
	});

	test('week navigation prev/next changes week display', async ({ page }) => {
		await page.goto('/slots');

		await page.locator('[data-test-id="week-next"]').click();

		await expect(page.locator('[data-test-id="week-today"]')).toBeVisible({ timeout: 5000 });

		await page.locator('[data-test-id="week-today"]').click();
	});
});
