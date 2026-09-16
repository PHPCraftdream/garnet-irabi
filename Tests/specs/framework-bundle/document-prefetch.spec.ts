/**
 * #386: document-prefetch behavior contract (garnet-framework #381-385,
 * shipped IRabi-side via v0.1.0-alpha64).
 *
 * `initDocumentPrefetchTriggers` wires hover/focus/press intent on every
 * eligible `<a href>` inside the `hot-click-container-init` container to
 * `prefetchDocument()`, which calls `getHtml()` — a GET with
 * `Accept: application/html`. That header is what distinguishes a prefetch
 * fetch from the browser's own page-navigation request in the assertions
 * below.
 *
 * Three contracts under test:
 *   1. Sustained hover (>300ms, `IntentTriggers.ts`'s `DEFAULT_HOVER_DELAY_MS`)
 *      over a plain nav link fires exactly one prefetch GET.
 *   2. Re-hovering the same link shortly after (well inside the 60s TTL,
 *      `PrefetchCache.ts`'s `DEFAULT_TTL_MS`) does NOT fire a second request
 *      — `freshEntry()`'s dedup, no longer defeated by a cancel-on-leave
 *      that used to delete the cache entry (the bug #385 fixed).
 *   3. Hovering/focusing a mutating `<button>` (the real booking-cancel
 *      control) never fires a prefetch GET — structural, not behavioral:
 *      `IntentTriggers.ts` only ever attaches via `closest('a[href]')`, so a
 *      `<button>` is never matched by the delegated handlers at all.
 */
import { test, expect, tn } from '../../helpers/scoped-test';
import { withConnection } from '../../helpers/db';

test.describe.configure({ mode: 'serial' });

function isPrefetchRequest(req: import('@playwright/test').Request, url: string): boolean {
	if (req.method() !== 'GET') return false;
	if (!req.url().endsWith(url)) return false;
	return req.headers()['accept'] === 'application/html';
}

test.describe('Document prefetch', () => {
	test('sustained hover fires exactly one prefetch GET, and re-hovering inside the TTL does not fire a second one', async ({ userPage: page }) => {
		await page.goto('/system/');
		// `nav a[href="/system/bookings"]` also matches the mobile drawer's
		// duplicate link (`data-test-id="mobile-nav-..."`) — scope to the
		// top-menu one specifically (`data-test-id^="nav-"`, no `mobile-` prefix).
		const link = page.locator('nav a[data-test-id^="nav-"][href="/system/bookings"]');
		await expect(link).toBeVisible({ timeout: 8000 });

		const requests: string[] = [];
		page.on('request', (req) => {
			if (isPrefetchRequest(req, '/system/bookings')) requests.push(req.url());
		});

		// First hover: past the 300ms debounce, plus margin for the fetch to
		// actually leave the browser.
		await link.hover();
		await page.waitForTimeout(800);
		expect(requests.length).toBe(1);

		// Move off, then back — a normal back-and-forth over a menu, not a
		// changed mind. Well inside the 60s TTL, so freshEntry() must still
		// find the settled entry and skip a second fetch.
		await page.locator('nav a[data-test-id^="nav-"][href="/system/slots"]').hover();
		await page.waitForTimeout(200);
		await link.hover();
		await page.waitForTimeout(800);
		expect(requests.length).toBe(1);
	});

	test('hovering and focusing a mutating button never fires a prefetch GET', async ({ userPage: page }) => {
		const expertLogin = 'testuser_setup_expert@irabi.test';
		let slotId = 0;
		let bookingId = 0;

		await test.step('seed a bookable slot and book it via UI', async () => {
			const expertRows = await withConnection((conn) =>
				conn.execute<any[]>(`SELECT id FROM ${tn('accounts')} WHERE login = ?`, [expertLogin])
			);
			const expertId = (expertRows[0] as any[])[0]?.id;
			expect(expertId).toBeTruthy();

			const startAt = Math.floor(Date.now() / 1000) + 86400 * 7;
			const uid = [...Array(16)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
			const result: any = await withConnection((conn) =>
				conn.execute(
					`INSERT INTO ${tn('time_slots')}
					 (expert_id, start_at, end_at, duration_min, cost, is_online, location, max_users, status, uid, created_at)
					 VALUES (?, ?, ?, 60, 0, 1, 'https://meet.example.com/386-prefetch-test', 1, 'free', ?, ?)`,
					[expertId, startAt, startAt + 3600, uid, Math.floor(Date.now() / 1000)]
				)
			);
			slotId = result[0].insertId;
			expect(slotId).toBeGreaterThan(0);

			await page.goto(`/system/bookings/id~${slotId}/~book`);
			const bookBtn = page.locator('[data-test-id="book-btn"]');
			await expect(bookBtn).toBeVisible({ timeout: 8000 });
			await Promise.all([
				page.waitForURL((url) => url.pathname === '/system/bookings' || url.pathname === '/bookings', { timeout: 10000 }),
				bookBtn.click(),
			]);

			const cards = page.locator('[data-test-id^="booking-card-"]');
			await expect(cards.first()).toBeVisible({ timeout: 8000 });
			const cardTestId = await cards.first().getAttribute('data-test-id');
			bookingId = parseInt(cardTestId?.replace('booking-card-', '') ?? '0', 10);
			expect(bookingId).toBeGreaterThan(0);
		});

		await test.step('hover + focus the cancel button, assert zero prefetch GETs', async () => {
			await page.goto('/system/bookings');
			const cancelBtn = page.locator(`[data-test-id="cancel-btn-${bookingId}"]`);
			await expect(cancelBtn).toBeVisible({ timeout: 8000 });

			const requests: string[] = [];
			page.on('request', (req) => {
				if (req.method() === 'GET' && req.headers()['accept'] === 'application/html') requests.push(req.url());
			});

			await cancelBtn.hover();
			await page.waitForTimeout(800);
			await cancelBtn.focus();
			await page.waitForTimeout(200);

			expect(requests.length).toBe(0);
		});

		await test.step('cleanup', async () => {
			if (!slotId) return;
			await withConnection((conn) =>
				conn.execute(
					`DELETE FROM ${tn('balance_ledger')} WHERE ref_type = 'booking' AND ref_id IN (SELECT id FROM ${tn('bookings')} WHERE bookable_type='time_slot' AND bookable_id=?)`,
					[slotId]
				)
			);
			await withConnection((conn) =>
				conn.execute(`DELETE FROM ${tn('bookings')} WHERE bookable_type='time_slot' AND bookable_id=?`, [slotId])
			);
			await withConnection((conn) => conn.execute(`DELETE FROM ${tn('time_slots')} WHERE id=?`, [slotId]));
		});
	});
});
