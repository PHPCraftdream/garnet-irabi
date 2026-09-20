/**
 * D-246 (UAT 20.09): the paperclip badge in the conversation list sits
 * right next to the LAST message's snippet, but counts attachments across
 * the WHOLE conversation — a reporter with a text-only last message but an
 * attachment further back read the badge as "this last message has a
 * file", which it didn't. The count itself is intentional (added so you
 * don't have to open every conversation to see if it holds any files —
 * see the comment on `AttachmentsMark` in ConversationRow.tsx), so the fix
 * clarifies scope in the tooltip rather than changing what's counted.
 */
import { test, expect, tn } from '../../helpers/scoped-test';
import { newScopedContext } from '../../helpers/scoped-test';
import { withConnection } from '../../helpers/db/db';
import { roleLogin } from '../../helpers/auth/role-login';

// Must match roleLogin()'s own 'expert'/'user' account mapping — the
// conversation is seeded for the account that ACTUALLY ends up logged in.
const EXPERT_LOGIN = 'expert1@dev.test';
const USER_LOGIN = 'user1@dev.test';

async function accountIdByLogin(login: string): Promise<number> {
    return withConnection(async (c) => {
        const [rows] = await c.execute<any[]>(`SELECT id FROM ${tn('accounts')} WHERE login = ?`, [login]);
        return Number(rows[0]?.id ?? 0);
    });
}

test('conversation-list attachment badge tooltip says the count is conversation-wide', async ({ browser }) => {
    const expertId = await accountIdByLogin(EXPERT_LOGIN);
    const studentId = await accountIdByLogin(USER_LOGIN);
    expect(expertId).toBeGreaterThan(0);
    expect(studentId).toBeGreaterThan(0);

    const now = Math.floor(Date.now() / 1000);
    const marker = `D-246 test ${now}`;
    let convId = 0;
    const messageIds: number[] = [];

    await withConnection(async (c) => {
        // The account pair may already share a (fixture-seeded) conversation
        // — (participant_a, participant_b) is unique, so find-or-create
        // rather than assume a fresh INSERT.
        const [existing] = await c.execute<any[]>(
            `SELECT id FROM ${tn('im_conversations')} WHERE (participant_a = ? AND participant_b = ?) OR (participant_a = ? AND participant_b = ?)`,
            [expertId, studentId, studentId, expertId],
        );

        if (existing[0]?.id) {
            convId = Number(existing[0].id);
            await c.execute(`UPDATE ${tn('im_conversations')} SET last_message_at = ? WHERE id = ?`, [now, convId]);
        } else {
            const [conv]: any = await c.execute(
                `INSERT INTO ${tn('im_conversations')} (participant_a, participant_b, last_message_at, created_at) VALUES (?, ?, ?, ?)`,
                [expertId, studentId, now, now],
            );
            convId = conv.insertId;
        }

        // Earlier message WITH an attachment.
        const [withFile]: any = await c.execute(
            `INSERT INTO ${tn('im_messages')} (conversation_id, sender_id, body, created_at) VALUES (?, ?, ?, ?)`,
            [convId, studentId, `${marker}: прикладываю скриншот.`, now - 120],
        );
        messageIds.push(withFile.insertId);
        await c.execute(
            `INSERT INTO ${tn('im_attachments')} (message_id, original_name, stored_name, mime_type, size, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
            [withFile.insertId, 'screenshot.png', 'd246-test.png', 'image/png', 1024, now - 120],
        );

        // Latest message — plain text, no attachment.
        const [textOnly]: any = await c.execute(
            `INSERT INTO ${tn('im_messages')} (conversation_id, sender_id, body, created_at) VALUES (?, ?, ?, ?)`,
            [convId, studentId, `${marker}: спасибо, до встречи!`, now],
        );
        messageIds.push(textOnly.insertId);
    });

    const context = await newScopedContext(browser);
    const page = await context.newPage();
    try {
        await page.goto('/');
        await roleLogin(page, 'expert');
        await page.goto('/');
        await page.goto('/system/im/');
        await page.waitForLoadState('networkidle');

        const row = page.locator(`[data-test-id="im-conversation-${convId}"]`);
        await expect(row).toBeVisible({ timeout: 10000 });

        // The badge sits next to a last message that itself has no
        // attachment — confirming the count is conversation-wide, not
        // last-message-scoped, is the whole point of this regression.
        await expect(row).toContainText(`${marker}: спасибо`);

        const badge = row.locator(`[data-test-id="im-conv-attachments-${convId}"]`);
        await expect(badge).toBeVisible();
        const title = await badge.getAttribute('title');
        expect(title).toMatch(/^Вложений в переписке: \d+$/);
    } finally {
        await context.close();
        if (messageIds.length) {
            await withConnection(async (c) => {
                await c.execute(`DELETE FROM ${tn('im_attachments')} WHERE message_id IN (${messageIds.map(() => '?').join(',')})`, messageIds);
                await c.execute(`DELETE FROM ${tn('im_messages')} WHERE id IN (${messageIds.map(() => '?').join(',')})`, messageIds);
            });
        }
    }
});
