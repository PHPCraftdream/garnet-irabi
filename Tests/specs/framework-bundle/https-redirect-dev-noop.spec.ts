/**
 * Regression: the app-level HTTPS-redirect + HSTS layer must be a complete
 * no-op on the dev server.
 *
 * `run_web.php` gates both the HTTP→HTTPS 301 redirect and the
 * Strict-Transport-Security header on `!$isDev`. The local dev server
 * (`php garnet serve` on http://localhost:8001) is always `isDev=true`
 * over plain HTTP BY DESIGN — the whole Playwright e2e stack talks to it
 * that way. If the gating flag is ever dropped or wired to the wrong
 * signal (e.g. `protocol` ini value, or a missing isDev check), every
 * test in the suite would immediately loop on a 301 to https://localhost
 * and every response would carry a sticky HSTS pin that breaks re-runs.
 *
 * This spec exists to fail LOUDLY the moment that regression lands,
 * instead of letting the suite slowly degrade into a wall of
 * `net::ERR_TOO_MANY_REDIRECTS` failures that don't point at the cause.
 *
 * What this guards at the HTTP layer (not derivable from the pure unit):
 *   1. A plain GET to `/` returns 200 (NOT 301) on the dev server.
 *   2. The response does NOT carry `Strict-Transport-Security`.
 *   3. The response does NOT carry a `Location` header pointing at https.
 *
 * The e2e cannot verify the production (isDev=false) branch here — the
 * dev server has no TLS stand and is always isDev. That branch is
 * covered by the offline `php -r` checks against HttpsRedirectService
 * documented in the task report, plus the live external curl audit
 * (`curl -I http://slotbook.ru/`) that originally surfaced C-2.
 */
import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://localhost:8001';
const WORKER = process.env.TEST_PARALLEL_INDEX ?? '0';

test('dev server (isDev=true) does not HTTPS-redirect and does not emit HSTS', async ({ request }) => {
    const res = await request.get(`${BASE}/`, {
        // The X-Test-Worker header selects the per-worker DB scope. Not
        // strictly required for a header-only check, but it keeps this
        // request consistent with every other request the suite makes
        // and avoids surprising the worker-scope middleware.
        headers: { 'X-Test-Worker': WORKER },
        // Playwright follows redirects by default; force the raw response
        // so a stray 301 would surface as the actual status code rather
        // than the post-redirect 200.
        maxRedirects: 0,
    });

    // (1) NOT a 301 — the dev server must serve the page directly over HTTP.
    expect(
        res.status(),
        `dev server returned ${res.status()} — isDev gate on the HTTPS redirect is broken`,
    ).not.toBe(301);
    expect(
        res.status(),
        `dev server returned ${res.status()} — expected a normal 2xx/3xx-without-redirect response`,
    ).toBeLessThan(400);

    // (2) No HSTS header — would otherwise pin the browser to https for a
    // year and break every subsequent plaintext re-run against the dev
    // server. Header lookup is case-insensitive via headersArray().
    const allHeaders = res.headersArray();
    const hsts = allHeaders.find((h) => h.name.toLowerCase() === 'strict-transport-security');
    expect(
        hsts,
        `dev server emitted Strict-Transport-Security (${hsts?.value ?? ''}) — HSTS must be gated on !isDev`,
    ).toBeUndefined();

    // (3) No Location pointing at an https:// URL — even if some other
    // layer (framework, static-page redirect) legitimately emits a 3xx,
    // it must never be an HTTPS upgrade in dev.
    const location = allHeaders.find((h) => h.name.toLowerCase() === 'location');
    if (location) {
        expect(
            location.value,
            `dev server Location points at https in dev — HTTPS upgrade is not gated on isDev`,
        ).not.toMatch(/^https:\/\//i);
    }
});
