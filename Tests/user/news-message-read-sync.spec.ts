/**
 * D-161: reading a conversation in /system/im/ marks the messaging module's
 * own read status (ImReadStatus) but never touched the "new message" item
 * the same message had spawned in the "Новости" feed — the badge count
 * there stayed unchanged and the item stayed bold/unread even after the
 * chat itself was read and replied to (found by user-6, live).
 *
 * Root cause: `NewsService::createMessageEvent()` never sets a `target_key`
 * (the framework's `createThrottledEvent` doesn't take one), so the
 * existing `deleteByTargetKey` purge mechanism used elsewhere in this
 * codebase (D-154 etc.) doesn't apply — the news event and the chat
 * message were two independent read-tracking journals with no link.
 *
 * Fix: `ImController::post__messages` now also calls the new
 * `NewsService::markMessagesRead($accountId, $senderId)` after the parent
 * marks the conversation itself read, closing every unread `new_message`
 * event from that specific sender.
 */

import { test, expect, tn } from '../helpers/scoped-test';
import { newScopedContext } from '../helpers/scoped-test';
import { resolveStorageStatePath } from '../helpers/state';
import { withConnection } from '../helpers/db';
import type { BrowserContext, Page } from '@playwright/test';

async function getIds(): Promise<{ expertId: number; userId: number }> {
	return withConnection(async (c) => {
		const [er] = await c.execute<any[]>(`SELECT id FROM ${tn('accounts')} WHERE login = 'testuser_setup_expert@irabi.test'`);
		const [ur] = await c.execute<any[]>(`SELECT id FROM ${tn('accounts')} WHERE login = 'testuser_setup_user@irabi.test'`);
		return { expertId: er[0]?.id ?? 0, userId: ur[0]?.id ?? 0 };
	});
}

/** Find-or-create, mirroring FwImConversations::findOrCreate — never deletes a pre-existing conversation. */
async function findOrCreateConversation(a: number, b: number): Promise<{ id: number; created: boolean }> {
	const lo = Math.min(a, b), hi = Math.max(a, b);
	return withConnection(async (c) => {
		const [existing] = await c.execute<any[]>(
			`SELECT id FROM ${tn('im_conversations')} WHERE participant_a = ? AND participant_b = ?`, [lo, hi],
		);
		if (existing.length > 0) return { id: existing[0].id, created: false };
		const now = Math.floor(Date.now() / 1000);
		const [res]: any = await c.execute(
			`INSERT INTO ${tn('im_conversations')} (participant_a, participant_b, last_message_at, created_at) VALUES (?, ?, ?, ?)`,
			[lo, hi, now, now],
		);
		return { id: res.insertId, created: true };
	});
}

async function insertMessageAndNewsEvent(conversationId: number, senderId: number, recipientId: number): Promise<{ messageId: number; eventId: number }> {
	return withConnection(async (c) => {
		const now = Math.floor(Date.now() / 1000);
		const [msgRes]: any = await c.execute(
			`INSERT INTO ${tn('im_messages')} (conversation_id, sender_id, body, created_at) VALUES (?, ?, ?, ?)`,
			[conversationId, senderId, 'D-161 test: непрочитанное сообщение', now],
		);
		const [evRes]: any = await c.execute(
			`INSERT INTO ${tn('news_events')} (event_type, audience_type, audience_id, actor_id, target_key, payload, created_at)
			 VALUES ('new_message', 'personal', ?, ?, NULL, '{}', ?)`,
			[recipientId, senderId, now],
		);
		return { messageId: msgRes.insertId, eventId: evRes.insertId };
	});
}

async function isEventRead(accountId: number, eventId: number): Promise<boolean> {
	return withConnection(async (c) => {
		const [rows] = await c.execute<any[]>(
			`SELECT 1 FROM ${tn('news_reads')} WHERE account_id = ? AND event_id = ?`, [accountId, eventId],
		);
		return rows.length > 0;
	});
}

async function cleanup(conversationId: number, conversationCreated: boolean, messageId: number, eventId: number, userId: number): Promise<void> {
	await withConnection(async (c) => {
		if (eventId) {
			await c.execute(`DELETE FROM ${tn('news_reads')} WHERE event_id = ?`, [eventId]);
			await c.execute(`DELETE FROM ${tn('news_events')} WHERE id = ?`, [eventId]);
		}
		if (messageId) await c.execute(`DELETE FROM ${tn('im_messages')} WHERE id = ?`, [messageId]);
		if (conversationCreated && conversationId) {
			await c.execute(`DELETE FROM ${tn('im_read_status')} WHERE conversation_id = ?`, [conversationId]);
			await c.execute(`DELETE FROM ${tn('im_conversations')} WHERE id = ?`, [conversationId]);
		}
	});
}

test.describe.configure({ mode: 'serial' });

test.describe('D-161: opening the chat clears the matching "Новости" unread item', () => {
	let expertId = 0;
	let userId = 0;
	let conversationId = 0;
	let conversationCreated = false;
	let messageId = 0;
	let eventId = 0;
	let ctx: BrowserContext;
	let page: Page;

	test.beforeAll(async ({ browser }) => {
		({ expertId, userId } = await getIds());
		expect(expertId).toBeGreaterThan(0);
		expect(userId).toBeGreaterThan(0);

		({ id: conversationId, created: conversationCreated } = await findOrCreateConversation(expertId, userId));
		({ messageId, eventId } = await insertMessageAndNewsEvent(conversationId, expertId, userId));

		ctx = await newScopedContext(browser, { storageState: resolveStorageStatePath('user') });
		page = await ctx.newPage();
		await page.goto('/system/im/', { waitUntil: 'domcontentloaded' });
	});

	test.afterAll(async () => {
		await ctx?.close().catch(() => {});
		await cleanup(conversationId, conversationCreated, messageId, eventId, userId);
	});

	test('the news event starts unread', async () => {
		expect(await isEventRead(userId, eventId)).toBe(false);
	});

	test('opening the conversation (POST /im/~messages) marks it read', async () => {
		const result = await page.evaluate(async (args: { conversationId: number }) => {
			const csrf = (window as any).__GARNET_CSRF__ || '';
			const fd = new FormData();
			fd.append('conversation_id', String(args.conversationId));
			fd.append('CSRF_TOKEN', csrf);
			const res = await fetch('/im/~messages', { method: 'POST', body: fd });
			return { status: res.status, body: await res.json().catch(() => null) };
		}, { conversationId });
		expect(result.status).toBe(200);

		expect(await isEventRead(userId, eventId)).toBe(true);
	});
});
