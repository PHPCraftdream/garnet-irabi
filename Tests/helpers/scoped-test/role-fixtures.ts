/**
 * Типы и заготовки фикстур по ролям: контекст на воркер, страница на
 * проверку.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { Browser, BrowserContext, BrowserContextOptions, Page } from '@playwright/test';
import { attachConsoleGuards } from '../guards/console-guards';
import { scopeHeaders } from './scope-headers';
import { recordCtxEvent } from './telemetry';
import { resetContextToStorageState } from './storage-state';


/* Anti-bot warm-up lives in ./anti-bot — shared with role-login. */

export type SharedFixtures = {
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

export type RolePageFixtures = {
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

export function roleContextOpts(workerIndex: number, role: string): BrowserContextOptions {
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

export function roleStateFile(workerIndex: number, role: string): string {
    return process.env.PW_WORKER_ISOLATION !== '0'
        ? path.resolve(__dirname, '..', '.auth', `${role}_w${workerIndex}.json`)
        : path.resolve(__dirname, '..', '.auth', `${role}.json`);
}

/**
 * Тип возврата объявлен явно, и это не формальность: Playwright ждёт
 * КОРТЕЖ [функция, опции], а вывод типов даёт обычный массив с union'ом
 * элементов — фикстура такой не принимает. Сказать `as const` тоже нельзя:
 * получится readonly-кортеж, который не подходит по другой причине.
 */
export function makeRoleContextFixture(role: string): [
    (args: { browser: Browser }, use: (ctx: BrowserContext) => Promise<void>, workerInfo: any) => Promise<void>,
    { scope: 'worker' },
] {
    return [
        async ({ browser }: { browser: Browser }, use: (ctx: BrowserContext) => Promise<void>, workerInfo: any) => {
            recordCtxEvent(`${role}Context`);
            const ctx = await browser.newContext(roleContextOpts(workerInfo.parallelIndex, role));
            attachConsoleGuards(ctx);
            await use(ctx);
            await ctx.close();
        },
        { scope: 'worker' },
    ];
}

// Note: Playwright's fixture runtime inspects the function signature
// and rejects anything whose first argument isn't a literal
// destructuring pattern (`{ … }`), so the per-role page fixtures
// can't share a single factory — they have to be declared inline
// below with `async ({ <ctx> }, …)` directly. Build the body once
// here, instantiate it per role at the use site.
export async function roleNewPage(ctx: BrowserContext, role: string, parallelIndex: number, use: (p: Page) => Promise<void>) {
    await resetContextToStorageState(ctx, roleStateFile(parallelIndex, role));
    const page = await ctx.newPage();
    try { await use(page); } finally { await page.close().catch(() => {}); }
}
