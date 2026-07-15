/**
 * Regression test: F-08-02 — booked_count and notifications must reflect
 * only ACTUALLY inserted bookings, not all validated candidates.
 *
 * Scenario: send slot_ids = [A, A] (same slot twice). The validation loop
 * accepts both (no booking exists yet), but the INSERT loop hits a
 * duplicate-key on the second attempt. Before the fix, the API returned
 * booked_count = 2; after the fix it returns booked_count = 1.
 */

import { test, expect, tn } from '../helpers/scoped-test';
import { newScopedContext } from '../helpers/scoped-test';
import type { BrowserContext, Page } from '@playwright/test';
import mysql from 'mysql2/promise';
import { DB } from '../helpers/db';
import { roleLogin } from '../helpers/role-login';

function generateUid(): string {
    return [...Array(16)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
}

async function getAccountId(login: string): Promise<number> {
    const conn = await mysql.createConnection(DB);
    try {
        const [rows] = await conn.execute<any[]>(
            `SELECT id FROM ${tn('accounts')} WHERE login = ?`, [login]
        );
        return rows[0]?.id ?? 0;
    } finally { await conn.end(); }
}

async function ensureBalance(accountId: number, minBalance: number): Promise<void> {
    const conn = await mysql.createConnection(DB);
    try {
        const [rows] = await conn.execute<any[]>(
            `SELECT balance FROM ${tn('account_balance')} WHERE account_id = ?`, [accountId]
        );
        const current = rows.length ? Number(rows[0].balance) : 0;
        if (current < minBalance) {
            const topUp = minBalance - current + 5000;
            await conn.execute(
                `INSERT INTO ${tn('account_balance')} (account_id, balance, updated_at)
                 VALUES (?, 0, UNIX_TIMESTAMP())
                 ON DUPLICATE KEY UPDATE account_id = account_id`,
                [accountId]
            );
            await conn.execute(
                `INSERT INTO ${tn('balance_ledger')} (account_id, is_credit, amount, entry_type, ref_type, ref_id, note, created_at)
                 VALUES (?, 1, ?, 'top_up', '', 0, 'Test top-up F-08-02', UNIX_TIMESTAMP())`,
                [accountId, topUp]
            );
            await conn.execute(
                `UPDATE ${tn('account_balance')} SET balance = balance + ?, updated_at = UNIX_TIMESTAMP() WHERE account_id = ?`,
                [topUp, accountId]
            );
        }
    } finally { await conn.end(); }
}

async function seedSlot(expertId: number, cost: number = 0): Promise<number> {
    const conn = await mysql.createConnection(DB);
    try {
        const startAt = Math.floor(Date.now() / 1000) + 86400 * 5 + 10 * 3600;
        const [result]: any = await conn.execute(
            `INSERT INTO ${tn('time_slots')}
             (expert_id, start_at, end_at, duration_min, cost, is_online, location, max_users, status, uid, created_at)
             VALUES (?, ?, ?, 60, ?, 1, 'https://meet.example.com/f0802-test', 1, 'free', ?, ?)`,
            [expertId, startAt, startAt + 3600, cost, generateUid(), Math.floor(Date.now() / 1000)]
        );
        return result.insertId;
    } finally { await conn.end(); }
}

async function cleanupSlot(slotId: number): Promise<void> {
    if (!slotId) return;
    const conn = await mysql.createConnection(DB);
    try {
        await conn.execute(
            `DELETE FROM ${tn('balance_ledger')} WHERE ref_type = 'booking' AND ref_id IN
             (SELECT id FROM ${tn('bookings')} WHERE bookable_type = 'time_slot' AND bookable_id = ?)`,
            [slotId]
        );
        await conn.execute(`DELETE FROM ${tn('bookings')} WHERE bookable_type = 'time_slot' AND bookable_id = ?`, [slotId]);
        await conn.execute(`DELETE FROM ${tn('time_slots')} WHERE id = ?`, [slotId]);
    } finally { await conn.end(); }
}

async function countBookingsForSlot(slotId: number): Promise<number> {
    const conn = await mysql.createConnection(DB);
    try {
        const [rows] = await conn.execute<any[]>(
            `SELECT COUNT(*) as cnt FROM ${tn('bookings')}
             WHERE bookable_type = 'time_slot' AND bookable_id = ? AND status IN ('pending','confirmed')`,
            [slotId]
        );
        return Number(rows[0]?.cnt ?? 0);
    } finally { await conn.end(); }
}

async function postSlotsBook(
    page: Page,
    slotIds: number[]
): Promise<{ status: number; body: any }> {
    return await page.evaluate(async (args: { slotIds: number[] }) => {
        const csrf = (window as any).__GARNET_CSRF__ || '';
        const fd = new FormData();
        fd.append('CSRF_TOKEN', csrf);
        for (const id of args.slotIds) {
            fd.append('slot_ids[]', String(id));
        }
        const res = await fetch('/slots/~book', { method: 'POST', body: fd });
        const text = await res.text();
        let body: any = null;
        try { body = JSON.parse(text); } catch { body = text; }
        return { status: res.status, body };
    }, { slotIds });
}

async function devLogin(browser: any, role: string): Promise<{ context: BrowserContext; page: Page }> {
    const context = await newScopedContext(browser);
    const page = await context.newPage();
    await page.goto('/');
    await roleLogin(page, role);
    await page.goto('/');
    return { context, page };
}

// ═══════════════════════════════════════════════════════════════════════════
// F-08-02: booked_count reflects actual inserts, not validated candidates
// ═══════════════════════════════════════════════════════════════════════════

test.describe('F-08-02: duplicate slot_id in multi-book returns correct booked_count', () => {
    test.describe.configure({ mode: 'serial' });
    let expertId = 0;
    let userId = 0;
    let slotId = 0;

    test('setup: seed free slot with zero cost', async () => {
        expertId = await getAccountId('expert1@dev.test');
        userId = await getAccountId('user1@dev.test');
        expect(expertId).toBeGreaterThan(0);
        expect(userId).toBeGreaterThan(0);

        await ensureBalance(userId, 10000);
        slotId = await seedSlot(expertId, 0);
        expect(slotId).toBeGreaterThan(0);
    });

    test('POST /slots/~book with [slotId, slotId] returns booked_count=1', async ({ browser }) => {
        if (!slotId) { test.skip(); return; }
        const { context, page } = await devLogin(browser, 'user');
        try {
            const result = await postSlotsBook(page, [slotId, slotId]);
            // The API should succeed (one booking created, one duplicate-key skipped).
            expect(result.status).toBe(200);
            expect(result.body.success).toBe(true);
            // booked_count must be 1 (not 2) — only one INSERT succeeded.
            expect(result.body.booked_count).toBe(1);
        } finally {
            await context.close();
        }
    });

    test('only one booking row exists in DB', async () => {
        if (!slotId) { test.skip(); return; }
        const cnt = await countBookingsForSlot(slotId);
        expect(cnt).toBe(1);
    });

    test('cleanup', async () => {
        if (slotId) await cleanupSlot(slotId);
    });
});
