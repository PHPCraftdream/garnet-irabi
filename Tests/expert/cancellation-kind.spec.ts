/**
 * Expert cancellation kind — decline vs cancel.
 *
 * Verifies the action→kind logic end-to-end:
 *
 * 1. Declining a PENDING booking (via the dashboard pending-bookings widget)
 *    writes an expert_cancellations row with kind='decline' and displays the
 *    decline-impact warning in the reject modal.
 *
 * 2. Cancelling a CONFIRMED booking (via the expert slots calendar) writes
 *    kind='cancel' and displays the cancel-impact warning in the cancel modal.
 */

import { test, expect, tn } from '../helpers/scoped-test';
import mysql from 'mysql2/promise';
import { DB } from '../helpers/db';

test.describe.configure({ mode: 'serial' });

test.describe('Expert cancellation kind — decline vs cancel', () => {
    const createdSlotIds: number[] = [];
    const createdBookingIds: number[] = [];

    /** Helper: get expert account id from the app global. */
    async function getExpertId(page: import('@playwright/test').Page): Promise<number> {
        await page.goto('/system/');
        await page.waitForLoadState('domcontentloaded');
        const id = await page.evaluate(
            () => (window as unknown as { __GARNET_ACCOUNT_ID__: number }).__GARNET_ACCOUNT_ID__
        );
        expect(id).toBeGreaterThan(0);
        return id;
    }

    /** Helper: seed a time slot + booking pair. */
    async function seedSlotAndBooking(
        expertId: number,
        bookingStatus: 'pending' | 'confirmed'
    ): Promise<{ slotId: number; bookingId: number }> {
        const now = Math.floor(Date.now() / 1000);
        const startAt = now + 86400 * 10; // 10 days ahead — within default 4-week window
        const uid = [...Array(16)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');

        const conn = await mysql.createConnection(DB);
        try {
            const [slotIns]: any = await conn.execute(
                `INSERT INTO ${tn('time_slots')}
                 (expert_id, start_at, end_at, duration_min, cost, is_online, location,
                  max_users, status, uid, cancellation_penalty_percent, created_at)
                 VALUES (?, ?, ?, 60, 500, 1, 'https://m.example/x',
                         1, 'booked', ?, 0, ?)`,
                [expertId, startAt, startAt + 3600, uid, now]
            );
            const slotId = Number(slotIns.insertId);
            expect(slotId).toBeGreaterThan(0);
            createdSlotIds.push(slotId);

            const confirmedAt = bookingStatus === 'confirmed' ? now : null;
            const [bookIns]: any = await conn.execute(
                `INSERT INTO ${tn('bookings')}
                 (user_id, bookable_id, bookable_type, status, created_at, confirmed_at)
                 VALUES (999999, ?, 'time_slot', ?, ?, ?)`,
                [slotId, bookingStatus, now, confirmedAt]
            );
            const bookingId = Number(bookIns.insertId);
            expect(bookingId).toBeGreaterThan(0);
            createdBookingIds.push(bookingId);

            return { slotId, bookingId };
        } finally {
            await conn.end();
        }
    }

    test.afterAll(async () => {
        if (createdBookingIds.length === 0 && createdSlotIds.length === 0) return;
        const conn = await mysql.createConnection(DB);
        try {
            if (createdBookingIds.length > 0) {
                const ph = createdBookingIds.map(() => '?').join(',');
                await conn.execute(
                    `DELETE FROM ${tn('expert_cancellations')} WHERE booking_id IN (${ph})`,
                    createdBookingIds
                );
                await conn.execute(
                    `DELETE FROM ${tn('bookings')} WHERE id IN (${ph})`,
                    createdBookingIds
                );
            }
            if (createdSlotIds.length > 0) {
                const ph = createdSlotIds.map(() => '?').join(',');
                await conn.execute(
                    `DELETE FROM ${tn('time_slots')} WHERE id IN (${ph})`,
                    createdSlotIds
                );
            }
        } finally {
            await conn.end();
        }
    });

    // ── TEST 1: decline a pending booking ────────────────────────────────

    test('declining a PENDING booking → kind = decline + decline-impact warning', async ({ page }) => {
        const expertId = await getExpertId(page);
        const { slotId, bookingId } = await seedSlotAndBooking(expertId, 'pending');

        // Reload dashboard so the pending-bookings widget picks up the seeded row.
        await page.goto('/system/');
        await page.waitForLoadState('domcontentloaded');

        // Click the reject button in the pending-bookings widget.
        const rejectBtn = page.locator(`[data-test-id="pending-reject-${bookingId}"]`);
        await expect(rejectBtn).toBeVisible({ timeout: 10000 });
        await rejectBtn.click();

        // Assert the decline-impact warning is shown in the reject modal.
        const impactWarning = page.locator('[data-test-id="reject-impact"]');
        await expect(impactWarning).toBeVisible({ timeout: 10000 });
        const warningText = await impactWarning.textContent();
        expect(warningText?.trim().length).toBeGreaterThan(0);

        // Fill reason and confirm.
        await page.locator('[data-test-id="reject-reason-input"]').fill('qa decline');
        await page.locator('[data-test-id="reject-modal-confirm"]').click();

        // Wait for the server round-trip, then verify the DB row.
        await page.waitForTimeout(2000);

        const conn = await mysql.createConnection(DB);
        try {
            const [rows]: any = await conn.execute(
                `SELECT kind FROM ${tn('expert_cancellations')} WHERE booking_id = ?`,
                [bookingId]
            );
            expect(rows.length).toBe(1);
            expect(rows[0].kind).toBe('decline');
        } finally {
            await conn.end();
        }
    });

    // ── TEST 2: cancel a confirmed booking ───────────────────────────────

    test('cancelling a CONFIRMED booking → kind = cancel + cancel-impact warning', async ({ page }) => {
        const expertId = await getExpertId(page);
        const { slotId, bookingId } = await seedSlotAndBooking(expertId, 'confirmed');

        // Navigate to the expert slots calendar.
        await page.goto('/system/expert/~slots');
        await expect(page.locator('[data-test-id="expert-week-nav"]')).toBeVisible({ timeout: 15000 });

        // The slot is 10 days out — within the default 4-week window.
        const slotCard = page.locator(`[data-test-id="expert-slot-${slotId}"]`);
        await expect(slotCard).toBeVisible({ timeout: 10000 });

        // Click the cancel button on the slot card.
        const cancelBtn = page.locator(`[data-test-id="cancel-booking-${slotId}"]`);
        await expect(cancelBtn).toBeVisible({ timeout: 10000 });
        await cancelBtn.click();

        // Assert the cancel modal and its impact warning are shown.
        const modal = page.locator('[data-test-id="cancel-booking-modal"]');
        await expect(modal).toBeVisible({ timeout: 10000 });

        const impactWarning = page.locator('[data-test-id="cancel-booking-impact"]');
        await expect(impactWarning).toBeVisible({ timeout: 10000 });
        const warningText = await impactWarning.textContent();
        expect(warningText?.trim().length).toBeGreaterThan(0);

        // Fill reason and submit.
        await page.locator('[data-test-id="cancel-booking-reason"]').fill('qa cancel');
        await page.locator('[data-test-id="cancel-booking-submit"]').click();

        // Wait for the server round-trip, then verify the DB row.
        await page.waitForTimeout(2000);

        const conn = await mysql.createConnection(DB);
        try {
            const [rows]: any = await conn.execute(
                `SELECT kind FROM ${tn('expert_cancellations')} WHERE booking_id = ?`,
                [bookingId]
            );
            expect(rows.length).toBe(1);
            expect(rows[0].kind).toBe('cancel');
        } finally {
            await conn.end();
        }
    });
});
