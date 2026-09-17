/**
 * D-167 [MAJOR/P0]: two moderators working the same ticket had no way to
 * know a colleague was already answering — both would type a reply and
 * whoever submitted second produced a near-duplicate/contradictory message
 * (mod-1/mod-2 collision, found live during the UAT campaign).
 *
 * Fix (SupportTicketTab.tsx): not a live-presence indicator (no
 * websocket/presence infra exists) — a "your draft may be stale" warning.
 * The admin panel already polls the open ticket every 15s
 * (`loadDetail`, interval in SupportTicketTab.tsx). If that poll observes
 * the message count grow while the moderator has unsent text sitting in
 * the reply box (`replyTextRef.current.trim()` non-empty), it sets
 * `staleWarning = true`, rendering `[data-test-id="support-stale-warning"]`.
 *
 * This spec reproduces the exact collision: moderator A drafts a reply
 * without sending, moderator B replies first, and after the next poll
 * A must see the stale-draft warning.
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
            [accountId, 'D-167 regression: stale draft warning', now, now],
        );
        const ticketId = res.insertId;
        await c.execute(
            `INSERT INTO ${tn('support_messages')} (ticket_id, author_id, body, is_internal, msg_type, created_at)
             VALUES (?, ?, 'D-167 test: initial user message', 0, 'user', ?)`,
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

test.describe('D-167: stale-draft warning when a colleague replies first', () => {
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

    test('moderator A sees the stale-draft warning after moderator B replies first', async ({ adminPage, moderatorPage }) => {
        // Both open the same ticket in the admin panel.
        await openAdminTicket(adminPage, ticketId);
        await expect(adminPage.locator('[data-test-id="support-reply-input"]')).toBeVisible({ timeout: 10000 });

        await openAdminTicket(moderatorPage, ticketId);
        await expect(moderatorPage.locator('[data-test-id="support-reply-input"]')).toBeVisible({ timeout: 10000 });

        // A starts drafting a reply but does NOT submit.
        await adminPage.locator('[data-test-id="support-reply-input"]').fill('A: печатаю ответ, ещё не отправил...');
        await expect(adminPage.locator('[data-test-id="support-stale-warning"]')).toHaveCount(0);

        // B replies first.
        await moderatorPage.locator('[data-test-id="support-reply-input"]').fill('B: ответ коллеги, отправлен первым');
        await Promise.all([
            moderatorPage.waitForResponse(r => r.request().method() === 'POST' && r.status() < 500, { timeout: 10000 }),
            moderatorPage.locator('[data-test-id="support-reply-btn"]').click(),
        ]);

        // A's next 15s poll (SupportTicketTab.tsx) must detect the new
        // message while A still has unsent text and show the warning.
        await expect(adminPage.locator('[data-test-id="support-stale-warning"]')).toBeVisible({ timeout: 20000 });

        // Clearing the draft dismisses the warning (staleWarning resets
        // whenever replyText goes empty).
        await adminPage.locator('[data-test-id="support-reply-input"]').fill('');
        await expect(adminPage.locator('[data-test-id="support-stale-warning"]')).toHaveCount(0);
    });
});
