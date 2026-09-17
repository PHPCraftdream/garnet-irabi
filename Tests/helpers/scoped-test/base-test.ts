/**
 * Сборка фикстур: что получает каждая проверка, когда пишет
 * `async ({ page, adminPage, dbPrefix })`.
 */

import { test as base, expect, Browser, BrowserContext, BrowserContextOptions, Page } from '@playwright/test';
import { isProd } from '../ssh-bridge';
import { attachConsoleGuards, collectAndResetIssues, formatIssues } from '../console-guards';
import { getDbPrefix } from './db-prefix';
import { scopeHeaders } from './scope-headers';
import { recordCtxEvent } from './telemetry';
import { resetContextToStorageState } from './storage-state';
import { SharedFixtures, RolePageFixtures, roleContextOpts, roleStateFile, makeRoleContextFixture, roleNewPage } from './role-fixtures';

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
