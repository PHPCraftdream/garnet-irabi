/**
 * Blocked user (IS_DISABLED) is anonymised in user-facing views:
 * name → "Пользователь #{id} отключён", avatar → placeholder icon.
 *
 * Covers the two most central surfaces: the news feed (actor name resolved
 * centrally) and the public expert profile (name + avatar).
 */

import { test, expect, tn } from '../helpers/scoped-test';
import mysql from 'mysql2/promise';
import { DB } from '../helpers/db';

test.describe.configure({ mode: 'serial' });

const USER_LOGIN = 'testuser_setup_user@irabi.test';
const EXPERT_LOGIN = 'testuser_setup_expert@irabi.test';

let userId = 0;
let expertId = 0;
let newsEventId = 0;
let prevDisabled: string | null = null; // original IS_DISABLED value to restore

function disabledName(id: number): string {
    return `Пользователь #${id} отключён`;
}

async function setExpertDisabled(on: boolean): Promise<void> {
    const conn = await mysql.createConnection(DB);
    try {
        await conn.execute(
            `INSERT INTO ${tn('accounts_data')} (account_id, param, value)
             VALUES (?, 'IS_DISABLED', ?)
             ON DUPLICATE KEY UPDATE value = VALUES(value)`,
            [expertId, on ? '1' : '0'],
        );
    } finally { await conn.end(); }
}

test.describe('Blocked user — anonymised name & avatar', () => {

    test('entry: resolve ids, seed a news event, block the expert', async () => {
        const conn = await mysql.createConnection(DB);
        try {
            const [u] = await conn.execute<any[]>(`SELECT id FROM ${tn('accounts')} WHERE login = ?`, [USER_LOGIN]);
            const [e] = await conn.execute<any[]>(`SELECT id FROM ${tn('accounts')} WHERE login = ?`, [EXPERT_LOGIN]);
            userId = Number(u[0]?.id ?? 0);
            expertId = Number(e[0]?.id ?? 0);
            if (!userId || !expertId) return;

            const [d] = await conn.execute<any[]>(
                `SELECT value FROM ${tn('accounts_data')} WHERE account_id = ? AND param = 'IS_DISABLED'`,
                [expertId],
            );
            prevDisabled = d.length ? String(d[0].value) : null;

            // A personal "new_message" event whose actor is the expert. The stored
            // payload name is irrelevant — the feed re-resolves it at serve time.
            const now = Math.floor(Date.now() / 1000);
            const [ins]: any = await conn.execute(
                `INSERT INTO ${tn('news_events')} (event_type, audience_type, audience_id, actor_id, target_key, payload, created_at)
                 VALUES ('new_message', 'personal', ?, ?, NULL, ?, ?)`,
                [userId, expertId, JSON.stringify({ sender_id: expertId, name: 'Анна Иванова', preview: 'тест' }), now],
            );
            newsEventId = Number(ins.insertId);
        } finally { await conn.end(); }

        await setExpertDisabled(true);
    });

    test('news feed shows the blocked placeholder, not the real name', async ({ page }) => {
        test.skip(!userId || !expertId, 'ids not resolved');
        await page.goto('/system/', { waitUntil: 'domcontentloaded' });
        await expect(page.locator('[data-test-id="news-feed"]')).toBeVisible({ timeout: 10_000 });
        await page.waitForResponse(
            r => r.url().includes('/news/~feed') && r.request().method() === 'POST',
            { timeout: 10_000 },
        ).catch(() => {});

        const row = page.locator(`[data-test-id="news-event-${newsEventId}"]`);
        await expect(row).toBeVisible({ timeout: 10_000 });
        const text = (await row.textContent()) ?? '';
        expect(text).toContain(disabledName(expertId));
        expect(text).not.toContain('Анна Иванова');
    });

    test('expert public profile shows placeholder name + no clickable avatar', async ({ page }) => {
        test.skip(!expertId, 'expert not resolved');
        await page.goto(`/system/expert/id~${expertId}`, { waitUntil: 'domcontentloaded' });
        await expect(page.locator('[data-test-id="expert-profile"]')).toBeVisible({ timeout: 10_000 });

        const body = (await page.locator('[data-test-id="expert-profile"]').textContent()) ?? '';
        expect(body).toContain(disabledName(expertId));
        expect(body).not.toContain('Анна Иванова');

        // The clickable avatar (real photo → lightbox) must be gone for a blocked expert.
        await expect(page.locator('[data-test-id="expert-avatar"]')).toHaveCount(0);
    });

    test('exit: unblock + cleanup', async () => {
        if (expertId) {
            const conn = await mysql.createConnection(DB);
            try {
                if (prevDisabled === null) {
                    await conn.execute(
                        `DELETE FROM ${tn('accounts_data')} WHERE account_id = ? AND param = 'IS_DISABLED'`,
                        [expertId],
                    );
                } else {
                    await conn.execute(
                        `UPDATE ${tn('accounts_data')} SET value = ? WHERE account_id = ? AND param = 'IS_DISABLED'`,
                        [prevDisabled, expertId],
                    );
                }
                if (newsEventId) {
                    await conn.execute(`DELETE FROM ${tn('news_events')} WHERE id = ?`, [newsEventId]);
                }
            } finally { await conn.end(); }
        }
    });
});
