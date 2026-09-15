/**
 * D-205: the queue's own vocabulary was leaking to the person outside it.
 *
 * Changing a ticket's status writes a system line into the thread — and that
 * line is NOT internal (`is_internal = 0`), so the client reads it too. It was
 * composed from our workflow status names, so on a client's screen it said
 * "Статус изменён: Ожидание ответа → В работе". Those names describe what WE
 * are waiting for; to the person who wrote in they are service jargon.
 *
 * Same family as the closed D-172, where internal routing leaked to the user:
 * that fix covered routing, the status line stayed behind.
 *
 * The event itself is worth telling the client about — "we've started",
 * "resolved" are real news. What was wrong was the wording. So the fix keeps
 * the meaningful transitions and words them for a human, and stays silent on
 * the ones that are pure queue movement (escalation, waiting-on-us, hold).
 *
 * The framework now asks the app for that body (`buildStatusChangeBody`),
 * because only the app knows which of its statuses mean anything outside.
 */
import { test, expect, tn } from '../helpers/scoped-test';
import { withConnection } from '../helpers/db';
import { USER_LOGIN } from '../helpers/logins';

/** Every internal status name the client must never be shown. */
const INTERNAL_STATUS_WORDS = [
	'Ожидание ответа',
	'Ожидание поддержки',
	'Эскалирован',
	'Отложен',
	'Статус изменён',
];

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
			 VALUES (?, 'D-205 смена статуса', 'waiting_support', NULL, 0, 1, '{}', ?, ?)`,
			[accountId, now, now],
		);
		const ticketId = res.insertId;
		await c.execute(
			`INSERT INTO ${tn('support_messages')} (ticket_id, author_id, body, is_internal, msg_type, created_at)
			 VALUES (?, ?, 'D-205 вопрос клиента', 0, 'user', ?)`,
			[ticketId, accountId, now],
		);
		return ticketId;
	});
}

/** Everything the CLIENT would receive: internal comments excluded. */
async function clientVisibleBodies(ticketId: number): Promise<string[]> {
	return withConnection(async (c) => {
		const [rows] = await c.execute<any[]>(
			`SELECT body FROM ${tn('support_messages')} WHERE ticket_id = ? AND is_internal = 0 ORDER BY id`,
			[ticketId],
		);
		return rows.map((r: any) => String(r.body));
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

test.describe('D-205: a status change speaks to the client, not about the queue', () => {
	let clientId = 0;
	let ticketId = 0;

	test.beforeAll(async () => {
		clientId = await getAccountId(USER_LOGIN);
		expect(clientId).toBeGreaterThan(0);
		ticketId = await createTicket(clientId);
		expect(ticketId).toBeGreaterThan(0);
	});

	test.afterAll(async () => {
		await cleanup(ticketId);
	});

	test('taking a ticket into work tells the client so, in their words', async ({ page }) => {
		await page.goto('/admin/support/', { waitUntil: 'domcontentloaded' });
		await page.locator(`[data-test-id="support-ticket-${ticketId}"]`).click();
		await expect(page.getByText('D-205 вопрос клиента')).toBeVisible({ timeout: 15000 });

		await page.locator('[data-test-id="support-status-select"]').selectOption('in_progress');

		// The client's side of the thread — read from the DB exactly as their
		// own request would read it.
		await expect
			.poll(async () => (await clientVisibleBodies(ticketId)).join('\n'), { timeout: 15000 })
			.toContain('Мы взяли обращение в работу');

		const visible = await clientVisibleBodies(ticketId);
		const joined = visible.join('\n');
		// Nothing from the queue's vocabulary may appear anywhere in it.
		for (const word of INTERNAL_STATUS_WORDS) {
			expect(joined).not.toContain(word);
		}
	});

	test('a purely internal move says nothing to the client at all', async ({ page }) => {
		const before = (await clientVisibleBodies(ticketId)).length;

		await page.goto('/admin/support/', { waitUntil: 'domcontentloaded' });
		await page.locator(`[data-test-id="support-ticket-${ticketId}"]`).click();
		await expect(page.getByText('D-205 вопрос клиента')).toBeVisible({ timeout: 15000 });

		// Escalation is us talking to ourselves about who handles this. For the
		// person waiting on an answer it is not news, and it used to arrive as
		// "Статус изменён: В работе → Эскалирован".
		await page.locator('[data-test-id="support-status-select"]').selectOption('escalated');

		// Give the write a chance to land before asserting it did NOT happen —
		// otherwise this passes for the wrong reason.
		await page.waitForTimeout(2000);
		const after = await clientVisibleBodies(ticketId);
		expect(after.length).toBe(before);
		expect(after.join('\n')).not.toContain('Эскалирован');
	});

	test('the status itself did change — silence is about wording, not about doing nothing', async () => {
		// Guards the obvious wrong fix: skipping the status update instead of
		// skipping the announcement.
		const status = await withConnection(async (c) => {
			const [rows] = await c.execute<any[]>(
				`SELECT status FROM ${tn('support_tickets')} WHERE id = ?`, [ticketId],
			);
			return String(rows[0]?.status ?? '');
		});
		expect(status).toBe('escalated');
	});
});
