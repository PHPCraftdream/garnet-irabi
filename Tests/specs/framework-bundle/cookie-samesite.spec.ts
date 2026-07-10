/**
 * Regression: auth cookies must be SameSite=Lax so they survive the cross-site
 * top-level navigation from a webmail magic-link click (gmail.com → example.com).
 *
 * The Cookie class defaults to SameSite=Strict. The session cookie overrode that
 * to Lax long ago, but the CSRF_TOKEN cookie did NOT — so on an email-link click
 * the session arrived while the CSRF cookie was dropped, and the page's token
 * disagreed with the cookie the browser replayed on the next same-site POST →
 * "CSRF token validation failed", and sign-in from email was impossible.
 *
 * This guards every auth cookie at the HTTP level (the actual Set-Cookie the
 * server emits), so a future cookie added without SameSite=Lax — or a regression
 * back to Strict — fails immediately.
 */
import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://localhost:8001';
const WORKER = process.env.TEST_PARALLEL_INDEX ?? '0';

// Cookies that ride the auth flow and therefore MUST be Lax (not Strict/None),
// or a magic-link click from webmail drops them.
const MUST_BE_LAX = ['session', 'CSRF_TOKEN'];

test('auth cookies are SameSite=Lax (survive webmail magic-link navigation)', async ({ request }) => {
    // The consent "start-session" POST is the point where both the session and
    // the CSRF cookie are (re)minted.
    const res = await request.post(`${BASE}/system/`, {
        form: { action: 'start-session', consent_pd: '1' },
        headers: { 'X-Test-Worker': WORKER },
    });

    const setCookies = res.headersArray()
        .filter((h) => h.name.toLowerCase() === 'set-cookie')
        .map((h) => h.value);

    for (const name of MUST_BE_LAX) {
        const cookie = setCookies.find((c) => new RegExp(`^${name}=`).test(c));
        expect(cookie, `${name} cookie should be set by start-session`).toBeTruthy();
        expect(cookie!, `${name} must be SameSite=Lax`).toMatch(/;\s*SameSite=Lax/i);
        expect(cookie!, `${name} must NOT be SameSite=Strict (drops on email-link nav)`).not.toMatch(/SameSite=Strict/i);
    }
});
