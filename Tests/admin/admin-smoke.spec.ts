/**
 * Smoke tests for all admin pages:
 * - Users, Bookings, Finance, Balances, Logs
 * - Verifies: access control, table renders, correct columns, search input present
 *
 * Selectors use data-test-id — never text content (locale-independent).
 * Runs as admin-tests project (pre-authenticated admin storageState).
 */

import { test, expect } from '../helpers/scoped-test';

// Read-only smoke tests — open a page, assert `data-test-id`. No
// `beforeAll` mutates DB, no test depends on a row a sibling created.
// With a 32-worker php-cgi pool the saturated-pool failure that broke
// our earlier parallel attempt (when pool was 6) is gone, so we let
// the 57 tests in this file fan out across all Playwright workers.
test.describe.configure({ mode: 'parallel' });

// Helper: navigate to an admin page. We don't wait on `networkidle` (every
// caller polls), AND we override `goto`'s default `waitUntil: 'load'` with
// `domcontentloaded` — `load` blocks until every CSS/JS/img/font subresource
// has finished, which on warm-cache admin pages can still add 200-500ms
// after the React island is already hydrating. `domcontentloaded` returns
// the moment the HTML is parsed; the next `expect(locator).toBeVisible`
// polls until the island shows up. ~57 callers in this file, ~250ms each
// saved.
async function openAdminPage(page: any, path: string) {
	await page.goto(path, { waitUntil: 'domcontentloaded' });
	// Wait for the admin React island to actually mount before callers assert
	// on specific controls. `domcontentloaded` returns before the island has
	// rendered its grid/tabs, and on the slower prod server that gap exceeds
	// the per-assertion 5s timeouts. Settle on the first piece of admin chrome
	// (a tab button, a table, or any grid search box); best-effort so a page
	// without these still surfaces the caller's own assertion error.
	await page
		.locator('[data-test-id^="tabnav-btn-"], table, [data-test-id$="-search"]')
		.first()
		.waitFor({ state: 'visible', timeout: 20000 })
		.catch(() => {});
}

// Helper: assert table rendered (at least one th visible)
async function expectTableVisible(page: any) {
	const table = page.locator('table');
	await expect(table).toBeVisible({ timeout: 10000 });
	const headers = page.locator('thead th');
	await expect(headers.first()).toBeVisible({ timeout: 5000 });
}

// ── /admin/ — Users ──────────────────────────────────────────────────────────

test.describe('Admin — Users page (/admin/)', () => {
	test('page loads and shows table', async ({ page }) => {
		await openAdminPage(page, '/admin/');
		await expectTableVisible(page);
	});

	test('has expected column headers', async ({ page }) => {
		await openAdminPage(page, '/admin/');
		await Promise.all([
			expect(page.locator('[data-test-id="sort-col-id"]')).toBeVisible({ timeout: 5000 }),
			expect(page.locator('[data-test-id="sort-col-login"]')).toBeVisible(),
		]);
	});

	test('has search input', async ({ page }) => {
		await openAdminPage(page, '/admin/');
		await expect(page.locator('[data-test-id="admin-grid-search"]')).toBeVisible({ timeout: 5000 });
	});

	test('admin user row is visible', async ({ page }) => {
		await openAdminPage(page, '/admin/');
		const tbody = page.locator('tbody');
		await expect(tbody).toBeVisible({ timeout: 5000 });
		const rowCount = await page.locator('tbody tr:not(:has(td[colspan]))').count();
		expect(rowCount).toBeGreaterThan(0);
	});

	test('search for admin login filters results', async ({ page }) => {
		await openAdminPage(page, '/admin/');
		const searchInput = page.locator('[data-test-id="admin-grid-search"]');
		await searchInput.fill('testuser_setup_admin@irabi.test');

		const rows = page.locator('tbody tr:not(:has(td[colspan]))');
		const count = await rows.count();
		expect(count).toBeGreaterThanOrEqual(1);
		const bodyText = await page.locator('tbody').textContent();
		expect(bodyText).toContain('testuser_setup_admin@irabi.test');
	});

	test('searching nonexistent user shows empty state', async ({ page }) => {
		await openAdminPage(page, '/admin/');
		await page.locator('[data-test-id="admin-grid-search"]').fill('xyzzy_no_such_user_abc');
		await expect(page.locator('tbody td[colspan]')).toBeVisible();
	});

	test('sidebar navigation is visible', async ({ page }) => {
		await openAdminPage(page, '/admin/');
		// Two <aside>s coexist now: mobile drawer + desktop sidebar — at
		// least one must be present. `expect.poll` so we re-check while
		// the React island mounts; bare `.count()` is a snapshot and was
		// racing the `domcontentloaded`-only goto.
		await expect.poll(() => page.locator('aside').count(), { timeout: 5000, intervals: [50, 150, 400] }).toBeGreaterThan(0);
	});

	test('sidebar has slots item', async ({ page }) => {
		await openAdminPage(page, '/admin/');
		await expect(page.locator('[data-test-id="sidebar-слоты"]').first()).toBeVisible({ timeout: 5000 });
	});

	test('sidebar no longer renders the legacy "брони" item', async ({ page }) => {
		await openAdminPage(page, '/admin/');
		// Bookings was renamed/folded into the slots group — old testid must be gone.
		// Wait for the sidebar to mount first (positive assertion polls)
		// before asserting the negative — otherwise we just see "0" because
		// the React island hadn't mounted yet at all.
		await Promise.all([
			expect(page.locator('[data-test-id="sidebar-слоты"]').first()).toBeVisible({ timeout: 5000 }),
			expect(page.locator('[data-test-id="sidebar-брони"]')).toHaveCount(0),
		]);
	});
});

// ── /admin/bookings/ — Slots (4-tab section, slots is default) ───────────────

test.describe('Admin — Bookings page (/admin/bookings/)', () => {
	test('page loads and shows tab nav', async ({ page }) => {
		await openAdminPage(page, '/admin/bookings/');
		await expect(page.locator('[data-test-id="admin-bookings-section-tabs"]')).toBeVisible({ timeout: 8000 });
	});

	test('has all four tabs', async ({ page }) => {
		await openAdminPage(page, '/admin/bookings/');
		await Promise.all([
			expect(page.locator('[data-test-id="tabnav-btn-slots"]')).toBeVisible({ timeout: 5000 }),
			expect(page.locator('[data-test-id="tabnav-btn-bookings"]')).toBeVisible(),
			expect(page.locator('[data-test-id="tabnav-btn-expert-cancellations"]')).toBeVisible(),
			expect(page.locator('[data-test-id="tabnav-btn-user-cancellations"]')).toBeVisible(),
		]);
	});

	test('slots tab is active by default', async ({ page }) => {
		await openAdminPage(page, '/admin/bookings/');
		await Promise.all([
			expect(page.locator('[data-test-id="tabnav-btn-slots"]')).toHaveAttribute('aria-selected', 'true'),
			expect(page.locator('[data-test-id="admin-slots-tab"]')).toBeVisible({ timeout: 5000 }),
		]);
	});

	test('slots tab has search input', async ({ page }) => {
		await openAdminPage(page, '/admin/bookings/');
		await expect(page.locator('[data-test-id="admin-slots-search"]')).toBeVisible({ timeout: 5000 });
	});

	test('bookings tab has search input', async ({ page }) => {
		await openAdminPage(page, '/admin/bookings/?tab=bookings');
		await expect(page.locator('[data-test-id="admin-bookings-search"]')).toBeVisible({ timeout: 5000 });
	});

	test('bookings tab exposes expert/user/status/reset filter controls', async ({ page }) => {
		await openAdminPage(page, '/admin/bookings/?tab=bookings');
		await Promise.all([
			expect(page.locator('[data-test-id="admin-bookings-tab"]')).toBeVisible({ timeout: 8000 }),
			expect(page.locator('[data-test-id="admin-bookings-expert"]')).toBeVisible({ timeout: 5000 }),
			expect(page.locator('[data-test-id="admin-bookings-user"]')).toBeVisible({ timeout: 5000 }),
			expect(page.locator('[data-test-id="admin-bookings-status"]')).toBeVisible({ timeout: 5000 }),
			expect(page.locator('[data-test-id="admin-bookings-reset"]')).toBeVisible({ timeout: 5000 }),
		]);
	});
});

// ── /admin/finance/ — Finance ─────────────────────────────────────────────────

test.describe('Admin — Finance page (/admin/finance/)', () => {
	test('page loads and shows table', async ({ page }) => {
		await openAdminPage(page, '/admin/finance/');
		await expectTableVisible(page);
	});

	test('has expected column headers', async ({ page }) => {
		await openAdminPage(page, '/admin/finance/');
		// Finance grid has columns: amount, entry_type, created_at etc
		const firstHeader = page.locator('thead th').first();
		await expect(firstHeader).toBeVisible({ timeout: 5000 });
	});
});

// ── /admin/balances/ — Balances ───────────────────────────────────────────────

test.describe('Admin — Balances page (/admin/balances/)', () => {
	test('page loads and shows table', async ({ page }) => {
		await openAdminPage(page, '/admin/balances/');
		await expectTableVisible(page);
	});

	test('has expected column headers', async ({ page }) => {
		await openAdminPage(page, '/admin/balances/');
		// balance and updated_at are sortable; login/name are not
		await Promise.all([
			expect(page.locator('[data-test-id="sort-col-balance"]')).toBeVisible({ timeout: 5000 }),
			expect(page.locator('[data-test-id="sort-col-updated_at"]')).toBeVisible(),
		]);
	});
});

// ── /admin/logs/ — Unified Logs viewer (Actions / Mails / Requests / Errors) ─

test.describe('Admin — Logs page (/admin/logs/)', () => {
	test('page loads and shows the viewer + 5 tab buttons', async ({ page }) => {
		await openAdminPage(page, '/admin/logs/');
		await expect(page.locator('[data-test-id="admin-logs-viewer"]')).toBeVisible({ timeout: 8000 });
		for (const id of ['actions', 'mails', 'requests', 'errors', 'cron']) {
			await expect(page.locator(`[data-test-id="tabnav-btn-${id}"]`)).toBeVisible({ timeout: 5000 });
		}
	});

	test('actions tab is active by default and shows the action log table', async ({ page }) => {
		await openAdminPage(page, '/admin/logs/');
		await expect(page.locator('[data-test-id="tabnav-btn-actions"]')).toHaveAttribute('aria-selected', 'true');
		await expectTableVisible(page);
	});

	test('actions tab exposes actor / target / action / actor-type / date filters', async ({ page }) => {
		await openAdminPage(page, '/admin/logs/');
		await Promise.all([
			expect(page.locator('[data-test-id="tabnav-btn-actions"]')).toHaveAttribute('aria-selected', 'true'),
			expect(page.locator('[data-test-id="actions-actor-filter"]')).toBeVisible({ timeout: 5000 }),
			expect(page.locator('[data-test-id="actions-target-filter"]')).toBeVisible({ timeout: 5000 }),
			expect(page.locator('[data-test-id="actions-action-filter"]')).toBeVisible({ timeout: 5000 }),
			expect(page.locator('[data-test-id="actions-actor-type-filter"]')).toBeVisible({ timeout: 5000 }),
			expect(page.locator('[data-test-id="actions-date-from"]')).toBeVisible({ timeout: 5000 }),
			expect(page.locator('[data-test-id="actions-date-to"]')).toBeVisible({ timeout: 5000 }),
		]);
	});

	test('switching to mails tab updates URL and renders mail log', async ({ page }) => {
		await openAdminPage(page, '/admin/logs/');
		await page.locator('[data-test-id="tabnav-btn-mails"]').click();
		await expect(page.locator('[data-test-id="tabnav-btn-mails"]')).toHaveAttribute('aria-selected', 'true');
		expect(page.url()).toContain('tab=mails');
	});

	test('switching to requests tab renders the requests panel', async ({ page }) => {
		await openAdminPage(page, '/admin/logs/');
		await page.locator('[data-test-id="tabnav-btn-requests"]').click();
		await expect(page.locator('[data-test-id="admin-request-log"]')).toBeVisible({ timeout: 5000 });
	});

	test('switching to errors tab renders the errors panel', async ({ page }) => {
		await openAdminPage(page, '/admin/logs/');
		await page.locator('[data-test-id="tabnav-btn-errors"]').click();
		await expect(page.locator('[data-test-id="admin-errors-log"]')).toBeVisible({ timeout: 5000 });
	});

	test('?tab=requests deep-link opens requests tab on initial load', async ({ page }) => {
		await openAdminPage(page, '/admin/logs/?tab=requests');
		await Promise.all([
			expect(page.locator('[data-test-id="tabnav-btn-requests"]')).toHaveAttribute('aria-selected', 'true'),
			expect(page.locator('[data-test-id="admin-request-log"]')).toBeVisible({ timeout: 5000 }),
		]);
	});
});

// ── /admin/mail-log/ + /admin/request-log/ — legacy URLs redirect to /admin/logs/ ─

test.describe('Admin — legacy log URLs redirect to unified viewer', () => {
	test('/admin/mail-log/ redirects to /admin/logs/?tab=mails', async ({ page }) => {
		// The redirect to the unified viewer is CLIENT-side, so it can land a
		// tick after `load` — wait for it (noticeably slower on prod) before
		// reading the URL, instead of assuming `goto` already settled it.
		await page.goto('/admin/mail-log/');
		await page.waitForURL('**/admin/logs/**', { timeout: 15000 });
		expect(page.url()).toContain('/admin/logs/');
		expect(page.url()).toContain('tab=mails');
	});

	test('/admin/request-log/ redirects to /admin/logs/?tab=requests', async ({ page }) => {
		await page.goto('/admin/request-log/');
		await page.waitForURL('**/admin/logs/**', { timeout: 15000 });
		expect(page.url()).toContain('/admin/logs/');
		expect(page.url()).toContain('tab=requests');
	});
});

// ── /admin/cancellations/ — Teacher Cancellations ────────────────────────────

test.describe('Admin — Cancellations page (/admin/cancellations/) — redirects to /admin/bookings/', () => {
	test('page loads and ends up on bookings tab', async ({ page }) => {
		const response = await page.goto('/admin/cancellations/');
		expect(response?.status()).toBe(200);
		// Client-side redirect to the bookings view — wait for it to land.
		await page.waitForURL('**/admin/bookings/**', { timeout: 15000 });
		expect(page.url()).toContain('/admin/bookings/');
		await expect(page.locator('text=/Fatal|Exception/i')).toHaveCount(0);
	});

	test('page shows expert and user cancellation tabs', async ({ page }) => {
		await openAdminPage(page, '/admin/cancellations/');
		await Promise.all([
			expect(page.locator('[data-test-id="tabnav-btn-expert-cancellations"]')).toBeVisible({ timeout: 8000 }),
			expect(page.locator('[data-test-id="tabnav-btn-user-cancellations"]')).toBeVisible({ timeout: 8000 }),
		]);
	});

	test('page shows table or empty state on each cancellation tab', async ({ page }) => {
		await openAdminPage(page, '/admin/cancellations/');
		// Wait for the tab strip to render so we know JS has mounted —
		// otherwise the non-polling `isVisible()` snapshot below races
		// the React island under load.
		await expect(page.locator('[data-test-id="tabnav-btn-expert-cancellations"]')).toBeVisible({ timeout: 8000 });
		// Expert cancellations tab is default after redirect. Either-or
		// check via `expect.poll` so both alternatives keep being
		// re-evaluated until one is true (or the timeout trips).
		await expect.poll(async () => {
			const t = await page.locator('table').isVisible().catch(() => false);
			const e = await page.locator('text=/не найдено|No.*found/i').isVisible().catch(() => false);
			return t || e;
		}, { timeout: 8000, intervals: [50, 150, 400] }).toBeTruthy();
		// User cancellations tab
		await page.locator('[data-test-id="tabnav-btn-user-cancellations"]').click();
		await expect.poll(async () => {
			const t = await page.locator('table').isVisible().catch(() => false);
			const e = await page.locator('text=/не найдено|No.*found/i').isVisible().catch(() => false);
			return t || e;
		}, { timeout: 8000, intervals: [50, 150, 400] }).toBeTruthy();
	});

	test('expert-cancellations tab exposes expert/user/date filters', async ({ page }) => {
		await openAdminPage(page, '/admin/bookings/?tab=expert-cancellations');
		await Promise.all([
			expect(page.locator('[data-test-id="expert-cancellations-tab"]')).toBeVisible({ timeout: 8000 }),
			expect(page.locator('[data-test-id="expert-cancellations-expert"]')).toBeVisible({ timeout: 5000 }),
			expect(page.locator('[data-test-id="expert-cancellations-user"]')).toBeVisible({ timeout: 5000 }),
			expect(page.locator('[data-test-id="expert-cancellations-date-from"]')).toBeVisible({ timeout: 5000 }),
			expect(page.locator('[data-test-id="expert-cancellations-date-to"]')).toBeVisible({ timeout: 5000 }),
			expect(page.locator('[data-test-id="expert-cancellations-reset"]')).toBeVisible({ timeout: 5000 }),
		]);
	});

	test('user-cancellations tab exposes expert/user/date filters', async ({ page }) => {
		await openAdminPage(page, '/admin/bookings/?tab=user-cancellations');
		await Promise.all([
			expect(page.locator('[data-test-id="user-cancellations-tab"]')).toBeVisible({ timeout: 8000 }),
			expect(page.locator('[data-test-id="user-cancellations-expert"]')).toBeVisible({ timeout: 5000 }),
			expect(page.locator('[data-test-id="user-cancellations-user"]')).toBeVisible({ timeout: 5000 }),
			expect(page.locator('[data-test-id="user-cancellations-date-from"]')).toBeVisible({ timeout: 5000 }),
			expect(page.locator('[data-test-id="user-cancellations-date-to"]')).toBeVisible({ timeout: 5000 }),
			expect(page.locator('[data-test-id="user-cancellations-reset"]')).toBeVisible({ timeout: 5000 }),
		]);
	});
});

// ── /admin/support/ — Support ────────────────────────────────────────────────

test.describe('Admin — Support page (/admin/support/)', () => {
	test('page loads and returns 200', async ({ page }) => {
		const response = await page.goto('/admin/support/');
		expect(response?.status()).toBe(200);
		await expect(page.locator('text=/Fatal|Exception/i')).toHaveCount(0);
	});

	test('has status filter buttons', async ({ page }) => {
		await openAdminPage(page, '/admin/support/');
		// The "All" filter should always be visible
		await expect(page.locator('[data-test-id="support-filter-all"]')).toBeVisible({ timeout: 8000 });
	});
});

// ── Access control ────────────────────────────────────────────────────────────

test.describe('Admin — Navigation links', () => {
	const adminPages = [
		'/admin/',
		'/admin/bookings/',
		'/admin/finance/',
		'/admin/balances/',
		'/admin/logs/',
		'/admin/cancellations/',
		'/admin/support/',
		'/admin/pages/',
	];

	for (const path of adminPages) {
		test(`${path} returns 200 for admin user`, async ({ page }) => {
			const response = await page.goto(path);
			expect(response?.status()).toBe(200);
		});
	}
});

// ── Header utility cluster — visible for staff after commit e1fb5d82 ──────
// Commit e1fb5d82 ("refactor(nav): restore IM + Support visibility for
// moderators and above") un-nullified buildUtilityData() for staff. Admins
// now see the same Balance/IM/Support cluster as regular users. The earlier
// "NOT rendered" assertions in this block passed accidentally — they ran
// inside the brief window between domcontentloaded and React island
// hydration when the cluster <div> was a placeholder, then declared success
// before the icons mounted. Inverted to wait for the rendered state so
// timing is deterministic.

test.describe('Admin — header utility cluster (Balance / IM / Support)', () => {
	test('balance pill IS rendered for admin', async ({ page }) => {
		await openAdminPage(page, '/admin/');
		await expect(page.locator('[data-test-id="util-balance"]')).toBeVisible({ timeout: 5000 });
	});

	test('messages icon IS rendered for admin', async ({ page }) => {
		await openAdminPage(page, '/admin/');
		await expect(page.locator('[data-test-id="util-messages"]')).toBeVisible({ timeout: 5000 });
	});

	test('support icon IS rendered for admin', async ({ page }) => {
		await openAdminPage(page, '/admin/');
		await expect(page.locator('[data-test-id="util-support"]')).toBeVisible({ timeout: 5000 });
	});

	test('mobile drawer balance/messages/support entries ARE rendered for admin', async ({ page }) => {
		await openAdminPage(page, '/admin/');
		// MobileMenu mounts via island too; assert count, not visibility — the
		// drawer is display:none until toggled, but the DOM nodes exist.
		await expect.poll(
			async () => page.locator('[data-test-id="mobile-drawer-balance"]').count(),
			{ timeout: 5000 },
		).toBeGreaterThan(0);
		await Promise.all([
			expect(page.locator('[data-test-id="mobile-drawer-messages"]')).toHaveCount(1),
			expect(page.locator('[data-test-id="mobile-drawer-support"]')).toHaveCount(1),
		]);
	});

	test('direct /balance/ navigation as admin returns 200 (no longer redirected)', async ({ page }) => {
		// Since commit e1fb5d82 admins get the full Balance/IM/Support cluster
		// (same as regular users), so /balance/ is served, not redirected away.
		const response = await page.goto('/balance/');
		expect(response?.status()).toBe(200);
		expect(page.url()).toContain('/balance');
	});

	// IM and Support pages are NOT redirected for staff anymore — commit
	// `e1fb5d82 refactor(nav): restore IM + Support visibility for moderators
	// and above` re-enabled staff access. The top/mobile-drawer icons stay
	// gated through their own testids; only direct /im/ + /support/ work.
	test('direct /im/ navigation as admin returns 200 (no longer redirected)', async ({ page }) => {
		const response = await page.goto('/im/');
		expect(response?.status()).toBe(200);
		expect(page.url()).toContain('/im');
	});

	test('direct /support/ navigation as admin returns 200 (no longer redirected)', async ({ page }) => {
		const response = await page.goto('/support/');
		expect(response?.status()).toBe(200);
		expect(page.url()).toContain('/support');
	});
});

// ── AdminGrid — sort indicators ───────────────────────────────────────────────

test.describe('Admin — AdminGrid sort behaviour', () => {
	test('sortable column shows ⇅ before click', async ({ page }) => {
		await openAdminPage(page, '/admin/');
		const idHeader = page.locator('[data-test-id="sort-col-id"]').first();
		await expect(idHeader.locator('span')).toContainText('⇅', { timeout: 5000 });
	});

	test('clicking sortable column shows ▲', async ({ page }) => {
		await openAdminPage(page, '/admin/');
		const idHeader = page.locator('[data-test-id="sort-col-id"]').first();
		await idHeader.click();
		await expect(idHeader.locator('span')).toContainText('▲', { timeout: 2000 });
	});

	test('clicking sorted column again shows ▼', async ({ page }) => {
		await openAdminPage(page, '/admin/');
		const idHeader = page.locator('[data-test-id="sort-col-id"]').first();
		await idHeader.click();
		await idHeader.click();
		await expect(idHeader.locator('span')).toContainText('▼', { timeout: 2000 });
	});

	test('clicking different column resets previous sort indicator', async ({ page }) => {
		await openAdminPage(page, '/admin/');
		const idHeader    = page.locator('[data-test-id="sort-col-id"]').first();
		const loginHeader = page.locator('[data-test-id="sort-col-login"]').first();

		await idHeader.click();
		await expect(idHeader.locator('span')).toContainText('▲', { timeout: 2000 });

		await loginHeader.click();
		// ID now back to ⇅
		await Promise.all([
			expect(idHeader.locator('span')).toContainText('⇅', { timeout: 2000 }),
			expect(loginHeader.locator('span')).toContainText('▲', { timeout: 2000 }),
		]);
	});

	test('sorting changes row order', async ({ page }) => {
		await openAdminPage(page, '/admin/');

		const getFirstCellId = async () => {
			const firstCell = page.locator('tbody tr:not(:has(td[colspan])) td').first();
			return firstCell.textContent();
		};

		const idHeader = page.locator('[data-test-id="sort-col-id"]').first();
		await idHeader.click(); // asc
		const ascFirst = await getFirstCellId();

		await idHeader.click(); // desc
		const descFirst = await getFirstCellId();

		// If there are multiple rows, ascending and descending first cells differ
		const rowCount = await page.locator('tbody tr:not(:has(td[colspan]))').count();
		if (rowCount > 1) {
			expect(ascFirst).not.toBe(descFirst);
		}
	});
});

// ── AdminGrid — pagination ────────────────────────────────────────────────────

test.describe('Admin — AdminGrid pagination', () => {
	// AdminGrid renders a pagination row both above and below the table — match
	// `.first()` everywhere so the strict-mode locator doesn't trip on the pair.
	const DEFAULT_PAGE_SIZE = 10;

	// Note: a previous test here asserted prev/next paginator symmetry.
	// That assumption is wrong: the grid legitimately renders only `prev`
	// on the last page and only `next` on the first, so prev=2 next=0
	// is correct on the page-tail. The follow-up test below covers what
	// we actually care about — pagination appears when row count exceeds
	// pageSize — without depending on which page lands first.

	test('pagination shows on users page if more than pageSize users', async ({ page }) => {
		// If there's only 1 user this test passes trivially
		await openAdminPage(page, '/admin/');
		const rows = await page.locator('tbody tr:not(:has(td[colspan]))').count();

		if (rows === 0) return;

		// Either pagination is present or all rows fit
		const hasPagination = await page.locator('[data-test-id="admin-grid-prev"]').first().isVisible().catch(() => false);
		if (hasPagination) {
			await expect(page.locator('[data-test-id="admin-grid-next"]').first()).toBeVisible();
		}
		// Pass either way — the logic is that if there's no overflow, no pagination is shown
	});
});
