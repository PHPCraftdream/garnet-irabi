/**
 * D-141: the "Мои ближайшие сессии" card on the dashboard always said
 * "Индивидуальное занятие" — even for a booking on a group slot (max_users
 * > 1). A user booking a spot in a group class had no way to tell from her
 * own dashboard that others would be there too.
 *
 * MainController now switches the label by the slot's max_users, in all
 * three places that build it: the student's upcoming bookings, the
 * recommended-slots widget, and the expert's own upcoming-slots widget.
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
        const startAt = Math.floor(Date.now() / 1000) + 86400 * 11;
        const uid = [...Array(16)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
        const [res]: any = await c.execute(
            `INSERT INTO ${tn('time_slots')}
             (expert_id, start_at, end_at, duration_min, cost, is_online, location, max_users, booked_count, status, uid, created_at)
             VALUES (?, ?, ?, 60, 500, 1, 'https://meet.example.com/d141-test', 3, 1, 'free', ?, ?)`,
            [expertId, startAt, startAt + 3600, uid, Math.floor(Date.now() / 1000)],
        );
        return res.insertId;
    });
}

async function createConfirmedBooking(slotId: number, userId: number): Promise<number> {
    return withConnection(async (c) => {
        const now = Math.floor(Date.now() / 1000);
        const [res]: any = await c.execute(
            `INSERT INTO ${tn('bookings')} (user_id, bookable_type, bookable_id, status, created_at, confirmed_at)
             VALUES (?, 'time_slot', ?, 'confirmed', ?, ?)`,
            [userId, slotId, now, now],
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

test.describe('D-141: dashboard booking card names the group format', () => {
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
        bookingId = await createConfirmedBooking(slotId, userId);
        expect(slotId).toBeGreaterThan(0);
        expect(bookingId).toBeGreaterThan(0);

        ctx = await newScopedContext(browser, { storageState: resolveStorageStatePath('user') });
        page = await ctx.newPage();
    });

    test.afterAll(async () => {
        await ctx?.close().catch(() => {});
        await cleanup(slotId, bookingId);
    });

    test('upcoming bookings card says "Групповое занятие", not "Индивидуальное"', async () => {
        await page.goto('/system/', { waitUntil: 'domcontentloaded' });
        const section = page.locator('[data-test-id="upcoming-bookings"]');
        await expect(section).toBeVisible({ timeout: 10000 });

        // Утверждение — про карточку ИМЕННО этой брони, а не про весь
        // блок. У того же ученика законно висят и другие занятия, в том
        // числе индивидуальные: запрет на слово «Индивидуальное» в целом
        // блоке падал на чужой карточке, хотя групповая была подписана
        // верно. Проверять надо ярлык брони, а не содержимое экрана.
        const card = section.locator(`[data-test-id="upcoming-booking-${bookingId}"]`);
        await expect(card).toBeVisible({ timeout: 10000 });
        await expect(card).toContainText('Групповое занятие');
        await expect(card).not.toContainText('Индивидуальное занятие');
    });
});
