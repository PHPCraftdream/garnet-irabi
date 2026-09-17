/**
 * D-198, the client-facing half: the unread badge in the header.
 *
 * Reading a support ticket clears `unread_user` on the server the moment the
 * thread loads. The badge in the page header, though, is drawn from a shared
 * counter that polls every 20 seconds — so the number stayed lit for up to a
 * third of a minute after the person had already read the message it was
 * counting. The fix makes the page ask for fresh counters as soon as it has
 * finished reading something.
 *
 * The moderator-side regression for D-198 deliberately left this assertion out
 * and said so in its header. This is that gap closed — no test id had to be
 * invented for it: the framework's header button already publishes the count
 * in its accessible name (`aria-label="Поддержка (2)"`), which is both a real
 * user-facing guarantee and a stabler thing to assert than a hidden hook.
 *
 * TIMING: the assertion window (6s) sits well inside the 20s poll interval,
 * and the click happens a second or two after the page loads — so the shared
 * poll cannot reach the badge first and pass this test by accident. Without
 * the fix, the badge is still showing the old number when the window closes.
 */
import { test, expect, tn } from '../helpers/scoped-test';
import { withConnection } from '../helpers/db';
import { USER_LOGIN } from '../helpers/logins';

/** Seeded high enough that the change is unmistakable against any other unread rows. */
const SEEDED_UNREAD = 2;

async function getAccountId(login: string): Promise<number> {
	return withConnection(async (c) => {
		const [rows] = await c.execute<any[]>(`SELECT id FROM ${tn('accounts')} WHERE login = ?`, [login]);
		return rows[0]?.id ?? 0;
	});
}

async function createTicketWithStaffReply(accountId: number): Promise<number> {
	return withConnection(async (c) => {
		const now = Math.floor(Date.now() / 1000);
		const [ticketRes]: any = await c.execute(
			`INSERT INTO ${tn('support_tickets')} (account_id, subject, status, assignee_id, unread_user, unread_staff, context, created_at, updated_at)
			 VALUES (?, ?, 'waiting_user', NULL, ?, 0, '{}', ?, ?)`,
			[accountId, 'D-198 header badge', SEEDED_UNREAD, now, now],
		);
		const ticketId = ticketRes.insertId;
		await c.execute(
			`INSERT INTO ${tn('support_messages')} (ticket_id, author_id, body, is_internal, msg_type, created_at)
			 VALUES (?, ?, 'D-198 answer the client has not read yet', 0, 'staff', ?)`,
			[ticketId, accountId, now],
		);
		return ticketId;
	});
}

async function unreadUser(ticketId: number): Promise<number> {
	return withConnection(async (c) => {
		const [rows] = await c.execute<any[]>(
			`SELECT unread_user FROM ${tn('support_tickets')} WHERE id = ?`, [ticketId],
		);
		return Number(rows[0]?.unread_user ?? -1);
	});
}

async function cleanup(ticketId: number): Promise<void> {
	if (!ticketId) return;
	await withConnection(async (c) => {
		await c.execute(`DELETE FROM ${tn('support_messages')} WHERE ticket_id = ?`, [ticketId]);
		await c.execute(`DELETE FROM ${tn('support_tickets')} WHERE id = ?`, [ticketId]);
	});
}

/** The header button spells its count into the accessible name: "Поддержка (2)". */
function countFromLabel(label: string | null): number {
	const m = /\((\d+)\)\s*$/.exec(label ?? '');
	return m ? Number(m[1]) : 0;
}

test.describe.configure({ mode: 'serial' });

test.describe('D-198: the unread badge goes out when the client reads, not 20 seconds later', () => {
	let accountId = 0;
	let ticketId = 0;

	test.beforeAll(async () => {
		accountId = await getAccountId(USER_LOGIN);
		expect(accountId).toBeGreaterThan(0);
		ticketId = await createTicketWithStaffReply(accountId);
		expect(ticketId).toBeGreaterThan(0);
		expect(await unreadUser(ticketId)).toBe(SEEDED_UNREAD);
	});

	test.afterAll(async () => {
		await cleanup(ticketId);
	});

	test('the badge counts the unread answer before it is opened', async ({ page }) => {
		await page.goto('/support/', { waitUntil: 'domcontentloaded' });

		const badge = page.locator('[data-test-id="util-support"]');
		await expect(badge).toBeVisible({ timeout: 15000 });

		// The seeded ticket contributes SEEDED_UNREAD to the sum, so whatever
		// else the fixture account carries, the badge is at least that.
		const before = countFromLabel(await badge.getAttribute('aria-label'));
		expect(before).toBeGreaterThanOrEqual(SEEDED_UNREAD);
	});

	test('opening the ticket clears it on the server AND in the header, with no reload', async ({ page }) => {
		// The shared counter fires one poll ~2s after the page starts, then
		// every 20s. That first poll would clear the badge on its own and make
		// this test pass no matter what the page does — so wait it out BEFORE
		// touching anything. Everything after it happens in the 20-second gap,
		// where the only thing that can refresh the header is the fix itself.
		// Ожидание арендовано с запасом и отсчитывается ДО перехода: под
		// полным прогоном на боевом хосте страница со всеми бандлами может
		// отвечать секунды, и тогда сам таймер первого опроса стартует
		// поздно. С прежними 15 с проверка падала на пустом месте —
		// «опроса не было», хотя он приходил чуть позже.
		const startupPoll = page.waitForResponse(r => r.url().includes('~counts'), { timeout: 45000 });
		await page.goto('/support/', { waitUntil: 'domcontentloaded' });
		await startupPoll;

		const badge = page.locator('[data-test-id="util-support"]');
		await expect(badge).toBeVisible({ timeout: 15000 });
		const before = countFromLabel(await badge.getAttribute('aria-label'));
		expect(before).toBeGreaterThanOrEqual(SEEDED_UNREAD);

		await page.locator(`[data-test-id="support-ticket-${ticketId}"]`).click();
		await expect(page.getByText('D-198 answer the client has not read yet')).toBeVisible({ timeout: 15000 });

		// The server side of it: reading the thread is what clears the flag.
		expect(await unreadUser(ticketId)).toBe(0);

		// ...and the header must agree straight away. Before the fix this kept
		// the old number until the next 20-second tick — the person had read
		// the answer and the screen still insisted they had not. 6s is well
		// inside that gap, so nothing but the fix can satisfy this.
		await expect
			.poll(async () => countFromLabel(await badge.getAttribute('aria-label')), { timeout: 6000 })
			.toBe(before - SEEDED_UNREAD);
	});
});
