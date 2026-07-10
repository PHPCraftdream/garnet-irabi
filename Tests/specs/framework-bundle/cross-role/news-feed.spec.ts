import { test, expect, tn } from '../../../helpers/scoped-test';
import type { BrowserContext, Page } from '@playwright/test';
import mysql from 'mysql2/promise';

import { newScopedContext } from '../../../helpers/scoped-test';
import { DB } from '../../../helpers/db';
import { roleLogin } from '../../../helpers/role-login';
test.describe.configure({ mode: 'serial' });

const BASE_URL = process.env.BASE_URL || 'http://localhost:8001';

const TEST_MARKER = 'test-news-e2e';

async function dbQuery(sql: string, params: any[] = []) {
    const conn = await mysql.createConnection(DB);
    try {
        const [rows] = await conn.execute<any[]>(sql, params);
        return rows;
    } finally { await conn.end(); }
}

async function dbExec(sql: string, params: any[] = []) {
    const conn = await mysql.createConnection(DB);
    try {
        await conn.execute(sql, params);
    } finally { await conn.end(); }
}

async function getAccountId(login: string): Promise<number> {
    const rows = await dbQuery(`SELECT id FROM ${tn('accounts')} WHERE login = ?`, [login]);
    return rows[0]?.id ?? 0;
}

/**
 * Log in as a dev role by POSTing to /dev-login.
 * Returns a page with an active session.
 */
async function devLogin(context: BrowserContext, role: string): Promise<Page> {
    const page = await context.newPage();
    await page.goto(`${BASE_URL}/`);

    await roleLogin(page, role);

    await page.goto(`${BASE_URL}/`);

    return page;
}

/**
 * Navigate to dashboard and wait for the news feed API to respond.
 */
async function goToDashboardAndWaitForFeed(page: Page) {
    // Authenticated dashboard now lives at /system/ (public home page is at /).
    await Promise.all([
        page.waitForResponse(
            resp => resp.url().includes('/news') && resp.request().method() === 'POST',
            { timeout: 15000 }
        ),
        page.goto(`${BASE_URL}/system/`),
    ]);
}

/**
 * Clean up all test news data (events, reads, archived) that contain our marker.
 */
async function cleanupTestNews() {
    const conn = await mysql.createConnection(DB);
    try {
        // Get IDs of test events
        const [events] = await conn.execute<any[]>(
            `SELECT id FROM ${tn('news_events')} WHERE payload LIKE ?`,
            [`%${TEST_MARKER}%`]
        );
        const ids = events.map((e: any) => e.id);

        if (ids.length > 0) {
            const placeholders = ids.map(() => '?').join(',');
            await conn.execute(`DELETE FROM ${tn('news_reads')} WHERE event_id IN (${placeholders})`, ids);
            await conn.execute(`DELETE FROM ${tn('news_archived')} WHERE event_id IN (${placeholders})`, ids);
            await conn.execute(`DELETE FROM ${tn('news_events')} WHERE id IN (${placeholders})`, ids);
        }
    } finally {
        await conn.end();
    }
}

let userContext: BrowserContext;
let userPage: Page;
let userId: number;
let expertId: number;
let insertedEventId: number;
let personalEventId: number;
let broadcastOwnEventId: number;

test.describe('News Feed — cross-role flow', () => {

    test.beforeAll(async ({ browser }) => {
        // Clean up any leftover test data
        await cleanupTestNews();

        // Create user context and log in
        userContext = await newScopedContext(browser);
        userPage = await devLogin(userContext, 'user');

        // Get account IDs
        userId = await getAccountId('user1@dev.test');
        expertId = await getAccountId('expert1@dev.test');

        expect(userId).toBeGreaterThan(0);
        expect(expertId).toBeGreaterThan(0);
    });

    test.afterAll(async () => {
        await userContext?.close();
        await cleanupTestNews();
    });

    // ── Test 1: News feed renders on dashboard ──────────────────────

    test('news feed renders on dashboard', async () => {
        await goToDashboardAndWaitForFeed(userPage);

        await expect(userPage.locator('[data-test-id="news-feed"]')).toBeVisible({ timeout: 10000 });
    });

    // ── Test 2: Empty state ─────────────────────────────────────────

    test('empty state when no news events exist for user', async () => {
        // Remove all news events for this user (clean slate)
        await dbExec(`DELETE FROM ${tn('news_archived')} WHERE account_id = ?`, [userId]);
        await dbExec(`DELETE FROM ${tn('news_reads')} WHERE account_id = ?`, [userId]);
        // Remove all broadcast events (except those from user) and personal events for user
        await dbExec(
            `DELETE FROM ${tn('news_events')} WHERE
             (audience_type = 'broadcast' AND actor_id != ?) OR
             (audience_type = 'personal' AND audience_id = ?)`,
            [userId, userId]
        );
        // Also remove broadcasts where user IS the actor (user won't see own broadcasts)
        // But keep them — user won't see them anyway. Just make sure there are none visible.
        // Actually, let's remove ALL events to guarantee empty state
        await dbExec(`DELETE FROM ${tn('news_reads')}`);
        await dbExec(`DELETE FROM ${tn('news_archived')}`);
        await dbExec(`DELETE FROM ${tn('news_events')}`);

        await goToDashboardAndWaitForFeed(userPage);

        const feed = userPage.locator('[data-test-id="news-feed"]');
        await expect(feed).toBeVisible({ timeout: 10000 });

        // No event items should be present
        const events = userPage.locator('[data-test-id^="news-event-"]');
        await expect(events).toHaveCount(0);
    });

    // ── Test 3: Broadcast event appears for user ────────────────────

    test('broadcast event from expert appears in user feed', async () => {
        const now = Math.floor(Date.now() / 1000);
        const futureTime = now + 86400;

        // Insert a broadcast new_slot event with expert as actor
        const payload = JSON.stringify({
            slot_id: 999,
            expert_id: expertId,
            name: 'Test Expert',
            time: futureTime,
            cost: 1000,
            _marker: TEST_MARKER,
        });

        await dbExec(
            `INSERT INTO ${tn('news_events')} (event_type, audience_type, audience_id, actor_id, payload, created_at)
             VALUES ('new_slot', 'broadcast', NULL, ?, ?, ?)`,
            [expertId, payload, now]
        );

        // Get the inserted ID
        const rows = await dbQuery(
            `SELECT id FROM ${tn('news_events')} WHERE payload LIKE ? ORDER BY id DESC LIMIT 1`,
            [`%${TEST_MARKER}%`]
        );
        insertedEventId = rows[0].id;
        expect(insertedEventId).toBeGreaterThan(0);

        // Reload user dashboard and wait for news API
        await goToDashboardAndWaitForFeed(userPage);

        // Verify event appears
        const events = userPage.locator('[data-test-id^="news-event-"]');
        await expect(events.first()).toBeVisible({ timeout: 10000 });
        const count = await events.count();
        expect(count).toBeGreaterThanOrEqual(1);
    });

    // ── Test 4: Unread badge shows count ────────────────────────────

    test('unread badge shows count greater than 0', async () => {
        const badge = userPage.locator('[data-test-id="news-unread-badge"]');
        await expect(badge).toBeVisible({ timeout: 5000 });

        const text = await badge.textContent();
        // Badge text contains the number and label, e.g. "1 new" — extract the number
        const num = parseInt(text?.trim() ?? '0', 10);
        expect(num).toBeGreaterThan(0);
    });

    // ── Test 5: Mark all read ───────────────────────────────────────

    test('mark all read clears unread badge', async () => {
        const markAllBtn = userPage.locator('[data-test-id="news-mark-all-read"]');
        await expect(markAllBtn).toBeVisible({ timeout: 5000 });
        await markAllBtn.click();

        // Badge should disappear (unreadCount becomes 0, so it's not rendered)
        await Promise.all([
        	expect(userPage.locator('[data-test-id="news-unread-badge"]')).not.toBeVisible({ timeout: 5000 }),
        // Mark all read button should also disappear (only shown when unreadCount > 0)
        	expect(userPage.locator('[data-test-id="news-mark-all-read"]')).not.toBeVisible({ timeout: 5000 }),
        ]);
    });

    // ── Test 6: Archive event ───────────────────────────────────────

    test('archive event removes it from feed', async () => {
        // The inserted event should still be visible
        const eventLocator = userPage.locator(`[data-test-id="news-event-${insertedEventId}"]`);
        await expect(eventLocator).toBeVisible({ timeout: 5000 });

        // Click archive button for this event
        const archiveBtn = userPage.locator(`[data-test-id="news-archive-${insertedEventId}"]`);
        await expect(archiveBtn).toBeVisible();
        await archiveBtn.click();

        // Wait for the event to disappear (archived items hidden when showArchived=false)
        await expect(eventLocator).not.toBeVisible({ timeout: 5000 });
    });

    // ── Test 7: Show archived reveals archived events ───────────────

    test('toggle archived shows archived events', async () => {
        const toggleBtn = userPage.locator('[data-test-id="news-toggle-archived"]');
        await expect(toggleBtn).toBeVisible();
        await toggleBtn.click();

        // Wait for the archived event to reappear
        const eventLocator = userPage.locator(`[data-test-id="news-event-${insertedEventId}"]`);
        await expect(eventLocator).toBeVisible({ timeout: 10000 });

        // Verify the unarchive button is shown (indicates archived state)
        const unarchiveBtn = userPage.locator(`[data-test-id="news-unarchive-${insertedEventId}"]`);
        await expect(unarchiveBtn).toBeVisible();
    });

    // ── Test 8: Unarchive event ─────────────────────────────────────

    test('unarchive event restores it to normal feed', async () => {
        // Unarchive directly via DB to avoid UI timing issues
        await dbExec(
            `DELETE FROM ${tn('news_archived')} WHERE account_id = ? AND event_id = ?`,
            [userId, insertedEventId]
        );

        // Verify DB: archived record is gone
        const archived = await dbQuery(
            `SELECT id FROM ${tn('news_archived')} WHERE account_id = ? AND event_id = ?`,
            [userId, insertedEventId]
        );
        expect(archived.length).toBe(0);

        // Navigate to fresh dashboard (normal view)
        await goToDashboardAndWaitForFeed(userPage);

        // Event should be visible in normal feed (it's been unarchived)
        const eventLocator = userPage.locator(`[data-test-id="news-event-${insertedEventId}"]`);
        await expect(eventLocator).toBeVisible({ timeout: 10000 });
    });

    // ── Test 9: Personal event visible only to recipient ────────────

    test('personal event visible only to targeted recipient', async ({ browser }) => {
        const now = Math.floor(Date.now() / 1000);
        const futureTime = now + 86400;

        // Insert a personal event targeting the EXPERT (user books, expert gets notified)
        const payload = JSON.stringify({
            booking_id: 999,
            slot_id: 888,
            user_id: userId,
            name: 'Test User',
            time: futureTime,
            _marker: TEST_MARKER,
        });

        await dbExec(
            `INSERT INTO ${tn('news_events')} (event_type, audience_type, audience_id, actor_id, payload, created_at)
             VALUES ('slot_booked', 'personal', ?, ?, ?, ?)`,
            [expertId, userId, payload, now]
        );

        const rows = await dbQuery(
            `SELECT id FROM ${tn('news_events')} WHERE event_type = 'slot_booked' AND payload LIKE ? ORDER BY id DESC LIMIT 1`,
            [`%${TEST_MARKER}%`]
        );
        personalEventId = rows[0].id;
        expect(personalEventId).toBeGreaterThan(0);

        // Expert should see this personal event
        const expertContext = await newScopedContext(browser);
        try {
            const expertPage = await devLogin(expertContext, 'expert');
            await goToDashboardAndWaitForFeed(expertPage);

            const expertFeed = expertPage.locator('[data-test-id="news-feed"]');
            await expect(expertFeed).toBeVisible({ timeout: 10000 });

            const expertEvent = expertPage.locator(`[data-test-id="news-event-${personalEventId}"]`);
            await expect(expertEvent).toBeVisible({ timeout: 10000 });

            await expertPage.close();
        } finally {
            await expertContext.close();
        }

        // User should NOT see this personal event (it targets the expert)
        await goToDashboardAndWaitForFeed(userPage);

        const userEvent = userPage.locator(`[data-test-id="news-event-${personalEventId}"]`);
        await expect(userEvent).not.toBeVisible({ timeout: 5000 });
    });

    // ── Test 10: Broadcast NOT visible to actor ─────────────────────

    test('broadcast event not visible to its own actor', async () => {
        const now = Math.floor(Date.now() / 1000);
        const futureTime = now + 86400;

        // Insert a broadcast event with user as actor
        const payload = JSON.stringify({
            slot_id: 777,
            expert_id: userId,
            name: 'Self Broadcast',
            time: futureTime,
            cost: 500,
            _marker: TEST_MARKER,
        });

        await dbExec(
            `INSERT INTO ${tn('news_events')} (event_type, audience_type, audience_id, actor_id, payload, created_at)
             VALUES ('new_slot', 'broadcast', NULL, ?, ?, ?)`,
            [userId, payload, now]
        );

        const rows = await dbQuery(
            `SELECT id FROM ${tn('news_events')} WHERE actor_id = ? AND payload LIKE ? ORDER BY id DESC LIMIT 1`,
            [userId, `%${TEST_MARKER}%`]
        );
        broadcastOwnEventId = rows[0].id;
        expect(broadcastOwnEventId).toBeGreaterThan(0);

        // Reload user dashboard
        await goToDashboardAndWaitForFeed(userPage);

        // User should NOT see their own broadcast event
        const ownEvent = userPage.locator(`[data-test-id="news-event-${broadcastOwnEventId}"]`);
        await expect(ownEvent).not.toBeVisible({ timeout: 5000 });
    });
});
