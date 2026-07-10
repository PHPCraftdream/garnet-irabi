/**
 * Cancellation statistics are split into "declines" (отклонение до подтверждения,
 * kind='decline') and "cancellations" (отмена после подтверждения, kind='cancel').
 *
 * This seeds one row of each kind for the logged-in expert and asserts the
 * public expert profile shows them as two SEPARATE counts — proving the
 * per-kind COUNT split (ExpertController) and the two-tile display
 * (ExpertProfile) line up end-to-end.
 */

import { test, expect, tn } from '../helpers/scoped-test';
import mysql from 'mysql2/promise';
import { DB } from '../helpers/db';

test.describe.configure({ mode: 'serial' });

test.describe('Expert cancellation stats — declines vs cancellations', () => {
    let expertId = 0;
    const seeded: number[] = [];

    test.afterAll(async () => {
        if (!seeded.length) return;
        const conn = await mysql.createConnection(DB);
        try {
            await conn.execute(
                `DELETE FROM ${tn('expert_cancellations')} WHERE id IN (${seeded.map(() => '?').join(',')})`,
                seeded,
            );
        } finally { await conn.end(); }
    });

    test('profile shows declines and cancellations as separate counts', async ({ page }) => {
        await page.goto('/system/');
        expertId = await page.evaluate(() => (window as unknown as { __GARNET_ACCOUNT_ID__: number }).__GARNET_ACCOUNT_ID__);
        expect(expertId).toBeGreaterThan(0);

        // Baseline counts already on the profile (other tests / seed data may exist).
        await page.goto(`/system/expert/id~${expertId}`);
        await expect(page.locator('[data-test-id="expert-profile"]')).toBeVisible({ timeout: 10000 });
        const baseDeclines = Number(await page.locator('[data-test-id="expert-stat-declines"]').textContent());
        const baseCancels  = Number(await page.locator('[data-test-id="expert-stat-cancellations"]').textContent());

        // Seed exactly one decline + one cancellation for this expert.
        const now = Math.floor(Date.now() / 1000);
        const conn = await mysql.createConnection(DB);
        try {
            for (const kind of ['decline', 'cancel']) {
                const [ins]: any = await conn.execute(
                    `INSERT INTO ${tn('expert_cancellations')}
                     (expert_id, slot_id, booking_id, user_id, reason, created_at, kind)
                     VALUES (?, 0, 0, 0, 'qa', ?, ?)`,
                    [expertId, now, kind],
                );
                seeded.push(Number(ins.insertId));
            }
        } finally { await conn.end(); }

        // Reload: each count must have grown by exactly one, independently.
        await page.goto(`/system/expert/id~${expertId}`);
        await expect(page.locator('[data-test-id="expert-stat-declines"]')).toHaveText(String(baseDeclines + 1), { timeout: 10000 });
        await expect(page.locator('[data-test-id="expert-stat-cancellations"]')).toHaveText(String(baseCancels + 1));
    });
});
