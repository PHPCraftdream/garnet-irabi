/**
 * D-208: picking a recipient in "+ Новый диалог" who already has a thread
 * with the current user opened a BLANK compose form instead of that thread.
 * Sending would still land in the same conversation (findOrCreate on the
 * server), so no history split — but the person saw an empty screen where
 * they had real history, and either wrote into what looked like a void or
 * believed the previous conversation was lost.
 *
 * The `#to=` deep-link path already checked `conversations` for an existing
 * partner and routed to it; the "+ Новый диалог" → recipient-picker path
 * (ImPageIsland.tsx, `NewMessageForm`/`RecipientCombobox`) did not — it's a
 * separate code path to the same effect. Fixed by running that same check
 * wherever a recipient is picked, not only on the deep link.
 */
import { test, expect, tn } from '../helpers/scoped-test';
import mysql from 'mysql2/promise';
import { DB } from '../helpers/db';
import { USER_LOGIN, EXPERT_LOGIN } from '../helpers/logins';

async function getAccountId(login: string): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(`SELECT id, name FROM ${tn('accounts')} WHERE login = ?`, [login]);
		return rows[0]?.id ?? 0;
	} finally {
		await conn.end();
	}
}

async function getAccountName(login: string): Promise<string> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(`SELECT name FROM ${tn('accounts')} WHERE login = ?`, [login]);
		return String(rows[0]?.name ?? '');
	} finally {
		await conn.end();
	}
}

async function seedConversation(userId: number, expertId: number): Promise<{ convId: number; bodyMarker: string }> {
	const conn = await mysql.createConnection(DB);
	try {
		const now = Math.floor(Date.now() / 1000);
		const [convRes]: any = await conn.execute(
			`INSERT INTO ${tn('im_conversations')} (participant_a, participant_b, last_message_at, created_at) VALUES (?, ?, ?, ?)`,
			[userId, expertId, now, now],
		);
		const convId = convRes.insertId;
		const bodyMarker = `D-208 existing thread marker ${now}`;
		await conn.execute(
			`INSERT INTO ${tn('im_messages')} (conversation_id, sender_id, body, created_at) VALUES (?, ?, ?, ?)`,
			[convId, expertId, bodyMarker, now],
		);
		return { convId, bodyMarker };
	} finally {
		await conn.end();
	}
}

async function cleanup(convId: number): Promise<void> {
	if (!convId) return;
	const conn = await mysql.createConnection(DB);
	try {
		await conn.execute(`DELETE FROM ${tn('im_messages')} WHERE conversation_id = ?`, [convId]);
		await conn.execute(`DELETE FROM ${tn('im_conversations')} WHERE id = ?`, [convId]);
	} finally {
		await conn.end();
	}
}

test.describe.configure({ mode: 'serial' });

test.describe('D-208: picking an existing partner from "+ Новый диалог" opens their thread', () => {
	let userId = 0;
	let expertId = 0;
	let convId = 0;
	let bodyMarker = '';
	let expertName = '';

	test.beforeAll(async () => {
		userId = await getAccountId(USER_LOGIN);
		expertId = await getAccountId(EXPERT_LOGIN);
		expect(userId).toBeGreaterThan(0);
		expect(expertId).toBeGreaterThan(0);
		expertName = await getAccountName(EXPERT_LOGIN);

		const seeded = await seedConversation(userId, expertId);
		convId = seeded.convId;
		bodyMarker = seeded.bodyMarker;
	});

	test.afterAll(async () => {
		await cleanup(convId);
	});

	test('recipient picker routes to the existing thread, not a blank form', async ({ page }) => {
		await page.goto('/system/im/', { waitUntil: 'domcontentloaded' });

		await page.locator('[data-test-id="im-new-message-btn"]').click();
		await expect(page.locator('[data-test-id="im-new-form"]')).toBeVisible({ timeout: 8000 });

		await page.locator('[data-test-id="im-recipient-input"]').click();
		await page.locator(`[data-test-id="im-recipient-${expertId}"]`).click();

		// Must NOT be sitting on the blank compose form anymore.
		await expect(page.locator('[data-test-id="im-new-form"]')).toHaveCount(0);
		// Must show the existing thread, with the pre-existing message visible.
		await expect(page.getByText(bodyMarker)).toBeVisible({ timeout: 8000 });

		// No second conversation was created for the same pair.
		const convCount: number = await (async () => {
			const conn = await mysql.createConnection(DB);
			try {
				const [rows] = await conn.execute<any[]>(
					`SELECT COUNT(*) AS cnt FROM ${tn('im_conversations')}
					 WHERE (participant_a = ? AND participant_b = ?) OR (participant_a = ? AND participant_b = ?)`,
					[userId, expertId, expertId, userId],
				);
				return Number(rows[0]?.cnt ?? 0);
			} finally {
				await conn.end();
			}
		})();
		expect(convCount).toBe(1);
	});
});
