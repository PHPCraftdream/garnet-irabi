/**
 * Email notification gate — per-category preference + frequency throttling.
 *
 * Sending an IM triggers EmailNotifications::newMessage() to the recipient,
 * which is now gated by the recipient's 'messages' preference:
 *   off    → no email enqueued
 *   each   → one email per send
 *   hourly → at most one email per hour (subsequent sends suppressed)
 *
 * We drive a real message send through the IM UI and assert on the email
 * queue table (rows are inserted at enqueue time, before SMTP).
 */

import { test, expect, tn } from '../helpers/scoped-test';
import type { Page } from '@playwright/test';
import mysql from 'mysql2/promise';
import { DB } from '../helpers/db';

test.describe.configure({ mode: 'serial' });

const SENDER_LOGIN = 'testuser_setup_user@irabi.test';
const RECIPIENT_LOGIN = 'testuser_setup_expert@irabi.test';

let senderId = 0;
let recipientId = 0;
let convId = 0;
let weCreatedConv = false;
const seededMsgIds: number[] = [];

async function setRecipientPref(freq: string): Promise<void> {
    const conn = await mysql.createConnection(DB);
    try {
        const value = JSON.stringify({ messages: freq, support: 'each', bookings: 'each' });
        await conn.execute(
            `INSERT INTO ${tn('accounts_data')} (account_id, param, value)
             VALUES (?, 'email_notif_prefs', ?)
             ON DUPLICATE KEY UPDATE value = VALUES(value)`,
            [recipientId, value],
        );
    } finally { await conn.end(); }
}

async function clearThrottle(): Promise<void> {
    const conn = await mysql.createConnection(DB);
    try {
        await conn.execute(
            `DELETE FROM ${tn('email_throttle')} WHERE account_id = ? AND category = 'messages'`,
            [recipientId],
        );
    } finally { await conn.end(); }
}

async function queueCount(): Promise<number> {
    const conn = await mysql.createConnection(DB);
    try {
        const [rows] = await conn.execute<any[]>(
            `SELECT COUNT(*) AS cnt FROM ${tn('email_queue')} WHERE recipient_email = ?`,
            [RECIPIENT_LOGIN],
        );
        return Number(rows[0]?.cnt ?? 0);
    } finally { await conn.end(); }
}

async function sendMessage(page: Page, text: string): Promise<void> {
    await page.goto('/im/', { waitUntil: 'domcontentloaded' });
    const conv = page.locator(`[data-test-id="im-conversation-${convId}"]`);
    await expect(conv).toBeVisible({ timeout: 15_000 });
    await conv.click();
    const input = page.locator('[data-test-id="im-reply-input"]');
    await expect(input).toBeVisible({ timeout: 10_000 });
    await input.fill(text);
    await Promise.all([
        page.waitForResponse(r => r.url().includes('/im/~send') && r.request().method() === 'POST' && r.status() < 500, { timeout: 15_000 }),
        page.locator('[data-test-id="im-reply-btn"]').click(),
    ]);
    // Give the server a moment to finish the synchronous enqueue inside the request.
    await page.waitForTimeout(500);
}

test.describe('Email notification gate — messages category', () => {

    test('entry: resolve ids + seed a conversation', async () => {
        const conn = await mysql.createConnection(DB);
        try {
            const [s] = await conn.execute<any[]>(`SELECT id FROM ${tn('accounts')} WHERE login = ?`, [SENDER_LOGIN]);
            const [r] = await conn.execute<any[]>(`SELECT id FROM ${tn('accounts')} WHERE login = ?`, [RECIPIENT_LOGIN]);
            senderId = Number(s[0]?.id ?? 0);
            recipientId = Number(r[0]?.id ?? 0);
            if (!senderId || !recipientId) return;

            const a = Math.min(senderId, recipientId);
            const b = Math.max(senderId, recipientId);
            const [existing] = await conn.execute<any[]>(
                `SELECT id FROM ${tn('im_conversations')} WHERE participant_a = ? AND participant_b = ?`,
                [a, b],
            );
            const now = Math.floor(Date.now() / 1000);
            if (existing.length > 0) {
                convId = Number(existing[0].id);
            } else {
                const [ins]: any = await conn.execute(
                    `INSERT INTO ${tn('im_conversations')} (participant_a, participant_b, last_message_at, created_at)
                     VALUES (?, ?, ?, ?)`,
                    [a, b, now, now],
                );
                convId = Number(ins.insertId);
                weCreatedConv = true;
            }
            // One message from the recipient so the conversation lists for the sender.
            const [msg]: any = await conn.execute(
                `INSERT INTO ${tn('im_messages')} (conversation_id, sender_id, body, created_at)
                 VALUES (?, ?, 'привет', ?)`,
                [convId, recipientId, now],
            );
            seededMsgIds.push(Number(msg.insertId));
        } finally { await conn.end(); }
    });

    test('OFF suppresses the email', async ({ page }) => {
        test.skip(!senderId || !recipientId, 'ids not resolved');
        await setRecipientPref('off');
        await clearThrottle();
        const before = await queueCount();
        await sendMessage(page, 'off-test ' + before);
        const after = await queueCount();
        expect(after).toBe(before);
    });

    test('EACH enqueues an email', async ({ page }) => {
        test.skip(!senderId || !recipientId, 'ids not resolved');
        await setRecipientPref('each');
        await clearThrottle();
        const before = await queueCount();
        await sendMessage(page, 'each-test ' + before);
        const after = await queueCount();
        expect(after).toBe(before + 1);
    });

    test('HOURLY throttles within the window', async ({ page }) => {
        test.skip(!senderId || !recipientId, 'ids not resolved');
        await setRecipientPref('hourly');
        await clearThrottle();
        const before = await queueCount();

        await sendMessage(page, 'hourly-1 ' + before);
        const afterFirst = await queueCount();
        expect(afterFirst).toBe(before + 1);

        await sendMessage(page, 'hourly-2 ' + before);
        const afterSecond = await queueCount();
        expect(afterSecond).toBe(before + 1); // throttled — no new row
    });

    test('exit: cleanup', async () => {
        const conn = await mysql.createConnection(DB);
        try {
            if (seededMsgIds.length) {
                const ph = seededMsgIds.map(() => '?').join(',');
                await conn.execute(`DELETE FROM ${tn('im_messages')} WHERE id IN (${ph})`, seededMsgIds);
            }
            if (convId) {
                await conn.execute(`DELETE FROM ${tn('im_messages')} WHERE conversation_id = ?`, [convId]);
                if (weCreatedConv) {
                    await conn.execute(`DELETE FROM ${tn('im_conversations')} WHERE id = ?`, [convId]);
                }
            }
            if (recipientId) {
                await conn.execute(`DELETE FROM ${tn('accounts_data')} WHERE account_id = ? AND param = 'email_notif_prefs'`, [recipientId]);
                await conn.execute(`DELETE FROM ${tn('email_throttle')} WHERE account_id = ? AND category = 'messages'`, [recipientId]);
                await conn.execute(`DELETE FROM ${tn('email_queue')} WHERE recipient_email = ?`, [RECIPIENT_LOGIN]);
            }
        } finally { await conn.end(); }
    });
});
