import { test, expect, tn } from '../../../helpers/scoped-test';
import type { BrowserContext, Page } from '@playwright/test';
import mysql from 'mysql2/promise';

import { newScopedContext } from '../../../helpers/scoped-test';
import { DB } from '../../../helpers/db';
import { roleLogin } from '../../../helpers/role-login';
test.describe.configure({ mode: 'serial' });

const BASE_URL = process.env.BASE_URL || 'http://localhost:8001';

// Dev accounts (expert1@dev.test / user1@dev.test — seeded by DevSeedService)
let EXPERT_ID = 0;
let USER_ID = 0;
const EXPERT_NAME = 'Анна Иванова';
const USER_NAME = 'Михаил Петров';

let userContext: BrowserContext;
let expertContext: BrowserContext;
let userPage: Page;
let expertPage: Page;

/**
 * Log in as a dev role by POSTing to /dev-login.
 * Returns a page with an active session.
 */
async function devLogin(context: BrowserContext, role: 'user' | 'expert'): Promise<Page> {
    const page = await context.newPage();
    // Navigate to a page first so we have a valid origin for the POST
    await page.goto(`${BASE_URL}/`);

    // Use the dev login POST endpoint
    await roleLogin(page, role);

    // Reload to apply the session
    await page.goto(`${BASE_URL}/`);

    return page;
}

test.describe('Personal Messages (IM) — cross-role flow', () => {

    test.beforeAll(async ({ browser }) => {
        // Create two separate browser contexts and log in first,
        // so devLogin creates/seeds the dev accounts before we query their IDs.
        userContext = await newScopedContext(browser);
        expertContext = await newScopedContext(browser);

        userPage = await devLogin(userContext, 'user');
        expertPage = await devLogin(expertContext, 'expert');

        // Resolve dev account IDs dynamically (must be after devLogin so accounts exist)
        const idConn = await mysql.createConnection(DB);
        try {
            const [eRows] = await idConn.execute<any[]>(`SELECT id FROM ${tn('accounts')} WHERE login = 'expert1@dev.test'`);
            const [uRows] = await idConn.execute<any[]>(`SELECT id FROM ${tn('accounts')} WHERE login = 'user1@dev.test'`);
            EXPERT_ID = eRows[0]?.id ?? 0;
            USER_ID = uRows[0]?.id ?? 0;
        } finally { await idConn.end(); }

        // Clean up existing IM data for a fresh start
        const conn = await mysql.createConnection(DB);
        try {
            await conn.execute(`DELETE FROM ${tn('im_read_status')}`);
            await conn.execute(`DELETE FROM ${tn('im_attachments')}`);
            await conn.execute(`DELETE FROM ${tn('im_messages')}`);
            await conn.execute(`DELETE FROM ${tn('im_conversations')}`);
        } finally {
            await conn.end();
        }
    });

    test.afterAll(async () => {
        await userContext?.close();
        await expertContext?.close();
    });

    // ── Step 1: User starts a new conversation ──────────────────

    test('step 1a: user navigates to /im/ and sees new message button', async () => {
        await userPage.goto(`${BASE_URL}/im/`);

        await expect(userPage.locator('[data-test-id="im-new-message-btn"]')).toBeVisible({ timeout: 10000 });
    });

    test('step 1b: user clicks new message button, form opens with recipient combobox', async () => {
        await userPage.locator('[data-test-id="im-new-message-btn"]').click();

        // Recipient combobox trigger should be visible
        await Promise.all([
        	expect(userPage.locator('[data-test-id="im-recipient-input"]')).toBeVisible(),
        // New message form should be visible
        	expect(userPage.locator('[data-test-id="im-new-form"]')).toBeVisible(),
        ]);
    });

    test('step 1c: combobox shows only experts (no moderators, owners, logins)', async () => {
        // Click the combobox trigger to open the dropdown
        await userPage.locator('[data-test-id="im-recipient-input"]').click();

        // Should see recipient options. The dropdown render races with
        // the click + the recipients fetch — wait for at least one
        // option to land before counting.
        const recipients = userPage.locator(
            '[data-test-id^="im-recipient-"]:not([data-test-id="im-recipient-input"]):not([data-test-id="im-recipient-search"])'
        );
        await expect(recipients.first()).toBeVisible({ timeout: 8000 });
        const count = await recipients.count();
        expect(count).toBeGreaterThan(0);
        console.log(`Recipient count: ${count}`);

        // Recipients are filtered to experts (by business role). An
        // expert may also carry a staff flag (expert-moderator, expert-
        // admin) — those are valid recipients and may render with a
        // staff badge (🛡️ moderator, 👑 owner). Only the privacy check
        // remains: raw login usernames must not leak into the dropdown.
        for (let i = 0; i < count; i++) {
            const recipientText = await recipients.nth(i).textContent();
            console.log(`  Recipient ${i}: "${recipientText}"`);
            expect(recipientText).not.toContain('__dev_');
            expect(recipientText).not.toContain('testuser_');
        }
    });

    test('step 1d: user selects Анна Иванова and sends message', async () => {
        // Search for expert in combobox search input
        const searchInput = userPage.locator('[data-test-id="im-recipient-search"]');
        if (await searchInput.isVisible()) {
            await searchInput.fill('Анна');
        }

        // Click the specific expert recipient (Анна Иванова = id 16)
        const targetRecipient = userPage.locator(`[data-test-id="im-recipient-${EXPERT_ID}"]`);
        if (await targetRecipient.isVisible()) {
            await targetRecipient.click();
        } else {
            // Fallback: click first visible recipient
            const recipients = userPage.locator(
                '[data-test-id^="im-recipient-"]:not([data-test-id="im-recipient-input"]):not([data-test-id="im-recipient-search"])'
            );
            await recipients.first().click();
        }

        // The combobox trigger should now show the selected expert name
        const triggerText = await userPage.locator('[data-test-id="im-recipient-input"]').textContent();
        expect(triggerText).toContain(EXPERT_NAME);

        // Type the message
        await userPage.locator('[data-test-id="im-new-message-input"]').fill(
            'Здравствуйте! Когда следующее занятие?'
        );

        // Click send
        const sendBtn = userPage.locator('[data-test-id="im-send-btn"]');
        await Promise.all([
        	expect(sendBtn).toBeVisible({ timeout: 3000 }),
        	expect(sendBtn).toBeEnabled(),
        ]);
        await sendBtn.click();
    });

    test('step 1e: user message appears in the thread', async () => {
        // After sending, the view should switch to the conversation thread
        const messagesList = userPage.locator('[data-test-id="im-messages-list"]');
        await expect(messagesList).toBeVisible({ timeout: 5000 });

        // Check for the message specifically within the messages list (not conversation snippet)
        await expect(
            messagesList.locator('text=Здравствуйте! Когда следующее занятие?')
        ).toBeVisible({ timeout: 5000 });
    });

    // ── Step 2: Expert sees the message ──────────────────────────

    test('step 2a: expert navigates to /im/ and sees conversation with user', async () => {
        await expertPage.goto(`${BASE_URL}/im/`);

        // Conversation from user should appear (use regex to match im-conversation-{number} not im-conversation-list)
        const conversations = expertPage.locator('[data-test-id^="im-conversation-"]:not([data-test-id="im-conversation-list"])');
        const count = await conversations.count();
        expect(count).toBeGreaterThanOrEqual(1);

        // Verify partner name is shown (user name, not login)
        const firstConvText = await conversations.first().textContent();
        expect(firstConvText).toContain(USER_NAME);
        expect(firstConvText).not.toContain('__dev_');
        console.log(`Expert sees conversation: "${firstConvText?.substring(0, 100)}"`);
    });

    test('step 2b: expert clicks conversation and sees user message', async () => {
        // Click the actual conversation row (not the conversation-list container)
        const convRow = expertPage.locator('[data-test-id^="im-conversation-"]:not([data-test-id="im-conversation-list"])').first();
        await convRow.click();

        const messagesList = expertPage.locator('[data-test-id="im-messages-list"]');
        await expect(messagesList).toBeVisible({ timeout: 10000 });
        await expect(
            messagesList.locator('text=Здравствуйте! Когда следующее занятие?')
        ).toBeVisible({ timeout: 5000 });
    });

    // ── Step 3: Expert replies ───────────────────────────────────

    test('step 3: expert types reply and sends', async () => {
        await expertPage.locator('[data-test-id="im-reply-input"]').fill(
            'Здравствуйте! Завтра в 14:00.'
        );
        await expertPage.locator('[data-test-id="im-reply-btn"]').click();

        // Verify the reply appears in the thread (look within messages list)
        const messagesList = expertPage.locator('[data-test-id="im-messages-list"]');
        await expect(
            messagesList.locator('text=Здравствуйте! Завтра в 14:00.')
        ).toBeVisible({ timeout: 5000 });
    });

    // ── Step 4: User sees the reply ────────────────────────────

    test('step 4: user refreshes and sees expert reply', async () => {
        await userPage.goto(`${BASE_URL}/im/`);

        const firstConv = userPage.locator('[data-test-id^="im-conversation-"]:not([data-test-id="im-conversation-list"])').first();
        await firstConv.click();

        const messagesList = userPage.locator('[data-test-id="im-messages-list"]');
        await expect(
            messagesList.locator('text=Здравствуйте! Завтра в 14:00.')
        ).toBeVisible({ timeout: 5000 });
    });

    // ── Step 5: Verify profile links ──────────────────────────────

    test('step 5a: user sees expert profile link in conversation header', async () => {
        // The thread header should contain a link to the expert profile
        const header = userPage.locator('[data-test-id="im-thread-header"]');
        await expect(header).toBeVisible();

        // Expert has a expert profile, so link should be /system/expert/id~{expertId}
        const link = header.locator('a').first();
        await expect(link).toBeVisible();
        const href = await link.getAttribute('href');
        expect(href).toBe(`/system/expert/id~${EXPERT_ID}`);

        // Link text should be the expert name, not login
        const linkText = await link.textContent();
        expect(linkText).toContain(EXPERT_NAME);
        console.log(`User header link: text="${linkText}", href="${href}"`);
    });

    test('step 5b: expert sees user profile link in conversation header', async () => {
        // The thread header should contain a link to the user profile
        const header = expertPage.locator('[data-test-id="im-thread-header"]');
        await expect(header).toBeVisible();

        // User does NOT have an expert profile, so link is /system/user/id~{userId}
        const link = header.locator('a').first();
        await expect(link).toBeVisible();
        const href = await link.getAttribute('href');
        expect(href).toBe(`/system/user/id~${USER_ID}`);

        // Link text should be the user name, not login
        const linkText = await link.textContent();
        expect(linkText).toContain(USER_NAME);
        console.log(`Expert header link: text="${linkText}", href="${href}"`);
    });

    // ── DB consistency ────────────────────────────────────────────

    test('DB: conversation and messages are consistent', async () => {
        const conn = await mysql.createConnection(DB);
        try {
            const [convs] = await conn.execute<any[]>(
                `SELECT * FROM ${tn('im_conversations')} LIMIT 5`
            );
            expect(convs.length).toBeGreaterThanOrEqual(1);

            const conv = convs[0];
            expect(conv.participant_a).toBeTruthy();
            expect(conv.participant_b).toBeTruthy();

            // participant_a should be the smaller ID (invariant)
            expect(Number(conv.participant_a)).toBeLessThan(Number(conv.participant_b));

            // Participants should be expert and user
            const ids = [Number(conv.participant_a), Number(conv.participant_b)].sort((a, b) => a - b);
            expect(ids).toEqual([EXPERT_ID, USER_ID].sort((a, b) => a - b));

            // Should have exactly 2 messages
            const [msgs] = await conn.execute<any[]>(
                `SELECT COUNT(*) as cnt FROM ${tn('im_messages')} WHERE conversation_id = ?`, [conv.id]
            );
            expect(Number(msgs[0].cnt)).toBe(2);
        } finally {
            await conn.end();
        }
    });
});
