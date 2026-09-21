/**
 * D-260 (UAT round, expert-3/Менахем Зельцер): the profile stat "Не
 * ответил на заявок" (Bookings::expertOutcomeCounts()'s `missed`) showed
 * 1, but none of the 19 cards on /expert/~bookings carried any status the
 * expert could recognize as "expired without an answer" — every
 * cancelled card just said the same generic "Отменён".
 *
 * Root cause: outcomeLabel() (Front/Common/booking/bookingAction.ts) had
 * a case for cancelled_role 'user' (withdrawn) and 'expert' (declined),
 * but fell through to the generic cancelled label for 'system' — the
 * exact role CronCompletionService's auto-decline branch stamps on a
 * booking whose expert never answered before the lesson started. The
 * counter was accurate; the card just couldn't be told apart from an
 * ordinary cancellation.
 */
import { test, expect, tn } from '../../helpers/scoped-test';
import mysql from 'mysql2/promise';
import { resolveStorageStatePath } from '../../helpers/auth/state';
import { newScopedContext } from '../../helpers/scoped-test';
import { DB } from '../../helpers/db/db';

test.describe.configure({ mode: 'serial' });

async function getAccountId(login: string): Promise<number> {
    const conn = await mysql.createConnection(DB);
    try {
        const [rows] = await conn.execute<any[]>(`SELECT id FROM ${tn('accounts')} WHERE login = ?`, [login]);
        return rows[0]?.id ?? 0;
    } finally { await conn.end(); }
}

test.describe('D-260: a system-auto-declined request reads as "expired", not a generic cancellation', () => {
    let expertId = 0;
    let userId = 0;
    let slotId = 0;
    let bookingId = 0;

    test.beforeAll(async ({ browser: _browser }) => {
        expertId = await getAccountId('testuser_setup_expert@irabi.test');
        userId = await getAccountId('testuser_setup_user@irabi.test');
        expect(expertId).toBeGreaterThan(0);
        expect(userId).toBeGreaterThan(0);

        const conn = await mysql.createConnection(DB);
        try {
            const now = Math.floor(Date.now() / 1000);
            const startAt = now - 3600;
            const uid = [...Array(16)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
            const [slotRes]: any = await conn.execute(
                `INSERT INTO ${tn('time_slots')}
                 (expert_id, start_at, end_at, duration_min, cost, is_online, location, max_users, status, uid, created_at)
                 VALUES (?, ?, ?, 60, 0, 1, 'https://meet.example.com/d260-test', 1, 'completed', ?, ?)`,
                [expertId, startAt, startAt + 3600, uid, now],
            );
            slotId = Number(slotRes.insertId);
            expect(slotId).toBeGreaterThan(0);

            const [bookingRes]: any = await conn.execute(
                `INSERT INTO ${tn('bookings')}
                 (user_id, bookable_type, bookable_id, status, cancelled_at, cancelled_role, created_at)
                 VALUES (?, 'time_slot', ?, 'cancelled', ?, 'system', ?)`,
                [userId, slotId, now, now - 100],
            );
            bookingId = Number(bookingRes.insertId);
            expect(bookingId).toBeGreaterThan(0);
        } finally {
            await conn.end();
        }
    });

    test.afterAll(async () => {
        const conn = await mysql.createConnection(DB);
        try {
            if (bookingId) await conn.execute(`DELETE FROM ${tn('bookings')} WHERE id = ?`, [bookingId]);
            if (slotId) await conn.execute(`DELETE FROM ${tn('time_slots')} WHERE id = ?`, [slotId]);
        } finally {
            await conn.end();
        }
    });

    test('the expert bookings list shows the missed-response label, not a generic "Отменён"', async ({ browser }) => {
        if (!bookingId) { test.skip(); return; }
        const ctx = await newScopedContext(browser, { storageState: resolveStorageStatePath('expert') });
        const page = await ctx.newPage();
        try {
            await page.goto('/expert/~bookings', { waitUntil: 'domcontentloaded' });
            const card = page.locator(`[data-test-id="booking-card-${bookingId}"]`);
            await expect(card).toBeVisible({ timeout: 10000 });
            await expect(card).toContainText('Истёк срок ответа');
            await expect(card).not.toContainText('Отменён');
        } finally {
            await ctx.close();
        }
    });
});
