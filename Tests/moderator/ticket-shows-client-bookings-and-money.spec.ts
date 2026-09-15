/**
 * D-209: the ticket knew who wrote it and showed nothing else about them.
 *
 * To answer "what happened to my booking" or "where did my money go", the
 * moderator left the ticket, opened the Bookings section and searched by name —
 * once per ticket. mod-1 hit this on live ticket #23. The contrast was measured
 * in the same cycle from the other side: where the data is already on screen,
 * support answers in 2–6 minutes with zero re-asking.
 *
 * The fix is a `~clientContext` endpoint (app-side: bookings and balance are
 * IRabi notions, the framework's support module has no business knowing them)
 * plus a panel in the ticket card showing the client's last lessons and last
 * money movements.
 *
 * What this test guards is the thing that made the finding real: the booking
 * the person is writing about, and the debit/refund pair, must be reachable
 * WITHOUT leaving the ticket.
 */
import { test, expect, tn } from '../helpers/scoped-test';
import { withConnection } from '../helpers/db';
import { USER_LOGIN } from '../helpers/logins';

const SLOT_COST = 850;

async function getAccountId(login: string): Promise<number> {
	return withConnection(async (c) => {
		const [rows] = await c.execute<any[]>(`SELECT id FROM ${tn('accounts')} WHERE login = ?`, [login]);
		return rows[0]?.id ?? 0;
	});
}

interface Seeded {
	ticketId: number;
	slotId: number;
	bookingId: number;
	ledgerIds: number[];
}

async function seedTicketWithHistory(accountId: number, expertId: number): Promise<Seeded> {
	return withConnection(async (c) => {
		const now = Math.floor(Date.now() / 1000);
		const startAt = now + 86400 * 2;

		const [slotRes]: any = await c.execute(
			`INSERT INTO ${tn('time_slots')}
			 (expert_id, start_at, end_at, duration_min, cost, is_online, location, max_users, booked_count, status, uid, created_at)
			 VALUES (?, ?, ?, 90, ?, 1, 'https://meet.example.com/d209', 3, 1, 'free', ?, ?)`,
			[expertId, startAt, startAt + 5400, SLOT_COST, `d209${now}`.slice(0, 16), now],
		);
		const slotId = slotRes.insertId;

		const [bookingRes]: any = await c.execute(
			`INSERT INTO ${tn('bookings')} (user_id, bookable_type, bookable_id, status, created_at)
			 VALUES (?, 'time_slot', ?, 'confirmed', ?)`,
			[accountId, slotId, now],
		);
		const bookingId = bookingRes.insertId;

		// The debit the person is asking about, and the refund that answers it.
		const [debitRes]: any = await c.execute(
			`INSERT INTO ${tn('balance_ledger')} (account_id, is_credit, amount, entry_type, ref_type, ref_id, note, created_at)
			 VALUES (?, 0, ?, 'booking_invoice', 'booking', ?, 'D-209 списание', ?)`,
			[accountId, SLOT_COST, bookingId, now],
		);
		const [refundRes]: any = await c.execute(
			`INSERT INTO ${tn('balance_ledger')} (account_id, is_credit, amount, entry_type, ref_type, ref_id, note, created_at)
			 VALUES (?, 1, ?, 'booking_refund', 'booking', ?, 'D-209 возврат', ?)`,
			[accountId, SLOT_COST, bookingId, now + 1],
		);

		const [ticketRes]: any = await c.execute(
			`INSERT INTO ${tn('support_tickets')} (account_id, subject, status, assignee_id, unread_user, unread_staff, context, created_at, updated_at)
			 VALUES (?, 'D-209 куда делись деньги', 'waiting_support', NULL, 0, 1, '{}', ?, ?)`,
			[accountId, now, now],
		);
		const ticketId = ticketRes.insertId;

		await c.execute(
			`INSERT INTO ${tn('support_messages')} (ticket_id, author_id, body, is_internal, msg_type, created_at)
			 VALUES (?, ?, 'Списали деньги за занятие, а что с ним — непонятно', 0, 'user', ?)`,
			[ticketId, accountId, now],
		);

		return {ticketId, slotId, bookingId, ledgerIds: [debitRes.insertId, refundRes.insertId]};
	});
}

async function cleanup(s: Seeded | null): Promise<void> {
	if (!s) return;
	await withConnection(async (c) => {
		await c.execute(`DELETE FROM ${tn('support_messages')} WHERE ticket_id = ?`, [s.ticketId]);
		await c.execute(`DELETE FROM ${tn('support_tickets')} WHERE id = ?`, [s.ticketId]);
		await c.execute(`DELETE FROM ${tn('balance_ledger')} WHERE ref_type = 'booking' AND ref_id = ?`, [s.bookingId]);
		await c.execute(`DELETE FROM ${tn('bookings')} WHERE id = ?`, [s.bookingId]);
		await c.execute(`DELETE FROM ${tn('time_slots')} WHERE id = ?`, [s.slotId]);
	});
}

test.describe.configure({ mode: 'serial' });

test.describe('D-209: the ticket card carries the client lessons and money', () => {
	let seeded: Seeded | null = null;
	let clientId = 0;

	test.beforeAll(async () => {
		clientId = await getAccountId(USER_LOGIN);
		expect(clientId).toBeGreaterThan(0);
		// Any expert will do — the panel names them, it does not act on them.
		const expertId = await getAccountId('testuser_setup_expert@irabi.test');
		expect(expertId).toBeGreaterThan(0);

		seeded = await seedTicketWithHistory(clientId, expertId);
		expect(seeded.ticketId).toBeGreaterThan(0);
	});

	test.afterAll(async () => {
		await cleanup(seeded);
	});

	test('opening the ticket shows the booking it is about, without leaving the page', async ({ page }) => {
		if (!seeded) { test.skip(); return; }

		await page.goto('/admin/support/', { waitUntil: 'domcontentloaded' });
		await expect(page.locator(`[data-test-id="grid-row-${seeded.ticketId}"]`)).toBeVisible({ timeout: 15000 });

		await page.locator(`[data-test-id="support-ticket-${seeded.ticketId}"]`).click();
		await expect(page.getByText('Списали деньги за занятие, а что с ним — непонятно')).toBeVisible({ timeout: 15000 });

		// The panel itself, and the exact booking the person is writing about.
		const panel = page.locator('[data-test-id="ticket-client-context"]');
		await expect(panel).toBeVisible({ timeout: 15000 });

		const bookingRow = page.locator(`[data-test-id="ticket-client-booking-${seeded.bookingId}"]`);
		await expect(bookingRow).toBeVisible({ timeout: 15000 });
		// Price is what the question is about, so it has to be in the row.
		await expect(bookingRow).toContainText(String(SLOT_COST));
	});

	test('the money question is answerable from the same screen: debit and refund are both there', async ({ page }) => {
		if (!seeded) { test.skip(); return; }

		await page.goto('/admin/support/', { waitUntil: 'domcontentloaded' });
		await page.locator(`[data-test-id="support-ticket-${seeded.ticketId}"]`).click();
		await expect(page.locator('[data-test-id="ticket-client-context"]')).toBeVisible({ timeout: 15000 });

		const ledger = page.locator('[data-test-id="ticket-client-ledger"]');
		await expect(ledger).toBeVisible({ timeout: 15000 });

		// Both sides of the story — "деньги списали" and "деньги вернули" — must
		// be visible at once. One without the other is exactly the half-answer
		// that sent the moderator to another section.
		for (const id of seeded.ledgerIds) {
			await expect(page.locator(`[data-test-id="ticket-client-ledger-${id}"]`)).toBeVisible({ timeout: 15000 });
		}
		await expect(ledger).toContainText('D-209 списание');
		await expect(ledger).toContainText('D-209 возврат');

		// And the balance, so "сколько у меня сейчас" needs no third screen.
		await expect(page.locator('[data-test-id="ticket-client-balance"]')).toBeVisible();
	});

	test('~clientContext refuses a caller who is not staff', async ({ browser, baseURL }) => {
		if (!seeded) { test.skip(); return; }

		// The panel exposes another person's bookings and money. A fresh
		// context with no storageState is a genuinely anonymous caller —
		// reusing the moderator's `page` would carry their session cookie and
		// prove nothing. Checked rather than assumed from the guard clause
		// being visible in the source.
		const anon = await browser.newContext({ storageState: undefined, baseURL });
		try {
			const res = await anon.request.post('/admin/support/~clientContext', {
				form: { ticket_id: String(seeded.ticketId) },
			});
			// Either a refusal or a redirect to the login page is acceptable;
			// a 200 with somebody's money in it is not.
			expect(res.status()).not.toBe(200);
			expect(await res.text()).not.toContain('D-209 возврат');
		} finally {
			await anon.close();
		}
	});
});
