/**
 * D-256 (UAT 21.09): a student opened the booking modal for a free slot,
 * clicked "Забронировать (500₽)", and — per the report — the modal closed
 * silently back to the catalog with no toast, no error, no hint. The
 * network panel showed `POST /system/slots/~book` answered 400. Balance
 * was unchanged and the slot had vanished from the catalog (someone else
 * had taken it in the meantime — a real overbooking race, not a fabricated
 * one).
 *
 * This spec reproduces the exact race: open the modal on a free slot (real
 * UI click, not a raw fetch), THEN — before the confirm click — have the
 * slot taken out from under it via a direct status flip (standing in for a
 * concurrent booker), THEN click "Забронировать" on the now-stale modal.
 * If BookingModal's error handling works, an error message must appear and
 * the modal must not silently close as if nothing happened.
 */
import { test, expect, tn } from '../../helpers/scoped-test';
import { newScopedContext } from '../../helpers/scoped-test';
import { DB } from '../../helpers/db/db';
import { roleLogin } from '../../helpers/auth/role-login';
import type { BrowserContext, Page } from '@playwright/test';
import mysql from 'mysql2/promise';

test.describe.configure({ mode: 'serial' });

const BASE_URL = process.env.BASE_URL || 'http://localhost:8001';

async function dbQuery(sql: string, params: any[] = []) {
    const conn = await mysql.createConnection(DB);
    try {
        const [rows] = await conn.execute<any[]>(sql, params);
        return rows;
    } finally { await conn.end(); }
}

async function dbExec(sql: string, params: any[] = []) {
    const conn = await mysql.createConnection(DB);
    try {
        await conn.execute(sql, params);
    } finally { await conn.end(); }
}

async function getAccountId(login: string): Promise<number> {
    const rows = await dbQuery(`SELECT id FROM ${tn('accounts')} WHERE login = ?`, [login]);
    return rows[0]?.id ?? 0;
}

async function ensureBalance(accountId: number, minBalance: number): Promise<void> {
    const rows = await dbQuery(`SELECT balance FROM ${tn('account_balance')} WHERE account_id = ?`, [accountId]);
    const cur = rows[0] ? Number(rows[0].balance) : 0;
    if (cur >= minBalance) return;
    const need = minBalance - cur;
    await dbExec(
        `INSERT INTO ${tn('balance_ledger')} (account_id, is_credit, amount, entry_type, ref_type, ref_id, note, created_at)
         VALUES (?, 1, ?, 'top_up', 'manual', 0, 'test top-up', UNIX_TIMESTAMP())`,
        [accountId, need]
    );
    await dbExec(
        `INSERT INTO ${tn('account_balance')} (account_id, balance, updated_at) VALUES (?, ?, UNIX_TIMESTAMP())
         ON DUPLICATE KEY UPDATE balance = (
             SELECT COALESCE(SUM(CASE WHEN is_credit=1 THEN amount ELSE -amount END), 0)
             FROM ${tn('balance_ledger')} WHERE account_id = ?
         ), updated_at = UNIX_TIMESTAMP()`,
        [accountId, minBalance, accountId]
    );
}

test.describe('D-256 — booking modal must not fail silently when the slot is raced away', () => {
    let expertId = 0;
    let userId = 0;
    let slotId = 0;
    let newsEventId = 0;
    let userCtx: BrowserContext;
    let userPage: Page;

    const SLOT_COST = 700;

    test.beforeAll(async ({ browser }) => {
        expertId = await getAccountId('expert1@dev.test');
        userId = await getAccountId('user1@dev.test');
        expect(expertId).toBeGreaterThan(0);
        expect(userId).toBeGreaterThan(0);

        await ensureBalance(userId, SLOT_COST + 500);

        const nowSec = Math.floor(Date.now() / 1000);
        const startAt = nowSec + 86400 * 5;
        const uid = [...Array(16)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');

        const conn = await mysql.createConnection(DB);
        try {
            const [slotIns]: any = await conn.execute(
                `INSERT INTO ${tn('time_slots')}
                 (expert_id, start_at, end_at, duration_min, cost, is_online, location, max_users, booked_count, status, uid, cancellation_penalty_percent, created_at)
                 VALUES (?, ?, ?, 60, ?, 1, 'https://meet.example.com/d256-test', 1, 0, 'free', ?, 0, ?)`,
                [expertId, startAt, startAt + 3600, SLOT_COST, uid, nowSec]
            );
            slotId = Number(slotIns.insertId);
            expect(slotId).toBeGreaterThan(0);

            const payload = JSON.stringify({
                slot_id: slotId,
                expert_id: expertId,
                name: 'D-256 test expert',
                time: startAt,
                cost: SLOT_COST,
            });
            const [evIns]: any = await conn.execute(
                `INSERT INTO ${tn('news_events')}
                 (event_type, audience_type, audience_id, target_key, actor_id, payload, created_at)
                 VALUES ('new_slot', 'broadcast', NULL, ?, ?, ?, ?)`,
                [`slot:${slotId}`, expertId, payload, nowSec]
            );
            newsEventId = Number(evIns.insertId);
            expect(newsEventId).toBeGreaterThan(0);
        } finally {
            await conn.end();
        }

        userCtx = await newScopedContext(browser);
        userPage = await userCtx.newPage();
        await userPage.goto(`${BASE_URL}/`);
        await roleLogin(userPage, 'user');
        await userPage.goto(`${BASE_URL}/`);
    });

    test.afterAll(async () => {
        await userCtx?.close().catch(() => {});
        if (newsEventId) await dbExec(`DELETE FROM ${tn('news_events')} WHERE id = ?`, [newsEventId]).catch(() => {});
        if (slotId) {
            await dbExec(`DELETE FROM ${tn('bookings')} WHERE bookable_id = ? AND bookable_type = ?`, [slotId, 'time_slot']).catch(() => {});
            await dbExec(`DELETE FROM ${tn('time_slots')} WHERE id = ?`, [slotId]).catch(() => {});
        }
    });

    test('confirming a booking on a slot raced away by another buyer shows an error, not silence', async () => {
        await userPage.goto(`${BASE_URL}/system/`);

        const balBefore = (await dbQuery(`SELECT balance FROM ${tn('account_balance')} WHERE account_id = ?`, [userId]))[0]?.balance ?? 0;

        const bookBtn = userPage.locator(`[data-test-id="news-book-slot-${slotId}"]`);
        await expect(bookBtn).toBeVisible({ timeout: 10000 });
        await bookBtn.click();

        const modal = userPage.locator('[data-test-id="booking-modal"]');
        await expect(modal).toBeVisible({ timeout: 8000 });

        // The race: another buyer takes the slot WHILE the modal is already
        // open on this user's screen — exactly the window the report describes.
        await dbExec(`UPDATE ${tn('time_slots')} SET status = 'booked', booked_count = 1 WHERE id = ?`, [slotId]);

        const submit = modal.locator('button[type="button"]').filter({ hasText: /^(Забронировать|Book)/ }).first();
        await expect(submit).toBeVisible({ timeout: 5000 });
        await submit.click();

        // The real assertion: SOME visible error must appear, and the modal
        // must not vanish as if the booking had gone through.
        const errorText = modal.locator('.text-danger');
        await expect(errorText).toBeVisible({ timeout: 5000 });
        await expect(modal).toBeVisible();

        // No booking must have been created, no money moved.
        const rows = await dbQuery(
            `SELECT id FROM ${tn('bookings')} WHERE user_id = ? AND bookable_id = ? AND bookable_type = ?`,
            [userId, slotId, 'time_slot']
        );
        expect(rows.length).toBe(0);

        const balAfter = (await dbQuery(`SELECT balance FROM ${tn('account_balance')} WHERE account_id = ?`, [userId]))[0]?.balance ?? 0;
        expect(Number(balAfter)).toBe(Number(balBefore));
    });
});
