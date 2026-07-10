/**
 * Unified role login that works in BOTH local-dev and prod (PW_PROD) runs.
 *
 * Local dev: POST `/dev-login` (the fast role shortcut) — unchanged.
 *
 * Prod: there is no `/dev-login` on the server, so we drive the REAL
 * passwordless email flow against the same `@dev.test` role accounts that
 * `test:provision` seeds (admin@dev.test, expert1@dev.test, …). They have the
 * right flags (DevSeedService sets them) and end in `.test`, so under an
 * active TestScope `IrabiAuthMiddleware` auto-completes the code step — one
 * submit logs in. Because it's the same account the dev `/dev-login` role maps
 * to, every downstream assertion in the spec still holds.
 *
 * Cross-role specs used to inline their own `fetch('/dev-login')`; they now
 * call `roleLogin(page, role)` so the prod path is handled centrally.
 */
import { Page } from '@playwright/test';
import { isProd } from './ssh-bridge';

/** Prod email login per role — mirrors DevLoginController's role→login map. */
const PROD_ROLE_LOGIN: Record<string, string> = {
    admin:     'admin@dev.test',
    owner:     'owner@dev.test',
    moderator: 'moderator@dev.test',
    expert:    'expert1@dev.test',
    user:      'user1@dev.test',
};

// Protected route that forces the auth widget to render (public `/` is a
// landing page). Override via PW_PROD_AUTH_PATH if the app moves it.
const AUTH_PATH = process.env.PW_PROD_AUTH_PATH ?? '/system/';

/**
 * Drive the real `.test` email auto-login through the auth widget. The page is
 * left authenticated (the widget unmounts on success).
 */
export async function emailLogin(page: Page, login: string): Promise<void> {
    // Always start from a logged-out state. Cross-role specs reuse one
    // context to switch roles (devLoginOnContext) — if the context already
    // holds a session, the auth widget never renders and `auth-login-input`
    // times out. Clearing cookies forces the server to show the login form.
    // Scope routing is header-based (run-test-garnet-team + X-Test-Worker),
    // not cookie-based, so it survives the clear. The previous role's session
    // row on the server is simply abandoned (not logged out / not deleted),
    // so it never disturbs another context that shares that role.
    await page.context().clearCookies();
    await page.goto(AUTH_PATH);

    const input = page.locator('[data-test-id="auth-login-input"]');
    await input.waitFor({ state: 'visible', timeout: 20000 });
    await input.fill(login);

    // 152-ФЗ consent gate mints CSRF + enables submit.
    await page.locator('[data-test-id="auth-consent-pd"]').check();
    await page.waitForFunction(() => {
        const b = document.querySelector('[data-test-id="auth-submit-btn"]') as HTMLButtonElement | null;
        return !!b && !b.disabled;
    }, { timeout: 8000 });

    await page.locator('[data-test-id="auth-submit-btn"]').click();
    await page.waitForFunction(
        () => document.querySelector('[data-test-id="auth-submit-btn"]') === null,
        { timeout: 30000 },
    );
}

/**
 * Log `page` in as `role`. Prod → email auto-login; dev → `/dev-login` POST.
 * Leaves the page on `/`, matching the old inline helpers' contract.
 */
export async function roleLogin(page: Page, role: string): Promise<void> {
    if (isProd()) {
        const login = PROD_ROLE_LOGIN[role];
        if (!login) {
            throw new Error(`roleLogin: no prod email-login mapping for role "${role}"`);
        }
        await emailLogin(page, login);
    } else {
        // The dev-login POST is issued from the page context with a relative
        // URL, so the page must already be on the app origin — a freshly
        // created page is about:blank, where `fetch('/dev-login')` throws
        // "Failed to parse URL". Navigate first when needed.
        if (!/^https?:/.test(page.url())) {
            await page.goto('/');
        }
        const resp = await page.evaluate(async (r: string) => {
            const fd = new FormData();
            fd.append('role', r);
            const res = await fetch('/dev-login', { method: 'POST', body: fd });
            return { ok: res.ok, status: res.status, body: await res.json().catch(() => null) };
        }, role);
        if (!resp.ok || !(resp.body as any)?.success) {
            throw new Error(`dev-login failed for ${role}: ${JSON.stringify(resp)}`);
        }
    }
    await page.goto('/');
}
