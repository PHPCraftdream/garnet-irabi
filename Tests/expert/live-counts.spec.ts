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

import { test, expect } from '../helpers/scoped-test';

test.describe.configure({ mode: 'parallel' });

test.describe('Live nav counters (~counts poll)', () => {
    test('GET /system/~counts returns numeric counters', async ({ page }) => {
        const resp = await page.request.get('/system/~counts');
        expect(resp.status()).toBe(200);

        const json = await resp.json();
        for (const key of ['bookingsPending', 'unreadIm', 'unreadSupport']) {
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
            body: JSON.stringify({ bookingsPending: 7, unreadIm: 3, unreadSupport: 4 }),
        }));

        await page.goto('/system/');

        // Islands hydrate post-load; the badges update on the first poll (~2s).
        await expect(page.locator('[data-test-id="nav-брони"] .count-badge-warning')).toHaveText('7', { timeout: 12000 });
        await expect(page.locator('[data-test-id="util-messages"] .util-badge')).toHaveText('3');
        await expect(page.locator('[data-test-id="util-support"] .util-badge')).toHaveText('4');
        // Widget badge = unread support + unread IM.
        await expect(page.locator('[data-test-id="support-widget-badge"]')).toHaveText('7');
    });
});
