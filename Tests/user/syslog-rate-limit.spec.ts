/**
 * F-LOG-01 regression: the public /sys/log breadcrumb endpoint must enforce a
 * per-IP rate limit so it cannot be abused for unauthenticated log-spam / disk
 * growth.
 *
 * The limit is a fixed 60-second window of RATE_MAX_PER_WINDOW=60 writes per IP
 * (SysLogController). We clear the worker-scoped throttle table, fire a burst,
 * and assert the endpoint starts rejecting with 429 once the cap is exceeded —
 * while a single legitimate call still succeeds.
 */
import { test, expect, tn } from '../helpers/scoped-test';
import { newScopedContext } from '../helpers/scoped-test';
import { withConnection } from '../helpers/db';
import type { BrowserContext, Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

const BASE_URL = process.env.BASE_URL || 'http://localhost:8001';

let context: BrowserContext;
let page: Page;

async function clearThrottle(): Promise<void> {
    await withConnection(async (c) => {
        await c.execute(`DELETE FROM ${tn('sys_log_throttle')}`);
    });
}

/** POST /sys/log once; returns HTTP status. Public endpoint — no auth/CSRF. */
async function postLog(p: Page, cat: string, msg: string): Promise<number> {
    return p.evaluate(async ({ cat, msg }) => {
        const fd = new FormData();
        fd.append('cat', cat);
        fd.append('msg', msg);
        const res = await fetch('/sys/log/~log', { method: 'POST', body: fd });
        return res.status;
    }, { cat, msg });
}

/** Fire N sequential posts, return the ordered status list. */
async function burst(p: Page, n: number): Promise<number[]> {
    return p.evaluate(async ({ n }) => {
        const out: number[] = [];
        for (let i = 0; i < n; i++) {
            const fd = new FormData();
            fd.append('cat', 'ratetest');
            fd.append('msg', `burst-${i}`);
            const res = await fetch('/sys/log/~log', { method: 'POST', body: fd });
            out.push(res.status);
        }
        return out;
    }, { n });
}

test.describe('F-LOG-01: /sys/log per-IP rate limit', () => {

    test.beforeAll(async ({ browser }) => {
        context = await newScopedContext(browser);
        page = await context.newPage();
        await page.goto(`${BASE_URL}/`);
    });

    test.afterAll(async () => {
        await clearThrottle().catch(() => {});
        await context?.close().catch(() => {});
    });

    test('a single breadcrumb write succeeds (200)', async () => {
        await clearThrottle();
        const status = await postLog(page, 'ratetest', 'single ok');
        expect(status).toBe(200);
    });

    test('exceeding the per-IP window is rejected with 429', async () => {
        await clearThrottle();
        // 65 > cap(60): the first 60 land, the tail is throttled.
        const statuses = await burst(page, 65);

        // First request always succeeds.
        expect(statuses[0]).toBe(200);
        // The limit must actually engage somewhere in the burst.
        expect(statuses.includes(429)).toBe(true);
        // Accepted writes are capped near the limit (tolerate a possible
        // window-boundary reset mid-burst by allowing one extra window).
        const accepted = statuses.filter((s) => s === 200).length;
        expect(accepted).toBeLessThanOrEqual(121);
        expect(accepted).toBeGreaterThanOrEqual(55);
        // The final request of a 65-long burst is past the cap → throttled.
        expect(statuses[statuses.length - 1]).toBe(429);
    });

    // ── L-01: fail-closed when throttle storage itself is unavailable ──

    test('throttle storage failure fails CLOSED (429), not open (200)', async () => {
        // Simulate the throttle table being unavailable (DB error inside
        // isRateLimited()'s try/catch) by dropping it for this worker scope.
        await withConnection(async (c) => {
            await c.execute(`DROP TABLE ${tn('sys_log_throttle')}`);
        });
        try {
            const status = await postLog(page, 'ratetest', 'throttle storage down');
            // Before the L-01 fix this returned 200 (fail-open). The fix
            // makes any DB error inside isRateLimited() fail closed (429) —
            // a public unauthenticated endpoint must not turn a storage
            // hiccup into unlimited log-spam capacity.
            expect(status).toBe(429);
        } finally {
            // Recreate the table so isolation teardown (which expects it to
            // exist) and any later test in this worker don't break.
            await withConnection(async (c) => {
                await c.execute(`
                    CREATE TABLE IF NOT EXISTS ${tn('sys_log_throttle')} (
                        id INT(11) NOT NULL AUTO_INCREMENT,
                        ip VARCHAR(45) NOT NULL,
                        window_start INT(11) NOT NULL DEFAULT 0,
                        cnt INT(11) NOT NULL DEFAULT 0,
                        PRIMARY KEY (id),
                        UNIQUE KEY ip (ip)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                `);
            });
        }
    });
});
