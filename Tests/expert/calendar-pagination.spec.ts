/**
 * Expert slot calendar — week-window pagination.
 *
 * Regression: the calendar used to render a fixed 4-week window starting at the
 * current week, so any slot outside it (a booked slot weeks ahead, or a past
 * one) was counted in the status filters but had no day cell on screen and no
 * way to reach it. The calendar now pages by 4-week windows (◄ / ► / Today), so
 * every slot is reachable.
 *
 * This seeds a free slot ~5 weeks out (beyond the default window), then asserts
 * it is hidden initially, appears after one "next" page, and hides again on
 * "Today".
 */

import { test, expect, tn } from '../helpers/scoped-test';
import mysql from 'mysql2/promise';
import { DB } from '../helpers/db';

test.describe.configure({ mode: 'serial' });

test.describe('Expert calendar — week pagination reaches far slots', () => {
    let slotId = 0;

    test.afterAll(async () => {
        if (!slotId) return;
        const conn = await mysql.createConnection(DB);
        try { await conn.execute(`DELETE FROM ${tn('time_slots')} WHERE id = ?`, [slotId]); }
        finally { await conn.end(); }
    });

    test('a slot 5 weeks out: hidden now, reachable via next, hidden again on today', async ({ page }) => {
        await page.goto('/system/expert/~slots');
        await expect(page.locator('[data-test-id="expert-week-nav"]')).toBeVisible({ timeout: 15000 });

        const selfId = await page.evaluate(() => (window as unknown as { __GARNET_ACCOUNT_ID__: number }).__GARNET_ACCOUNT_ID__);
        expect(selfId).toBeGreaterThan(0);

        // ~5 weeks ahead — comfortably inside the SECOND window (weeks 4–7), never
        // the first (weeks 0–3): now is in week 0, so now+35d lands in week 5.
        const now = Math.floor(Date.now() / 1000);
        const startAt = now + 86400 * 35;
        const uid = [...Array(16)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');

        const conn = await mysql.createConnection(DB);
        try {
            const [ins]: any = await conn.execute(
                `INSERT INTO ${tn('time_slots')}
                 (expert_id, start_at, end_at, duration_min, cost, is_online, location, max_users, status, uid, cancellation_penalty_percent, created_at)
                 VALUES (?, ?, ?, 60, 500, 1, 'https://meet.example.com/pagination', 1, 'free', ?, 0, ?)`,
                [selfId, startAt, startAt + 3600, uid, now]
            );
            slotId = Number(ins.insertId);
        } finally { await conn.end(); }
        expect(slotId).toBeGreaterThan(0);

        // Reload so the island fetches the freshly-seeded slot.
        await page.goto('/system/expert/~slots');
        await expect(page.locator('[data-test-id="expert-week-nav"]')).toBeVisible({ timeout: 15000 });

        const card = page.locator(`[data-test-id="expert-slot-${slotId}"]`);

        // Not in the current 4-week window.
        await expect(card).toHaveCount(0);

        // The pager hints there's a free slot ahead (the seeded one), so the user
        // knows paging forward is worth it.
        await expect(page.locator('[data-test-id="week-next-count-free"]')).toBeVisible();

        // Page forward one window — now within weeks 4–7.
        await page.locator('[data-test-id="expert-week-next"]').click();
        await expect(card).toBeVisible({ timeout: 8000 });

        // Back to today hides it again.
        await page.locator('[data-test-id="expert-week-today"]').click();
        await expect(card).toHaveCount(0, { timeout: 8000 });
    });
});
