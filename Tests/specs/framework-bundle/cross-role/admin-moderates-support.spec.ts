/**
 * Cross-role: Admin moderates a user support ticket
 *
 * Two sessions: user + admin
 * Steps:
 *   1. User creates a support ticket (subject, message)
 *   2. Admin sees ticket in /admin/support/ grid
 *   3. Admin opens ticket, changes status
 *   4. Admin replies
 *   5. Admin writes internal comment
 *   6. User sees admin reply but NOT internal comment
 *   7. User replies
 *   8. Admin sees user reply, changes status to "Resolved"
 *
 * Uses dev-login for reliable session creation.
 */

import { test, expect, tn } from '../../../helpers/scoped-test';
import type { BrowserContext, Page } from '@playwright/test';
import mysql from 'mysql2/promise';

import { newScopedContext } from '../../../helpers/scoped-test';
import { DB } from '../../../helpers/db';
import { roleLogin } from '../../../helpers/role-login';
test.describe.configure({ mode: 'serial' });

const TICKET_SUBJECT = 'E2E admin-moderates: тест поддержки';
const TICKET_MESSAGE = 'Автоматический тест: пользователь создаёт тикет для админа';
const ADMIN_REPLY = 'Ответ администратора на тикет';
const INTERNAL_COMMENT = 'Внутренний комментарий: только для команды';
const USER_REPLY = 'Спасибо, админ! Дополнительный вопрос.';

let userContext: BrowserContext;
let adminContext: BrowserContext;
let userPage: Page;
let adminPage: Page;
let ticketId = 0;

// ── Dev-login helper ────────────────────────────────────────────────────────

async function devLogin(browser: any, role: string): Promise<{ context: BrowserContext; page: Page }> {
	const context = await newScopedContext(browser);
	const page = await context.newPage();
	await page.goto('/');

	await roleLogin(page, role);

	await page.goto('/');
	return { context, page };
}

// ── Cleanup helper ──────────────────────────────────────────────────────────

async function cleanupTicket(tid: number): Promise<void> {
	if (!tid) return;
	const conn = await mysql.createConnection(DB);
	try {
		await conn.execute(
			`DELETE FROM ${tn('support_attachments')} WHERE message_id IN
			 (SELECT id FROM ${tn('support_messages')} WHERE ticket_id = ?)`, [tid]
		);
		await conn.execute(`DELETE FROM ${tn('support_messages')} WHERE ticket_id = ?`, [tid]);
		await conn.execute(`DELETE FROM ${tn('support_assignment_log')} WHERE ticket_id = ?`, [tid]);
		await conn.execute(`DELETE FROM ${tn('support_tickets')} WHERE id = ?`, [tid]);
	} finally { await conn.end(); }
}

// ── Tests ───────────────────────────────────────────────────────────────────

test.describe('Cross-role: admin moderates user support ticket', () => {

	test.beforeAll(async ({ browser }) => {
		const user = await devLogin(browser, 'user');
		userContext = user.context;
		userPage = user.page;

		const admin = await devLogin(browser, 'admin');
		adminContext = admin.context;
		adminPage = admin.page;
	});

	test.afterAll(async () => {
		if (ticketId) {
			await cleanupTicket(ticketId);
		}
		await userContext?.close();
		await adminContext?.close();
	});

	// ── Step 1: User creates support ticket ──────────────────────────────

	test('step 1: user navigates to /support/ and creates ticket', async () => {
		await userPage.goto('/support/');

		await expect(userPage.locator('[data-test-id="support-new-ticket-btn"]')).toBeVisible({ timeout: 10000 });
		await userPage.locator('[data-test-id="support-new-ticket-btn"]').click();

		await Promise.all([
			expect(userPage.locator('[data-test-id="support-subject-input"]')).toBeVisible(),
			expect(userPage.locator('[data-test-id="support-message-input"]')).toBeVisible(),
		]);

		await userPage.locator('[data-test-id="support-subject-input"]').fill(TICKET_SUBJECT);
		await userPage.locator('[data-test-id="support-message-input"]').fill(TICKET_MESSAGE);

		// Click + wait for the ticket-create POST so the React island has
		// the new row before we read the first ticket id from the list.
		await Promise.all([
			userPage.waitForResponse(r => r.request().method() === 'POST' && r.status() < 500, { timeout: 10000 }),
			userPage.locator('[data-test-id="support-send-btn"]').click(),
		]);

		// Ticket should appear in list — match by subject so we don't pick
		// up a stale leftover row from a previous run.
		const ticketEl = userPage.locator(`[data-test-id^="support-ticket-"]:has-text("${TICKET_SUBJECT}")`).first();
		await expect(ticketEl).toBeVisible({ timeout: 5000 });

		const testId = await ticketEl.getAttribute('data-test-id');
		ticketId = parseInt(testId!.replace('support-ticket-', ''), 10);
		expect(ticketId).toBeGreaterThan(0);
		console.log('Created ticket ID:', ticketId);
	});

	test('step 1: ticket saved in DB with status open', async () => {
		expect(ticketId).toBeGreaterThan(0);

		const conn = await mysql.createConnection(DB);
		try {
			const [rows] = await conn.execute<any[]>(
				`SELECT * FROM ${tn('support_tickets')} WHERE id = ?`, [ticketId]
			);
			expect(rows).toHaveLength(1);
			expect(rows[0].subject).toBe(TICKET_SUBJECT);
			expect(rows[0].status).toBe('open');
			expect(rows[0].unread_staff).toBe(1);
		} finally { await conn.end(); }
	});

	// ── Step 2: Admin sees ticket in /admin/support/ ────────────────────────

	test('step 2: admin navigates to /admin/support/ and sees ticket', async () => {
		if (!ticketId) { test.skip(); return; }

		await adminPage.goto('/admin/support/');

		await Promise.all([
			expect(adminPage.locator('[data-test-id="support-filter-all"]')).toBeVisible({ timeout: 8000 }),
			expect(adminPage.locator(`[data-test-id="support-ticket-${ticketId}"]`)).toBeVisible({ timeout: 5000 }),
		]);
	});

	// ── Step 3: Admin opens ticket and changes status ───────────────────────

	test('step 3: admin opens ticket and sees messages', async () => {
		if (!ticketId) { test.skip(); return; }

		await adminPage.locator(`[data-test-id="support-ticket-${ticketId}"]`).click();

		// Should see the user's message
		await Promise.all([
			expect(adminPage.locator(`text=${TICKET_MESSAGE}`)).toBeVisible({ timeout: 5000 }),

		// Context toggle should be visible (admin feature)
			expect(adminPage.locator('[data-test-id="support-context-toggle"]')).toBeVisible(),
		]);
	});

	test('step 3: admin changes status to in_progress', async () => {
		if (!ticketId) { test.skip(); return; }

		const statusSelect = adminPage.locator('[data-test-id="support-status-select"]');
		await expect(statusSelect).toBeVisible({ timeout: 3000 });
		// Status change fires an XHR; without waiting for it the DB
		// read below races and gets the prior 'open' value.
		await Promise.all([
			adminPage.waitForResponse((r) => r.request().method() === 'POST' && r.status() < 500, { timeout: 10000 }),
			statusSelect.selectOption('in_progress'),
		]);

		// Verify in DB
		const conn = await mysql.createConnection(DB);
		try {
			const [rows] = await conn.execute<any[]>(
				`SELECT status FROM ${tn('support_tickets')} WHERE id = ?`, [ticketId]
			);
			expect(rows[0].status).toBe('in_progress');
		} finally { await conn.end(); }
	});

	// ── Step 4: Admin replies ───────────────────────────────────────────────

	test('step 4: admin replies to ticket', async () => {
		if (!ticketId) { test.skip(); return; }

		await adminPage.locator('[data-test-id="support-reply-input"]').fill(ADMIN_REPLY);
		// Reply triggers an XHR that sets assignee_id + unread_user;
		// without the wait the next test reads null for assignee_id.
		await Promise.all([
			adminPage.waitForResponse((r) => r.request().method() === 'POST' && r.status() < 500, { timeout: 10000 }),
			adminPage.locator('[data-test-id="support-reply-btn"]').click(),
		]);

		// Admin should see the reply
		await expect(adminPage.locator(`text=${ADMIN_REPLY}`)).toBeVisible({ timeout: 5000 });
	});

	test('step 4: admin reply updates ticket metadata', async () => {
		if (!ticketId) { test.skip(); return; }

		const conn = await mysql.createConnection(DB);
		try {
			// Auto-assign + unread bump happen in async post-reply
			// pipeline; poll until they land instead of reading once
			// and racing.
			let row: any = null;
			for (let i = 0; i < 10; i++) {
				const [rows] = await conn.execute<any[]>(
					`SELECT status, assignee_id, unread_user FROM ${tn('support_tickets')} WHERE id = ?`, [ticketId]
				);
				row = rows[0];
				if (row?.assignee_id && row.unread_user > 0) break;
				await new Promise((r) => setTimeout(r, 100));
			}
			// Status auto-changes to waiting_user only from 'open' or 'waiting_support'.
			// Since step 3 set it to 'in_progress', status stays 'in_progress' after reply.
			expect(['in_progress', 'waiting_user']).toContain(row.status);
			expect(row.assignee_id).toBeTruthy();
			expect(row.unread_user).toBeGreaterThan(0);
		} finally { await conn.end(); }
	});

	// ── Step 5: Admin writes internal comment ───────────────────────────────

	test('step 5: admin writes internal comment', async () => {
		if (!ticketId) { test.skip(); return; }

		await adminPage.locator('[data-test-id="support-internal-input"]').fill(INTERNAL_COMMENT);
		// Wait for the button to become enabled (previous reply may still be sending)
		await expect(adminPage.locator('[data-test-id="support-internal-btn"]')).toBeEnabled({ timeout: 5000 });
		await adminPage.locator('[data-test-id="support-internal-btn"]').click();

		// Admin sees internal comment
		await expect(adminPage.locator(`text=${INTERNAL_COMMENT}`)).toBeVisible({ timeout: 8000 });
	});

	// ── Step 6: User sees admin reply but NOT internal comment ────────────

	test('step 6: user sees admin reply in ticket', async () => {
		if (!ticketId) { test.skip(); return; }

		await userPage.goto('/support/');

		await userPage.locator(`[data-test-id="support-ticket-${ticketId}"]`).click();

		// User should see admin reply
		await expect(userPage.locator(`text=${ADMIN_REPLY}`)).toBeVisible({ timeout: 5000 });
	});

	test('step 6: user does NOT see internal comment', async () => {
		if (!ticketId) { test.skip(); return; }

		await expect(userPage.locator(`text=${INTERNAL_COMMENT}`)).not.toBeVisible();
	});

	// ── Step 7: User replies ─────────────────────────────────────────────

	test('step 7: user replies to ticket', async () => {
		if (!ticketId) { test.skip(); return; }

		await userPage.locator('[data-test-id="support-reply-input"]').fill(USER_REPLY);
		// User reply triggers a status flip + unread_staff bump on the
		// server; wait for the XHR so the next test reads consistent
		// state.
		await Promise.all([
			userPage.waitForResponse((r) => r.request().method() === 'POST' && r.status() < 500, { timeout: 10000 }),
			userPage.locator('[data-test-id="support-reply-btn"]').click(),
		]);

		// User sees own reply
		await expect(userPage.locator(`text=${USER_REPLY}`)).toBeVisible({ timeout: 5000 });
	});

	test('step 7: user reply flips status to waiting_support and sets unread_staff', async () => {
		if (!ticketId) { test.skip(); return; }

		const conn = await mysql.createConnection(DB);
		try {
			// Async pipeline — poll until the status flip + unread_staff
			// bump land.
			let row: any = null;
			for (let i = 0; i < 20; i++) {
				const [rows] = await conn.execute<any[]>(
					`SELECT status, unread_staff FROM ${tn('support_tickets')} WHERE id = ?`, [ticketId]
				);
				row = rows[0];
				if (row?.status === 'waiting_support' && row.unread_staff > 0) break;
				await new Promise((r) => setTimeout(r, 200));
			}
			// Backend sets status to 'waiting_support' when user replies (not 'open')
			expect(row.status).toBe('waiting_support');
			expect(row.unread_staff).toBeGreaterThan(0);
		} finally { await conn.end(); }
	});

	// ── Step 8: Admin sees user reply and resolves ───────────────────────

	test('step 8: admin refreshes and sees user reply', async () => {
		if (!ticketId) { test.skip(); return; }

		// Reload the admin support page to get fresh data
		await adminPage.goto('/admin/support/');

		await adminPage.locator(`[data-test-id="support-ticket-${ticketId}"]`).click();

		await expect(adminPage.locator(`text=${USER_REPLY}`)).toBeVisible({ timeout: 5000 });
	});

	test('step 8: admin changes status to resolved', async () => {
		if (!ticketId) { test.skip(); return; }

		// Status select fires an XHR; wait for it before reading the
		// DB so the test catches the persisted value, not 'in_progress'.
		await Promise.all([
			adminPage.waitForResponse((r) => r.request().method() === 'POST' && r.status() < 500, { timeout: 10000 }),
			adminPage.locator('[data-test-id="support-status-select"]').selectOption('resolved'),
		]);

		// Verify in DB
		const conn = await mysql.createConnection(DB);
		try {
			const [rows] = await conn.execute<any[]>(
				`SELECT status FROM ${tn('support_tickets')} WHERE id = ?`, [ticketId]
			);
			expect(rows[0].status).toBe('resolved');
		} finally { await conn.end(); }
	});

	test('step 8: user sees resolved status and system message', async () => {
		if (!ticketId) { test.skip(); return; }

		await userPage.goto('/support/');

		await userPage.locator(`[data-test-id="support-ticket-${ticketId}"]`).click();

		// System message about status change should be visible (Russian)
		// Multiple status change messages may exist — use .first()
		await expect(userPage.locator('text=Статус изменён').first()).toBeVisible({ timeout: 5000 });
	});

	// ── DB consistency ──────────────────────────────────────────────────────

	test('DB: correct message count (user + staff + internal + system)', async () => {
		if (!ticketId) { test.skip(); return; }

		const conn = await mysql.createConnection(DB);
		try {
			// Should have: 1 user message, 1 staff reply, 1 internal (staff + is_internal=1), 1 user reply, + system messages
			const [rows] = await conn.execute<any[]>(
				`SELECT msg_type, is_internal, COUNT(*) as cnt FROM ${tn('support_messages')} WHERE ticket_id = ? GROUP BY msg_type, is_internal`,
				[ticketId]
			);
			const counts: Record<string, number> = {};
			let internalCount = 0;
			for (const row of rows) {
				counts[row.msg_type] = (counts[row.msg_type] || 0) + Number(row.cnt);
				if (Number(row.is_internal) === 1) internalCount += Number(row.cnt);
			}
			// 2 user messages (initial + reply)
			expect(counts['user']).toBe(2);
			// staff reply(s) + internal comment(s) — both have msg_type='staff'
			expect(counts['staff']).toBeGreaterThanOrEqual(2);
			// 1 internal comment (is_internal=1)
			expect(internalCount).toBe(1);
			// system messages for status changes
			expect(counts['system']).toBeGreaterThanOrEqual(1);
		} finally { await conn.end(); }
	});
});
