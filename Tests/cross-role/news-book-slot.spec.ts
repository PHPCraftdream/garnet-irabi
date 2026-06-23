import { test, expect, tn } from '../helpers/scoped-test';
import type { BrowserContext, Page } from '@playwright/test';
import mysql from 'mysql2/promise';

import { newScopedContext } from '../helpers/scoped-test';
import { DB } from '../helpers/db';
import { roleLogin } from '../helpers/role-login';
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

async function devLogin(context: BrowserContext, role: string): Promise<Page> {
    const page = await context.newPage();
    await page.goto(`${BASE_URL}/`);

    await roleLogin(page, role);

    await page.goto(`${BASE_URL}/`);

    return page;
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

test.describe('News Feed — book slot via dialog', () => {
    let expertId = 0;
    let userId = 0;
    let slotId = 0;
    let newsEventId = 0;
    let userCtx: BrowserContext;
    let userPage: Page;

    const SLOT_COST = 750;

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
                 (expert_id, start_at, end_at, duration_min, cost, is_online, location, max_users, status, uid, cancellation_penalty_percent, created_at)
                 VALUES (?, ?, ?, 60, ?, 1, 'https://meet.example.com/news-book', 1, 'free', ?, 0, ?)`,
                [expertId, startAt, startAt + 3600, SLOT_COST, uid, nowSec]
            );
            slotId = Number(slotIns.insertId);
            expect(slotId).toBeGreaterThan(0);

            const payload = JSON.stringify({
                slot_id: slotId,
                expert_id: expertId,
                name: 'Setup Expert',
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
        userPage = await devLogin(userCtx, 'user');
    });

    test.afterAll(async () => {
        await userCtx?.close();
        if (newsEventId) await dbExec(`DELETE FROM ${tn('news_events')} WHERE id = ?`, [newsEventId]);
        if (slotId) {
            await dbExec(`DELETE FROM ${tn('bookings')} WHERE bookable_id = ? AND bookable_type = ?`, [slotId, 'time_slot']);
            await dbExec(`DELETE FROM ${tn('time_slots')} WHERE id = ?`, [slotId]);
        }
    });

    test('user opens dashboard and sees the news event with book button', async () => {
        await userPage.goto(`${BASE_URL}/system/`);

        const bookBtn = userPage.locator(`[data-test-id="news-book-slot-${slotId}"]`);
        await expect(bookBtn).toBeVisible({ timeout: 10000 });
    });

    test('clicking the news slot link opens the BookingModal in-place', async () => {
        await userPage.goto(`${BASE_URL}/system/`);

        const bookBtn = userPage.locator(`[data-test-id="news-book-slot-${slotId}"]`);
        await expect(bookBtn).toBeVisible({ timeout: 10000 });
        await bookBtn.click();

        // BookingModal renders with data-test-id="booking-modal"
        const modal = userPage.locator('[data-test-id="booking-modal"]');
        await expect(modal).toBeVisible({ timeout: 8000 });

        // Did NOT navigate away from the dashboard
        expect(userPage.url()).toBe(`${BASE_URL}/system/`);
    });

    test('user completes booking from the news dialog and balance is debited', async () => {
        await userPage.goto(`${BASE_URL}/system/`);

        const balBefore = (await dbQuery(`SELECT balance FROM ${tn('account_balance')} WHERE account_id = ?`, [userId]))[0]?.balance ?? 0;

        await userPage.locator(`[data-test-id="news-book-slot-${slotId}"]`).click();
        const modal = userPage.locator('[data-test-id="booking-modal"]');
        await expect(modal).toBeVisible({ timeout: 8000 });

        // The confirm button inside the modal — testid varies; pick the primary submit
        const submit = modal.locator('button[type="button"]').filter({ hasText: /^(Забронировать|Book)/ }).first();
        await expect(submit).toBeVisible({ timeout: 5000 });
        await submit.click();

        // Booking row should be present in DB
        await expect.poll(async () => {
            const r = await dbQuery(
                `SELECT id FROM ${tn('bookings')} WHERE user_id = ? AND bookable_id = ? AND bookable_type = ?`,
                [userId, slotId, 'time_slot']
            );
            return r.length;
        }, { timeout: 8000, intervals: [50, 150, 400] }).toBeGreaterThan(0);

        const balAfter = (await dbQuery(`SELECT balance FROM ${tn('account_balance')} WHERE account_id = ?`, [userId]))[0]?.balance ?? 0;
        expect(Number(balAfter)).toBe(Number(balBefore) - SLOT_COST);
    });
});
