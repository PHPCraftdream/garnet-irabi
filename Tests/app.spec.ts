import { test, expect } from './helpers/scoped-test';

test.describe('iRabi Application', () => {
	test('homepage loads successfully', async ({ page }) => {
		const response = await page.goto('/');
		expect(response?.status()).toBe(200);
		await expect(page.locator('body')).toBeVisible();
	});

	test('old /register URL returns 404', async ({ page }) => {
		const response = await page.goto('/register');
		expect(response?.status()).toBe(404);
	});

	test('invite token error page renders for invalid token', async ({ page }) => {
		const response = await page.goto('/first-step/token~invalid-test-token');
		expect(response?.status()).toBe(200);
		// The invite error island renders a heading and a reason paragraph
		await Promise.all([
			expect(page.locator('h1')).toBeVisible({ timeout: 10000 }),
		// Auth form should NOT be shown (invalid token = error, not login)
			expect(page.locator('[data-test-id="auth-login-input"]')).not.toBeVisible({ timeout: 2000 }),
		]);
	});

	test('homepage has no fatal errors', async ({ page }) => {
		await page.goto('/');
		await expect(page.locator('text=/Fatal|Exception/i')).toHaveCount(0);
	});

	test('homepage emits <link rel="prefetch"> for splitChunks common chunks', async ({ page }) => {
		// PhpClassGeneratorPlugin (rspack `afterEmit` hook) scans gen/js/
		// at build time and bakes the numbered-chunk URLs into
		// ForegroundJsGen::commonChunks(). IRabi::DEF_LAYOUT_PARAMS passes
		// them to HtmlLayout as `prefetch_js_assets`, which the twig
		// template renders as `<link rel="prefetch" as="script">` in <head>.
		// Zero runtime I/O — the array is a static method return.
		const html = await page.goto('/').then(r => r?.text() ?? '');

		// At least one prefetch link is expected — the build always
		// produces shared chunks because splitChunks pulls vendor + util
		// code out of the entry.
		const prefetchTags = html.match(/<link rel="prefetch"[^>]*>/g) ?? [];
		expect(prefetchTags.length, 'no prefetch links in <head> — check ForegroundJsGen::commonChunks() exists').toBeGreaterThan(0);

		// Every emitted URL must point at a numbered chunk under gen/js/.
		// Filter out entry/vendor accidents (those would explode prefetch
		// list size and waste bandwidth on chunks already loaded).
		for (const tag of prefetchTags) {
			const href = tag.match(/href="([^"]+)"/)?.[1] ?? '';
			expect(href, `prefetch href looks wrong: ${tag}`).toMatch(/^\/assets\/[^/]+\/gen\/js\/\d+\.[a-f0-9]+\.gen\.js$/);
		}

		// All prefetch URLs must be reachable — broken URL = wasted req +
		// browser cache pollution. Hit the first one.
		const firstHref = prefetchTags[0].match(/href="([^"]+)"/)?.[1] ?? '';
		const chunkResp = await page.request.get(firstHref);
		expect(chunkResp.status(), `first prefetch chunk ${firstHref} 404'd`).toBe(200);
	});
});
