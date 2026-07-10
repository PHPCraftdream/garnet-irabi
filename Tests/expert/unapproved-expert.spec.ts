/**
 * Unapproved expert — banner visibility & news suppression.
 *
 * Verifies:
 * 1. An expert whose profile is NOT approved sees a "pending approval" banner.
 * 2. Creating a slot while unapproved does NOT generate a news event.
 * 3. After re-approval, the banner disappears.
 */

import { test, expect, tn } from '../helpers/scoped-test';
import mysql from 'mysql2/promise';
import { DB } from '../helpers/db';

test.describe.configure({ mode: 'serial' });

test.describe('Unapproved expert — banner & news suppression', () => {
    let expertId = 0;
    let initialApprovalState = 0;
    let createdSlotId = 0;

    async function getExpertId(): Promise<number> {
        const conn = await mysql.createConnection(DB);
        try {
            const [rows] = await conn.execute<any[]>(
                `SELECT id FROM ${tn('accounts')} WHERE login = 'testuser_setup_expert@irabi.test'`
            );
            return rows[0]?.id ?? 0;
        } finally { await conn.end(); }
    }

    async function getExpertApprovalState(): Promise<number> {
        const conn = await mysql.createConnection(DB);
        try {
            const [rows] = await conn.execute<any[]>(
                `SELECT is_approved FROM ${tn('expert_profiles')}
                 WHERE account_id = (SELECT id FROM ${tn('accounts')} WHERE login = 'testuser_setup_expert@irabi.test')`
            );
            return rows[0]?.is_approved ?? 0;
        } finally { await conn.end(); }
    }

    async function setApprovalState(state: number): Promise<void> {
        const conn = await mysql.createConnection(DB);
        try {
            await conn.execute(
                `UPDATE ${tn('expert_profiles')} SET is_approved = ?
                 WHERE account_id = ?`, [state, expertId]
            );
            await conn.execute(
                `INSERT INTO ${tn('accounts_data')} (account_id, param, value)
                 SELECT id, 'IS_APPROVED', ? FROM ${tn('accounts')} WHERE login = 'testuser_setup_expert@irabi.test'
                 ON DUPLICATE KEY UPDATE value = ?`,
                [String(state), String(state)]
            );
        } finally { await conn.end(); }
    }

    async function getNewsCount(): Promise<number> {
        const conn = await mysql.createConnection(DB);
        try {
            const [rows] = await conn.execute<any[]>(
                `SELECT COUNT(*) AS cnt FROM ${tn('news_events')}
                 WHERE event_type = 'new_slot' AND actor_id = ?`,
                [expertId]
            );
            return rows[0]?.cnt ?? 0;
        } finally { await conn.end(); }
    }

    // ── TEST 1: record initial state and set unapproved ──────────────────

    test('entry: record initial approval state and set expert unapproved', async () => {
        expertId = await getExpertId();
        expect(expertId).toBeGreaterThan(0);

        initialApprovalState = await getExpertApprovalState();
        await setApprovalState(0);
    });

    // ── TEST 2: banner visible when unapproved ───────────────────────────

    test('unapproved expert sees the pending-approval banner', async ({ page }) => {
        if (!expertId) { test.skip(); return; }

        await page.goto('/system/expert/~slots');
        await expect(
            page.locator('[data-test-id="expert-pending-approval"]')
        ).toBeVisible({ timeout: 10000 });
    });

    // ── TEST 3: creating a slot while unapproved creates no news ─────────

    test('creating a slot while unapproved creates no news event', async ({ page }) => {
        if (!expertId) { test.skip(); return; }

        const newsBefore = await getNewsCount();

        await page.goto('/system/expert/~slots');
        await page.waitForLoadState('domcontentloaded');

        // Open create-slot modal
        const openBtn = page.locator('[data-test-id="open-create-slot-modal"]');
        await expect(openBtn).toBeVisible({ timeout: 10000 });
        await openBtn.click();

        // Fill form — date 12 days ahead
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 12);
        const dateStr = `${futureDate.getFullYear()}-${String(futureDate.getMonth() + 1).padStart(2, '0')}-${String(futureDate.getDate()).padStart(2, '0')}`;

        const dateInput = page.locator('[data-test-id="slot-date"]');
        await dateInput.fill(dateStr);

        const timeInput = page.locator('[data-test-id="slot-time"]');
        await timeInput.fill('10:00');

        const costInput = page.locator('[data-test-id="slot-cost"]');
        await costInput.fill('500');

        // Submit the form
        const submitBtn = page.locator('[data-test-id="create-slot-btn"]');
        await submitBtn.click();

        // Wait for the POST response
        await page.waitForTimeout(3000);

        // Capture the created slot id for cleanup
        const conn = await mysql.createConnection(DB);
        try {
            const [rows] = await conn.execute<any[]>(
                `SELECT id FROM ${tn('time_slots')} WHERE expert_id = ? ORDER BY id DESC LIMIT 1`,
                [expertId]
            );
            if (rows.length > 0) {
                createdSlotId = rows[0].id;
            }
        } finally { await conn.end(); }

        // Assert no new news event was created
        const newsAfter = await getNewsCount();
        expect(newsAfter).toBe(newsBefore);
    });

    // ── TEST 4: after re-approval, banner disappears ─────────────────────

    test('after re-approval the banner disappears', async ({ page }) => {
        if (!expertId) { test.skip(); return; }

        await setApprovalState(1);

        await page.goto('/system/expert/~slots');
        await page.waitForLoadState('domcontentloaded');

        await expect(
            page.locator('[data-test-id="expert-pending-approval"]')
        ).toHaveCount(0, { timeout: 10000 });
    });

    // ── TEST 5: restore initial state & cleanup ──────────────────────────

    test('exit: restore initial state + cleanup', async () => {
        if (!expertId) return;

        // Restore approval state
        await setApprovalState(initialApprovalState);

        // Cleanup created slot and any related news events
        if (createdSlotId > 0) {
            const conn = await mysql.createConnection(DB);
            try {
                await conn.execute(
                    `DELETE FROM ${tn('news_events')}
                     WHERE (target_key = ? OR payload LIKE ?)
                       AND event_type = 'new_slot'`,
                    [`slot:${createdSlotId}`, `%"slot_id":${createdSlotId}%`]
                );
                await conn.execute(
                    `DELETE FROM ${tn('bookings')} WHERE bookable_id = ? AND bookable_type = 'time_slot'`,
                    [createdSlotId]
                );
                await conn.execute(
                    `DELETE FROM ${tn('time_slots')} WHERE id = ?`,
                    [createdSlotId]
                );
            } finally { await conn.end(); }
        }
    });
});
