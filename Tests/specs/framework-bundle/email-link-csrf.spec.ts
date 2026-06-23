/**
 * Regression: signing in from an email magic-link must work even when the CSRF
 * cookie is dropped on the cross-site navigation from a webmail client.
 *
 * Root cause it guards: the auth page deliberately doesn't mint CSRF on a plain
 * GET (consent-gating). But the code-entry phases are reached only AFTER consent
 * (you requested a code), and the magic-link auto-verify POSTs the moment that
 * page loads. If the CSRF cookie didn't survive the cross-site nav, peekCSRF
 * returned '' → no token injected → the auto-verify failed CSRF and sign-in from
 * email was impossible. The fix mints a fresh CSRF token when rendering a code
 * phase. This test reproduces "session present, CSRF cookie absent" and asserts
 * the code page mints + injects a token.
 */
import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://localhost:8001';
const WORKER = process.env.TEST_PARALLEL_INDEX ?? '0';
const HDR = { 'X-Test-Worker': WORKER };

test('code-phase auth page mints CSRF without a prior CSRF cookie (email-link sign-in)', async ({ playwright }) => {
    const ctx = await playwright.request.newContext({ baseURL: BASE, extraHTTPHeaders: HDR });
    try {
        // 1. Consent → mints session + CSRF, returns the token.
        const ss = await ctx.post('/system/', { data: { action: 'start-session', consent_pd: '1' } });
        const { csrf } = await ss.json();
        expect(csrf, 'start-session returns a csrf token').toBeTruthy();

        // 2. Request a code → session advances to the code-entry phase.
        await ctx.post('/system/', { data: { auth_email: `csrftest_${WORKER}@example.com`, CSRF_TOKEN: csrf } });

        // Grab the session cookie so we can replay WITHOUT the CSRF cookie.
        const state = await ctx.storageState();
        const session = state.cookies.find((c) => c.name === 'session');
        expect(session, 'session cookie present').toBeTruthy();

        // 3. Fresh context carrying ONLY the session cookie — i.e. the CSRF
        //    cookie was dropped on the cross-site email-link navigation.
        const ctx2 = await playwright.request.newContext({
            baseURL: BASE,
            extraHTTPHeaders: { ...HDR, Cookie: `session=${session!.value}` },
        });
        try {
            const res = await ctx2.get('/system/');
            const body = await res.text();
            const setCookies = res.headersArray()
                .filter((h) => h.name.toLowerCase() === 'set-cookie')
                .map((h) => h.value);

            // We really are on the code page (so the auto-verify would fire) …
            expect(body, 'reached the code-entry phase').toContain('"phase":"INPUT_CODE"');
            // … and a CSRF token was minted + injected for the auto-verify …
            expect(body, 'CSRF token injected for the auto-verify').toMatch(/window\.__GARNET_CSRF__ = "[A-Za-z0-9]+"/);
            // … and the fresh cookie is itself Lax.
            expect(
                setCookies.some((c) => /^CSRF_TOKEN=/.test(c) && /SameSite=Lax/i.test(c)),
                'a fresh SameSite=Lax CSRF_TOKEN cookie is set',
            ).toBe(true);
        } finally {
            await ctx2.dispose();
        }
    } finally {
        await ctx.dispose();
    }
});
