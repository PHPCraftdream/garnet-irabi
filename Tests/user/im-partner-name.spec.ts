/**
 * User -- IM: partner name resolution in conversation list
 *
 * The IM conversation list used to show empty/"#id" when a partner's
 * accounts.name was blank. Now ImController::enrichConversation re-resolves
 * partner_name via NewsService::resolveDisplayNames: expert display_name →
 * accounts.name → "#id".
 *
 * This spec blanks the partner's accounts.name, sets a known expert
 * display_name, seeds a conversation, and asserts the rendered list shows
 * the expert display_name (not "#id").
 */

import { test, expect, tn } from '../helpers/scoped-test';
import mysql from 'mysql2/promise';
import { DB } from '../helpers/db';

test.describe.configure({ mode: 'serial' });

const PARTNER_DISPLAY_NAME = 'Диалог Имя';
const USER_LOGIN           = 'testuser_setup_user@irabi.test';
const EXPERT_LOGIN         = 'testuser_setup_expert@irabi.test';

let userId = 0;
let partnerId = 0;
let convId = 0;
let msgId = 0;
let weCreatedConversation = false;
let prevAccountName = '';
let prevDisplayName: string | null = null;
let hadExpertProfile = false;

test.describe('IM -- partner name resolution', () => {

    test('entry: blank partner account name, set expert display_name, seed a conversation', async () => {
        const conn = await mysql.createConnection(DB);
        try {
            // Resolve user and partner account ids
            const [userRows] = await conn.execute<any[]>(
                `SELECT id FROM ${tn('accounts')} WHERE login = ?`, [USER_LOGIN],
            );
            expect(userRows.length, 'setup user not found').toBeGreaterThan(0);
            userId = Number(userRows[0].id);

            const [partnerRows] = await conn.execute<any[]>(
                `SELECT id, name FROM ${tn('accounts')} WHERE login = ?`, [EXPERT_LOGIN],
            );
            expect(partnerRows.length, 'setup expert not found').toBeGreaterThan(0);
            partnerId = Number(partnerRows[0].id);
            prevAccountName = partnerRows[0].name ?? '';

            // Blank the partner's accounts.name
            await conn.execute(
                `UPDATE ${tn('accounts')} SET name = '' WHERE id = ?`,
                [partnerId],
            );

            // Ensure expert_profiles row exists and set display_name
            const [epRows] = await conn.execute<any[]>(
                `SELECT display_name FROM ${tn('expert_profiles')} WHERE account_id = ?`,
                [partnerId],
            );
            if (epRows.length > 0) {
                hadExpertProfile = true;
                prevDisplayName = epRows[0].display_name;
                await conn.execute(
                    `UPDATE ${tn('expert_profiles')} SET display_name = ? WHERE account_id = ?`,
                    [PARTNER_DISPLAY_NAME, partnerId],
                );
            } else {
                hadExpertProfile = false;
                await conn.execute(
                    `INSERT INTO ${tn('expert_profiles')} (account_id, display_name, is_approved) VALUES (?, ?, 1)`,
                    [partnerId, PARTNER_DISPLAY_NAME],
                );
            }

            // Upsert a conversation between user and partner
            const a = Math.min(userId, partnerId);
            const b = Math.max(userId, partnerId);
            const now = Math.floor(Date.now() / 1000);

            try {
                const [insertResult] = await conn.execute<any>(
                    `INSERT INTO ${tn('im_conversations')} (participant_a, participant_b, last_message_at, created_at) VALUES (?, ?, ?, ?)`,
                    [a, b, now, now],
                );
                convId = Number(insertResult.insertId);
                weCreatedConversation = true;
            } catch (e: any) {
                // Duplicate key — conversation already exists
                if (e.code === 'ER_DUP_ENTRY' || e.errno === 1062) {
                    const [convRows] = await conn.execute<any[]>(
                        `SELECT id FROM ${tn('im_conversations')} WHERE participant_a = ? AND participant_b = ?`,
                        [a, b],
                    );
                    convId = Number(convRows[0].id);
                    weCreatedConversation = false;
                    // Update last_message_at so it sorts to the top
                    await conn.execute(
                        `UPDATE ${tn('im_conversations')} SET last_message_at = ? WHERE id = ?`,
                        [now, convId],
                    );
                } else {
                    throw e;
                }
            }

            expect(convId).toBeGreaterThan(0);

            // Insert a message from the partner
            const [msgResult] = await conn.execute<any>(
                `INSERT INTO ${tn('im_messages')} (conversation_id, sender_id, body, created_at) VALUES (?, ?, 'тестовое сообщение', ?)`,
                [convId, partnerId, now],
            );
            msgId = Number(msgResult.insertId);
            expect(msgId).toBeGreaterThan(0);

            // Ensure last_message_at is current (in case we created the conv above)
            if (weCreatedConversation) {
                await conn.execute(
                    `UPDATE ${tn('im_conversations')} SET last_message_at = ? WHERE id = ?`,
                    [now, convId],
                );
            }
        } finally {
            await conn.end();
        }
    });

    test('conversation list shows the resolved partner display name', async ({ page }) => {
        test.skip(!userId || !partnerId, 'missing user/partner ids');

        await page.goto('/im/', { waitUntil: 'domcontentloaded' });

        const list = page.locator('[data-test-id="im-conversation-list"]');
        await expect(list).toBeVisible({ timeout: 10_000 });

        // The conversation list may render asynchronously; poll for the expected name
        await expect.poll(async () => {
            return await list.textContent() ?? '';
        }, { timeout: 15_000, message: 'partner display name not found in conversation list' }).toContain(PARTNER_DISPLAY_NAME);

        // Also verify the stale "#id" fallback is NOT shown
        const text = await list.textContent() ?? '';
        expect(text).not.toContain(`#${partnerId}`);
    });

    test('exit: cleanup + restore', async () => {
        const conn = await mysql.createConnection(DB);
        try {
            // Delete seeded message
            if (msgId) {
                await conn.execute(
                    `DELETE FROM ${tn('im_messages')} WHERE id = ?`,
                    [msgId],
                );
            }

            // Delete conversation if we created it
            if (weCreatedConversation && convId) {
                await conn.execute(
                    `DELETE FROM ${tn('im_conversations')} WHERE id = ?`,
                    [convId],
                );
            }

            // Restore accounts.name
            if (partnerId) {
                await conn.execute(
                    `UPDATE ${tn('accounts')} SET name = ? WHERE id = ?`,
                    [prevAccountName, partnerId],
                );
            }

            // Restore expert_profiles
            if (partnerId) {
                if (hadExpertProfile) {
                    await conn.execute(
                        `UPDATE ${tn('expert_profiles')} SET display_name = ? WHERE account_id = ?`,
                        [prevDisplayName, partnerId],
                    );
                } else {
                    // We inserted the row; remove it
                    await conn.execute(
                        `DELETE FROM ${tn('expert_profiles')} WHERE account_id = ?`,
                        [partnerId],
                    );
                }
            }
        } finally {
            await conn.end();
        }
    });

});
