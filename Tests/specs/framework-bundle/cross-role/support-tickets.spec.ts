import { test, expect, tn } from '../../../helpers/scoped-test';
import type { BrowserContext, Page } from '@playwright/test';
import mysql from 'mysql2/promise';

import { newScopedContext } from '../../../helpers/scoped-test';
import { DB } from '../../../helpers/db';
import { roleLogin } from '../../../helpers/role-login';
test.describe.configure({ mode: 'serial' });

const BASE_URL = process.env.BASE_URL || 'http://localhost:8001';

async function devLogin(context: BrowserContext, role: string): Promise<Page> {
    const page = await context.newPage();
    await page.goto(`${BASE_URL}/`);
    await roleLogin(page, role);
    await page.goto(`${BASE_URL}/`);
    return page;
}

let userContext: BrowserContext;
let moderatorContext: BrowserContext;
let userPage: Page;
let moderatorPage: Page;
let ticketId: number;

test.describe('Support tickets — cross-role flow', () => {

    test.beforeAll(async ({ browser }) => {
        // Use dev-login for both user and moderator — avoids stale storageState sessions
        userContext = await newScopedContext(browser);
        userPage = await devLogin(userContext, 'user');

        moderatorContext = await newScopedContext(browser);
        moderatorPage = await devLogin(moderatorContext, 'moderator');
    });

    test.afterAll(async () => {
        await userContext?.close();
        await moderatorContext?.close();
    });

    // ── User creates ticket ───────────────────────────────────────

    test('user: support page loads with new ticket button', async () => {
        await userPage.goto('/support/');

        await Promise.all([
        	expect(userPage.locator('[data-test-id="support-new-ticket-btn"]')).toBeVisible({ timeout: 15000 }),
        	expect(userPage.locator('[data-test-id="support-widget-btn"]')).toBeVisible({ timeout: 10000 }),
        ]);
    });

    test('user: new ticket form has subject, message, and attachment button', async () => {
        await userPage.locator('[data-test-id="support-new-ticket-btn"]').click();

        await Promise.all([
        	expect(userPage.locator('[data-test-id="support-subject-input"]')).toBeVisible(),
        	expect(userPage.locator('[data-test-id="support-message-input"]')).toBeVisible(),
        	expect(userPage.locator('[data-test-id="attachment-btn"]')).toBeVisible(),
        ]);
        // Screenshot button only in floating widget, not on /support/ page
        await expect(userPage.locator('[data-test-id="support-send-btn"]')).toBeVisible();
    });

    test('user: send button disabled when fields empty', async () => {
        await expect(userPage.locator('[data-test-id="support-send-btn"]')).toBeDisabled();
    });

    test('user: creates ticket via FormData', async () => {
        const subject = 'E2E: тест тех-поддержки';
        await userPage.locator('[data-test-id="support-subject-input"]').fill(subject);
        await userPage.locator('[data-test-id="support-message-input"]').fill('Автоматический тест создания тикета через FormData');
        // Click + wait for the `~createTicket` POST so the new row is in
        // DB and the React island has rendered it before we read its id.
        await Promise.all([
            userPage.waitForResponse(
                r => r.request().method() === 'POST' && r.url().includes('~createTicket') && r.status() < 500,
                { timeout: 15000 }
            ),
            userPage.locator('[data-test-id="support-send-btn"]').click(),
        ]);

        // Match the ticket by its subject — `.first()` would otherwise pick
        // up a stale leftover when cleanup didn't fire on the previous run.
        const ticketEl = userPage.locator(`[data-test-id^="support-ticket-"]:has-text("${subject}")`).first();
        await expect(ticketEl).toBeVisible({ timeout: 5000 });

        const testId = await ticketEl.getAttribute('data-test-id');
        ticketId = parseInt(testId!.replace('support-ticket-', ''), 10);
        expect(ticketId).toBeGreaterThan(0);
    });

    test('user: ticket saved in DB with auto-context', async () => {
        const conn = await mysql.createConnection(DB);
        try {
            const [rows] = await conn.execute<any[]>(
                `SELECT * FROM ${tn('support_tickets')} WHERE id = ?`, [ticketId]
            );
            expect(rows).toHaveLength(1);
            expect(rows[0].subject).toBe('E2E: тест тех-поддержки');
            expect(rows[0].status).toBe('open');
            expect(rows[0].unread_staff).toBe(1);

            // Context should be captured
            expect(rows[0].context).toBeTruthy();
            const ctx = JSON.parse(rows[0].context);
            expect(ctx.url).toContain('/support/');
            expect(ctx.userAgent).toBeTruthy();
            expect(ctx.viewport).toBeDefined();
            expect(ctx.viewport.width).toBeGreaterThan(0);
        } finally { await conn.end(); }
    });

    test('user: can view ticket messages', async () => {
        await userPage.locator(`[data-test-id="support-ticket-${ticketId}"]`).click();

        await Promise.all([
        	expect(userPage.locator('[data-test-id="support-reply-input"]')).toBeVisible(),
        // Message body should be visible
        	expect(userPage.locator('text=Автоматический тест создания тикета')).toBeVisible(),
        ]);
    });

    test('user: can reply to ticket', async () => {
        await userPage.locator('[data-test-id="support-reply-input"]').fill('Дополнение от студента');
        // Reply triggers a status flip on the server; wait for the
        // `~reply` XHR specifically so the moderator-facing filter test
        // sees the persisted status, not the pre-reply value.
        await Promise.all([
            userPage.waitForResponse(
                (r) => r.request().method() === 'POST' && r.url().includes('~reply') && r.status() < 500,
                { timeout: 15000 }
            ),
            userPage.locator('[data-test-id="support-reply-btn"]').click(),
        ]);

        await expect(userPage.locator('text=Дополнение от студента')).toBeVisible({ timeout: 5000 });
    });

    // ── Moderator sees and responds ───────────────────────────────

    test('moderator: admin support page shows the ticket', async () => {
        await moderatorPage.goto('/admin/support/');

        // Verify we actually got the admin support page (not user support page).
        // If moderator lost access (session issue), the admin filter won't appear.
        const adminFilter = moderatorPage.locator('[data-test-id="support-filter-all"]');
        const isAdmin = await adminFilter.isVisible({ timeout: 8000 }).catch(() => false);
        if (!isAdmin) {
            // Reload once — the session may need to pick up IS_MODERATOR flag
            await moderatorPage.reload();
            await moderatorPage.waitForLoadState('networkidle');
        }

        await Promise.all([
        	expect(moderatorPage.locator('[data-test-id="support-filter-all"]')).toBeVisible({ timeout: 8000 }),

        	expect(moderatorPage.locator(`[data-test-id="support-ticket-${ticketId}"]`)).toBeVisible({ timeout: 5000 }),
        ]);
    });

    test('moderator: admin support page exposes user/assignee/date filter widgets', async () => {
        // Already on /admin/support/ from the previous test; assert all advanced filter testids are present.
        await Promise.all([
        	expect(moderatorPage.locator('[data-test-id="support-user-filter"]')).toBeVisible({ timeout: 8000 }),
        	expect(moderatorPage.locator('[data-test-id="support-assignee-filter"]')).toBeVisible({ timeout: 8000 }),
        	expect(moderatorPage.locator('[data-test-id="support-date-field"]')).toBeVisible({ timeout: 8000 }),
        	expect(moderatorPage.locator('[data-test-id="support-date-from"]')).toBeVisible({ timeout: 8000 }),
        	expect(moderatorPage.locator('[data-test-id="support-date-to"]')).toBeVisible({ timeout: 8000 }),
        ]);
    });

    test('moderator: status filter "waiting_support" shows new tickets', async () => {
        // New tickets have status "waiting_support".
        // Earlier this test wrapped the click in
        //   Promise.all([waitForResponse(r => POST && <500), click()])
        // which routinely caught a stray CSRF / heartbeat POST and then
        // sat through the 8s `expect` timeout while the real list refetch
        // was still pending — that was the 10s wall on this single test.
        // Skip the generic XHR wait entirely: `expect(...).toBeVisible`
        // already polls until the row appears, regardless of whether the
        // filter is server-side (fetch + rerender) or client-side (pure
        // React filter).
        const waitingFilter = moderatorPage.locator('[data-test-id="support-filter-waiting_support"]');
        if (await waitingFilter.isVisible({ timeout: 2000 }).catch(() => false)) {
            await waitingFilter.click();
            await expect(moderatorPage.locator(`[data-test-id="support-ticket-${ticketId}"]`)).toBeVisible({ timeout: 8000 });
        }
        // Switch back to "All"
        await moderatorPage.locator('[data-test-id="support-filter-all"]').click();
    });

    test('moderator: opens ticket and sees messages + context', async () => {
        await moderatorPage.locator(`[data-test-id="support-ticket-${ticketId}"]`).click();

        // Messages visible
        await Promise.all([
        	expect(moderatorPage.locator('text=Автоматический тест создания тикета')).toBeVisible({ timeout: 5000 }),
        	expect(moderatorPage.locator('text=Дополнение от студента')).toBeVisible(),
        ]);

        // Context toggle visible
        await expect(moderatorPage.locator('[data-test-id="support-context-toggle"]')).toBeVisible();
    });

    test('moderator: can expand context panel', async () => {
        // Ensure we're on the ticket detail
        await expect(moderatorPage.locator('[data-test-id="support-context-toggle"]')).toBeVisible({ timeout: 5000 });
        await moderatorPage.locator('[data-test-id="support-context-toggle"]').click();

        // Context panel should show browser/viewport info
        await expect(moderatorPage.locator('text=1280')).toBeVisible({ timeout: 3000 });
    });

    test('moderator: replies to ticket', async () => {
        await moderatorPage.locator('[data-test-id="support-reply-input"]').fill('Ответ от модератора');
        // Reply XHR triggers the auto-assign + status flip pipeline;
        // wait for the `~reply` endpoint specifically (not just any POST
        // < 500 — CSRF refresh and other side-effects can win the race).
        await Promise.all([
            moderatorPage.waitForResponse(
                (r) => r.request().method() === 'POST' && r.url().includes('~reply') && r.status() < 500,
                { timeout: 15000 }
            ),
            moderatorPage.locator('[data-test-id="support-reply-btn"]').click(),
        ]);

        await expect(moderatorPage.locator('text=Ответ от модератора')).toBeVisible({ timeout: 5000 });
    });

    test('moderator: reply auto-assigns and changes status', async () => {
        const conn = await mysql.createConnection(DB);
        try {
            // Poll until assignee+status land — auto-assign happens in
            // an async post-reply pipeline.
            let row: any = null;
            for (let i = 0; i < 20; i++) {
                const [rows] = await conn.execute<any[]>(
                    `SELECT status, assignee_id, unread_user FROM ${tn('support_tickets')} WHERE id = ?`, [ticketId]
                );
                row = rows[0];
                if (row?.assignee_id && row.status === 'waiting_user') break;
                await new Promise((r) => setTimeout(r, 200));
            }
            expect(row.status).toBe('waiting_user');
            expect(row.assignee_id).toBeTruthy();
            expect(row.unread_user).toBeGreaterThan(0);
        } finally { await conn.end(); }
    });

    test('moderator: adds internal comment', async () => {
        await moderatorPage.locator('[data-test-id="support-internal-input"]').fill('Внутренняя заметка для команды');
        await expect(moderatorPage.locator('[data-test-id="support-internal-btn"]')).toBeEnabled({ timeout: 5000 });
        await moderatorPage.locator('[data-test-id="support-internal-btn"]').click();

        // Internal comment should be visible to moderator
        await expect(moderatorPage.locator('text=Внутренняя заметка для команды')).toBeVisible({ timeout: 5000 });
    });

    // ── User sees response but not internal comment ───────────────

    test('user: sees moderator reply', async () => {
        await userPage.goto('/support/');
        await expect(userPage.locator(`[data-test-id="support-ticket-${ticketId}"]`)).toBeVisible({ timeout: 10000 });
        await userPage.locator(`[data-test-id="support-ticket-${ticketId}"]`).click();

        await expect(userPage.locator('text=Ответ от модератора')).toBeVisible({ timeout: 5000 });
    });

    test('user: does NOT see internal comment', async () => {
        await expect(userPage.locator('text=Внутренняя заметка для команды')).not.toBeVisible();
    });

    test('user: sees updated status', async () => {
        // The ticket status should reflect the moderator's reply
        const conn = await mysql.createConnection(DB);
        try {
            const [rows] = await conn.execute<any[]>(
                `SELECT status FROM ${tn('support_tickets')} WHERE id = ?`, [ticketId]
            );
            expect(rows[0].status).toBe('waiting_user');
        } finally { await conn.end(); }
    });

    // ── Status change ────────────────────────────────────────────

    test('moderator: changes status to resolved', async () => {
        // Status select fires `~changeStatus`; wait for it specifically
        // so the DB read catches the persisted 'resolved'.
        await Promise.all([
            moderatorPage.waitForResponse(
                (r) => r.request().method() === 'POST' && r.url().includes('~changeStatus') && r.status() < 500,
                { timeout: 15000 }
            ),
            moderatorPage.locator('[data-test-id="support-status-select"]').selectOption('resolved'),
        ]);

        const conn = await mysql.createConnection(DB);
        try {
            const [rows] = await conn.execute<any[]>(
                `SELECT status FROM ${tn('support_tickets')} WHERE id = ?`, [ticketId]
            );
            expect(rows[0].status).toBe('resolved');
        } finally { await conn.end(); }
    });

    test('user: sees resolved status and system message', async () => {
        await userPage.goto('/support/');
        await userPage.locator(`[data-test-id="support-ticket-${ticketId}"]`).click();

        // System message about status change should be visible
        // System message is now localized — check for Russian text
        await expect(userPage.locator('text=Статус изменён')).toBeVisible({ timeout: 5000 });
    });

    // ── Widget ───────────────────────────────────────────────────

    test('user: support widget works on other pages', async () => {
        await userPage.goto('/');

        await expect(userPage.locator('[data-test-id="support-widget-btn"]')).toBeVisible();
        await userPage.locator('[data-test-id="support-widget-btn"]').click();

        await Promise.all([
        	expect(userPage.locator('[data-test-id="support-widget-panel"]')).toBeVisible(),
        // Should show ticket in widget list
        	expect(userPage.locator(`[data-test-id="support-ticket-${ticketId}"]`)).toBeVisible({ timeout: 5000 }),
        ]);
    });

    // ── File attachment (via setInputFiles) ──────────────────────

    test('user: can attach file to new ticket', async () => {
        await userPage.goto('/support/');
        await userPage.locator('[data-test-id="support-new-ticket-btn"]').click();

        await userPage.locator('[data-test-id="support-subject-input"]').fill('Тикет с вложением');
        await userPage.locator('[data-test-id="support-message-input"]').fill('Прикрепляю файл');

        // Attach file via hidden input
        const fileInput = userPage.locator('[data-test-id="attachment-input"]');
        await fileInput.setInputFiles({
            name: 'test-file.txt',
            mimeType: 'text/plain',
            buffer: Buffer.from('Test attachment content'),
        });

        // Thumbnail should appear (non-image shows file type)
        await expect(userPage.locator('[data-test-id="attachment-remove-0"]')).toBeVisible();

        // Send — wait for the `~createTicket` XHR so the DB row exists
        // before the next test queries it.
        await Promise.all([
            userPage.waitForResponse(
                (r) => r.request().method() === 'POST' && r.url().includes('~createTicket') && r.status() < 500,
                { timeout: 15000 }
            ),
            userPage.locator('[data-test-id="support-send-btn"]').click(),
        ]);
    });

    test('user: attachment saved in DB', async () => {
        const conn = await mysql.createConnection(DB);
        try {
            const [tickets] = await conn.execute<any[]>(
                `SELECT id FROM ${tn('support_tickets')} WHERE subject = 'Тикет с вложением' ORDER BY id DESC LIMIT 1`
            );
            expect(tickets.length).toBeGreaterThan(0);
            const tid = tickets[0].id;

            const [messages] = await conn.execute<any[]>(
                `SELECT id FROM ${tn('support_messages')} WHERE ticket_id = ?`, [tid]
            );
            expect(messages.length).toBeGreaterThan(0);

            const [attachments] = await conn.execute<any[]>(
                `SELECT * FROM ${tn('support_attachments')} WHERE message_id = ?`, [messages[0].id]
            );
            expect(attachments).toHaveLength(1);
            expect(attachments[0].original_name).toBe('test-file.txt');
            expect(attachments[0].mime_type).toBe('text/plain');
            expect(attachments[0].size).toBeGreaterThan(0);
        } finally { await conn.end(); }
    });
});
