/**
 * Regression: the auth island must hydrate WITHOUT a React #130
 * ("element type is invalid … got: undefined") under concurrent load.
 *
 * Root cause it guards against: importing a React component module
 * (GlobalToast) into the low-level API layer (maintenance503 → asyncJsonThen /
 * sendPostFormData) dragged React/JSX into the deepest shared chunk, which
 * broke island hydration on the auth / registration pages — but ONLY under
 * concurrent chunk loading, so a single page load often slipped through. We
 * open several contexts at once (the condition that made it deterministic) and
 * assert every auth island mounts and none emits React #130.
 *
 * Self-contained (main-tests project): no auth state, opens its own contexts.
 */
import { test, expect } from './helpers/scoped-test';
import { newScopedContext } from './helpers/scoped-test';

const REACT_130 = /Minified React error #130|element type is invalid/i;

test('auth island hydrates under concurrent load — no React #130', async ({ browser }) => {
    const N = 8;
    const contexts = await Promise.all(Array.from({ length: N }, () => newScopedContext(browser)));
    try {
        // Warm the server-side Twig template cache with ONE sequential request
        // first — otherwise the concurrent burst below races the cold first
        // compile (a separate FilesystemCache write contention, not #130).
        const warm = await contexts[0].newPage();
        await warm.goto('/balance');
        await expect(warm.locator('[data-test-id="auth-login-input"]')).toBeVisible({ timeout: 15000 });
        await warm.close();

        const errorBatches = await Promise.all(contexts.map(async (ctx) => {
            const page = await ctx.newPage();
            const errors: string[] = [];
            page.on('pageerror', (e) => errors.push(String(e?.message ?? e)));
            // Logged-out /balance renders the Auth2 island (auth-login-input).
            await page.goto('/balance');
            // If the island crashed (#130) its input never renders → this fails too.
            await expect(page.locator('[data-test-id="auth-login-input"]')).toBeVisible({ timeout: 15000 });
            return errors;
        }));

        const reactErrors = errorBatches.flat().filter((e) => REACT_130.test(e));
        expect(reactErrors, `auth island crashed with React #130:\n${reactErrors.join('\n')}`).toHaveLength(0);
    } finally {
        await Promise.all(contexts.map((c) => c.close()));
    }
});
