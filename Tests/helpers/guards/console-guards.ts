/**
 * Centralised browser-console + uncaught-error guards.
 *
 * One call to `attachConsoleGuards(ctx)` per BrowserContext is all the
 * spec ever needs — every page that context spawns (now or later) is
 * automatically wired up. Accumulated issues are picked up in the
 * global test.afterEach inside scoped-test.ts; specs themselves stay
 * untouched.
 *
 * What's caught:
 *   - `page.on('pageerror')` — uncaught JS exceptions inside the page.
 *   - `page.on('console')` with type 'error' or 'warning'.
 *
 * Allowlist: edit ALLOWLIST below to silence known noise. Each entry
 * is a regex tested against the issue's text. Keep this list tight —
 * the whole point is that real warnings fail the build.
 */
import type { BrowserContext, ConsoleMessage, Page } from '@playwright/test';

export interface ConsoleIssue {
    type: 'pageerror' | 'console.error' | 'console.warning';
    text: string;
    stack?: string;
    location?: string;
    pageUrl: string;
}

// Known false positives. Add a regex only when you're certain the
// message is unfixable noise. Real product warnings stay loud.
const ALLOWLIST: RegExp[] = [
    // Chromium logs every XHR/fetch with a non-2xx response as
    // console.error. Tests that intentionally exercise error paths
    // (404 on nonexistent IDs, 403 on unauthorised access) trip this.
    // Allow 4xx — those are deliberate client-error contracts — but
    // keep 5xx (real server failures) blocking.
    /Failed to load resource: the server responded with a status of 4\d{2} \(/,
    // Tests in js-errors-flow.spec.ts deliberately throw to verify
    // the frontend→backend→admin-grid pipeline. The marker carries
    // the test's timestamp suffix so it never collides with real
    // product errors.
    /e2e-jserror-marker-/,
    // Server-Sent Events (EventSource — e.g. the admin dashboard's
    // `/__garnet/api/exec` command stream) log a network error when the
    // long-lived chunked connection is torn down: on navigation, context
    // close, or reconnect after the stream ends. This is inherent to
    // EventSource teardown, not a product fault. It was flaking unrelated
    // tests non-deterministically via the cross-context console scan.
    /Failed to load resource: net::ERR_INCOMPLETE_CHUNKED_ENCODING/,
];

const PAGE_ISSUES = new WeakMap<Page, ConsoleIssue[]>();
const TRACKED_CONTEXTS = new Set<BrowserContext>();

function isAllowed(text: string): boolean {
    return ALLOWLIST.some((re) => re.test(text));
}

function attachToPage(page: Page): void {
    if (PAGE_ISSUES.has(page)) return;
    const issues: ConsoleIssue[] = [];
    PAGE_ISSUES.set(page, issues);

    page.on('pageerror', (err: Error) => {
        const text = err.message ?? String(err);
        if (isAllowed(text)) return;
        issues.push({
            type: 'pageerror',
            text,
            stack: err.stack,
            pageUrl: page.url(),
        });
    });

    page.on('console', (msg: ConsoleMessage) => {
        const t = msg.type();
        if (t !== 'error' && t !== 'warning') return;
        const text = msg.text();
        if (isAllowed(text)) return;
        const loc = msg.location();
        issues.push({
            type: t === 'error' ? 'console.error' : 'console.warning',
            text,
            location: loc?.url ? `${loc.url}:${loc.lineNumber}:${loc.columnNumber}` : undefined,
            pageUrl: page.url(),
        });
    });
}

/**
 * Wire guards onto a context. Idempotent. Every existing and future
 * page in this context will be tracked until the context closes.
 */
export function attachConsoleGuards(ctx: BrowserContext): void {
    if (TRACKED_CONTEXTS.has(ctx)) return;
    TRACKED_CONTEXTS.add(ctx);

    ctx.on('page', (page) => attachToPage(page));
    for (const page of ctx.pages()) attachToPage(page);

    ctx.on('close', () => {
        TRACKED_CONTEXTS.delete(ctx);
    });
}

/**
 * Collect every issue accumulated since the last call, then clear the
 * buffers. Called from the global test.afterEach hook in scoped-test.ts.
 */
export function collectAndResetIssues(): ConsoleIssue[] {
    const all: ConsoleIssue[] = [];
    for (const ctx of TRACKED_CONTEXTS) {
        for (const page of ctx.pages()) {
            const issues = PAGE_ISSUES.get(page);
            if (issues && issues.length) {
                all.push(...issues);
                issues.length = 0;
            }
        }
    }
    return all;
}

export function formatIssues(issues: ConsoleIssue[]): string {
    return issues.map((i, idx) => {
        const head = `[${i.type}] ${i.text}`;
        const loc = i.location ? `\n    at ${i.location}` : '';
        const url = `\n    page: ${i.pageUrl}`;
        const stack = i.stack
            ? `\n${i.stack.split('\n').slice(0, 5).map((s) => '    ' + s).join('\n')}`
            : '';
        return `  ${idx + 1}. ${head}${loc}${url}${stack}`;
    }).join('\n');
}
