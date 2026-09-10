/**
 * D-165: landing on /system/support with tickets already in the list (but
 * none picked yet) showed "Сообщений пока нет" ("No messages yet") in the
 * right-hand panel — worded for an opened, empty conversation, not for
 * "nothing is open". Read as "your ticket has no messages" even when the
 * ticket one click away had a full conversation (found by user-4 on a real
 * 4-message ticket with an attachment).
 *
 * Fixed: `SupportPageIsland::renderEmpty()` now distinguishes "no tickets
 * at all" (Support_NoTickets) from "tickets exist, none selected yet"
 * (new Support_SelectTicket) — Support_NoMessages is reserved for an
 * actually-opened, genuinely empty thread.
 */
import { test, expect, tn } from '../helpers/scoped-test';
import { withConnection } from '../helpers/db';

async function getAccountId(login: string): Promise<number> {
	return withConnection(async (c) => {
		const [rows] = await c.execute<any[]>(`SELECT id FROM ${tn('accounts')} WHERE login = ?`, [login]);
		return rows[0]?.id ?? 0;
	});
}

async function createTicketWithMessage(accountId: number): Promise<{ ticketId: number; messageId: number }> {
	return withConnection(async (c) => {
		const now = Math.floor(Date.now() / 1000);
		const [ticketRes]: any = await c.execute(
			`INSERT INTO ${tn('support_tickets')} (account_id, subject, status, assignee_id, unread_user, unread_staff, context, created_at, updated_at)
			 VALUES (?, ?, 'waiting_support', NULL, 0, 1, '{}', ?, ?)`,
			[accountId, 'D-165 test ticket', now, now],
		);
		const ticketId = ticketRes.insertId;
		const [msgRes]: any = await c.execute(
			`INSERT INTO ${tn('support_messages')} (ticket_id, author_id, body, is_internal, msg_type, created_at)
			 VALUES (?, ?, 'D-165 test message', 0, 'user', ?)`,
			[ticketId, accountId, now],
		);
		return { ticketId, messageId: msgRes.insertId };
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

test.describe('D-165: /system/support empty panel tells "no tickets" from "none selected yet"', () => {
	let accountId = 0;
	let ticketId = 0;

	test.beforeAll(async () => {
		accountId = await getAccountId('testuser_setup_user@irabi.test');
		expect(accountId).toBeGreaterThan(0);
		({ ticketId } = await createTicketWithMessage(accountId));
		expect(ticketId).toBeGreaterThan(0);
	});

	test.afterAll(async () => {
		await cleanup(ticketId);
	});

	test('landing on the page with tickets in the list prompts to pick one, not "no messages"', async ({ page }) => {
		await page.goto('/system/support', { waitUntil: 'domcontentloaded' });

		await expect(page.locator(`[data-test-id="support-ticket-${ticketId}"]`)).toBeVisible({ timeout: 10000 });

		const panel = page.locator('[data-test-id="support-empty-panel"]');
		await expect(panel).toBeVisible();
		await expect(panel).toContainText('Выберите обращение');
		await expect(panel).not.toContainText('Сообщений пока нет');
	});

	test('opening the ticket shows its real messages, not the empty state', async ({ page }) => {
		await page.goto('/system/support', { waitUntil: 'domcontentloaded' });

		await page.locator(`[data-test-id="support-ticket-${ticketId}"]`).click();
		await expect(page.locator('[data-test-id="support-empty-panel"]')).toHaveCount(0);
		await expect(page.getByText('D-165 test message')).toBeVisible({ timeout: 10000 });
	});
});
