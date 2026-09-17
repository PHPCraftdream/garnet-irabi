/**
 * Заголовки, которыми запрос попадает в изолированный тестовый контур.
 */

import { isProd } from '../db/ssh-bridge';

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
