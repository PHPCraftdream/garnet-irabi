/**
 * Consent audit trail (legal finding F-04).
 *
 * Every successful email-code login must append a row to the `consents`
 * journal per consent the user actually gave in THAT login — personal-data
 * always (it's mandatory to reach verify), marketing only when the box was
 * ticked. Repeat logins re-confirm PD consent and must produce ADDITIONAL
 * rows (the finding explicitly wants the history of repeated consents, not a
 * deduped latest-only value).
 *
 * These specs drive the REAL auth flow (non-`.test` email → code sent →
 * magic-link verify), NOT the `.test` dev auto-login bypass: the bypass
 * short-circuits processPhaseNullPost before sendSuccessLogin ever runs, so
 * it can't exercise the journal. Pattern mirrors magic-link.spec.ts.
 */
import { test, expect, tn } from '../../helpers/scoped-test';
import { newScopedContext } from '../../helpers/scoped-test';
import { withConnection } from '../../helpers/db';
import { tickPdConsent } from '../../helpers/auth';
import type { Browser } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

const PIDX = process.env.TEST_PARALLEL_INDEX ?? '0';
// Unique per run — the request-code rate limit (5 / 10min per email)
// outlives cleanup, so a fixed address 429s on the next run.
const PD_EMAIL = `cj_pd_${PIDX}_${Date.now()}@external.example.com`;
const MK_EMAIL = `cj_mk_${PIDX}_${Date.now()}@external.example.com`;
// Must match ConsentJournalService::DOCUMENT_VERSION (the single source of
// truth in PHP). Kept here as a literal so a silent bump is caught.
const DOCUMENT_VERSION = '1.0';

interface ConsentRow {
    consent_type: string;
    action: string;
    document_version: string;
    ip: string | null;
    user_agent: string | null;
}

async function fetchLatestMagicToken(email: string): Promise<string | null> {
    return withConnection(async (conn) => {
        const [rows] = await conn.execute<any[]>(
            `SELECT token FROM ${tn('magic_login_tokens')} WHERE email = ? ORDER BY id DESC LIMIT 1`,
            [email],
        );
        return rows[0]?.token ?? null;
    });
}

async function getAccountId(email: string): Promise<number | null> {
    return withConnection(async (conn) => {
        const [rows] = await conn.execute<any[]>(
            `SELECT id FROM ${tn('accounts')} WHERE login = ? LIMIT 1`,
            [email],
        );
        return rows[0]?.id ? Number(rows[0].id) : null;
    });
}

async function getConsentRows(accountId: number): Promise<ConsentRow[]> {
    return withConnection(async (conn) => {
        const [rows] = await conn.execute<ConsentRow[]>(
            `SELECT consent_type, action, document_version, ip, user_agent
             FROM ${tn('consents')} WHERE account_id = ? ORDER BY id ASC`,
            [accountId],
        );
        return rows as ConsentRow[];
    });
}

async function cleanupEmail(email: string): Promise<void> {
    await withConnection(async (conn) => {
        await conn.execute(
            `DELETE c FROM ${tn('consents')} c
             JOIN ${tn('accounts')} a ON a.id = c.account_id
             WHERE a.login = ?`,
            [email],
        );
        await conn.execute(`DELETE FROM ${tn('mail_log')} WHERE recipient_email = ?`, [email]);
        await conn.execute(
            `DELETE ad FROM ${tn('accounts_data')} ad
             JOIN ${tn('accounts')} a ON a.id = ad.account_id
             WHERE a.login = ?`,
            [email],
        );
        await conn.execute(`DELETE FROM ${tn('accounts')} WHERE login = ?`, [email]);
    });
}

/**
 * Drive the full real email-code login once: tick the consent checkbox(es),
 * request a code, then follow the one-click magic-login link (read from
 * magic_login_tokens) to complete the login via a plain GET + redirect. A
 * fresh context = a fresh session, so consent timestamps staged this login
 * can't leak from a prior login.
 */
async function loginOnce(
    browser: Browser,
    email: string,
    opts: { marketing: boolean },
): Promise<void> {
    const context = await newScopedContext(browser);
    const page = await context.newPage();

    await page.goto('/system/');
    await expect(page.locator('[data-test-id="auth-login-input"]')).toBeVisible({ timeout: 10000 });
    await page.locator('[data-test-id="auth-login-input"]').fill(email);

    // Marketing MUST be ticked before PD: ticking PD fires the `start-session`
    // POST, which reads the marketing-checkbox state to decide whether to
    // stage consent_marketing_at. Ticking marketing first guarantees that
    // POST carries consent_marketing=1.
    if (opts.marketing) {
        await page.locator('[data-test-id="auth-consent-marketing"]').check();
        await expect(page.locator('[data-test-id="auth-consent-marketing"]')).toBeChecked();
    }
    await tickPdConsent(page);

    const [requestResponse] = await Promise.all([
        page.waitForResponse(
            (r) => r.request().method() === 'POST' && r.url().includes('/system/'),
            { timeout: 15000 },
        ),
        page.locator('[data-test-id="auth-submit-btn"]').click(),
    ]);
    if (!requestResponse.ok()) {
        const body = await requestResponse.text().catch(() => '');
        throw new Error(`request-code POST failed: ${requestResponse.status()} ${body}`);
    }

    const magicToken = await fetchLatestMagicToken(email);
    expect(magicToken, `magic-login token not found for ${email}`).toBeTruthy();

    // One-click magic-login link — a plain GET that validates, consumes,
    // logs in and redirects server-side. Same context, but no session
    // continuity is required for this to work (that's the whole point).
    const linkPage = await context.newPage();
    await linkPage.goto(`/magic-login/code~${magicToken}`);
    await expect(linkPage.locator('[data-test-id="auth-login-input"]')).not.toBeVisible({ timeout: 10000 });

    await context.close();
}

test.describe('Consent audit trail — journal rows on real auth flow', () => {
    test.beforeAll(async () => {
        await cleanupEmail(PD_EMAIL);
        await cleanupEmail(MK_EMAIL);
    });

    test.afterAll(async () => {
        await cleanupEmail(PD_EMAIL);
        await cleanupEmail(MK_EMAIL);
    });

    test('PD-only login writes exactly one personal_data row, no marketing', async ({ browser }) => {
        await loginOnce(browser, PD_EMAIL, { marketing: false });

        const accountId = await getAccountId(PD_EMAIL);
        expect(accountId, `account for ${PD_EMAIL} must exist after login`).not.toBeNull();

        const rows = await getConsentRows(accountId as number);
        expect(rows.length, 'exactly one consent row for PD-only login').toBe(1);
        expect(rows[0].consent_type).toBe('personal_data');
        expect(rows[0].action).toBe('given');
        expect(rows[0].document_version).toBe(DOCUMENT_VERSION);
        expect(rows[0].ip, 'IP must be captured').toBeTruthy();
        expect(rows[0].user_agent, 'User-Agent must be captured').toBeTruthy();
    });

    test('repeat PD login on the same account adds a second personal_data row', async ({ browser }) => {
        // Second login on the already-existing account (re-login path).
        await loginOnce(browser, PD_EMAIL, { marketing: false });

        const accountId = await getAccountId(PD_EMAIL);
        expect(accountId).not.toBeNull();

        const rows = await getConsentRows(accountId as number);
        const pdRows = rows.filter((r) => r.consent_type === 'personal_data');
        expect(pdRows.length, 'repeat login must NOT dedupe — 2 PD rows now').toBe(2);
        // No marketing row sneaked in on a PD-only repeat login.
        expect(rows.filter((r) => r.consent_type === 'marketing').length).toBe(0);
        // Both rows carry the captured audit fields.
        for (const r of pdRows) {
            expect(r.document_version).toBe(DOCUMENT_VERSION);
            expect(r.ip).toBeTruthy();
            expect(r.user_agent).toBeTruthy();
        }
    });

    test('PD + marketing login writes a personal_data AND a marketing row', async ({ browser }) => {
        await loginOnce(browser, MK_EMAIL, { marketing: true });

        const accountId = await getAccountId(MK_EMAIL);
        expect(accountId, `account for ${MK_EMAIL} must exist after login`).not.toBeNull();

        const rows = await getConsentRows(accountId as number);
        expect(rows.length, 'two consent rows for PD+marketing login').toBe(2);

        const pd = rows.filter((r) => r.consent_type === 'personal_data');
        const mk = rows.filter((r) => r.consent_type === 'marketing');
        expect(pd.length).toBe(1);
        expect(mk.length).toBe(1);
        expect(mk[0].action).toBe('given');
        expect(mk[0].document_version).toBe(DOCUMENT_VERSION);
        expect(mk[0].ip).toBeTruthy();
        expect(mk[0].user_agent).toBeTruthy();
    });

    test('start-session without consent_pd=1 is rejected and writes no journal row', async ({ browser }) => {
        // The UI disables submit until PD is ticked, so exercise the gate
        // directly: POST start-session with consent_pd absent must 400.
        const context = await newScopedContext(browser);
        const page = await context.newPage();
        await page.goto('/system/');
        await expect(page.locator('[data-test-id="auth-login-input"]')).toBeVisible({ timeout: 10000 });

        // Ensure the "no account yet" baseline for a throwaway address, so the
        // post-condition "no journal row" is meaningful (not just unchanged).
        const probeEmail = `cj_reject_${PIDX}_${Date.now()}@external.example.com`;

        const result = await page.evaluate(async (email: string) => {
            const res = await fetch(window.location.href, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({ action: 'start-session', consent_marketing: '1' }),
            });
            void email;
            return { status: res.status, body: await res.json().catch(() => ({})) };
        }, probeEmail);

        expect(result.status, 'missing consent_pd must be rejected').toBe(400);

        // No account was created and therefore no journal row can exist.
        const accountId = await getAccountId(probeEmail);
        expect(accountId).toBeNull();

        await context.close();
    });
});
