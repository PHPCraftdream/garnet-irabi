import { Browser, chromium, FullConfig } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Prod globalSetup — logs each role into the remote box via the REAL
 * passwordless `.test` auto-login flow (there is no /dev-login on prod) and
 * saves per-role storageState to `.auth/{role}_w0.json`, exactly where the
 * base config's projects look for it (worker 0).
 *
 * The role accounts (`testuser_setup_*@irabi.test`) and their flags were
 * created server-side by `php garnet test:provision`; here we just walk the
 * UI auth widget to mint a session. Under the active TestScope the server
 * auto-completes the code step for `.test` mailboxes, so a single submit
 * logs in.
 *
 * No DB isolation work happens here (the remote scope is already built);
 * direct SQL from specs is bridged over SSH by helpers/ssh-bridge.ts.
 */
const BASE_URL = process.env.BASE_URL!;
const TOKEN = process.env.RUN_TEST_TOKEN ?? '';
const AUTH_DIR = path.resolve(__dirname, '.auth');

// A protected route forces the auth widget to render (the public `/` is a
// landing page). Override per-app via PW_PROD_AUTH_PATH if needed.
const AUTH_PATH = process.env.PW_PROD_AUTH_PATH ?? '/system/';

const ROLES: Record<string, string> = {
    admin:              'testuser_setup_admin@irabi.test',
    expert:             'testuser_setup_expert@irabi.test',
    user:               'testuser_setup_user@irabi.test',
    moderator:          'testuser_setup_moderator@irabi.test',
    owner:              'testuser_setup_owner@irabi.test',
    // Dual-axis combos used by cross-role specs (resolveStorageStatePath).
    'expert-moderator': 'testuser_setup_expert_moderator@irabi.test',
    'expert-admin':     'testuser_setup_expert_admin@irabi.test',
};

async function loginOnce(browser: Browser, role: string, email: string): Promise<void> {
    const ctx = await browser.newContext({
        baseURL: BASE_URL,
        extraHTTPHeaders: { 'X-Test-Worker': '0', 'run-test-garnet-team': TOKEN },
    });
    try {
        const page = await ctx.newPage();
        await page.goto(AUTH_PATH);

        const input = page.locator('[data-test-id="auth-login-input"]');
        await input.waitFor({ state: 'visible', timeout: 20000 });
        await input.fill(email);

        // 152-ФЗ consent gate: ticking it fires the start-session POST that
        // mints CSRF and enables the submit button. On a cold/slow prod moment
        // that round-trip can take a few seconds — give it real headroom
        // (15s), and the whole login is retried by loginRole on timeout.
        await page.locator('[data-test-id="auth-consent-pd"]').check();
        await page.waitForFunction(() => {
            const b = document.querySelector('[data-test-id="auth-submit-btn"]') as HTMLButtonElement | null;
            return !!b && !b.disabled;
        }, { timeout: 15000 });

        await page.locator('[data-test-id="auth-submit-btn"]').click();

        // `.test` auto-login completes the code step server-side, so the auth
        // widget unmounts on success.
        await page.waitForFunction(
            () => document.querySelector('[data-test-id="auth-submit-btn"]') === null,
            { timeout: 30000 },
        );

        await ctx.storageState({ path: path.join(AUTH_DIR, `${role}_w0.json`) });
        console.log(`[prod-setup] logged in ${role} (${email})`);
    } finally {
        await ctx.close();
    }
}

async function loginRole(browser: Browser, role: string, email: string): Promise<void> {
    // globalSetup is all-or-nothing: a single role's transient timeout aborts
    // the ENTIRE remote run before a single test executes. Retry each role a
    // couple of times against shared-hosting latency spikes.
    let lastErr: unknown;
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            await loginOnce(browser, role, email);
            return;
        } catch (e) {
            lastErr = e;
            console.warn(`[prod-setup] login ${role} attempt ${attempt} failed: ${(e as Error)?.message ?? e}`);
        }
    }
    throw lastErr;
}

export default async function globalSetup(_config: FullConfig): Promise<void> {
    if (!BASE_URL) throw new Error('[prod-setup] BASE_URL is required');
    if (!TOKEN) throw new Error('[prod-setup] RUN_TEST_TOKEN is required');

    fs.mkdirSync(AUTH_DIR, { recursive: true });

    // Fail fast if the remote isn't reachable / not provisioned.
    const probe = await fetch(`${BASE_URL}/`, { headers: { 'run-test-garnet-team': TOKEN } }).catch((e) => {
        throw new Error(`[prod-setup] ${BASE_URL} unreachable: ${e?.message ?? e}`);
    });
    if (probe.status >= 500) {
        throw new Error(`[prod-setup] ${BASE_URL}/ → ${probe.status}; is the box up and provisioned?`);
    }

    const browser = await chromium.launch();
    try {
        for (const [role, email] of Object.entries(ROLES)) {
            await loginRole(browser, role, email);
        }
    } finally {
        await browser.close();
    }
    console.log('[prod-setup] all roles authenticated');
}
