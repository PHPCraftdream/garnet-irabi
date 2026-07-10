import type {AutoContext} from './supportTypes';
import {D} from '@common/Debug/D';

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

export function initAutoContext(): void {
    if (initialized) return;
    initialized = true;
    D('support.context', 'init');

    // Capture JS errors
    window.addEventListener('error', (e) => {
        if (jsErrors.length >= MAX_JS_ERRORS) jsErrors.shift();
        jsErrors.push({
            message: e.message || 'Unknown error',
            source: e.filename ? `${e.filename}:${e.lineno}` : undefined,
            time: Date.now(),
        });
    });

    window.addEventListener('unhandledrejection', (e) => {
        if (jsErrors.length >= MAX_JS_ERRORS) jsErrors.shift();
        const msg = e.reason instanceof Error ? e.reason.message : String(e.reason);
        jsErrors.push({ message: msg, time: Date.now() });
    });

    // Capture network errors via fetch intercept
    const origFetch = window.fetch;
    window.fetch = function (...args) {
        return origFetch.apply(window, args).then(
            (response) => {
                if (response.status >= 400) {
                    if (netErrors.length >= MAX_NET_ERRORS) netErrors.shift();
                    netErrors.push({
                        url: response.url,
                        status: response.status,
                        time: Date.now(),
                    });
                }
                return response;
            },
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
    breadcrumb.push({ url: location.href, time: Date.now() });

    const origPushState = history.pushState;
    history.pushState = function (...args) {
        const result = origPushState.apply(this, args);
        if (breadcrumb.length >= MAX_BREADCRUMB) breadcrumb.shift();
        breadcrumb.push({ url: location.href, time: Date.now() });
        return result;
    };

    window.addEventListener('popstate', () => {
        if (breadcrumb.length >= MAX_BREADCRUMB) breadcrumb.shift();
        breadcrumb.push({ url: location.href, time: Date.now() });
    });
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
