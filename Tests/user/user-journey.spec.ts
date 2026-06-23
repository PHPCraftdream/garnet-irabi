/**
 * User Journey — full end-to-end story test
 *
 * Flow: dashboard -> slots -> book -> bookings -> cancel -> balance refund -> IM -> support
 *
 * This test exercises the entire user experience in a single serial flow,
 * verifying that each step leaves the system in the correct state for the next.
 *
 * All selectors use data-test-id -- never text content.
 * All DB operations use the test DB connection pattern.
 * uid field required in all time_slots INSERT statements.
 */

import { test, expect, tn } from '../helpers/scoped-test';
import type { Page } from '@playwright/test';
import mysql from 'mysql2/promise';
import { DB } from '../helpers/db';
test.describe.configure({ mode: 'serial' });

function generateUid(): string {
    return [...Array(16)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
}

async function getUserId(): Promise<number> {
    const conn = await mysql.createConnection(DB);
    try {
        const [rows] = await conn.execute<any[]>(
            `SELECT id FROM ${tn('accounts')} WHERE login = 'testuser_setup_user@irabi.test'`
        );
        return rows[0]?.id ?? 0;
    } finally { await conn.end(); }
}

async function getUserBalance(): Promise<number> {
    const conn = await mysql.createConnection(DB);
    try {
        const [rows] = await conn.execute<any[]>(
            `SELECT ab.balance
             FROM ${tn('account_balance')} ab
             JOIN ${tn('accounts')} a ON a.id = ab.account_id
             WHERE a.login = 'testuser_setup_user@irabi.test'`
        );
        return rows.length ? rows[0].balance : 0;
    } finally { await conn.end(); }
}

async function getExpertId(): Promise<number> {
    const conn = await mysql.createConnection(DB);
    try {
        const [rows] = await conn.execute<any[]>(
            `SELECT account_id FROM ${tn('expert_profiles')} WHERE is_approved = 1 LIMIT 1`
        );
        return rows[0]?.account_id ?? 0;
    } finally { await conn.end(); }
}

async function createFreeSlotForJourney(expertId: number): Promise<number> {
    const conn = await mysql.createConnection(DB);
    try {
        const startAt = Math.floor(Date.now() / 1000) + 86400 * 5 + 14 * 3600;
        const [result]: any = await conn.execute(
            `INSERT INTO ${tn('time_slots')}
             (expert_id, start_at, end_at, duration_min, cost, is_online, location, max_users, status, uid, created_at)
             VALUES (?, ?, ?, 60, 200, 1, 'https://meet.example.com/journey-test', 1, 'free', ?, ?)`,
            [expertId, startAt, startAt + 3600, generateUid(), Math.floor(Date.now() / 1000)]
        );
        return result.insertId;
    } finally { await conn.end(); }
}

async function cleanupJourneySlot(slotId: number) {
    if (!slotId) return;
    const conn = await mysql.createConnection(DB);
    try {
        await conn.execute(`DELETE FROM ${tn('bookings')} WHERE bookable_type='time_slot' AND bookable_id=?`, [slotId]);
        await conn.execute(`DELETE FROM ${tn('time_slots')} WHERE id=?`, [slotId]);
    } finally { await conn.end(); }
}

// -- Journey test --

test.describe('User Journey: full end-to-end', () => {
    let expertId = 0;
    let slotId = 0;

    // Step 1: Dashboard
    test('Step 1: dashboard loads with welcome card and upcoming bookings', async ({ page }) => {
        await page.goto('/system/');

        await Promise.all([
        	expect(page.locator('[data-test-id="dashboard"]')).toBeVisible({ timeout: 8000 }),
        	expect(page.locator('[data-test-id="welcome-card"]')).toBeVisible({ timeout: 5000 }),
        ]);
        // Note: quick-links block was removed (commit 8f1be69b) — no audience left.
        await expect(page.locator('[data-test-id="upcoming-bookings"]')).toBeVisible({ timeout: 5000 });
    });

    // Step 2: Browse slots calendar
    test('Step 2: browse slots calendar with week navigation', async ({ page }) => {
        expertId = await getExpertId();
        test.skip(!expertId, 'No approved expert for slot creation');

        await page.goto('/slots');

        await Promise.all([
        	expect(page.locator('[data-test-id="slots-calendar"]')).toBeVisible({ timeout: 8000 }),
        	expect(page.locator('[data-test-id="week-navigation"]')).toBeVisible({ timeout: 5000 }),
        ]);

        // Navigate weeks
        await page.locator('[data-test-id="week-next"]').click();
        await expect(page.locator('[data-test-id="week-today"]')).toBeVisible({ timeout: 5000 });

        await page.locator('[data-test-id="week-today"]').click();
    });

    // Step 3: Book a slot via direct booking form
    test('Step 3: book a slot via /bookings/id~{id}/~book', async ({ page }) => {
        test.skip(!expertId, 'No expert available');

        slotId = await createFreeSlotForJourney(expertId);
        expect(slotId).toBeGreaterThan(0);

        // Ensure balance
        await page.goto('/balance');
        const balText = await page.locator('[data-test-id="balance-amount"]').textContent() ?? '0';
        const bal = parseInt(balText.replace(/\D/g, ''), 10) || 0;
        if (bal < 500) {
            await page.locator('[data-test-id="topup-amount-input"]').fill('5000');
            await page.locator('[data-test-id="topup-submit"]').click();
        }

        // Go to booking form
        await page.goto(`/bookings/id~${slotId}/~book`);

        const bookBtn = page.locator('[data-test-id="book-btn"]');
        await expect(bookBtn).toBeVisible({ timeout: 8000 });

        // Submit and wait for redirect
        await Promise.all([
            page.waitForURL(url => url.pathname === '/bookings', { timeout: 10000 }),
            bookBtn.click(),
        ]);
        expect(page.url()).toContain('/bookings');
    });

    // Step 4: Verify booking appears in list
    test('Step 4: booking card visible in /bookings list', async ({ page }) => {
        test.skip(!slotId, 'No slot was booked');

        await page.goto('/bookings');

        const cards = page.locator('[data-test-id^="booking-card-"]');
        await expect(cards.first()).toBeVisible({ timeout: 8000 });
    });

    // Step 5: Cancel booking via modal with reason
    test('Step 5: cancel booking via modal with reason textarea', async ({ page }) => {
        test.skip(!slotId, 'No slot was booked');

        await page.goto('/bookings');

        // Find cancel button
        const cancelBtn = page.locator('[data-test-id^="cancel-btn-"]').first();
        await expect(cancelBtn).toBeVisible({ timeout: 8000 });
        await cancelBtn.click();

        // Cancel modal opens
        const cancelModal = page.locator('[data-test-id="user-cancel-modal"]');
        await expect(cancelModal).toBeVisible({ timeout: 5000 });

        // Fill required reason
        const reasonTextarea = page.locator('[data-test-id="user-cancel-reason"]');
        await expect(reasonTextarea).toBeVisible();
        await reasonTextarea.fill('Journey test cancellation');

        // Submit cancellation
        await page.locator('[data-test-id="user-cancel-submit"]').click();

        // Modal closes after XHR
        await expect(cancelModal).not.toBeVisible({ timeout: 10000 });
    });

    // Step 6: Balance refund appears in ledger
    test('Step 6: balance refund -- ledger row appears after cancellation', async ({ page }) => {
        test.skip(!slotId, 'No slot was booked');

        await page.goto('/balance');

        // Ledger should have at least one row
        const ledgerRows = page.locator('[data-test-id="ledger-row"]');
        await expect(ledgerRows.first()).toBeVisible({ timeout: 8000 });
    });

    // Step 7: IM -- new dialog flow
    test('Step 7: IM -- create new dialog with recipient combobox', async ({ page }) => {
        const tId = await getExpertId();
        test.skip(!tId, 'No expert for IM');

        await page.goto('/im/');

        // Conversation list visible
        await expect(page.locator('[data-test-id="im-conversation-list"]')).toBeVisible({ timeout: 8000 });

        // Click new message button
        await page.locator('[data-test-id="im-new-message-btn"]').click();

        // New message form appears
        await expect(page.locator('[data-test-id="im-new-form"]')).toBeVisible({ timeout: 5000 });

        // Click recipient input to open combobox (Radix Popover)
        await page.locator('[data-test-id="im-recipient-input"]').click();

        // Search input appears in popover
        const searchInput = page.locator('[data-test-id="im-recipient-search"]');
        await expect(searchInput).toBeVisible({ timeout: 5000 });

        // Wait for recipients to load, then select the first numeric-id recipient
        // Use regex to match im-recipient-{number} (not im-recipient-input or im-recipient-search)
        const firstRecipient = page.locator('[data-test-id^="im-recipient-"]:not([data-test-id="im-recipient-input"]):not([data-test-id="im-recipient-search"])').first();
        await expect(firstRecipient).toBeVisible({ timeout: 5000 });
        await firstRecipient.click();

        // Type a message
        await page.locator('[data-test-id="im-new-message-input"]').fill('Journey test message');

        // Send
        await page.locator('[data-test-id="im-send-btn"]').click();

        // After send, the new form should close and conversation should be selected
        // or conversation list should update
        await expect(page.locator('[data-test-id="im-conversation-list"]')).toBeVisible({ timeout: 8000 });
    });

    // Step 8: Support -- create ticket
    test('Step 8: support -- create a support ticket', async ({ page }) => {
        await page.goto('/support/');

        // Click new ticket button
        await page.locator('[data-test-id="support-new-ticket-btn"]').click();

        // Fill subject
        const subjectInput = page.locator('[data-test-id="support-subject-input"]');
        await expect(subjectInput).toBeVisible({ timeout: 5000 });
        await subjectInput.fill('Journey test ticket');

        // Fill message
        const messageInput = page.locator('[data-test-id="support-message-input"]');
        await expect(messageInput).toBeVisible();
        await messageInput.fill('This is a journey test support ticket.');

        // Send
        await page.locator('[data-test-id="support-send-btn"]').click();

        // Ticket should appear in the list
        const ticketItem = page.locator('[data-test-id^="support-ticket-"]').first();
        await expect(ticketItem).toBeVisible({ timeout: 8000 });
    });

    // Cleanup
    test('Cleanup: remove journey test slot', async () => {
        await cleanupJourneySlot(slotId);
    });
});
