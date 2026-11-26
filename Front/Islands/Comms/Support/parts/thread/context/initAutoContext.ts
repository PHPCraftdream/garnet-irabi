import {D} from '@common/Support/Debug/D';
import {jsErrors} from '@/Islands/Comms/Support/parts/thread/errors/jsErrors';
import {netErrors} from '@/Islands/Comms/Support/parts/thread/errors/netErrors';
import {breadcrumb} from '@/Islands/Comms/Support/parts/thread/errors/breadcrumb';


const MAX_JS_ERRORS = 50;
const MAX_NET_ERRORS = 20;
const MAX_BREADCRUMB = 10;

let initialized = false;

/** Сохраняет сведения об ошибке. */
function captureError(event: ErrorEvent): void {
    if (jsErrors.length >= MAX_JS_ERRORS) jsErrors.shift();
    jsErrors.push({
        message: event.message || 'Unknown error',
        source: event.filename ? `${event.filename}:${event.lineno}` : undefined,
        time: Date.now(),
    });
}

/** Сохраняет сведения об отклонённом запросе. */
function captureRejection(event: PromiseRejectionEvent): void {
    if (jsErrors.length >= MAX_JS_ERRORS) jsErrors.shift();
    const message = event.reason instanceof Error ? event.reason.message : String(event.reason);
    jsErrors.push({message, time: Date.now()});
}

/** Сохраняет сведения об ответе сервера. */
function captureResponse(response: Response): Response {
    if (response.status >= 400) {
        if (netErrors.length >= MAX_NET_ERRORS) netErrors.shift();
        netErrors.push({url: response.url, status: response.status, time: Date.now()});
    }
    return response;
}

/** Записывает переход по странице. */
function recordNavigation(): void {
    if (breadcrumb.length >= MAX_BREADCRUMB) breadcrumb.shift();
    breadcrumb.push({url: location.href, time: Date.now()});
}

/** Сохраняет сетевую ошибку и пробрасывает исходное исключение. */
function captureFetchError(args: Parameters<typeof fetch>, error: unknown): never {
    if (netErrors.length >= MAX_NET_ERRORS) netErrors.shift();
    netErrors.push({
        url: typeof args[0] === 'string' ? args[0] : '(unknown)',
        status: 0,
        time: Date.now(),
    });
    throw error;
}

/** Запускает сбор контекста страницы. */
export function initAutoContext(): void {
    if (initialized) return;
    initialized = true;
    D('support.context', 'init');

    window.addEventListener('error', captureError);
    window.addEventListener('unhandledrejection', captureRejection);

    // Capture network errors via fetch intercept
    const origFetch = window.fetch;
    window.fetch = function (...args) {
        return origFetch.apply(window, args).then(captureResponse, error => captureFetchError(args, error));
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
