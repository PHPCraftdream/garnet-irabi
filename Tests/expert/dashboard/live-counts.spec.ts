/**
 * Live navigation counters — the badges (pending bookings, unread messages,
 * unread support) and the message-widget badge refresh from the backend on a
 * ~20s poll instead of staying frozen at the server-rendered value.
 *
 * Coverage:
 *   - GET /system/~counts returns the three numeric counters;
 *   - the page exposes __GARNET_COUNTS_URL__ so the poller knows where to fetch;
 *   - the poller actually applies fresh counts to every badge (driven here by a
 *     stubbed ~counts response so the assertion is deterministic, not a 20s wait).
 *
 * Runs as expert (default storageState): experts have the bookings badge plus
 * the utility + widget badges, so all four targets exist on one page.
 */

import { test, expect } from '../../helpers/scoped-test';

test.describe.configure({ mode: 'parallel' });

test.describe('Live nav counters (~counts poll)', () => {
    test('GET /system/~counts returns numeric counters', async ({ page }) => {
        const resp = await page.request.get('/system/~counts');
        expect(resp.status()).toBe(200);

        const json = await resp.json();
        for (const key of ['primaryBadgeCount', 'unreadIm', 'unreadSupport']) {
            expect(typeof json[key], `${key} should be a number`).toBe('number');
            expect(json[key]).toBeGreaterThanOrEqual(0);
        }
    });

    test('the counts URL global is exposed for the poller', async ({ page }) => {
        await page.goto('/system/');
        const url = await page.evaluate(() => (window as unknown as { __GARNET_COUNTS_URL__?: string }).__GARNET_COUNTS_URL__);
        expect(typeof url).toBe('string');
        expect(url).toContain('~counts');
    });

    test('the poller applies fresh counts to every badge', async ({ page }) => {
        // Stub the poll so all badges resolve to known values regardless of the
        // tenant's real data — and stay stable across the 20s re-poll.
        await page.route(/\/~counts(\?|$)/, route => route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ primaryBadgeCount: 7, unreadIm: 3, unreadSupport: 4 }),
        }));

        await page.goto('/system/');

        // Islands hydrate post-load; the badges update on the first poll (~2s).
        // All four badges come from the same fetch, so they need the same
        // generous margin under load — leaving the other three at the
        // default 5s timeout let them flake independently of badge 1.
        await expect(page.locator('[data-test-id="nav-брони"] .count-badge-warning')).toHaveText('7', { timeout: 12000 });
        await expect(page.locator('[data-test-id="util-messages"] .util-badge')).toHaveText('3', { timeout: 12000 });
        await expect(page.locator('[data-test-id="util-support"] .util-badge')).toHaveText('4', { timeout: 12000 });
        // D-210: widget badge is support-only now — it used to sum unread
        // support + unread IM, which double-counted personal messages as
        // support load for a live client.
        await expect(page.locator('[data-test-id="support-widget-badge"]')).toHaveText('4', { timeout: 12000 });
    });

    /**
     * D-203: a click that opened a preview modal was observed alongside 3-5
     * duplicate `~counts` reads. Root cause: `poll()` (liveCounts.ts) had no
     * in-flight guard — the interval timer, a `visibilitychange` flip and an
     * explicit `refreshLiveCounts()` could all call it within the same tick,
     * and each independently passed the shared-cache freshness check and
     * fired its own fetch. Fixed with an in-flight ref, mirroring the
     * `useSending` guard D-171 added for the `~cancel` mutation.
     *
     * Reproduced here by firing several `visibilitychange` events in one
     * synchronous tick (the tab is already visible, so each one re-enters
     * `poll()`) while the response is deliberately slow — before the fix
     * this fired one request per event.
     */
    test('rapid visibilitychange flips do not fire concurrent ~counts requests', async ({ page }) => {
        let inFlightCount = 0;
        let maxConcurrent = 0;
        await page.route(/\/~counts(\?|$)/, async (route) => {
            inFlightCount++;
            maxConcurrent = Math.max(maxConcurrent, inFlightCount);
            await new Promise((r) => setTimeout(r, 800));
            inFlightCount--;
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ primaryBadgeCount: 1, unreadIm: 0, unreadSupport: 0 }),
            });
        });

        await page.goto('/system/');
        // Let the island hydrate so startLiveCounts() has registered its
        // visibilitychange listener before we start flipping it.
        await page.waitForTimeout(500);

        await page.evaluate(() => {
            for (let i = 0; i < 5; i++) document.dispatchEvent(new Event('visibilitychange'));
        });

        await page.waitForTimeout(2000);
        expect(maxConcurrent).toBeLessThanOrEqual(1);
    });
});
