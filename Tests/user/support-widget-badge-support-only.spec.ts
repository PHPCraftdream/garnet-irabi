/**
 * D-210: the floating support button is labelled and shaped as a support
 * entry point, but its badge summed `unreadSupport + unreadIm`. A real
 * client (support ticket #24) complained about exactly this — the button
 * showed "9+" while `unreadSupport` was 0, they clicked expecting a support
 * reply, and landed on their personal-message chat with the teacher
 * instead. Confirmed independently by user-2 and mod-1 in cycle8.
 *
 * Fixed at both places the badge is computed: the server-rendered initial
 * prop (`IRabi.php::buildSupportWidget`) and the live 20s poll update
 * (`SupportWidgetIsland.tsx`). Unread IM keeps its own separate badge
 * inside the widget panel (`widget-im-link`) — this spec checks that one
 * still shows the personal-message count, so the fix isn't "drop IM
 * visibility everywhere", just "don't fold it into the support badge".
 */
import { test, expect, tn } from '../helpers/scoped-test';
import { withConnection } from '../helpers/db';
import { USER_LOGIN, EXPERT_LOGIN } from '../helpers/logins';

async function getAccountId(login: string): Promise<number> {
	return withConnection(async (c) => {
		const [rows] = await c.execute<any[]>(`SELECT id FROM ${tn('accounts')} WHERE login = ?`, [login]);
		return rows[0]?.id ?? 0;
	});
}

async function seedUnreadImMessage(userId: number, expertId: number): Promise<{ convId: number; msgId: number }> {
	return withConnection(async (c) => {
		const now = Math.floor(Date.now() / 1000);
		const [convRes]: any = await c.execute(
			`INSERT INTO ${tn('im_conversations')} (participant_a, participant_b, last_message_at, created_at) VALUES (?, ?, ?, ?)`,
			[userId, expertId, now, now],
		);
		const convId = convRes.insertId;
		const [msgRes]: any = await c.execute(
			`INSERT INTO ${tn('im_messages')} (conversation_id, sender_id, body, created_at) VALUES (?, ?, ?, ?)`,
			[convId, expertId, 'D-210 unread personal message', now],
		);
		return { convId, msgId: msgRes.insertId };
	});
}

async function cleanup(convId: number): Promise<void> {
	if (!convId) return;
	await withConnection(async (c) => {
		await c.execute(`DELETE FROM ${tn('im_read_status')} WHERE conversation_id = ?`, [convId]);
		await c.execute(`DELETE FROM ${tn('im_messages')} WHERE conversation_id = ?`, [convId]);
		await c.execute(`DELETE FROM ${tn('im_conversations')} WHERE id = ?`, [convId]);
	});
}

test.describe.configure({ mode: 'serial' });

test.describe('D-210: support widget badge counts support unread only', () => {
	let userId = 0;
	let expertId = 0;
	let convId = 0;

	test.beforeAll(async () => {
		userId = await getAccountId(USER_LOGIN);
		expertId = await getAccountId(EXPERT_LOGIN);
		expect(userId).toBeGreaterThan(0);
		expect(expertId).toBeGreaterThan(0);

		const seeded = await seedUnreadImMessage(userId, expertId);
		convId = seeded.convId;
	});

	test.afterAll(async () => {
		await cleanup(convId);
	});

	test('unread personal messages alone do not put a badge on the support button', async ({ page }) => {
		await page.goto('/system/', { waitUntil: 'domcontentloaded' });

		// The widget button must exist but show NO badge — unreadSupport is 0
		// for this account, only unreadIm is non-zero.
		await expect(page.locator('[data-test-id="support-widget-btn"]')).toBeVisible({ timeout: 10000 });
		await expect(page.locator('[data-test-id="support-widget-badge"]')).toHaveCount(0);

		// The personal-message count is still surfaced — just in its own
		// place, not folded into the support badge. It shows inside the panel.
		// Asserting >=1 rather than an exact count: this account's unread IM
		// total can include messages from other specs sharing this worker's
		// tables, not just the one seeded here — the point of D-210 is that
		// it's visible at all, not the exact number.
		await page.locator('[data-test-id="support-widget-btn"]').click();
		await expect(page.locator('[data-test-id="widget-im-link"]')).toBeVisible({ timeout: 8000 });
		const imLinkText = await page.locator('[data-test-id="widget-im-link"]').innerText();
		expect(Number(imLinkText.match(/\d+/)?.[0] ?? '0')).toBeGreaterThanOrEqual(1);
	});
});
