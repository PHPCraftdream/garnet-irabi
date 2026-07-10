/**
 * Admin dashboard — working user links.
 *
 * Regression: the "Recent activity" and "Pending approvals" widgets used
 * AdminUserLink, which needs a UserDetailContext provider the dashboard doesn't
 * have — so its links were dead (preventDefault + no-op). They now render
 * AdminUserDualLink: a public-profile link + an admin-card gear, both plain
 * navigations. Recent activity also became one block per entry (an action line
 * with the two users on the row below).
 *
 * Data-dependent (needs at least one activity row); skips cleanly when the
 * tenant has none rather than false-failing.
 */

import { test, expect } from '../helpers/scoped-test';

test.describe.configure({ mode: 'parallel' });

test.describe('Admin dashboard — working user links', () => {
    test('recent-activity: one block per entry, dual links that navigate', async ({ page }) => {
        await page.goto('/system/admin/dashboard');

        const activity = page.locator('[data-test-id="admin-dash-activity"]');
        await expect(activity).toBeVisible({ timeout: 15000 });

        const rows = page.locator('[data-test-id^="admin-dash-log-"]');
        const count = await rows.count();
        test.skip(count === 0, 'no recent-activity rows in this tenant');

        const row = rows.first();

        // New layout: an action line + a users row, in one block.
        await expect(row.locator('.admin-dash-activity-head')).toHaveCount(1);
        await expect(row.locator('.admin-dash-activity-users')).toHaveCount(1);

        // Dual link: public profile (common-link) + admin gear (common-link-admin-tag).
        const profile = row.locator('a.common-link').first();
        await expect(profile).toHaveAttribute('href', /\/user\/id~\d+/);
        const gear = row.locator('a.common-link-admin-tag').first();
        await expect(gear).toHaveAttribute('href', /\/admin\/#user=\d+/);

        // The profile link must actually navigate (it was a dead button before).
        await page.evaluate(() => { (window as unknown as { __m?: string }).__m = 'alive'; });
        await profile.click({ noWaitAfter: true });
        await page.waitForURL(u => /\/user\/id~\d+/.test(new URL(u).pathname), { timeout: 10000 });
        expect(await page.evaluate(() => (window as unknown as { __m?: string }).__m)).toBe('alive');
    });
});
