/**
 * D-188: D-167's stale-draft warning only fires on the NEXT 15s poll — it
 * catches "I was typing while a colleague already sent", but not "we both
 * hit Send within the same short window". At submit time in that window
 * neither side has seen the other's reply, so nothing warns them (mod-1/
 * mod-2 sent near-identical replies in the same minute on a live ticket,
 * and the ticket status flapped Resolved -> Escalated).
 *
 * Fix: `post__reply` now compares the message count the client saw when it
 * started composing (`known_message_count`) against the actual count at
 * insert time, in the same request — this catches the collision no matter
 * how close together the two sends land. The reply is NOT blocked (a
 * moderator's typed answer isn't discarded); the response is flagged
 * `staleReply: true` and SupportTicketTab shows an immediate notice
 * (`support-stale-reply-notice`), not tied to the (already-cleared) draft
 * text the way D-167's warning is.
 *
 * This spec reproduces the exact collision: both moderators open the ticket
 * (same known message count), A replies first, then B replies — B's send
 * must show the notice immediately, without waiting for any poll.
 */
import { test, expect, tn } from '../../../helpers/scoped-test';
import { withConnection } from '../../../helpers/db';
import { openAdminTicket } from '../../../helpers/admin-support';

async function getAccountId(login: string): Promise<number> {
    return withConnection(async (c) => {
        const [rows] = await c.execute<any[]>(`SELECT id FROM ${tn('accounts')} WHERE login = ?`, [login]);
        return rows[0]?.id ?? 0;
    });
}

async function createTicket(accountId: number): Promise<number> {
    return withConnection(async (c) => {
        const now = Math.floor(Date.now() / 1000);
        const [res]: any = await c.execute(
            `INSERT INTO ${tn('support_tickets')} (account_id, subject, status, assignee_id, unread_user, unread_staff, context, created_at, updated_at)
             VALUES (?, ?, 'open', NULL, 0, 1, '{}', ?, ?)`,
            [accountId, 'D-188 regression: concurrent reply notice', now, now],
        );
        const ticketId = res.insertId;
        await c.execute(
            `INSERT INTO ${tn('support_messages')} (ticket_id, author_id, body, is_internal, msg_type, created_at)
             VALUES (?, ?, 'D-188 test: initial user message', 0, 'user', ?)`,
            [ticketId, accountId, now],
        );
        return ticketId;
    });
}

async function cleanup(ticketId: number): Promise<void> {
    if (!ticketId) return;
    await withConnection(async (c) => {
        await c.execute(`DELETE FROM ${tn('support_messages')} WHERE ticket_id = ?`, [ticketId]);
        await c.execute(`DELETE FROM ${tn('support_tickets')} WHERE id = ?`, [ticketId]);
    });
}

test.describe.configure({ mode: 'serial' });

test.describe('D-188: concurrent-reply notice fires on send, not on the next poll', () => {
    let userId = 0;
    let ticketId = 0;

    test.beforeAll(async () => {
        userId = await getAccountId('testuser_setup_user@irabi.test');
        expect(userId).toBeGreaterThan(0);
        ticketId = await createTicket(userId);
        expect(ticketId).toBeGreaterThan(0);
    });

    test.afterAll(async () => {
        await cleanup(ticketId);
    });

    test('moderator B sees the notice immediately after sending, before any poll', async ({ adminPage, moderatorPage }) => {
        // Both open the same ticket — both see the same starting message count.
        await openAdminTicket(adminPage, ticketId);
        await expect(adminPage.locator('[data-test-id="support-reply-input"]')).toBeVisible({ timeout: 10000 });

        await openAdminTicket(moderatorPage, ticketId);
        await expect(moderatorPage.locator('[data-test-id="support-reply-input"]')).toBeVisible({ timeout: 10000 });

        // A replies first — B has NOT polled since, so B doesn't know yet.
        await adminPage.locator('[data-test-id="support-reply-input"]').fill('A: ответ, отправлен первым');
        await Promise.all([
            adminPage.waitForResponse(r => r.request().method() === 'POST' && r.status() < 500, { timeout: 10000 }),
            adminPage.locator('[data-test-id="support-reply-btn"]').click(),
        ]);

        // B composes and sends within the same window, BEFORE its own 15s
        // poll would ever have caught A's reply — no wait between these
        // lines. The server-side check must catch it regardless.
        await moderatorPage.locator('[data-test-id="support-reply-input"]').fill('B: ответ коллеги, отправлен почти следом');
        await Promise.all([
            moderatorPage.waitForResponse(r => r.request().method() === 'POST' && r.status() < 500, { timeout: 10000 }),
            moderatorPage.locator('[data-test-id="support-reply-btn"]').click(),
        ]);

        // The notice must appear right away — no 15s poll wait.
        await expect(moderatorPage.locator('[data-test-id="support-stale-reply-notice"]')).toBeVisible({ timeout: 3000 });

        // Both replies actually landed — the fix doesn't drop B's work.
        const bodies = await withConnection(async (c) => {
            const [rows] = await c.execute<any[]>(
                `SELECT body FROM ${tn('support_messages')} WHERE ticket_id = ? ORDER BY id`, [ticketId],
            );
            return rows.map((r: any) => String(r.body));
        });
        expect(bodies).toContain('A: ответ, отправлен первым');
        expect(bodies).toContain('B: ответ коллеги, отправлен почти следом');

        // Dismissing the notice clears it.
        await moderatorPage.locator('[data-test-id="support-stale-reply-notice-dismiss"]').click();
        await expect(moderatorPage.locator('[data-test-id="support-stale-reply-notice"]')).toHaveCount(0);
    });

    test('a solo reply with no collision does NOT show the notice', async ({ adminPage }) => {
        await openAdminTicket(adminPage, ticketId);
        await expect(adminPage.locator('[data-test-id="support-reply-input"]')).toBeVisible({ timeout: 10000 });

        await adminPage.locator('[data-test-id="support-reply-input"]').fill('C: обычный ответ без коллизии');
        await Promise.all([
            adminPage.waitForResponse(r => r.request().method() === 'POST' && r.status() < 500, { timeout: 10000 }),
            adminPage.locator('[data-test-id="support-reply-btn"]').click(),
        ]);

        await adminPage.waitForTimeout(500);
        await expect(adminPage.locator('[data-test-id="support-stale-reply-notice"]')).toHaveCount(0);
    });
});
