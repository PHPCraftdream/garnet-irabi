/**
 * User — Booking modal (today's change: open BookingModal in-place instead of
 * navigating to a separate /bookings/..~book page).
 *
 * Covers:
 *   - Expert profile "Доступные слоты" → Забронировать opens the modal in-place
 *     (no navigation, /slots/~bookData hit).
 *   - Dashboard recommended-slots "забронировать" opens the modal (best-effort:
 *     only when a recommendation is present).
 *   - A stale/unavailable slot surfaces a toast and does NOT redirect to /slots
 *     (the redirect-removal fix).
 *
 * Uses the stored `user` auth state. Requires an approved expert (setup:expert).
 */
import { test, expect, tn } from '../helpers/scoped-test';
import mysql from 'mysql2/promise';
import { DB } from '../helpers/db';

test.describe.configure({ mode: 'serial' });

const BASE = process.env.BASE_URL || 'http://localhost:8001';

async function dbQuery(sql: string, params: any[] = []): Promise<any[]> {
    const conn = await mysql.createConnection(DB);
    try {
        const [rows] = await conn.execute<any[]>(sql, params);
        return rows;
    } finally { await conn.end(); }
}

async function dbExec(sql: string, params: any[] = []): Promise<void> {
    const conn = await mysql.createConnection(DB);
    try { await conn.execute(sql, params); }
    finally { await conn.end(); }
}

async function approvedExpertId(): Promise<number> {
    const rows = await dbQuery(`SELECT account_id FROM ${tn('expert_profiles')} WHERE is_approved = 1 LIMIT 1`);
    return Number(rows[0]?.account_id ?? 0);
}

async function createFreeSlot(expertId: number, cost = 500): Promise<number> {
    const now = Math.floor(Date.now() / 1000);
    const startAt = now + 86400 * 6; // future, inside the 4-week calendar window
    const uid = [...Array(16)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
    const conn = await mysql.createConnection(DB);
    try {
        const [ins]: any = await conn.execute(
            `INSERT INTO ${tn('time_slots')}
             (expert_id, start_at, end_at, duration_min, cost, is_online, location, max_users, status, uid, cancellation_penalty_percent, created_at)
             VALUES (?, ?, ?, 60, ?, 1, 'https://meet.example.com/modal-test', 1, 'free', ?, 0, ?)`,
            [expertId, startAt, startAt + 3600, cost, uid, now]
        );
        return Number(ins.insertId);
    } finally { await conn.end(); }
}

test.describe('Booking modal — opens in place', () => {
    let expertId = 0;
    const slotIds: number[] = [];

    test.beforeAll(async () => {
        expertId = await approvedExpertId();
        expect(expertId).toBeGreaterThan(0);
    });

    test.afterAll(async () => {
        for (const id of slotIds) {
            await dbExec(`DELETE FROM ${tn('bookings')} WHERE bookable_id = ? AND bookable_type = 'time_slot'`, [id]);
            await dbExec(`DELETE FROM ${tn('time_slots')} WHERE id = ?`, [id]);
        }
    });

    test('expert profile: Забронировать opens the modal in-place (no navigation)', async ({ page }) => {
        const slotId = await createFreeSlot(expertId);
        slotIds.push(slotId);

        await page.goto(`${BASE}/system/expert/id~${expertId}`);

        const bookBtn = page.locator(`[data-test-id="slot-book-${slotId}"]`);
        await expect(bookBtn).toBeVisible({ timeout: 10000 });

        // It must be a button (modal trigger), not an anchor navigating away.
        expect((await bookBtn.evaluate(el => el.tagName)).toLowerCase()).toBe('button');

        const bookData = page.waitForResponse(r => r.url().includes('/slots/~bookData') && r.status() === 200, { timeout: 8000 });
        await bookBtn.click();
        await bookData;

        await expect(page.locator('[data-test-id="booking-modal"]')).toBeVisible({ timeout: 8000 });
        // Stayed on the expert profile — no hard navigation to /bookings/..~book
        expect(new URL(page.url()).pathname).toContain(`/expert/id~${expertId}`);
    });

    test('dashboard recommended slots: book-btn opens the modal (when present)', async ({ page }) => {
        await page.goto(`${BASE}/system/`);
        await expect(page.locator('[data-test-id="dashboard"]')).toBeVisible({ timeout: 10000 });

        const recBook = page.locator('[data-test-id="recommended-slots"] [data-test-id="book-btn"]').first();
        if (await recBook.count() === 0) {
            test.skip(true, 'No recommended slot present for this user — nothing to click');
            return;
        }
        // Must be a button, not a navigating anchor.
        expect((await recBook.evaluate(el => el.tagName)).toLowerCase()).toBe('button');

        await recBook.click();
        await expect(page.locator('[data-test-id="booking-modal"]')).toBeVisible({ timeout: 8000 });
        expect(new URL(page.url()).pathname).toBe('/system/');
    });

    test('unavailable slot: shows a toast and does NOT redirect to /slots', async ({ page }) => {
        const slotId = await createFreeSlot(expertId);
        slotIds.push(slotId);

        await page.goto(`${BASE}/system/expert/id~${expertId}`);
        const bookBtn = page.locator(`[data-test-id="slot-book-${slotId}"]`);
        await expect(bookBtn).toBeVisible({ timeout: 10000 });

        // Make the slot stale AFTER it's rendered (simulates someone else booking
        // it while the page was held): the booking call will now fail.
        await dbExec(`UPDATE ${tn('time_slots')} SET status = 'booked' WHERE id = ?`, [slotId]);

        const profilePath = new URL(page.url()).pathname;
        await bookBtn.click();

        // A toast appears (global toast container) …
        const toast = page.locator('#global-toast [role="alert"]');
        await expect(toast).toContainText(/недоступ|занят|больше недоступен|unavailable|taken/i, { timeout: 8000 });

        // … and we are NOT yanked to the calendar.
        await page.waitForTimeout(500);
        expect(new URL(page.url()).pathname).toBe(profilePath);
        await expect(page.locator('[data-test-id="booking-modal"]')).toHaveCount(0);
    });
});
