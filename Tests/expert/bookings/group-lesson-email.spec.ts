/**
 * D-139: no booking email said a lesson was a group lesson. A teacher
 * reading an email about ONE seat cancelling out of four couldn't tell
 * whether the whole group fell through or just one person.
 *
 * `EmailNotifications::bookingConfirmed` (and created/rejected/cancelled)
 * now append a "Формат занятия: Групповое, мест: N" row whenever the slot's
 * `max_users > 1`. This drives it through the real confirm-booking path and
 * reads the actually-queued email body back out of `mail_log`.
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

async function createGroupSlot(expertId: number): Promise<number> {
    return withConnection(async (c) => {
        const startAt = Math.floor(Date.now() / 1000) + 86400 * 10;
        const uid = [...Array(16)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
        const [res]: any = await c.execute(
            `INSERT INTO ${tn('time_slots')}
             (expert_id, start_at, end_at, duration_min, cost, is_online, location, max_users, booked_count, status, uid, created_at)
             VALUES (?, ?, ?, 60, 500, 1, 'https://meet.example.com/d139-test', 4, 1, 'free', ?, ?)`,
            [expertId, startAt, startAt + 3600, uid, Math.floor(Date.now() / 1000)],
        );
        return res.insertId;
    });
}

async function createPendingBooking(slotId: number, userId: number): Promise<number> {
    return withConnection(async (c) => {
        const [res]: any = await c.execute(
            `INSERT INTO ${tn('bookings')} (user_id, bookable_type, bookable_id, status, created_at)
             VALUES (?, 'time_slot', ?, 'pending', ?)`,
            [userId, slotId, Math.floor(Date.now() / 1000)],
        );
        return res.insertId;
    });
}

async function cleanup(slotId: number, bookingId: number): Promise<void> {
    await withConnection(async (c) => {
        await c.execute(`DELETE FROM ${tn('bookings')} WHERE id = ?`, [bookingId]);
        await c.execute(`DELETE FROM ${tn('time_slots')} WHERE id = ?`, [slotId]);
    });
}

test.describe.configure({ mode: 'serial' });

test.describe('D-139: booking emails name the group format', () => {
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

        slotId = await createGroupSlot(expertId);
        bookingId = await createPendingBooking(slotId, userId);
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

    test('confirming a group booking queues an email naming the group format', async () => {
        const result = await page.evaluate(async ({ id }) => {
            const csrf = (window as any).__GARNET_CSRF__ ?? '';
            const res = await fetch('/expert/~confirmBooking', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ CSRF_TOKEN: csrf, booking_id: id }),
            });
            return { status: res.status };
        }, { id: bookingId });
        expect(result.status).toBe(200);

        // enqueue() writes to email_queue — mail_log is populated later, only
        // once the send cron actually processes the row. The rendered HTML
        // is already final at enqueue time, so email_queue is the right
        // place to read it back from without needing a real send.
        const mail = await withConnection(async (c) => {
            const [rows] = await c.execute<any[]>(
                `SELECT body_html FROM ${tn('email_queue')} WHERE account_id = ? ORDER BY id DESC LIMIT 1`,
                [userId],
            );
            return rows[0];
        });
        expect(mail).toBeTruthy();
        expect(mail.body_html).toContain('Групповое, мест: 4');
    });
});
