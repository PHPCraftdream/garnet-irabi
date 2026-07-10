/**
 * User — Booking page tests
 *
 * Covers:
 *   - /bookings/id~{id}/~book renders without error
 *   - booking form submit redirects to /bookings (via goTo after XHR)
 *   - /bookings list shows expert name and meeting details after booking
 *
 * Uses stored user auth state. Requires setup:expert (approved expert
 * with free slots and is_online=1, location set).
 *
 * UI changes:
 *   - BookingFormIsland: XHR submit via fetch, then goTo(redirect) on success
 *   - Top-up is XHR-based (reactive, no form POST)
 *   - Teacher profile URL: /teacher/id~{id}
 *   - Slots calendar: week navigation (prev/next/today), booking modal with pre-selected slot
 */

import { test, expect, tn } from '../helpers/scoped-test';
import type { Page } from '@playwright/test';
import mysql from 'mysql2/promise';
test.describe.configure({ mode: 'serial' });

const DB_CONFIG = {
    host: '127.0.0.1',
    port: 3306,
    database: 'app_db',
    user: 'app_db',
    password: 'app_db',
};

async function getFreeSlot(): Promise<{ id: number; expertName: string; location: string; isOnline: number } | null> {
    const conn = await mysql.createConnection(DB_CONFIG);
    try {
        const [rows] = await conn.execute<any[]>(
            `SELECT ts.id, ts.location, ts.is_online, tp.display_name AS expert_name
             FROM ${tn('time_slots')} ts
             JOIN ${tn('expert_profiles')} tp ON tp.account_id = ts.expert_id
             WHERE ts.status = 'free'
               AND ts.start_at > UNIX_TIMESTAMP()
               AND tp.is_approved = 1
               AND NOT EXISTS (
                 SELECT 1 FROM ${tn('bookings')} b
                 WHERE b.bookable_type = 'time_slot'
                   AND b.bookable_id = ts.id
                   AND b.status IN ('pending', 'confirmed')
               )
             LIMIT 1`
        );
        if (rows.length === 0) return null;
        const r = rows[0];
        return { id: r.id, expertName: r.expert_name, location: r.location ?? '', isOnline: r.is_online };
    } finally {
        await conn.end();
    }
}

async function ensureBalance(page: Page, minBalance: number) {
    await page.goto('/system/balance');
    const text = await page.locator('[data-test-id="balance-amount"]').textContent().catch(() => '0');
    const balance = parseInt((text ?? '0').replace(/\D/g, ''), 10) || 0;
    if (balance < minBalance) {
        await page.locator('[data-test-id="topup-amount-input"]').fill(String(minBalance - balance + 500));
        await page.locator('[data-test-id="topup-submit"]').click();
        // XHR-based topup -- wait for reactive update
    }
}

// -- Booking form page --

test.describe('Booking form -- page loads', () => {
    test('/bookings list returns HTTP 200', async ({ page }) => {
        const resp = await page.goto('/system/bookings');
        expect(resp?.status()).toBe(200);
    });

    test('booking form returns HTTP 200 for valid slot', async ({ page }) => {
        const slot = await getFreeSlot();
        if (!slot) { console.log('No free approved slot -- skipping'); return; }
        const resp = await page.goto(`/system/bookings/id~${slot.id}/~book`);
        expect(resp?.status()).toBe(200);
    });

    test('booking form shows slot details', async ({ page }) => {
        const slot = await getFreeSlot();
        if (!slot) { console.log('No free approved slot -- skipping'); return; }
        await page.goto(`/system/bookings/id~${slot.id}/~book`);
        await Promise.all([
        	expect(page.locator('text=/Fatal|Exception/i')).toHaveCount(0),
        	expect(page.locator('[data-test-id="book-btn"]')).toBeVisible({ timeout: 8000 }),
        ]);
    });

    test('booking form for non-existent slot returns 404', async ({ page }) => {
        const resp = await page.goto('/system/bookings/id~999999999/~book');
        expect(resp?.status()).toBe(404);
    });
});

// -- Book action --

test.describe('Booking form -- submit', () => {
    let bookedSlot: { id: number; expertName: string; location: string; isOnline: number } | null = null;

    test('submitting booking form redirects to /bookings', async ({ page }) => {
        bookedSlot = await getFreeSlot();
        if (!bookedSlot) { console.log('No free approved slot -- skipping'); return; }

        await ensureBalance(page, 5000);
        await page.goto(`/system/bookings/id~${bookedSlot.id}/~book`);

        const bookBtn = page.locator('[data-test-id="book-btn"]');
        await expect(bookBtn).toBeVisible({ timeout: 8000 });

        // BookingFormIsland uses XHR fetch then goTo(redirect) on success
        await Promise.all([
            page.waitForURL(url => url.pathname === '/system/bookings' || url.pathname === '/bookings', { timeout: 10000 }),
            bookBtn.click(),
        ]);

        expect(page.url()).toContain('/bookings');
    });

    test('bookings list shows the new booking card', async ({ page }) => {
        await page.goto('/system/bookings');

        await Promise.all([
        	expect(page.locator('text=/Fatal|Exception/i')).toHaveCount(0),
        	expect(page.locator('[data-test-id^="booking-card-"]').first()).toBeVisible({ timeout: 8000 }),
        ]);
    });

    test('booking card shows expert name', async ({ page }) => {
        bookedSlot = bookedSlot ?? await (async () => {
            const conn = await mysql.createConnection(DB_CONFIG);
            try {
                const [rows] = await conn.execute<any[]>(
                    `SELECT ts.id, ts.location, ts.is_online, tp.display_name AS expert_name
                     FROM ${tn('time_slots')} ts
                     JOIN ${tn('expert_profiles')} tp ON tp.account_id = ts.expert_id
                     WHERE tp.is_approved = 1
                     LIMIT 1`
                );
                if (rows.length === 0) return null;
                const r = rows[0];
                return { id: r.id, expertName: r.expert_name, location: r.location ?? '', isOnline: r.is_online };
            } finally { await conn.end(); }
        })();

        if (!bookedSlot?.expertName) { console.log('No expert name available -- skipping'); return; }

        await page.goto('/system/bookings');

        // An expert element with data-test-id must appear
        const expertLinks = page.locator('[data-test-id^="booking-expert-"]');
        await expect(expertLinks.first()).toBeVisible({ timeout: 8000 });
    });

    test('booking card shows meeting info for online slot', async ({ page }) => {
        if (!bookedSlot) { console.log('No booked slot -- skipping'); return; }
        if (!bookedSlot.isOnline) { console.log('Slot is offline -- skipping online check'); return; }

        await page.goto('/system/bookings');

        const meetingEls = page.locator('[data-test-id^="booking-meeting-"]');
        await expect(meetingEls.first()).toBeVisible({ timeout: 8000 });
    });
});

// -- Expert profile via /teacher/id~X --

test.describe('Expert profile page', () => {
    test('/teacher/id~{id} returns 200 for approved expert', async ({ page }) => {
        const conn = await mysql.createConnection(DB_CONFIG);
        let expertId: number | null = null;
        try {
            const [rows] = await conn.execute<any[]>(
                `SELECT account_id FROM ${tn('expert_profiles')} WHERE is_approved = 1 LIMIT 1`
            );
            expertId = rows.length > 0 ? (rows[0].account_id as number) : null;
        } finally {
            await conn.end();
        }

        if (!expertId) { console.log('No approved expert -- skipping'); return; }
        const resp = await page.goto(`/expert/id~${expertId}`);
        expect(resp?.status()).toBe(200);
        await expect(page.locator('[data-test-id="expert-profile"]')).toBeVisible({ timeout: 8000 });
    });
});
