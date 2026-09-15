/**
 * D-172 [MAJOR/P0]: the system message a ticket assignment generates
 * ("Назначено: <имя>") used to be inserted with `is_internal = 0`, so a
 * customer reading their own ticket thread saw internal staff routing
 * (who it was handed to, and by implication that it was being routed
 * between staff at all) — found live: a student saw "Назначено: Йосеф
 * Ланде" in their own ticket.
 *
 * Fix: `FwSupportAdminController::post__assign()` (garnet-framework)
 * now inserts that system message with `is_internal = 1`. The
 * customer-facing controller (`FwSupportController::post__messages`)
 * already filters `is_internal = 0` — the leak was purely the write
 * side. Verified once already via direct SQL against production; this
 * spec locks the behavior in as an automated regression through the
 * real assign flow (admin panel UI → DB → customer-facing read).
 */
import { test, expect, tn } from '../../../helpers/scoped-test';
import { withConnection } from '../../../helpers/db';

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
            [accountId, 'D-172 regression: assignment must not leak', now, now],
        );
        const ticketId = res.insertId;
        await c.execute(
            `INSERT INTO ${tn('support_messages')} (ticket_id, author_id, body, is_internal, msg_type, created_at)
             VALUES (?, ?, 'D-172 test: initial user message', 0, 'user', ?)`,
            [ticketId, accountId, now],
        );
        return ticketId;
    });
}

async function cleanup(ticketId: number): Promise<void> {
    if (!ticketId) return;
    await withConnection(async (c) => {
        await c.execute(`DELETE FROM ${tn('support_assignment_log')} WHERE ticket_id = ?`, [ticketId]);
        await c.execute(`DELETE FROM ${tn('support_messages')} WHERE ticket_id = ?`, [ticketId]);
        await c.execute(`DELETE FROM ${tn('support_tickets')} WHERE id = ?`, [ticketId]);
    });
}

test.describe.configure({ mode: 'serial' });

test.describe('D-172: ticket assignment system message stays internal', () => {
    let userId = 0;
    let ticketId = 0;
    let moderatorName = '';

    test.beforeAll(async () => {
        userId = await getAccountId('testuser_setup_user@irabi.test');
        expect(userId).toBeGreaterThan(0);
        ticketId = await createTicket(userId);
        expect(ticketId).toBeGreaterThan(0);
    });

    test.afterAll(async () => {
        await cleanup(ticketId);
    });

    test('admin assigns the ticket to another moderator via the UI', async ({ adminPage }) => {
        await adminPage.goto('/admin/support/');
        await adminPage.locator(`[data-test-id="support-ticket-${ticketId}"]`).click();

        const assigneeSelect = adminPage.locator('[data-test-id="support-assignee-select"]');
        await expect(assigneeSelect).toBeVisible({ timeout: 8000 });

        // Pick the first non-"unassigned" option so this doesn't depend
        // on exact seeded names.
        const options = await assigneeSelect.locator('option').all();
        expect(options.length).toBeGreaterThan(1);
        const targetValue = await options[1].getAttribute('value');
        moderatorName = (await options[1].textContent())?.trim() ?? '';
        expect(targetValue).toBeTruthy();

        await Promise.all([
            adminPage.waitForResponse(r => r.request().method() === 'POST' && r.status() < 500, { timeout: 10000 }),
            assigneeSelect.selectOption(targetValue!),
        ]);

        // Admin sees everything, including the internal system message.
        await expect(adminPage.getByText('Назначено:').first()).toBeVisible({ timeout: 8000 });
    });

    test('the assignment system message was written as internal', async () => {
        const rows = await withConnection(async (c) => {
            const [r] = await c.execute<any[]>(
                `SELECT is_internal, body FROM ${tn('support_messages')}
                 WHERE ticket_id = ? AND body LIKE 'Назначено:%' ORDER BY id DESC LIMIT 1`,
                [ticketId],
            );
            return r;
        });
        expect(rows.length).toBe(1);
        expect(Number(rows[0].is_internal)).toBe(1);
    });

    test('the customer does NOT see the assignment message or the assignee name', async ({ userPage }) => {
        await userPage.goto('/support/');
        await userPage.locator(`[data-test-id="support-ticket-${ticketId}"]`).click();

        await expect(userPage.locator('[data-test-id="support-reply-input"]')).toBeVisible({ timeout: 8000 });
        await expect(userPage.getByText('Назначено:')).toHaveCount(0);
        if (moderatorName) {
            await expect(userPage.getByText(moderatorName)).toHaveCount(0);
        }
    });
});
