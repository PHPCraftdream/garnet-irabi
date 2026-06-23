/**
 * Regression: "Message Expert/User" buttons removed from booking cards.
 *
 * Verifies that after the removal of the messaging buttons from BookingsTab,
 * no message-expert-btn-* or message-user-btn-* elements appear on the
 * user's bookings page.
 */

import { test, expect, tn } from '../helpers/scoped-test';
import mysql from 'mysql2/promise';
import { DB } from '../helpers/db';

test.describe.configure({ mode: 'serial' });

test.describe('Booking card — no message buttons (regression)', () => {
    let userId = 0;
    let expertId = 0;
    let slotId = 0;
    let bookingId = 0;

    test('entry: seed a confirmed booking for the user on an expert slot', async () => {
        const conn = await mysql.createConnection(DB);
        try {
            const [userRows] = await conn.execute<any[]>(
                `SELECT id FROM ${tn('accounts')} WHERE login = 'testuser_setup_user@irabi.test'`
            );
            userId = userRows[0]?.id ?? 0;
            expect(userId).toBeGreaterThan(0);

            const [expertRows] = await conn.execute<any[]>(
                `SELECT id FROM ${tn('accounts')} WHERE login = 'testuser_setup_expert@irabi.test'`
            );
            expertId = expertRows[0]?.id ?? 0;
            expect(expertId).toBeGreaterThan(0);

            const now = Math.floor(Date.now() / 1000);
            const startAt = now + 86400 * 8;
            const uid = [...Array(16)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');

            const [slotResult]: any = await conn.execute(
                `INSERT INTO ${tn('time_slots')}
                 (expert_id, start_at, end_at, duration_min, cost, is_online, location,
                  max_users, status, uid, cancellation_penalty_percent, created_at)
                 VALUES (?, ?, ?, 60, 500, 1, 'https://m.example/x',
                         1, 'booked', ?, 0, ?)`,
                [expertId, startAt, startAt + 3600, uid, now]
            );
            slotId = Number(slotResult.insertId);
            expect(slotId).toBeGreaterThan(0);

            const [bookResult]: any = await conn.execute(
                `INSERT INTO ${tn('bookings')}
                 (user_id, bookable_id, bookable_type, status, created_at, confirmed_at)
                 VALUES (?, ?, 'time_slot', 'confirmed', ?, ?)`,
                [userId, slotId, now, now]
            );
            bookingId = Number(bookResult.insertId);
            expect(bookingId).toBeGreaterThan(0);
        } finally {
            await conn.end();
        }
    });

    test('the booking card has NO message button', async ({ page }) => {
        if (!bookingId) { test.skip(); return; }

        await page.goto('/system/bookings');

        const card = page.locator(`[data-test-id="booking-card-${bookingId}"]`);
        await expect(card).toBeVisible({ timeout: 10000 });

        // The specific message button for this booking must not exist
        const messageExpertBtn = page.locator(`[data-test-id="message-expert-btn-${bookingId}"]`);
        await expect(messageExpertBtn).toHaveCount(0);

        // No message buttons anywhere on the page (both expert and user variants)
        await expect(page.locator('[data-test-id^="message-expert-btn-"]')).toHaveCount(0);
        await expect(page.locator('[data-test-id^="message-user-btn-"]')).toHaveCount(0);
    });

    test('exit: cleanup', async () => {
        const conn = await mysql.createConnection(DB);
        try {
            if (bookingId) {
                await conn.execute(
                    `DELETE FROM ${tn('bookings')} WHERE id = ?`,
                    [bookingId]
                );
            }
            if (slotId) {
                await conn.execute(
                    `DELETE FROM ${tn('time_slots')} WHERE id = ?`,
                    [slotId]
                );
            }
        } finally {
            await conn.end();
        }
    });
});
