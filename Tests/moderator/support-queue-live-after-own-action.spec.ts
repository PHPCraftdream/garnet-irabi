/**
 * D-198: after the moderator's own action, half the screen updated and half
 * did not.
 *
 * The support queue was rendered into the HTML once and had no way to be
 * re-read. Opening a ticket clears `unread_staff` on the server, and replying
 * moves the ticket to `waiting_user` — but the row, and the per-status
 * counters computed from the same list, kept the old values until the
 * moderator reloaded the page. mod-2 hit the counter half of this; expert-1
 * hit the same class on the user-facing support page in the same cycle.
 *
 * The header badge (`unreadSupport`) is fixed by the same call chain
 * (`refreshLiveCounts()`) but is NOT asserted here — it lives in a framework
 * component with no test id, and inventing one for a test would be the tail
 * wagging the dog. Stated plainly rather than implied by silence.
 *
 * Fixed by the rule the four findings pointed at: after a mutation, re-read
 * from the server the state that mutation changes. `SupportTicketTab` now
 * reports every such moment to its parent (`onTicketChanged`), and
 * `AdminSupportIsland` re-reads the queue through the new `~ticketsList`
 * endpoint plus `refreshLiveCounts()` for the header badge.
 *
 * NOTE on selectivity: the background 15s poll inside the open tab must NOT
 * trigger the re-read — it changes nothing and would hammer the queue once
 * per tab per 15 seconds. That is why `loadDetail()` takes an explicit flag
 * instead of notifying unconditionally.
 */
import { test, expect, tn } from '../helpers/scoped-test';
import { withConnection } from '../helpers/db';

async function getAccountId(login: string): Promise<number> {
	return withConnection(async (c) => {
		const [rows] = await c.execute<any[]>(`SELECT id FROM ${tn('accounts')} WHERE login = ?`, [login]);
		return rows[0]?.id ?? 0;
	});
}

async function createUnreadTicket(accountId: number): Promise<number> {
	return withConnection(async (c) => {
		const now = Math.floor(Date.now() / 1000);
		const [ticketRes]: any = await c.execute(
			`INSERT INTO ${tn('support_tickets')} (account_id, subject, status, assignee_id, unread_user, unread_staff, context, created_at, updated_at)
			 VALUES (?, ?, 'waiting_support', NULL, 0, 1, '{}', ?, ?)`,
			[accountId, 'D-198 queue freshness', now, now],
		);
		const ticketId = ticketRes.insertId;
		await c.execute(
			`INSERT INTO ${tn('support_messages')} (ticket_id, author_id, body, is_internal, msg_type, created_at)
			 VALUES (?, ?, 'D-198 question from the client', 0, 'user', ?)`,
			[ticketId, accountId, now],
		);
		return ticketId;
	});
}

async function unreadStaff(ticketId: number): Promise<number> {
	return withConnection(async (c) => {
		const [rows] = await c.execute<any[]>(
			`SELECT unread_staff FROM ${tn('support_tickets')} WHERE id = ?`, [ticketId],
		);
		return Number(rows[0]?.unread_staff ?? -1);
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

test.describe('D-198: the support queue stops lying right after the moderator acts', () => {
	let clientId = 0;
	let ticketId = 0;

	test.beforeAll(async () => {
		clientId = await getAccountId('testuser_setup_user@irabi.test');
		expect(clientId).toBeGreaterThan(0);
		ticketId = await createUnreadTicket(clientId);
		expect(ticketId).toBeGreaterThan(0);
		expect(await unreadStaff(ticketId)).toBe(1);
	});

	test.afterAll(async () => {
		await cleanup(ticketId);
	});

	test('opening a ticket really clears unread_staff on the server', async ({ page }) => {
		await page.goto('/admin/support/', { waitUntil: 'domcontentloaded' });
		await expect(page.locator(`[data-test-id="grid-row-${ticketId}"]`)).toBeVisible({ timeout: 15000 });

		await page.locator(`[data-test-id="support-ticket-${ticketId}"]`).click();
		await expect(page.getByText('D-198 question from the client')).toBeVisible({ timeout: 15000 });

		// This is what makes the screen stale: the read happens server-side the
		// moment the tab loads, and nothing on the page used to notice.
		expect(await unreadStaff(ticketId)).toBe(0);
	});

	test('replying updates the queue row and the status counters without a reload', async ({ page }) => {
		await page.goto('/admin/support/', { waitUntil: 'domcontentloaded' });

		const row = page.locator(`[data-test-id="grid-row-${ticketId}"]`);
		await expect(row).toBeVisible({ timeout: 15000 });
		await expect(row).toContainText('Ожидание поддержки');

		const waitingUser = page.locator('[data-test-id="support-filter-waiting_user"]');
		const before = (await waitingUser.count()) > 0 ? await waitingUser.innerText() : '';

		await page.locator(`[data-test-id="support-ticket-${ticketId}"]`).click();
		await expect(page.getByText('D-198 question from the client')).toBeVisible({ timeout: 15000 });

		await page.locator('[data-test-id="support-reply-input"]').fill('D-198 answer from support');
		await page.locator('[data-test-id="support-reply-btn"]').click();
		await expect(page.getByText('D-198 answer from support')).toBeVisible({ timeout: 15000 });

		// Back to the queue tab. No navigation, no reload — the row must already
		// agree with the database. Before the fix it still said "Ожидание
		// поддержки", the status a reply had just ended.
		await page.getByRole('button', { name: 'Поддержка', exact: true }).first().click();
		await expect(row).toContainText('Ожидание ответа', { timeout: 15000 });

		// The per-status counters above the grid are computed from the same
		// list, so they went stale together with it.
		await expect(waitingUser).not.toHaveText(before, { timeout: 15000 });
	});
});
