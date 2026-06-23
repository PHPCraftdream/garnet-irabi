import { defineConfig } from '@playwright/test';
import base from './playwright.config';
import { installProdDbBridge } from './helpers/ssh-bridge';

// Install the SSH DB bridge at CONFIG load — Playwright evaluates the config
// in every worker process BEFORE any spec module, so by the time a spec runs
// `import mysql from 'mysql2/promise'` the patched `createConnection` is
// already in place. Doing it only in scoped-test.ts was import-order
// dependent: a spec that imported mysql2 before scoped-test captured the
// unpatched function and silently hit the LOCAL DB. No-op outside PW_PROD.
installProdDbBridge();

/**
 * Playwright config for a run against an EXTERNAL box (prod / staging),
 * driven by `php garnet test:remote`. Reuses every project/spec from the
 * base config — only the wiring changes:
 *
 *   - baseURL points at the remote site (BASE_URL).
 *   - one worker, no retries — shared hosting must not be hammered.
 *   - the token-gated globalSetup logs each role in via the real `.test`
 *     auto-login flow (no /dev-login on prod) and saves storageState.
 *   - every request carries `run-test-garnet-team: <token>` so the server
 *     flips into the isolated test_worker_0 scope. Direct MySQL access is
 *     routed back over SSH by helpers/ssh-bridge.ts (PW_PROD=1).
 *
 * Never point this at a box without first provisioning the scope — without
 * a planted token the server would serve these requests as normal traffic.
 */
const BASE_URL = process.env.BASE_URL;
if (!BASE_URL) {
    throw new Error('playwright.prod.config: BASE_URL is required (set by `php garnet test:remote`).');
}
const TOKEN = process.env.RUN_TEST_TOKEN ?? '';
if (!TOKEN) {
    throw new Error('playwright.prod.config: RUN_TEST_TOKEN is required (set by `php garnet test:remote`).');
}

export default defineConfig({
    ...base,
    workers: 1,
    fullyParallel: false,
    // One retry on prod: a flaky toast/XHR race against shared-hosting
    // latency shouldn't fail the run; a real bug fails both attempts.
    retries: 1,
    globalSetup: './global-setup.prod.ts',
    globalTeardown: './global-teardown.prod.ts',
    // Shared hosting + the SSH DB bridge are slower than the local stack —
    // give actions/navigations/assertions more headroom than the base config.
    timeout: 150_000,
    expect: { timeout: 12_000 },
    use: {
        ...base.use,
        baseURL: BASE_URL,
        actionTimeout: 25_000,
        navigationTimeout: 40_000,
        // Token + worker header on the default/​shared context. The role
        // and secondary contexts get the same pair via scopeHeaders() in
        // helpers/scoped-test.ts.
        extraHTTPHeaders: {
            'X-Test-Worker': '0',
            'run-test-garnet-team': TOKEN,
        },
    },
});
