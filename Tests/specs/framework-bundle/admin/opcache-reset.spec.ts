/**
 * Admin — POST /admin/system/~opcacheReset
 *
 * The endpoint is owner-only (DashboardSystemController::isAllowed === isOwner)
 * and idempotent. CLI OPcache typically isn't loaded in the PHP test runner, so
 * `function_exists('opcache_reset')` may be false — in that case the endpoint
 * responds 503. We accept BOTH 200 (cache present + reset) and 503 (cache not
 * available in this SAPI) as valid outcomes; the regression we're guarding is
 * "endpoint returns the right contract" + "non-owner is rejected".
 */

import { test, expect } from '../../../helpers/scoped-test';
import { newScopedContext } from '../../../helpers/scoped-test';
import { roleLogin } from '../../../helpers/role-login';

const RESET_PATH = '/admin/system/~opcacheReset';

async function postReset(page: any): Promise<{ status: number; body: any }> {
	return await page.evaluate(async (path: string) => {
		const csrf = (window as any).__GARNET_CSRF__ ?? '';
		const fd = new FormData();
		fd.append('CSRF_TOKEN', csrf);
		const res = await fetch(path, { method: 'POST', body: fd });
		const text = await res.text();
		let body: any = null;
		try { body = JSON.parse(text); } catch { body = text; }
		return { status: res.status, body };
	}, RESET_PATH);
}

test.describe('OPcache reset endpoint', () => {
	test('owner: returns 200 success or 503 unavailable, never 4xx auth', async ({ browser }) => {
		const context = await newScopedContext(browser);
		const page = await context.newPage();
		try {
			await roleLogin(page, 'owner');
			await page.goto('/admin/system/');
			await page.waitForFunction(() => !!(window as any).__GARNET_CSRF__, { timeout: 10000 });

			const result = await postReset(page);

			// Two acceptable states; either way the response is well-formed JSON.
			expect([200, 503]).toContain(result.status);
			expect(result.body).toBeTruthy();
			if (result.status === 200) {
				expect(result.body).toMatchObject({ success: true });
				expect(typeof result.body.sapi).toBe('string');
			} else {
				// 503: opcache_reset() not available — owner still gets a JSON error.
				expect(result.body).toHaveProperty('error');
			}
		} finally {
			await context.close();
		}
	});

	test('regular user: no opcache reset (no success response)', async ({ browser }) => {
		const context = await newScopedContext(browser);
		const page = await context.newPage();
		try {
			await roleLogin(page, 'user');
			// /admin/system/ would 403/no-access for non-owner — go to '/system/' instead
			// just to mint CSRF + cookies, then call the API directly.
			await page.goto('/system/');
			await page.waitForFunction(() => !!(window as any).__GARNET_CSRF__, { timeout: 10000 });

			const result = await postReset(page);
			// Two valid gates: the route-level middleware short-circuits with a
			// noAccess HTML page (200), or the controller's own isAllowed() returns
			// a 403 JSON. Both are "denied". The contract we guard is that a regular
			// user never sees `success: true` — i.e. the cache is never wiped on
			// their request.
			const body: unknown = result.body;
			const success = (body && typeof body === 'object' && 'success' in body)
				? (body as { success?: unknown }).success
				: undefined;
			expect(success).not.toBe(true);
		} finally {
			await context.close();
		}
	});

	test('owner: UI button is rendered on /admin/system/', async ({ browser }) => {
		const context = await newScopedContext(browser);
		const page = await context.newPage();
		try {
			await roleLogin(page, 'owner');
			await page.goto('/admin/system/');
			await expect(page.locator('[data-test-id="opcache-reset-btn"]')).toBeVisible({ timeout: 10000 });
		} finally {
			await context.close();
		}
	});
});
