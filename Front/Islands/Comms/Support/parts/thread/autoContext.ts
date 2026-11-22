import type {AutoContext} from '../supportTypes';
import {D} from '@common/Support/Debug/D';

/**
 * Auto-context collector for support tickets.
 * Captures browser info, JS errors, network errors, and navigation breadcrumb.
 * Runs in production — not debug-mode dependent.
 */

const MAX_JS_ERRORS = 50;
const MAX_NET_ERRORS = 20;
const MAX_BREADCRUMB = 10;

// Accumulated data
const jsErrors: { message: string; source?: string; time: number }[] = [];
const netErrors: { url: string; status: number; time: number }[] = [];
const breadcrumb: { url: string; time: number }[] = [];

let initialized = false;

function captureError(event: ErrorEvent): void {
    if (jsErrors.length >= MAX_JS_ERRORS) jsErrors.shift();
    jsErrors.push({
        message: event.message || 'Unknown error',
        source: event.filename ? `${event.filename}:${event.lineno}` : undefined,
        time: Date.now(),
    });
}

function captureRejection(event: PromiseRejectionEvent): void {
    if (jsErrors.length >= MAX_JS_ERRORS) jsErrors.shift();
    const message = event.reason instanceof Error ? event.reason.message : String(event.reason);
    jsErrors.push({message, time: Date.now()});
}

function captureResponse(response: Response): Response {
    if (response.status >= 400) {
        if (netErrors.length >= MAX_NET_ERRORS) netErrors.shift();
        netErrors.push({url: response.url, status: response.status, time: Date.now()});
    }
    return response;
}

function recordNavigation(): void {
    if (breadcrumb.length >= MAX_BREADCRUMB) breadcrumb.shift();
    breadcrumb.push({url: location.href, time: Date.now()});
}

export function initAutoContext(): void {
    if (initialized) return;
    initialized = true;
    D('support.context', 'init');

    window.addEventListener('error', captureError);
    window.addEventListener('unhandledrejection', captureRejection);

    // Capture network errors via fetch intercept
    const origFetch = window.fetch;
    window.fetch = function (...args) {
        return origFetch.apply(window, args).then(
            captureResponse,
            (err) => {
                if (netErrors.length >= MAX_NET_ERRORS) netErrors.shift();
                netErrors.push({
                    url: typeof args[0] === 'string' ? args[0] : '(unknown)',
                    status: 0,
                    time: Date.now(),
                });
                throw err;
            },
        );
    };

    // Track navigation breadcrumb
    recordNavigation();

    const origPushState = history.pushState;
    history.pushState = function (...args) {
        const result = origPushState.apply(this, args);
        recordNavigation();
        return result;
    };

    window.addEventListener('popstate', recordNavigation);
}

/**
 * Collect current context snapshot. Call when creating a ticket.
 */
export function collectContext(): AutoContext {
    const fiveMinAgo = Date.now() - 5 * 60 * 1000;
    const oneMinAgo = Date.now() - 60 * 1000;

    const ctx: AutoContext = {
        url: location.href,
        referrer: document.referrer,
        userAgent: navigator.userAgent,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        language: navigator.language,
        timestamp: Date.now(),
        jsErrors: jsErrors.filter((e) => e.time >= fiveMinAgo),
        netErrors: netErrors.filter((e) => e.time >= oneMinAgo),
        breadcrumb: [...breadcrumb],
    };
    D('support.context', {jsErrors: ctx.jsErrors.length, netErrors: ctx.netErrors.length, breadcrumb: ctx.breadcrumb.length});
    return ctx;
}
