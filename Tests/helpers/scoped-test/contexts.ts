/**
 * Создание контекстов и страниц, привязанных к тестовому контуру.
 */

import { Browser, BrowserContext, BrowserContextOptions, Page } from '@playwright/test';
import { attachConsoleGuards } from '../guards/console-guards';
import { warmAntiBotCookie } from '../guards/anti-bot';
import { scopeHeaders } from './scope-headers';
import { recordCtxEvent } from './telemetry';

/**
 * `browser.newContext()` doesn't inherit `extraHTTPHeaders` from
 * `playwright.config.ts → use:` — those only apply to the default
 * `context` fixture. Specs that spin up their own contexts (cross-role
 * flows, isolation-aware idempotency probes) must use this helper to
 * keep the X-Test-Worker header attached, otherwise the server falls
 * back to the legacy `db_*` prefix and the test sees the wrong DB.
 *
 * `browser.newContext()` DOES, however, inherit the project's
 * `use.storageState` (and `baseURL`) — verified empirically. So a
 * caller that does NOT pass its own `options.storageState` gets a
 * context that silently carries whatever role the current project is
 * pre-authenticated as (e.g. every "ephemeral" context in an
 * admin-storageState project starts out logged in as admin). Default
 * to an explicitly empty (cookie-less) storageState here so callers
 * are logged-out by default, same as a fresh `browser.newContext()`
 * with no project storageState configured; a caller that explicitly
 * passes `options.storageState` still gets exactly that, since it's
 * spread after this default.
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
        storageState: { cookies: [], origins: [] },
        ...options,
        extraHTTPHeaders: {
            ...(options.extraHTTPHeaders ?? {}),
            ...scopeHeaders(idx),
        },
    };
    const ctx = await browser.newContext(merged);
    attachConsoleGuards(ctx);
    // A brand-new context starts without the host's anti-bot cookie, so its
    // first POST — including a `fetch()` fired from inside the page — is spent
    // on the challenge (see warmAntiBotCookie). Specs that build their own
    // context this way bypass the reset path, which is how A-01 ("owner cannot
    // mint owner") kept reading as a 200: the challenge page, not the app. The
    // flag was never actually set.
    await warmAntiBotCookie(ctx);

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
