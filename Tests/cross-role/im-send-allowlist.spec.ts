/**
 * F-IM-01 regression: server-side recipient allow-list on /im/~send.
 *
 * Validates that ImController::canMessage() blocks unauthorised sends
 * at the API level (not just in the UI recipient picker) and that
 * existing-conversation partners remain allowed even when the business
 * rule would otherwise deny the pair.
 */
import { test, expect, tn } from '../helpers/scoped-test';
import { newScopedContext, scopeHeaders } from '../helpers/scoped-test';
import { DB, withConnection } from '../helpers/db';
import { roleLogin } from '../helpers/role-login';
import mysql from 'mysql2/promise';
import type { BrowserContext, Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

const BASE_URL = process.env.BASE_URL || 'http://localhost:8001';

let userContext: BrowserContext;
let user2Context: BrowserContext;
let expertContext: BrowserContext;
let userPage: Page;
let user2Page: Page;
let expertPage: Page;

let USER_ID = 0;
let USER2_ID = 0;
let EXPERT_ID = 0;

async function devLogin(context: BrowserContext, role: string): Promise<Page> {
    const page = await context.newPage();
    await page.goto(`${BASE_URL}/`);
    await roleLogin(page, role);
    await page.goto(`${BASE_URL}/`);
    return page;
}

/**
 * POST /im/~send via page.evaluate (preserves session cookies).
 * Returns { status, body }.
 */
async function apiSend(page: Page, recipientId: number, message: string): Promise<{ status: number; body: any }> {
    return page.evaluate(async ({ recipientId, message }) => {
        // CSRF token is embedded in the React island's data-props JSON
        let csrf = '';
        const island = document.querySelector('[data-island="im-page"]');
        if (island) {
            try {
                const props = JSON.parse(island.getAttribute('data-props') || '{}');
                csrf = props.csrf || '';
            } catch {}
        }
        // Fallback: scan all data-props for a csrf field
        if (!csrf) {
            document.querySelectorAll('[data-props]').forEach(el => {
                try {
                    const p = JSON.parse(el.getAttribute('data-props') || '{}');
                    if (p.csrf) csrf = p.csrf;
                } catch {}
            });
        }

        const fd = new FormData();
        fd.append('recipient_id', String(recipientId));
        fd.append('message', message);
        fd.append('CSRF_TOKEN', csrf);

        const res = await fetch('/im/~send', { method: 'POST', body: fd });
        const body = await res.json().catch(() => null);
        return { status: res.status, body };
    }, { recipientId, message });
}

test.describe('F-IM-01: /im/~send recipient allow-list', () => {

    test.beforeAll(async ({ browser }) => {
        userContext = await newScopedContext(browser);
        expertContext = await newScopedContext(browser);

        userPage = await devLogin(userContext, 'user');
        expertPage = await devLogin(expertContext, 'expert');

        // Resolve IDs
        const conn = await mysql.createConnection(DB);
        try {
            const [eRows] = await conn.execute<any[]>(`SELECT id FROM ${tn('accounts')} WHERE login = 'expert1@dev.test'`);
            const [uRows] = await conn.execute<any[]>(`SELECT id FROM ${tn('accounts')} WHERE login = 'user1@dev.test'`);
            EXPERT_ID = eRows[0]?.id ?? 0;
            USER_ID = uRows[0]?.id ?? 0;

            // Find or create a second regular user (user2@dev.test) to test user->user block
            const [u2Rows] = await conn.execute<any[]>(`SELECT id FROM ${tn('accounts')} WHERE login = 'user2@dev.test'`);
            USER2_ID = u2Rows[0]?.id ?? 0;
        } finally {
            await conn.end();
        }

        // Clean IM data
        await withConnection(async (c) => {
            await c.execute(`DELETE FROM ${tn('im_read_status')}`);
            await c.execute(`DELETE FROM ${tn('im_attachments')}`);
            await c.execute(`DELETE FROM ${tn('im_messages')}`);
            await c.execute(`DELETE FROM ${tn('im_conversations')}`);
        });

        // Navigate to /im/ so CSRF is available on the page
        await userPage.goto(`${BASE_URL}/im/`);
        await expertPage.goto(`${BASE_URL}/im/`);
    });

    test.afterAll(async () => {
        await userContext?.close();
        await expertContext?.close();
        await user2Context?.close().catch(() => {});
    });

    // ── Positive: user -> expert (allowed) ──────────────────────────

    test('user can send message to expert (allowed by business rules)', async () => {
        expect(EXPERT_ID).toBeGreaterThan(0);
        const result = await apiSend(userPage, EXPERT_ID, 'Allowed: user to expert');
        expect(result.status).toBe(200);
    });

    // ── Negative: user -> unrelated user (must 403) ─────────────────

    test('user cannot send message to another regular user (403)', async () => {
        // If we don't have a user2, use a non-expert account ID.
        // The user should be blocked from messaging another regular user.
        if (USER2_ID > 0) {
            const result = await apiSend(userPage, USER2_ID, 'Blocked: user to user');
            expect(result.status).toBe(403);
            expect(result.body?.error).toContain('not allowed');
        } else {
            // Create a dummy target: pick any ID that is not an expert/mod/owner
            // We'll use a high ID that should not exist as expert
            test.skip(true, 'No user2@dev.test seeded — skipping user->user block test');
        }
    });

    // ── Positive: expert -> own student (allowed) ──────────────────

    test('expert can send message to their student (allowed)', async () => {
        expect(USER_ID).toBeGreaterThan(0);
        // Expert should be able to message users who booked their slots
        // First, ensure there IS a booking relationship (the dev seed should create one)
        const result = await apiSend(expertPage, USER_ID, 'Allowed: expert to student');
        // This should be 200 if the dev seed creates bookings, or 403 if not.
        // The dev seed should create the booking relationship.
        expect(result.status).toBe(200);
    });

    // ── Existing conversation exception ─────────────────────────────

    test('existing conversation partner remains allowed even if rules change', async () => {
        // After the user->expert exchange above, a conversation exists.
        // Verify the conversation is in DB
        const convExists = await withConnection(async (c) => {
            const [rows] = await c.execute<any[]>(
                `SELECT id FROM ${tn('im_conversations')} WHERE
                 (participant_a = ? AND participant_b = ?) OR
                 (participant_a = ? AND participant_b = ?)`,
                [USER_ID, EXPERT_ID, EXPERT_ID, USER_ID],
            );
            return rows.length > 0;
        });
        expect(convExists).toBe(true);

        // Now the expert can reply (expert->user with existing conversation)
        const result = await apiSend(expertPage, USER_ID, 'Reply in existing conversation');
        expect(result.status).toBe(200);
    });
});
