/**
 * Owner — anyone signed in can book (today's change: canBook = authenticated,
 * the not_user guard removed). An owner is not a "user" yet must see the book
 * button on the calendar and be able to open the booking modal.
 *
 * Stored `owner` auth state.
 */
import { test, expect, tn } from '../helpers/scoped-test';
import mysql from 'mysql2/promise';
import { DB } from '../helpers/db';

test.describe.configure({ mode: 'serial' });

async function dbQuery(sql: string, params: any[] = []): Promise<any[]> {
    const conn = await mysql.createConnection(DB);
    try { const [r] = await conn.execute<any[]>(sql, params); return r; }
    finally { await conn.end(); }
}
async function dbExec(sql: string, params: any[] = []): Promise<void> {
    const conn = await mysql.createConnection(DB);
    try { await conn.execute(sql, params); } finally { await conn.end(); }
}

test.describe('Owner can book a slot', () => {
    let slotId = 0;
    let expertId = 0;

    test.beforeAll(async () => {
        const exp = await dbQuery(`SELECT account_id FROM ${tn('expert_profiles')} WHERE is_approved = 1 LIMIT 1`);
        expertId = Number(exp[0]?.account_id ?? 0);
        expect(expertId).toBeGreaterThan(0);

        const now = Math.floor(Date.now() / 1000);
        const startAt = now + 86400 * 7;
        const uid = [...Array(16)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
        const conn = await mysql.createConnection(DB);
        try {
            const [ins]: any = await conn.execute(
                `INSERT INTO ${tn('time_slots')}
                 (expert_id, start_at, end_at, duration_min, cost, is_online, location, max_users, status, uid, cancellation_penalty_percent, created_at)
                 VALUES (?, ?, ?, 60, 500, 1, 'https://meet.example.com/owner-book', 1, 'free', ?, 0, ?)`,
                [expertId, startAt, startAt + 3600, uid, now]
            );
            slotId = Number(ins.insertId);
        } finally { await conn.end(); }
        expect(slotId).toBeGreaterThan(0);
    });

    test.afterAll(async () => {
        if (slotId) {
            await dbExec(`DELETE FROM ${tn('bookings')} WHERE bookable_id = ? AND bookable_type = 'time_slot'`, [slotId]);
            await dbExec(`DELETE FROM ${tn('time_slots')} WHERE id = ?`, [slotId]);
        }
    });

    test('owner sees the book button on an expert profile and can open the modal', async ({ page }) => {
        // The expert profile lists every free future slot (not week-bound like the
        // calendar), so the book button is reliably present. canBook is now true
        // for any signed-in account — an owner included.
        await page.goto(`/system/expert/id~${expertId}`);
        await expect(page.locator('[data-test-id="expert-profile"]')).toBeVisible({ timeout: 10000 });

        const bookBtn = page.locator(`[data-test-id="slot-book-${slotId}"]`);
        await expect(bookBtn).toBeVisible({ timeout: 10000 });
        expect((await bookBtn.evaluate(el => el.tagName)).toLowerCase()).toBe('button');

        await bookBtn.click();
        await expect(page.locator('[data-test-id="booking-modal"]')).toBeVisible({ timeout: 8000 });
    });
});
