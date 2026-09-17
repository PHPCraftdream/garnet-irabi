/**
 * D-211: creating a support ticket left the screen silent — no ticket
 * number, no sense of when to expect a reply. user-2 (cycle8) measured the
 * actual first-reply times that day (2, 6, 12 minutes) — support was fast,
 * the person just had no way to know that at the moment of sending.
 *
 * `post__createTicket` now returns `ticketId` and `responseEtaMinutes`
 * alongside the existing `ticket` object; `responseEtaMinutes` is a REAL
 * median over recent tickets that got a first staff reply
 * (`SupportResponseEta::medianFirstResponseMinutes()`), not a number typed
 * into a template — with too little history it comes back `null` and the
 * UI shows the ticket number without a time promise it can't back up.
 *
 * This spec seeds a few extra tickets with a first reply (so the sample
 * clears `MIN_SAMPLES` regardless of what else already exists in this
 * worker's isolated tables), then independently computes the SAME median
 * from the DB the way `SupportResponseEta` does and checks the confirmation
 * toast states that exact figure — not a fixed number, since the isolated
 * template may already seed some ticket history of its own.
 */
import { test, expect, tn } from '../../../helpers/scoped-test';
import mysql from 'mysql2/promise';
import { DB } from '../../../helpers/db/db';
import { USER_LOGIN, EXPERT_LOGIN } from '../../../helpers/auth/logins';

const HISTORY_ETA_MINUTES = 10;

async function getAccountId(login: string): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(`SELECT id FROM ${tn('accounts')} WHERE login = ?`, [login]);
		return rows[0]?.id ?? 0;
	} finally {
		await conn.end();
	}
}

/** Seed 5 already-answered tickets, each replied to in exactly HISTORY_ETA_MINUTES — a deterministic median. */
async function seedReplyHistory(userId: number, staffId: number): Promise<number[]> {
	const conn = await mysql.createConnection(DB);
	try {
		const now = Math.floor(Date.now() / 1000);
		const ids: number[] = [];
		for (let i = 0; i < 5; i++) {
			const createdAt = now - (i + 1) * 3600;
			const [ticketRes]: any = await conn.execute(
				`INSERT INTO ${tn('support_tickets')} (account_id, subject, status, assignee_id, unread_user, unread_staff, context, created_at, updated_at)
				 VALUES (?, ?, 'resolved', ?, 0, 0, '{}', ?, ?)`,
				[userId, `D-211 history ticket ${i}`, staffId, createdAt, createdAt],
			);
			const ticketId = ticketRes.insertId;
			ids.push(ticketId);
			await conn.execute(
				`INSERT INTO ${tn('support_messages')} (ticket_id, author_id, body, is_internal, msg_type, created_at)
				 VALUES (?, ?, 'D-211 initial question', 0, 'user', ?)`,
				[ticketId, userId, createdAt],
			);
			await conn.execute(
				`INSERT INTO ${tn('support_messages')} (ticket_id, author_id, body, is_internal, msg_type, created_at)
				 VALUES (?, ?, 'D-211 staff reply', 0, 'staff', ?)`,
				[ticketId, staffId, createdAt + HISTORY_ETA_MINUTES * 60],
			);
		}
		return ids;
	} finally {
		await conn.end();
	}
}

/** Mirrors `SupportResponseEta::medianFirstResponseMinutes()` exactly, over the same table scope. */
async function computeExpectedMedian(): Promise<number | null> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.query(
			`SELECT t.created_at AS ticket_created, MIN(m.created_at) AS first_reply
			 FROM ${tn('support_tickets')} t
			 INNER JOIN ${tn('support_messages')} m
			     ON m.ticket_id = t.id AND m.msg_type = 'staff' AND m.is_internal = 0
			 GROUP BY t.id
			 ORDER BY t.created_at DESC
			 LIMIT 200`,
		) as any;

		const minutes: number[] = [];
		for (const row of rows) {
			const created = Number(row.ticket_created ?? 0);
			const replied = Number(row.first_reply ?? 0);
			if (replied > created) minutes.push(Math.round((replied - created) / 60));
		}
		if (minutes.length < 5) return null;

		minutes.sort((a, b) => a - b);
		const mid = Math.floor(minutes.length / 2);
		const median = minutes.length % 2 === 0
			? Math.round((minutes[mid - 1] + minutes[mid]) / 2)
			: minutes[mid];
		return Math.max(1, median);
	} finally {
		await conn.end();
	}
}

async function cleanup(historyIds: number[], newTicketSubject: string): Promise<void> {
	const conn = await mysql.createConnection(DB);
	try {
		for (const id of historyIds) {
			await conn.execute(`DELETE FROM ${tn('support_messages')} WHERE ticket_id = ?`, [id]);
			await conn.execute(`DELETE FROM ${tn('support_tickets')} WHERE id = ?`, [id]);
		}
		const [newRows] = await conn.execute<any[]>(`SELECT id FROM ${tn('support_tickets')} WHERE subject = ?`, [newTicketSubject]);
		for (const row of newRows) {
			await conn.execute(`DELETE FROM ${tn('support_messages')} WHERE ticket_id = ?`, [row.id]);
			await conn.execute(`DELETE FROM ${tn('support_tickets')} WHERE id = ?`, [row.id]);
		}
	} finally {
		await conn.end();
	}
}

test.describe.configure({ mode: 'serial' });

test.describe('D-211: creating a ticket confirms the number and a real response-time estimate', () => {
	let userId = 0;
	let staffId = 0;
	let historyIds: number[] = [];
	const newSubject = `D-211 real ticket ${Date.now()}`;

	test.beforeAll(async () => {
		userId = await getAccountId(USER_LOGIN);
		staffId = await getAccountId(EXPERT_LOGIN); // any account id works as "staff" for author_id here
		expect(userId).toBeGreaterThan(0);
		historyIds = await seedReplyHistory(userId, staffId);
	});

	test.afterAll(async () => {
		await cleanup(historyIds, newSubject);
	});

	test('the confirmation toast names the ticket number and the measured ETA', async ({ page }) => {
		const expectedMedian = await computeExpectedMedian();
		expect(expectedMedian).not.toBeNull();

		await page.goto('/system/', { waitUntil: 'domcontentloaded' });

		await page.locator('[data-test-id="support-widget-btn"]').click();
		await page.locator('[data-test-id="support-new-ticket-btn"]').click();
		await page.locator('[data-test-id="support-subject-input"]').fill(newSubject);
		await page.locator('[data-test-id="support-message-input"]').fill('D-211 regression: does the confirmation show up?');

		await page.locator('[data-test-id="support-send-btn"]').click();

		const toast = page.locator('#global-toast [role="alert"]');
		await expect(toast).toBeVisible({ timeout: 8000 });

		const conn = await mysql.createConnection(DB);
		let newTicketId = 0;
		try {
			const [rows] = await conn.execute<any[]>(`SELECT id FROM ${tn('support_tickets')} WHERE subject = ?`, [newSubject]);
			newTicketId = rows[0]?.id ?? 0;
		} finally {
			await conn.end();
		}
		expect(newTicketId).toBeGreaterThan(0);

		await expect(toast).toContainText(`#${newTicketId}`);
		await expect(toast).toContainText(String(expectedMedian));
	});
});
