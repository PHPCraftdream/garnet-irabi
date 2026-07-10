/**
 * Expert — your own slots are never offered as bookable (today's change:
 * the slot calendar excludes expert_id = self). The slot still exists and shows
 * on your own profile (with the "your slot" marker), proving the calendar
 * exclusion is the self-filter, not a missing/invalid slot.
 *
 * Stored `expert` auth state.
 */
import { test, expect, tn } from '../helpers/scoped-test';
import mysql from 'mysql2/promise';
import { DB } from '../helpers/db';

test.describe.configure({ mode: 'serial' });

async function dbExec(sql: string, params: any[] = []): Promise<void> {
    const conn = await mysql.createConnection(DB);
    try { await conn.execute(sql, params); } finally { await conn.end(); }
}

test.describe('Own slots hidden from the booking calendar', () => {
    let slotId = 0;
    let selfId = 0;

    test.afterAll(async () => {
        if (slotId) await dbExec(`DELETE FROM ${tn('time_slots')} WHERE id = ?`, [slotId]);
    });

    test('own free future slot is hidden on /system/slots but visible on own profile', async ({ page }) => {
        await page.goto('/system/slots');
        selfId = await page.evaluate(() => (window as any).__GARNET_ACCOUNT_ID__);
        expect(selfId).toBeGreaterThan(0);

        // Create a perfectly bookable slot owned by THIS expert.
        const now = Math.floor(Date.now() / 1000);
        const startAt = now + 86400 * 8;
        const uid = [...Array(16)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
        const conn = await mysql.createConnection(DB);
        try {
            const [ins]: any = await conn.execute(
                `INSERT INTO ${tn('time_slots')}
                 (expert_id, start_at, end_at, duration_min, cost, is_online, location, max_users, status, uid, cancellation_penalty_percent, created_at)
                 VALUES (?, ?, ?, 60, 500, 1, 'https://meet.example.com/own-slot', 1, 'free', ?, 0, ?)`,
                [selfId, startAt, startAt + 3600, uid, now]
            );
            slotId = Number(ins.insertId);
        } finally { await conn.end(); }
        expect(slotId).toBeGreaterThan(0);

        // Booking calendar: loads, but does NOT offer my own slot.
        await page.goto('/system/slots');
        await expect(page.locator('[data-test-id="week-grid"]')).toBeVisible({ timeout: 10000 });
        await expect(page.locator(`[data-test-id="slot-book-btn-${slotId}"]`)).toHaveCount(0);
        await expect(page.locator(`[data-test-id="slot-card-${slotId}"]`)).toHaveCount(0);

        // Own profile: the very same slot IS listed (with the "your slot" marker).
        await page.goto(`/system/expert/id~${selfId}`);
        await expect(page.locator('[data-test-id="expert-profile"]')).toBeVisible({ timeout: 10000 });
        await expect(page.locator(`[data-test-id="slot-card-${slotId}"]`)).toBeVisible({ timeout: 8000 });
        await expect(page.locator(`[data-test-id="slot-own-${slotId}"]`)).toBeVisible();
    });
});
