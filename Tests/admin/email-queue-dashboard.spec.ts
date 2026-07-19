/**
 * Admin — /admin/email-queue/ — email queue viewer + manual dead-letter retry
 *
 * Covers audit 09 / H-3 mitigation (task #80):
 *   1. Access control: moderator/user get no sidebar link + 403 on the
 *      retry endpoint (admin-only, unlike the moderator-gated logs viewer).
 *   2. Admin sees the page with email_queue rows + correct fields.
 *   3. Manual retry: a terminal dead-letter row (status='error',
 *      next_attempt_at=NULL) returns to status='queued' with a scheduled
 *      next_attempt_at, and the dead-letter counter drops by 1.
 *   4. max_attempts is now 6 (was 3) for emails enqueued via the real
 *      EmailNotifications path (support-ticket-created → moderator mail).
 */

import { test, expect, tn } from '../helpers/scoped-test';
import { DB, withConnection } from '../helpers/db';
import type { Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

const QUEUE = () => tn('email_queue');

// ── DB helpers ────────────────────────────────────────────────────────────

async function deadLetterCount(): Promise<number> {
    return withConnection(async conn => {
        const [rows] = await conn.execute<any[]>(
            `SELECT COUNT(*) AS cnt FROM ${QUEUE()} WHERE status = 'error' AND next_attempt_at IS NULL`
        );
        return Number(rows[0]?.cnt ?? 0);
    });
}

async function maxQueueId(): Promise<number> {
    return withConnection(async conn => {
        const [rows] = await conn.execute<any[]>(`SELECT COALESCE(MAX(id), 0) AS m FROM ${QUEUE()}`);
        return Number(rows[0]?.m ?? 0);
    });
}

async function getQueueRow(id: number): Promise<any> {
    return withConnection(async conn => {
        const [rows] = await conn.execute<any[]>(
            `SELECT id, status, attempts, max_attempts, next_attempt_at FROM ${QUEUE()} WHERE id = ?`,
            [id]
        );
        return rows[0] ?? null;
    });
}

/** Insert a terminal dead-letter row; returns its id. */
async function seedDeadLetterRow(subject: string): Promise<number> {
    const now = Math.floor(Date.now() / 1000);
    return withConnection(async conn => {
        const [res]: any = await conn.execute(
            `INSERT INTO ${QUEUE()}
                (account_id, recipient_email, subject, body_html, status, attempts, max_attempts, next_attempt_at, sent_at, created_at)
             VALUES (NULL, ?, ?, '<p>probe</p>', 'error', 6, 6, NULL, NULL, ?)`,
            [`probe+${now}@irabi.test`, subject, now]
        );
        return Number(res.insertId);
    });
}

async function deleteRow(id: number): Promise<void> {
    if (!id) return;
    await withConnection(async conn => {
        await conn.execute(`DELETE FROM ${QUEUE()} WHERE id = ?`, [id]);
    });
}

/**
 * POST JSON from inside the browser page so the request carries the
 * session cookie AND the framework CSRF token (window.__GARNET_CSRF__),
 * exactly like the island's sendPost() does.
 */
async function postFromPage(page: Page, url: string, body: Record<string, unknown>): Promise<{ status: number; data: any }> {
    return page.evaluate(async ({ url, body }) => {
        const csrf = (window as any).__GARNET_CSRF__ ?? '';
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ ...body, CSRF_TOKEN: csrf }),
        });
        let data: any = null;
        try { data = await res.json(); } catch { /* non-JSON */ }
        return { status: res.status, data };
    }, { url, body });
}

// ── 1. Access control ─────────────────────────────────────────────────────

test.describe('Email queue dashboard — access control (admin-only)', () => {
    test('moderator: no sidebar link + retry endpoint returns 403', async ({ moderatorPage }) => {
        // Moderators can open admin pages (moderatorOnly middleware), so the
        // sidebar renders — but the admin-only email-queue link must be absent.
        await moderatorPage.goto('/admin/');
        await moderatorPage.waitForLoadState('networkidle');
        await expect(moderatorPage.locator(`a[href*="/admin/email-queue/"]`)).toHaveCount(0);

        // Direct POST to the retry endpoint must be refused by the controller.
        const { status } = await postFromPage(moderatorPage, '/admin/email-queue/~retry', { id: 1 });
        expect(status).toBe(403);
    });

    test('user: cannot perform a retry (blocked before reaching the controller)', async ({ userPage }) => {
        await userPage.goto('/');
        await userPage.waitForLoadState('networkidle');
        // A regular user is blocked by the route-level moderatorOnly middleware
        // (redirect), not by the controller's isAdmin() gate — so the response
        // is not a clean 403. Assert the meaningful invariant instead: the retry
        // never succeeds.
        const { data } = await postFromPage(userPage, '/admin/email-queue/~retry', { id: 1 });
        expect(data?.success).not.toBe(true);
    });
});

// ── 2. Admin view ─────────────────────────────────────────────────────────

test.describe('Email queue dashboard — admin view', () => {
    const viewSubject = `PW view probe ${Date.now()}`;
    let rowId = 0;

    test('seed a row so the table is populated', async () => {
        rowId = await seedDeadLetterRow(viewSubject);
        expect(rowId).toBeGreaterThan(0);
    });

    test('admin sees the page and the queue table renders with correct fields', async ({ adminPage }) => {
        if (!rowId) { test.skip(); return; }

        const resp = await adminPage.goto('/admin/email-queue/');
        expect(resp?.status()).toBe(200);

        await adminPage.waitForSelector('[data-test-id="admin-email-queue"]', { timeout: 12000 });
        // 7 data columns + 1 action column.
        await expect(adminPage.locator('[data-test-id="admin-email-queue"] thead th')).toHaveCount(8, { timeout: 8000 });

        // The seeded row is present and shows its subject + status badge.
        const row = adminPage.locator(`[data-test-id="email-queue-row-${rowId}"]`);
        await expect(row).toBeVisible({ timeout: 8000 });
        await expect(row).toContainText(viewSubject);
        await expect(row.locator('.badge')).toHaveText('error');

        await expect(adminPage.locator('text=/Fatal|Exception/i')).toHaveCount(0);
    });

    test('cleanup view-probe row', async () => {
        await deleteRow(rowId);
    });
});

// ── 3. Manual retry of a dead-letter row ──────────────────────────────────

test.describe('Email queue dashboard — manual retry', () => {
    const subject = `PW dead-letter probe ${Date.now()}`;
    let rowId = 0;
    let countBefore = 0;

    test('seed a terminal dead-letter row', async () => {
        countBefore = await deadLetterCount();
        rowId = await seedDeadLetterRow(subject);
        expect(rowId).toBeGreaterThan(0);

        const row = await getQueueRow(rowId);
        expect(row.status).toBe('error');
        expect(row.next_attempt_at).toBeNull();
    });

    test('admin retry moves the row back to queued and drops the dead-letter count', async ({ adminPage }) => {
        if (!rowId) { test.skip(); return; }

        await adminPage.goto('/admin/email-queue/');
        await adminPage.waitForSelector(`[data-test-id="email-queue-row-${rowId}"]`, { timeout: 12000 });

        // The banner reflects the seeded row among the dead-letter count.
        await expect(adminPage.locator('[data-test-id="email-queue-deadletter-banner"]')).toBeVisible({ timeout: 8000 });

        const retryBtn = adminPage.locator(`[data-test-id="email-queue-retry-${rowId}"]`);
        await expect(retryBtn).toBeEnabled({ timeout: 8000 });
        await retryBtn.click();

        // Give the island's sendPost a moment to complete, then assert DB state
        // (the source of truth): status→queued, next_attempt_at set, attempts reset.
        await expect.poll(async () => {
            const r = await getQueueRow(rowId);
            return r?.status ?? null;
        }, { timeout: 10000 }).toBe('queued');

        const row = await getQueueRow(rowId);
        expect(row.next_attempt_at).not.toBeNull();
        expect(Number(row.attempts)).toBe(0);

        // Dead-letter counter (status='error' AND next_attempt_at IS NULL) dropped by 1.
        const countAfter = await deadLetterCount();
        expect(countAfter).toBe(countBefore);
    });

    test('cleanup seeded row', async () => {
        await deleteRow(rowId);
    });
});

// ── 4. max_attempts = 6 for real notification emails ──────────────────────

test.describe('Email queue — max_attempts raised to 6', () => {
    const ticketSubject = `PW max_attempts probe ${Date.now()}`;
    let idBefore = 0;

    test('trigger a real notification email via support-ticket creation', async ({ userPage }) => {
        idBefore = await maxQueueId();

        // Create a support ticket → EmailNotifications::supportTicketCreated()
        // → FwEmailQueueService::enqueueToMany() for each moderator recipient.
        await userPage.goto('/support/');
        await userPage.waitForLoadState('networkidle');

        await userPage.locator('[data-test-id="support-new-ticket-btn"]').click();
        await userPage.locator('[data-test-id="support-subject-input"]').fill(ticketSubject);
        await userPage.locator('[data-test-id="support-message-input"]').fill('Probe body for max_attempts verification.');
        await userPage.locator('[data-test-id="support-send-btn"]').click();
        // Allow the create + enqueue round-trip to settle.
        await userPage.waitForTimeout(1500);
    });

    test('newly enqueued rows have max_attempts = 6', async () => {
        const rows = await withConnection(async conn => {
            const [r] = await conn.execute<any[]>(
                `SELECT id, max_attempts FROM ${QUEUE()} WHERE id > ? ORDER BY id ASC`,
                [idBefore]
            );
            return r;
        });

        if (rows.length === 0) {
            // No moderator recipients in this worker's scope → no rows enqueued.
            test.skip(true, 'no email_queue rows created (no moderator recipients)');
            return;
        }

        for (const row of rows) {
            expect(Number(row.max_attempts)).toBe(6);
        }
    });
});
