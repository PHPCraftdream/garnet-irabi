/**
 * M-02 regression (docs/security-audit/09-ms-fresh-authorization-review.md):
 * FwSupportAdminController::post__assign() used to accept an arbitrary
 * `assignee_id` from POST with no check that it names a moderator/owner/
 * admin — a moderator could assign a support ticket to any regular user
 * or expert, or to a nonexistent account id.
 *
 * The fix validates assignee_id against the app's own fetchModerators()
 * (0/absent stays a valid "unassign" sentinel); any positive id must
 * resolve to a moderator/owner/admin account.
 */
import { test, expect, tn } from '../../../helpers/scoped-test';
import { newScopedContext } from '../../../helpers/scoped-test';
import { DB, withConnection } from '../../../helpers/db';
import { roleLogin } from '../../../helpers/role-login';
import mysql from 'mysql2/promise';
import type { BrowserContext, Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

let moderatorContext: BrowserContext;
let moderatorPage: Page;
let ticketId = 0;
let regularUserId = 0;
let moderatorAccountId = 0;

async function devLogin(browser: any, role: string): Promise<{ context: BrowserContext; page: Page }> {
    const context = await newScopedContext(browser);
    const page = await context.newPage();
    await page.goto('/');
    await roleLogin(page, role);
    await page.goto('/');
    return { context, page };
}

async function postAssign(page: Page, ticketId: number, assigneeId: number): Promise<{ status: number; body: any }> {
    return page.evaluate(async ({ ticketId, assigneeId }) => {
        const csrf = (window as any).__GARNET_CSRF__ || '';
        const res = await fetch('/admin/support/~assign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ ticket_id: ticketId, assignee_id: assigneeId, CSRF_TOKEN: csrf }),
        });
        const body = await res.json().catch(() => null);
        return { status: res.status, body };
    }, { ticketId, assigneeId });
}

async function seedTicket(userId: number): Promise<number> {
    return withConnection(async (c) => {
        const [res]: any = await c.execute(
            `INSERT INTO ${tn('support_tickets')} (account_id, subject, status, created_at, updated_at)
             VALUES (?, 'M-02 test ticket', 'open', UNIX_TIMESTAMP(), UNIX_TIMESTAMP())`,
            [userId],
        );
        return res.insertId;
    });
}

async function getAssigneeId(tid: number): Promise<number | null> {
    return withConnection(async (c) => {
        const [rows] = await c.execute<any[]>(`SELECT assignee_id FROM ${tn('support_tickets')} WHERE id = ?`, [tid]);
        return rows[0]?.assignee_id ?? null;
    });
}

async function cleanup(tid: number): Promise<void> {
    if (!tid) return;
    await withConnection(async (c) => {
        await c.execute(`DELETE FROM ${tn('support_assignment_log')} WHERE ticket_id = ?`, [tid]);
        await c.execute(`DELETE FROM ${tn('support_tickets')} WHERE id = ?`, [tid]);
    });
}

test.describe('M-02: /admin/support/~assign validates assignee_id', () => {
    test.beforeAll(async ({ browser }) => {
        ({ context: moderatorContext, page: moderatorPage } = await devLogin(browser, 'moderator'));

        const conn = await mysql.createConnection(DB);
        try {
            const [uRows] = await conn.execute<any[]>(`SELECT id FROM ${tn('accounts')} WHERE login = 'user1@dev.test'`);
            regularUserId = uRows[0]?.id ?? 0;
            const [mRows] = await conn.execute<any[]>(`SELECT id FROM ${tn('accounts')} WHERE login = 'moderator@dev.test'`);
            moderatorAccountId = mRows[0]?.id ?? 0;
        } finally {
            await conn.end();
        }

        ticketId = await seedTicket(regularUserId);
        await moderatorPage.goto('/admin/support/');
    });

    test.afterAll(async () => {
        await cleanup(ticketId);
        await moderatorContext?.close().catch(() => {});
    });

    test('assigning to a regular (non-staff) account is rejected', async () => {
        expect(regularUserId).toBeGreaterThan(0);
        expect(ticketId).toBeGreaterThan(0);
        const result = await postAssign(moderatorPage, ticketId, regularUserId);
        expect(result.status).toBe(400);
        const assignee = await getAssigneeId(ticketId);
        expect(assignee).toBeNull();
    });

    test('assigning to a nonexistent account id is rejected', async () => {
        const bogusId = 999999999;
        const result = await postAssign(moderatorPage, ticketId, bogusId);
        expect(result.status).toBe(400);
        const assignee = await getAssigneeId(ticketId);
        expect(assignee).toBeNull();
    });

    test('assigning to a real moderator succeeds', async () => {
        expect(moderatorAccountId).toBeGreaterThan(0);
        const result = await postAssign(moderatorPage, ticketId, moderatorAccountId);
        expect(result.status).toBe(200);
        const assignee = await getAssigneeId(ticketId);
        expect(Number(assignee)).toBe(moderatorAccountId);
    });

    test('unassigning (assignee_id=0) still works', async () => {
        const result = await postAssign(moderatorPage, ticketId, 0);
        expect(result.status).toBe(200);
        const assignee = await getAssigneeId(ticketId);
        expect(assignee).toBeNull();
    });
});
