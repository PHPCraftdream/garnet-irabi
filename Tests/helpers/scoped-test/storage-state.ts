/**
 * Возврат контекста к сохранённому состоянию входа между проверками.
 *
 * Без этого выход или очистка кук в одной проверке протекает в
 * следующую, живущую в том же воркере.
 */

import * as fs from 'node:fs';
import { BrowserContext } from '@playwright/test';
import { warmAntiBotCookie } from '../guards/anti-bot';

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

export function loadStateOnce(stateFile: string | undefined): any | null {
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
export async function resetContextToStorageState(ctx: BrowserContext, stateFile: string | undefined): Promise<void> {
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

    await warmAntiBotCookie(ctx);
}
