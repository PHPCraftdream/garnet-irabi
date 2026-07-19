/**
 * Marketing consent semantics (legal finding F-06).
 *
 * Two independent defects from one finding:
 *  (а) Account::withdrawMarketingConsent() existed in the framework but was
 *      never called from any UI — the user had no way to withdraw consent.
 *      The /~profile form now carries a toggle that grants/withdraws consent
 *      and journals each real state change via ConsentJournalService.
 *  (б) RegisterController::post__main force-disabled the TRANSACTIONAL email
 *      categories (messages/support/bookings) when the marketing checkbox was
 *      left unchecked at /first-step registration — conflating advertising
 *      consent with service notifications. The block is removed; this spec
 *      pins the fix by driving that exact code path.
 *
 * The profile tests mirror profile-edit-settings.spec.ts (same /~profile_edit
 * page + /~saveNotifPrefs endpoint) and the consent-journal audit expectations
 * from consent-journal.spec.ts (task #70).
 */
import { test, expect, tn } from '../../helpers/scoped-test';
import type { Page, BrowserContext } from '@playwright/test';
import mysql from 'mysql2/promise';
import { newScopedContext } from '../../helpers/scoped-test';
import { DB } from '../../helpers/db';

test.describe.configure({ mode: 'serial' });

const PIDX = process.env.TEST_PARALLEL_INDEX ?? '0';
const TEST_EMAIL = `test_mkconsent_${PIDX}@irabi.test`;
// Must match ConsentJournalService::DOCUMENT_VERSION (single source of truth in PHP).
const DOCUMENT_VERSION = '1.0';

let userId = 0;
let page: Page;
let context: BrowserContext;

// ── DB helpers ───────────────────────────────────────────────────────────────

async function resolveAccountId(login: string): Promise<number> {
    const conn = await mysql.createConnection(DB);
    try {
        const [rows] = await conn.execute<any[]>(
            `SELECT id FROM ${tn('accounts')} WHERE login = ? LIMIT 1`, [login],
        );
        return rows[0]?.id ? Number(rows[0].id) : 0;
    } finally { await conn.end(); }
}

async function setProfileViaDb(id: number): Promise<void> {
    // Direct UPDATE — Account::fromSession() re-reads from DB on every request,
    // so this is immediately reflected. Sets name + time_zone so RegMiddleware
    // no longer intercepts with the first-registration form.
    const conn = await mysql.createConnection(DB);
    try {
        await conn.execute(
            `UPDATE ${tn('accounts')} SET name = ?, time_zone = ? WHERE id = ?`,
            ['Mk Consent', 'UTC', id],
        );
    } finally { await conn.end(); }
}

async function clearEmailNotifPrefs(id: number): Promise<void> {
    const conn = await mysql.createConnection(DB);
    try {
        await conn.execute(
            `DELETE FROM ${tn('accounts_data')} WHERE account_id = ? AND param = 'email_notif_prefs'`,
            [id],
        );
    } finally { await conn.end(); }
}

async function readEmailNotifPrefs(id: number): Promise<Record<string, string> | null> {
    const conn = await mysql.createConnection(DB);
    try {
        const [rows] = await conn.execute<any[]>(
            `SELECT value FROM ${tn('accounts_data')} WHERE account_id = ? AND param = 'email_notif_prefs'`,
            [id],
        );
        if (rows.length === 0) return null;
        try { return JSON.parse(rows[0].value); } catch { return null; }
    } finally { await conn.end(); }
}

async function clearMarketingConsent(id: number): Promise<void> {
    const conn = await mysql.createConnection(DB);
    try {
        await conn.execute(
            `DELETE FROM ${tn('accounts_data')} WHERE account_id = ? AND param IN ('consent_marketing_at', 'consent_marketing_withdrawn_at')`,
            [id],
        );
    } finally { await conn.end(); }
}

async function grantMarketingConsentViaDb(id: number): Promise<void> {
    const conn = await mysql.createConnection(DB);
    try {
        const now = Math.floor(Date.now() / 1000);
        await conn.execute(
            `INSERT INTO ${tn('accounts_data')} (account_id, param, value) VALUES (?, 'consent_marketing_at', ?)
             ON DUPLICATE KEY UPDATE value = VALUES(value)`,
            [id, String(now)],
        );
        await conn.execute(
            `DELETE FROM ${tn('accounts_data')} WHERE account_id = ? AND param = 'consent_marketing_withdrawn_at'`,
            [id],
        );
    } finally { await conn.end(); }
}

interface ConsentRow {
    consent_type: string;
    action: string;
    document_version: string;
    ip: string | null;
    user_agent: string | null;
}

async function getMarketingConsentRows(id: number): Promise<ConsentRow[]> {
    const conn = await mysql.createConnection(DB);
    try {
        const [rows] = await conn.execute<ConsentRow[]>(
            `SELECT consent_type, action, document_version, ip, user_agent
             FROM ${tn('consents')} WHERE account_id = ? AND consent_type = 'marketing' ORDER BY id ASC`,
            [id],
        );
        return rows as ConsentRow[];
    } finally { await conn.end(); }
}

async function clearMarketingJournal(id: number): Promise<void> {
    const conn = await mysql.createConnection(DB);
    try {
        await conn.execute(
            `DELETE FROM ${tn('consents')} WHERE account_id = ? AND consent_type = 'marketing'`,
            [id],
        );
    } finally { await conn.end(); }
}

async function createInviteToken(label: string): Promise<string> {
    const token = `mkconsent_${PIDX}_${Date.now()}`;
    const conn = await mysql.createConnection(DB);
    try {
        await conn.execute(
            `INSERT INTO ${tn('invite_tokens')} (token, label, expires_at, max_uses, uses_left, is_disabled, created_at, created_by)
             VALUES (?, ?, NULL, 1, 1, 0, UNIX_TIMESTAMP(), NULL)`,
            [token, label],
        );
    } finally { await conn.end(); }
    return token;
}

async function countInviteRegistrations(id: number): Promise<number> {
    const conn = await mysql.createConnection(DB);
    try {
        const [rows] = await conn.execute<any[]>(
            `SELECT COUNT(*) AS cnt FROM ${tn('invite_registrations')} WHERE account_id = ?`,
            [id],
        );
        return Number(rows[0]?.cnt ?? 0);
    } finally { await conn.end(); }
}

async function cleanup(): Promise<void> {
    const conn = await mysql.createConnection(DB);
    try {
        const id = await resolveAccountId(TEST_EMAIL);
        if (id) {
            await conn.execute(`DELETE FROM ${tn('consents')} WHERE account_id = ?`, [id]);
            await conn.execute(`DELETE FROM ${tn('invite_registrations')} WHERE account_id = ?`, [id]);
        }
        await conn.execute(`DELETE FROM ${tn('invite_tokens')} WHERE label LIKE 'mkconsent_%'`);
        await conn.execute(`DELETE FROM ${tn('mail_log')} WHERE recipient_email = ?`, [TEST_EMAIL]);
        await conn.execute(
            `DELETE ad FROM ${tn('accounts_data')} ad JOIN ${tn('accounts')} a ON a.id = ad.account_id WHERE a.login = ?`,
            [TEST_EMAIL],
        );
        await conn.execute(`DELETE FROM ${tn('accounts')} WHERE login = ?`, [TEST_EMAIL]);
    } finally { await conn.end(); }
}

async function reloadProfile(): Promise<void> {
    await page.goto('/system/~profile_edit', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-test-id="notif-prefs"]', { timeout: 15000 });
    await page.waitForSelector('[data-test-id="notif-row-marketing"]', { timeout: 15000 });
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe('Marketing consent — /~profile grant/withdraw + registration regression (F-06)', () => {

    test.beforeAll(async ({ browser }) => {
        await cleanup();
        context = await newScopedContext(browser, {
            baseURL: process.env.BASE_URL || 'http://localhost:8001',
        });
        page = await context.newPage();

        // Auto-login the .test account (creates it via touchAccount).
        await page.goto('/balance');
        const loginInput = page.locator('[data-test-id="auth-login-input"]');
        await expect(loginInput).toBeVisible({ timeout: 15000 });
        await loginInput.fill(TEST_EMAIL);
        await Promise.all([
            page.waitForResponse(r => r.request().method() === 'POST', { timeout: 15000 }),
            page.locator('[data-test-id="auth-consent-pd"]').click(),
        ]);
        const submitBtn = page.locator('[data-test-id="auth-submit-btn"]');
        await Promise.all([
            page.waitForResponse(r => r.request().method() === 'POST', { timeout: 15000 }),
            submitBtn.click(),
        ]);

        // Resolve the freshly-created account, then set name/time_zone so
        // RegMiddleware stops intercepting with the first-registration form.
        for (let attempt = 0; attempt < 10; attempt++) {
            userId = await resolveAccountId(TEST_EMAIL);
            if (userId) break;
            await new Promise(r => setTimeout(r, 500));
        }
        expect(userId, 'account must exist after .test auto-login').toBeGreaterThan(0);
        await setProfileViaDb(userId);
    });

    test.afterAll(async () => {
        await cleanup();
        if (context) await context.close();
    });

    // ── (б) Regression: the buggy block force-disabled transactional prefs ──
    test('registering via /first-step without marketing does NOT disable transactional prefs', async () => {
        // Start from a known-clean prefs state.
        await clearEmailNotifPrefs(userId);

        // Create a valid invite token and POST action=reg_user WITHOUT
        // consent_marketing — the exact path that contained the buggy block.
        const token = await createInviteToken(`mkconsent_reg_${PIDX}`);

        // The /first-step route uses $maintenanceOnly (no auth chain) and
        // RegisterController calls authOnly() itself, which enforces CSRF on
        // POST. The CSRF token lives in an HttpOnly cookie named CSRF_TOKEN;
        // read it via the Playwright context (document.cookie can't see it)
        // and echo it back in the POST body so checkCSRF passes.
        const cookies = await context.cookies();
        const csrf = cookies.find(c => c.name === 'CSRF_TOKEN')?.value ?? '';
        expect(csrf, 'CSRF_TOKEN cookie must be present for an authenticated session').toBeTruthy();

        const result = await page.evaluate(async (args: { tok: string; csrf: string }) => {
            const res = await fetch(`/first-step/token~${args.tok}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({
                    action: 'reg_user',
                    CSRF_TOKEN: args.csrf,
                    name: 'Mk Consent',
                    time_zone: 'UTC',
                }),
            });
            return { status: res.status, body: await res.json().catch(() => ({})) };
        }, {tok: token, csrf});

        // The response status is irrelevant (processPost may report field
        // issues) — what matters is that email_notif_prefs was NOT force-set
        // to all-off, which is the exact behaviour the removed block produced.
        void result;

        // PROVE the POST actually entered the reg_user block (where the buggy
        // block lived): FwInviteTokenService::consume() runs inside it and
        // records an invite_registrations row. Without this guard the test
        // could pass trivially if the request never reached the handler.
        const regCount = await countInviteRegistrations(userId);
        expect(regCount, 'POST must have entered the reg_user block (invite consumed)').toBeGreaterThanOrEqual(1);

        const prefs = await readEmailNotifPrefs(userId);
        if (prefs) {
            expect(prefs.messages, 'messages must not be force-disabled by declining marketing').not.toBe('off');
            expect(prefs.support, 'support must not be force-disabled by declining marketing').not.toBe('off');
            expect(prefs.bookings, 'bookings must not be force-disabled by declining marketing').not.toBe('off');
        }
        // prefs === null is also correct: the fix removed the only writer on this path.
    });

    // ── (а) Grant: enabling the toggle on /~profile ──────────────────────────
    test('enabling the marketing toggle grants consent + journals ACTION_GIVEN', async () => {
        // Start from no active consent.
        await clearMarketingConsent(userId);
        await clearMarketingJournal(userId);
        await reloadProfile();

        const toggle = page.locator('[data-test-id="notif-marketing-consent"]');
        await expect(toggle).not.toBeChecked();

        await Promise.all([
            page.waitForResponse(
                r => r.url().includes('/~saveNotifPrefs') && r.request().method() === 'POST' && r.status() === 200,
                { timeout: 15000 },
            ),
            toggle.check(),
        ]);

        const rows = await getMarketingConsentRows(userId);
        expect(rows.length, 'exactly one marketing journal row after granting').toBe(1);
        expect(rows[0].action).toBe('given');
        expect(rows[0].document_version).toBe(DOCUMENT_VERSION);
        expect(rows[0].ip, 'IP must be captured').toBeTruthy();
        expect(rows[0].user_agent, 'User-Agent must be captured').toBeTruthy();
    });

    // ── (а) Withdraw: disabling the toggle on /~profile ──────────────────────
    test('disabling the toggle withdraws consent + journals ACTION_WITHDRAWN', async () => {
        // Consent is active from the previous test's grant.
        const toggle = page.locator('[data-test-id="notif-marketing-consent"]');
        await expect(toggle).toBeChecked();

        await Promise.all([
            page.waitForResponse(
                r => r.url().includes('/~saveNotifPrefs') && r.request().method() === 'POST' && r.status() === 200,
                { timeout: 15000 },
            ),
            toggle.uncheck(),
        ]);

        const rows = await getMarketingConsentRows(userId);
        expect(rows.length, 'two marketing rows now: given + withdrawn').toBe(2);
        expect(rows[1].action).toBe('withdrawn');
        expect(rows[1].document_version).toBe(DOCUMENT_VERSION);
        expect(rows[1].ip).toBeTruthy();
        expect(rows[1].user_agent).toBeTruthy();
    });

    // ── No-op: re-saving without toggling consent must not duplicate the journal
    test('re-saving the form without a consent change adds no journal row', async () => {
        const before = (await getMarketingConsentRows(userId)).length;

        // Tweak a transactional pref frequency WITHOUT touching the marketing
        // toggle — triggers a /~saveNotifPrefs POST that carries the current
        // (unchanged) consent_marketing value.
        await Promise.all([
            page.waitForResponse(
                r => r.url().includes('/~saveNotifPrefs') && r.request().method() === 'POST' && r.status() === 200,
                { timeout: 15000 },
            ),
            page.locator('[data-test-id="notif-freq-messages"]').selectOption('hourly'),
        ]);

        const after = (await getMarketingConsentRows(userId)).length;
        expect(after, 'no new journal row when consent state is unchanged').toBe(before);
    });
});
