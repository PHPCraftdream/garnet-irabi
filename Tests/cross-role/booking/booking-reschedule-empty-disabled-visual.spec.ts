/**
 * D-251 (UAT round, user-3/Софья Гринберг): when the expert has no other
 * free slot at the same price, RescheduleModal shows its confirm button
 * WITHOUT a date to reschedule to. The button is genuinely `disabled` in
 * the DOM (`SendButton`'s `disabled={selectedId === null}`, and no option
 * ever sets `selectedId` when the options list is empty) — clicking it is
 * correctly a no-op. But it LOOKS exactly like an active button: `.btn`
 * never styled `:disabled` (no opacity change, no cursor change), and the
 * variant it uses, `btn-outline-warning`, had no CSS rule behind it at all
 * — a plain unstyled fallback. A disabled control with an enabled look
 * reads to a person as "the button is broken", not "there's nothing to
 * reschedule to".
 *
 * This spec checks the actual computed style of that disabled button —
 * cursor and opacity — the two signals a native `disabled` button should
 * carry and, before the fix, carried neither.
 */
import { test, expect, tn } from '../../helpers/scoped-test';
import mysql from 'mysql2/promise';
import { DB } from '../../helpers/db/db';
import { roleLogin } from '../../helpers/auth/role-login';

test.describe.configure({ mode: 'serial' });

async function createTestSlot(login: string, startOffsetDays: number, cost: number): Promise<{ slotId: number; expertId: number }> {
    const conn = await mysql.createConnection(DB);
    try {
        const [expertAccRows] = await conn.execute<any[]>(
            `SELECT id FROM ${tn('accounts')} WHERE login = ?`, [login]
        );
        const expertId = expertAccRows[0]?.id;
        if (!expertId) return { slotId: 0, expertId: 0 };

        const startAt = Math.floor(Date.now() / 1000) + 86400 * startOffsetDays;
        const uid = [...Array(16)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
        const [result]: any = await conn.execute(
            `INSERT INTO ${tn('time_slots')}
             (expert_id, start_at, end_at, duration_min, cost, is_online, location, max_users, status, uid, created_at)
             VALUES (?, ?, ?, 60, ?, 1, 'https://meet.example.com/d251-reschedule-empty-test', 1, 'free', ?, ?)`,
            [expertId, startAt, startAt + 3600, cost, uid, Math.floor(Date.now() / 1000)]
        );
        return { slotId: result.insertId, expertId };
    } finally {
        await conn.end();
    }
}

async function findBookingId(userId: number, slotId: number): Promise<number> {
    const conn = await mysql.createConnection(DB);
    try {
        const [rows] = await conn.execute<any[]>(
            `SELECT id FROM ${tn('bookings')} WHERE user_id = ? AND bookable_id = ? AND bookable_type = 'time_slot' ORDER BY id DESC LIMIT 1`,
            [userId, slotId],
        );
        return Number(rows[0]?.id ?? 0);
    } finally {
        await conn.end();
    }
}

async function getAccountId(login: string): Promise<number> {
    const conn = await mysql.createConnection(DB);
    try {
        const [rows] = await conn.execute<any[]>(`SELECT id FROM ${tn('accounts')} WHERE login = ?`, [login]);
        return Number(rows[0]?.id ?? 0);
    } finally {
        await conn.end();
    }
}

async function deleteTestSlot(slotId: number): Promise<void> {
    if (!slotId) return;
    const conn = await mysql.createConnection(DB);
    try {
        await conn.execute(
            `DELETE FROM ${tn('balance_ledger')} WHERE ref_type = 'booking' AND ref_id IN (SELECT id FROM ${tn('bookings')} WHERE bookable_type='time_slot' AND bookable_id=?)`,
            [slotId]
        );
        await conn.execute(`DELETE FROM ${tn('bookings')} WHERE bookable_type='time_slot' AND bookable_id=?`, [slotId]);
        await conn.execute(`DELETE FROM ${tn('time_slots')} WHERE id=?`, [slotId]);
    } finally {
        await conn.end();
    }
}

test.describe('D-251: reschedule modal with no alternative slot must LOOK disabled, not just BE disabled', () => {
    // Free slot: avoids any balance dependency for the booking step.
    const UNIQUE_COST = 0;
    let slotId = 0;
    let bookingId = 0;

    test.beforeAll(async () => {
        const { slotId: sid } = await createTestSlot('expert1@dev.test', 9, UNIQUE_COST);
        slotId = sid;
        expect(slotId).toBeGreaterThan(0);
    });

    test.afterAll(async () => {
        await deleteTestSlot(slotId);
    });

    test('book the only slot, then open reschedule — options list is empty', async ({ page }) => {
        if (!slotId) { test.skip(); return; }
        await page.goto('/');
        await roleLogin(page, 'user');
        await page.goto(`/system/bookings/id~${slotId}/~book`);
        const bookBtn = page.locator('[data-test-id="book-btn"]');
        await expect(bookBtn).toBeVisible({ timeout: 8000 });
        await Promise.all([
            page.waitForURL(url => url.pathname === '/system/bookings' || url.pathname === '/bookings', { timeout: 10000 }),
            bookBtn.click(),
        ]);

        const userId = await getAccountId('user1@dev.test');
        bookingId = await findBookingId(userId, slotId);
        expect(bookingId).toBeGreaterThan(0);

        const card = page.locator(`[data-test-id="booking-card-${bookingId}"]`);
        await expect(card).toBeVisible({ timeout: 8000 });

        const rescheduleBtn = page.locator(`[data-test-id="reschedule-btn-${bookingId}"]`);
        await expect(rescheduleBtn).toBeVisible({ timeout: 8000 });
        await rescheduleBtn.click();

        const modal = page.locator('[data-test-id="reschedule-modal"]');
        await expect(modal).toBeVisible({ timeout: 5000 });

        const empty = page.locator('[data-test-id="reschedule-modal-empty"]');
        await expect(empty).toBeVisible({ timeout: 8000 });
    });

    test('the disabled submit button visually reads as disabled', async ({ page }) => {
        if (!bookingId) { test.skip(); return; }
        await page.goto('/');
        await roleLogin(page, 'user');
        // Modal state doesn't survive navigation — reopen it fresh.
        await page.goto('/system/bookings');
        await page.locator(`[data-test-id="reschedule-btn-${bookingId}"]`).click();
        const modal = page.locator('[data-test-id="reschedule-modal"]');
        await expect(modal).toBeVisible({ timeout: 5000 });
        await expect(page.locator('[data-test-id="reschedule-modal-empty"]')).toBeVisible({ timeout: 8000 });

        const submit = page.locator('[data-test-id="reschedule-modal-submit"]');
        await expect(submit).toBeVisible();
        await expect(submit).toBeDisabled();

        const style = await submit.evaluate((el) => {
            const cs = getComputedStyle(el);
            return { cursor: cs.cursor, opacity: cs.opacity };
        });
        expect(style.cursor).not.toBe('pointer');
        expect(Number(style.opacity)).toBeLessThan(1);
    });
});
