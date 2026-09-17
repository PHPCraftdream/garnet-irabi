/**
 * D-130: a partially-filled group slot stays status='free' — it only flips
 * to 'booked' once max_users is reached (see the C-2 audit comment in
 * ExpertBookingsService::cancelAllFutureSlotsForExpert). Because of that,
 * cancelBookedSlot()'s status==='booked' guard could never reach it, and the
 * only endpoint that could (`cancelSlot`) never asked for a reason at all —
 * the student's booking card and cancellation email showed who cancelled and
 * nothing else.
 *
 * `cancelSlot` now requires a reason whenever the slot has active bookings,
 * and stores it the same way `cancelBookedSlot` always has
 * (`bookings.cancel_reason`, `expert_cancellations.reason`).
 */

import { test, expect, tn } from '../../helpers/scoped-test';
import { newScopedContext } from '../../helpers/scoped-test';
import { resolveStorageStatePath } from '../../helpers/auth/state';
import { withConnection } from '../../helpers/db/db';
import type { BrowserContext, Page } from '@playwright/test';

async function getIds(): Promise<{ expertId: number; userId: number }> {
    return withConnection(async (c) => {
        const [er] = await c.execute<any[]>(`SELECT id FROM ${tn('accounts')} WHERE login = 'testuser_setup_expert@irabi.test'`);
        const [ur] = await c.execute<any[]>(`SELECT id FROM ${tn('accounts')} WHERE login = 'testuser_setup_user@irabi.test'`);
        return { expertId: er[0]?.id ?? 0, userId: ur[0]?.id ?? 0 };
    });
}

async function createOpenGroupSlot(expertId: number): Promise<number> {
    return withConnection(async (c) => {
        const startAt = Math.floor(Date.now() / 1000) + 86400 * 9;
        const uid = [...Array(16)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
        const [res]: any = await c.execute(
            `INSERT INTO ${tn('time_slots')}
             (expert_id, start_at, end_at, duration_min, cost, is_online, location, max_users, booked_count, status, uid, created_at)
             VALUES (?, ?, ?, 60, 1000, 1, 'https://meet.example.com/d130-test', 3, 1, 'free', ?, ?)`,
            [expertId, startAt, startAt + 3600, uid, Math.floor(Date.now() / 1000)],
        );
        return res.insertId;
    });
}

async function createActiveBooking(slotId: number, userId: number): Promise<number> {
    return withConnection(async (c) => {
        const [res]: any = await c.execute(
            `INSERT INTO ${tn('bookings')} (user_id, bookable_type, bookable_id, status, created_at, confirmed_at)
             VALUES (?, 'time_slot', ?, 'confirmed', ?, ?)`,
            [userId, slotId, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000)],
        );
        return res.insertId;
    });
}

async function cleanup(slotId: number, bookingId: number): Promise<void> {
    await withConnection(async (c) => {
        await c.execute(`DELETE FROM ${tn('bookings')} WHERE id = ?`, [bookingId]);
        await c.execute(`DELETE FROM ${tn('time_slots')} WHERE id = ?`, [slotId]);
        await c.execute(`DELETE FROM ${tn('expert_cancellations')} WHERE slot_id = ?`, [slotId]);
    });
}

test.describe.configure({ mode: 'serial' });

test.describe('D-130: cancelling a group slot with open seats requires and stores a reason', () => {
    let expertId = 0;
    let userId = 0;
    let slotId = 0;
    let bookingId = 0;
    let ctx: BrowserContext;
    let page: Page;

    test.beforeAll(async ({ browser }) => {
        ({ expertId, userId } = await getIds());
        expect(expertId).toBeGreaterThan(0);
        expect(userId).toBeGreaterThan(0);

        slotId = await createOpenGroupSlot(expertId);
        bookingId = await createActiveBooking(slotId, userId);
        expect(slotId).toBeGreaterThan(0);
        expect(bookingId).toBeGreaterThan(0);

        ctx = await newScopedContext(browser, { storageState: resolveStorageStatePath('expert') });
        page = await ctx.newPage();
        await page.goto('/expert/');
    });

    test.afterAll(async () => {
        await ctx?.close().catch(() => {});
        await cleanup(slotId, bookingId);
    });

    test('without a reason: rejected', async () => {
        const result = await page.evaluate(async ({ id }) => {
            const csrf = (window as any).__GARNET_CSRF__ ?? '';
            const res = await fetch('/expert/~cancelSlot', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ CSRF_TOKEN: csrf, slot_id: id }),
            });
            return { status: res.status };
        }, { id: slotId });
        expect(result.status).toBe(400);

        const status = await withConnection(async (c) => {
            const [r] = await c.execute<any[]>(`SELECT status FROM ${tn('bookings')} WHERE id = ?`, [bookingId]);
            return r[0]?.status;
        });
        expect(status).toBe('confirmed');
    });

    test('with a reason: cancelled and the reason is stored', async () => {
        const result = await page.evaluate(async ({ id, reason }) => {
            const csrf = (window as any).__GARNET_CSRF__ ?? '';
            const res = await fetch('/expert/~cancelSlot', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ CSRF_TOKEN: csrf, slot_id: id, reason }),
            });
            return { status: res.status };
        }, { id: slotId, reason: 'D-130 test reason' });
        expect(result.status).toBe(200);

        const row = await withConnection(async (c) => {
            const [r] = await c.execute<any[]>(
                `SELECT status, cancel_reason FROM ${tn('bookings')} WHERE id = ?`, [bookingId],
            );
            return r[0];
        });
        expect(row.status).toBe('cancelled');
        expect(row.cancel_reason).toBe('D-130 test reason');

        const cancellation = await withConnection(async (c) => {
            const [r] = await c.execute<any[]>(
                `SELECT reason FROM ${tn('expert_cancellations')} WHERE slot_id = ? AND booking_id = ?`, [slotId, bookingId],
            );
            return r[0];
        });
        expect(cancellation?.reason).toBe('D-130 test reason');
    });
});
