/**
 * Per-worker scoped test fixture.
 *
 * Every spec that talks to the DB-backed application MUST import `test`
 * from this file — NOT from `@playwright/test` directly. Doing so:
 *
 *   1. Guarantees the worker prefix is available as a fixture
 *      (`workerPrefix`) so direct DB queries target the right tables.
 *   2. Wires the `X-Test-Worker` header into every HTTP request the
 *      browser issues, so the server-side WorkerScopeMiddleware swaps
 *      the table prefix to `test_worker_N_*` for that request.
 *
 * The fixture is per-worker (not per-test), so the prefix is stable
 * across all tests inside one worker process.
 *
 * Usage (CMS spec):
 * ```ts
 * import { test, expect } from '../../helpers/scoped-test';
 * import mysql from 'mysql2/promise';
 *
 * test('booking lands in DB', async ({ page, workerPrefix }) => {
 *   await page.goto('/admin/');
 *   await page.click('[data-test-id="book"]');
 *
 *   // Direct DB assert — must use the per-worker prefix:
 *   const conn = await mysql.createConnection(DB);
 *   const [rows] = await conn.execute(
 *     `SELECT * FROM ${workerPrefix}_ir_bookings WHERE user_id = ?`,
 *     [userId]
 *   );
 * });
 * ```
 *
 * The HTTP path is automatic via `extraHTTPHeaders` in
 * `playwright.config.ts` — no per-test wiring needed.
 */
import { test as base, expect, Browser, BrowserContext, BrowserContextOptions, Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { attachConsoleGuards, collectAndResetIssues, formatIssues } from './console-guards';
import { installProdDbBridge, isProd } from './ssh-bridge';

// Prod (PW_PROD=1) mode: route every spec's direct MySQL access over SSH.
// Runs once per worker process (this module is imported by every spec).
installProdDbBridge();

/**
 * Per-request headers that route a browser context to the isolated test
 * scope. `X-Test-Worker` selects the per-worker prefix; in prod mode we ALSO
 * attach the `run-test-garnet-team` secret so the server flips into the
 * token-gated test_worker_0 scope. CRITICAL: every context the suite opens
 * must carry these in prod — a context that misses the token would have its
 * requests served against LIVE prod tables. Centralised here so no call site
 * can forget it.
 */
export function scopeHeaders(workerIndex: string | number): Record<string, string> {
    const headers: Record<string, string> = { 'X-Test-Worker': String(workerIndex) };
    if (isProd()) {
        const token = process.env.RUN_TEST_TOKEN ?? '';
        if (token) headers['run-test-garnet-team'] = token;
    }
    return headers;
}

// ── Browser-context telemetry ────────────────────────────────────────────────
//
// Every BrowserContext creation is an opportunity to overpay: ~150-250ms per
// context, ~63 newScopedContext + ~37 _sharedContext = ~100/run at our last
// measurement. Append one JSONL line per creation to a per-worker file;
// global-teardown.ts aggregates and prints a summary at the end of the run.
// Opt out with PW_CTX_TELEMETRY=0 if it ever gets in the way.
//
// Files land under tests/.ctx-stats/worker-{idx}.jsonl, cleared at the
// start of every run by global-setup.ts.
export const CTX_STATS_DIR = path.resolve(__dirname, '..', '.ctx-stats');
function recordCtxEvent(kind: string, project?: string): void {
    if (process.env.PW_CTX_TELEMETRY === '0') return;
    try {
        fs.mkdirSync(CTX_STATS_DIR, { recursive: true });
        const idx = process.env.TEST_PARALLEL_INDEX ?? '0';
        fs.appendFileSync(
            path.join(CTX_STATS_DIR, `worker-${idx}.jsonl`),
            JSON.stringify({ kind, project: project ?? null, ts: Date.now() }) + '\n',
        );
    } catch { /* best-effort, never block a test on telemetry */ }
}

/**
 * Resolve the framework table prefix for the current worker.
 *
 * The base prefix is read from `db.ini` (the same file PHP reads), so
 * an app-specific suffix like `db_ir` keeps working without spec-level
 * `ir_` hard-coding. Tests reference tables as `tn('accounts')` only;
 * the bundle-specific segment is part of the prefix, not the name.
 *
 * Two modes (isolation is ON by default):
 *   - default (`PW_WORKER_ISOLATION` unset or = "1"): returns
 *     `'test_worker_${idx}${suffix}'` where `suffix` is everything in
 *     the base prefix after the leading `db` segment (e.g. `_ir`).
 *     Each worker gets its own table namespace, race-free.
 *   - `PW_WORKER_ISOLATION=0`: returns the base prefix verbatim (e.g.
 *     `'db_ir'`). Drops back to the legacy shared set — for debugging
 *     against live data only, do NOT combine with `PW_WORKERS>1`.
 *
 * Used by both the `dbPrefix` test fixture (for spec destructuring)
 * AND by the `tn()` helper (for non-fixture helper functions).
 */
const DB_INI_CANDIDATES = [
    path.resolve(__dirname, '..', '..', 'Apps', 'IRabi', 'WorkDir', 'ConfigDev', 'db.ini'),
    path.resolve(__dirname, '..', '..', 'Apps', 'IRabi', 'WorkDir', 'Config', 'db.ini'),
];
function readBasePrefix(): string {
    const override = process.env.PW_DB_PREFIX_BASE;
    if (override && override.length > 0) return override;
    for (const file of DB_INI_CANDIDATES) {
        if (!fs.existsSync(file)) continue;
        const text = fs.readFileSync(file, 'utf-8');
        for (const raw of text.split(/\r?\n/)) {
            const line = raw.trim();
            if (!line || line.startsWith(';') || line.startsWith('#') || line.startsWith('[')) continue;
            const eq = line.indexOf('=');
            if (eq < 0) continue;
            const key = line.slice(0, eq).trim();
            if (key !== 'prefix') continue;
            let val = line.slice(eq + 1).trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                val = val.slice(1, -1);
            }
            if (val) return val;
        }
    }
    return 'db';
}

export function getDbPrefix(): string {
    const base = readBasePrefix();
    if (process.env.PW_WORKER_ISOLATION === '0') {
        return base;
    }
    const idx = process.env.TEST_PARALLEL_INDEX ?? '0';
    // The DB_PREFIX_OVERRIDE substitution in isolation-setup replaces
    // the entire base prefix (`db_ir`, `db`, …) with `test_worker_N`,
    // so no suffix from the original prefix should be preserved.
    return `test_worker_${idx}`;
}

/**
 * `browser.newContext()` doesn't inherit `extraHTTPHeaders` from
 * `playwright.config.ts → use:` — those only apply to the default
 * `context` fixture. Specs that spin up their own contexts (cross-role
 * flows, isolation-aware idempotency probes) must use this helper to
 * keep the X-Test-Worker header attached, otherwise the server falls
 * back to the legacy `db_*` prefix and the test sees the wrong DB.
 *
 * Outside isolation mode this is a thin pass-through.
 */
export async function newScopedContext(
    browser: Browser,
    options: BrowserContextOptions = {}
): Promise<BrowserContext> {
    recordCtxEvent('newScopedContext');
    if (process.env.PW_WORKER_ISOLATION === '0') {
        return browser.newContext(options);
    }
    const idx = process.env.TEST_PARALLEL_INDEX ?? '0';
    const merged: BrowserContextOptions = {
        ...options,
        extraHTTPHeaders: {
            ...(options.extraHTTPHeaders ?? {}),
            ...scopeHeaders(idx),
        },
    };
    const ctx = await browser.newContext(merged);
    attachConsoleGuards(ctx);
    return ctx;
}

/**
 * Convenience: open a single page in a scoped context. Same caveat as
 * `newScopedContext` — `browser.newPage()` skips the `use:` block,
 * so a spec calling it raw under isolation gets a context that misses
 * the X-Test-Worker header. Use this instead to preserve the worker
 * scope in legacy beforeAll patterns:
 *
 * ```ts
 *   page = await newScopedPage(browser);
 * ```
 */
export async function newScopedPage(
    browser: Browser,
    options: BrowserContextOptions = {}
) {
    const context = await newScopedContext(browser, options);
    return context.newPage();
}

/**
 * Compose a fully-qualified table name from the bundle-relative name.
 * Drop-in replacement for hardcoded `db_*` literals in raw SQL:
 *
 * ```ts
 *   `SELECT * FROM ${tn('bookings')} WHERE id = ?`
 *   `INSERT INTO ${tn('accounts_data')} VALUES (...)`
 * ```
 *
 * Resolves at call time, so isolation toggles via env var without
 * recompiling the spec.
 */
export function tn(name: string): string {
    return `${getDbPrefix()}_${name}`;
}

type WorkerScope = {
    /**
     * Resolved framework table prefix for this worker. Equivalent to
     * `getDbPrefix()` but exposed as a fixture so specs can destructure
     * it from the test args alongside `page`/`request`.
     */
    dbPrefix: string;

    /**
     * Numeric worker index, mirrors `testInfo.parallelIndex`. Useful for
     * picking per-worker resources (auth state files, ports, etc.).
     */
    workerIndex: number;
};

/**
 * Cache of parsed storageState files keyed by absolute path. Each
 * worker reads its assigned storageState at most once.
 */
const STATE_CACHE = new Map<string, any>();

function loadStateOnce(stateFile: string | undefined): any | null {
    if (!stateFile) return null;
    if (STATE_CACHE.has(stateFile)) return STATE_CACHE.get(stateFile);
    if (!fs.existsSync(stateFile)) {
        STATE_CACHE.set(stateFile, null);
        return null;
    }
    const parsed = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
    STATE_CACHE.set(stateFile, parsed);
    return parsed;
}

/**
 * Reset a BrowserContext back to the cookies/origins recorded in its
 * project's storageState file. Called between tests when we're reusing
 * a worker-scoped context — otherwise one test's logout/clearCookies
 * leaks into the next test in the same worker.
 *
 * If no storageState is configured for the project, just clears
 * cookies — the project never had any to begin with.
 */
async function resetContextToStorageState(ctx: BrowserContext, stateFile: string | undefined): Promise<void> {
    await ctx.clearCookies();
    const state = loadStateOnce(stateFile);
    if (state?.cookies?.length) {
        await ctx.addCookies(state.cookies);
    }
    // Wipe localStorage / sessionStorage on the active page. Playwright's
    // `addInitScript` covers future page navigations, but the page that's
    // currently mounted in beforeEach still carries the previous test's
    // state. Best-effort — if no page is open yet, this is a no-op.
    for (const p of ctx.pages()) {
        await p.evaluate(() => {
            try { localStorage.clear(); } catch {}
            try { sessionStorage.clear(); } catch {}
        }).catch(() => { /* page may have navigated mid-clear */ });
    }
}

type SharedFixtures = {
    /**
     * Worker-scoped BrowserContext that all tests in the same worker
     * share. Created once per worker with the project's storageState
     * baked in; subsequent tests get a fresh `page` from
     * `context.newPage()` (~30ms) instead of paying the full
     * `browser.newContext()` cost (~150-250ms) every single test.
     */
    _sharedContext: BrowserContext;

    /**
     * Worker-scoped BrowserContext per role. Loaded with the role's
     * per-worker storageState (`.auth/{role}_w{idx}.json`) so the
     * test starts already authenticated as that role. Lazy: a worker
     * only pays the `browser.newContext()` cost for a role if some
     * test in the worker actually requested it.
     *
     * Use the role-specific `*Page` fixture in tests; reach for the
     * raw context only when you legitimately need multiple pages on
     * the same role.
     */
    adminContext: BrowserContext;
    expertContext: BrowserContext;
    userContext: BrowserContext;
    moderatorContext: BrowserContext;
    ownerContext: BrowserContext;
};

type RolePageFixtures = {
    /**
     * Fresh `Page` opened on the role's worker-scoped context, with
     * cookies + localStorage reset to the saved storageState first
     * so the previous test in this worker can't leak state in.
     *
     * Use these instead of `await newScopedContext(browser, {storageState: …})`
     * inside cross-role tests — the context is reused across the
     * worker's lifetime instead of allocated per-test.
     */
    adminPage: Page;
    expertPage: Page;
    userPage: Page;
    moderatorPage: Page;
    ownerPage: Page;
};

// ── helpers for the per-role fixtures ────────────────────────────────────────

function roleContextOpts(workerIndex: number, role: string): BrowserContextOptions {
    const stateFile = process.env.PW_WORKER_ISOLATION !== '0'
        ? path.resolve(__dirname, '..', '.auth', `${role}_w${workerIndex}.json`)
        : path.resolve(__dirname, '..', '.auth', `${role}.json`);
    const opts: BrowserContextOptions = {};
    if (fs.existsSync(stateFile)) {
        opts.storageState = stateFile;
    }
    if (process.env.PW_WORKER_ISOLATION !== '0') {
        opts.extraHTTPHeaders = scopeHeaders(workerIndex);
    }
    return opts;
}

function roleStateFile(workerIndex: number, role: string): string {
    return process.env.PW_WORKER_ISOLATION !== '0'
        ? path.resolve(__dirname, '..', '.auth', `${role}_w${workerIndex}.json`)
        : path.resolve(__dirname, '..', '.auth', `${role}.json`);
}

function makeRoleContextFixture(role: string) {
    return [
        async ({ browser }: { browser: Browser }, use: (ctx: BrowserContext) => Promise<void>, workerInfo: any) => {
            recordCtxEvent(`${role}Context`);
            const ctx = await browser.newContext(roleContextOpts(workerInfo.parallelIndex, role));
            attachConsoleGuards(ctx);
            await use(ctx);
            await ctx.close();
        },
        { scope: 'worker' as const },
    ] as const;
}

// Note: Playwright's fixture runtime inspects the function signature
// and rejects anything whose first argument isn't a literal
// destructuring pattern (`{ … }`), so the per-role page fixtures
// can't share a single factory — they have to be declared inline
// below with `async ({ <ctx> }, …)` directly. Build the body once
// here, instantiate it per role at the use site.
async function roleNewPage(ctx: BrowserContext, role: string, parallelIndex: number, use: (p: Page) => Promise<void>) {
    await resetContextToStorageState(ctx, roleStateFile(parallelIndex, role));
    const page = await ctx.newPage();
    try { await use(page); } finally { await page.close().catch(() => {}); }
}

const baseTest = base.extend<{}, WorkerScope>({
    workerIndex: [
        async ({}, use, workerInfo) => {
            await use(workerInfo.parallelIndex);
        },
        { scope: 'worker' },
    ],

    dbPrefix: [
        async ({}, use) => {
            await use(getDbPrefix());
        },
        { scope: 'worker' },
    ],
});

/**
 * Shared-context test runner. Imported as `test` by every spec.
 *
 * Each worker reuses one BrowserContext across all of its tests. The
 * `page` fixture is overridden so each test still gets a fresh `Page`
 * from `_sharedContext.newPage()` — DOM, listeners, history are reset
 * per-test, but the context (which costs ~150-250ms to spin up because
 * of storageState parsing + cookie injection) survives.
 *
 * Between tests the context is restored to the project's storageState
 * snapshot: cookies cleared and re-added from the JSON file,
 * localStorage / sessionStorage wiped. Specs that need a truly pristine
 * context (logout flows that intentionally clearCookies, etc.) keep
 * working — the reset before the NEXT test puts cookies back.
 */
export const test = baseTest.extend<{ page: Page; __consoleGuard: void } & RolePageFixtures, SharedFixtures>({
    /**
     * Auto-fixture: every browser-side warning or uncaught exception
     * accumulated during a test fails that test, with the full
     * messages attached. Centralised here so no spec ever has to wire
     * its own listeners. `auto: true` means it runs for every test
     * even when not explicitly requested.
     */
    __consoleGuard: [async ({}, use) => {
        await use();
        const issues = collectAndResetIssues();
        if (issues.length > 0) {
            throw new Error(
                `Browser console produced ${issues.length} error/warning(s) during this test:\n` +
                formatIssues(issues)
            );
        }
    }, { auto: true }],

    _sharedContext: [
        async ({ browser }, use, workerInfo) => {
            const projectUse = workerInfo.project.use as any;
            const opts: BrowserContextOptions = {
                baseURL: projectUse?.baseURL,
                storageState: projectUse?.storageState,
                // Belt-and-suspenders: re-stamp the scope headers in prod so
                // the shared context can NEVER fall back to live prod tables,
                // even if the project↔global use merge ever drops them.
                extraHTTPHeaders: {
                    ...(projectUse?.extraHTTPHeaders ?? {}),
                    ...(isProd() ? scopeHeaders('0') : {}),
                },
            };
            if (projectUse?.viewport) opts.viewport = projectUse.viewport;
            if (projectUse?.userAgent) opts.userAgent = projectUse.userAgent;
            recordCtxEvent('_sharedContext', workerInfo.project.name);
            const ctx = await browser.newContext(opts);
            attachConsoleGuards(ctx);
            await use(ctx);
            await ctx.close();
        },
        { scope: 'worker' },
    ],

    page: async ({ _sharedContext }, use, testInfo) => {
        const stateFile = (testInfo.project.use as any).storageState as string | undefined;
        // Reset cookies + storage between tests so leftover state from
        // the previous spec in this worker doesn't bleed in.
        await resetContextToStorageState(_sharedContext, stateFile);
        const page = await _sharedContext.newPage();
        await use(page);
        // Close the page so the context's page list doesn't grow
        // unboundedly across N tests — each lingering page also keeps
        // its JS heap / event listeners alive.
        await page.close().catch(() => {});
    },

    // Worker-scoped role contexts — lazy; only created if a test
    // actually requests the matching role*Page fixture.
    adminContext:     makeRoleContextFixture('admin'),
    expertContext:    makeRoleContextFixture('expert'),
    userContext:      makeRoleContextFixture('user'),
    moderatorContext: makeRoleContextFixture('moderator'),
    ownerContext:     makeRoleContextFixture('owner'),

    // Test-scoped role pages — fresh page per test, reset state
    // between tests, share the worker context.
    adminPage: async ({ adminContext }, use, testInfo) => {
        await roleNewPage(adminContext, 'admin', testInfo.parallelIndex, use);
    },
    expertPage: async ({ expertContext }, use, testInfo) => {
        await roleNewPage(expertContext, 'expert', testInfo.parallelIndex, use);
    },
    userPage: async ({ userContext }, use, testInfo) => {
        await roleNewPage(userContext, 'user', testInfo.parallelIndex, use);
    },
    moderatorPage: async ({ moderatorContext }, use, testInfo) => {
        await roleNewPage(moderatorContext, 'moderator', testInfo.parallelIndex, use);
    },
    ownerPage: async ({ ownerContext }, use, testInfo) => {
        await roleNewPage(ownerContext, 'owner', testInfo.parallelIndex, use);
    },
});

export { expect };
