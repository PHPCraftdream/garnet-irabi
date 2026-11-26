import type {AutoContext} from '@/Islands/Comms/Support/parts/supportTypes';
import {D} from '@common/Support/Debug/D';
import {breadcrumb} from '@/Islands/Comms/Support/parts/thread/errors/breadcrumb';
import {jsErrors} from '@/Islands/Comms/Support/parts/thread/errors/jsErrors';
import {netErrors} from '@/Islands/Comms/Support/parts/thread/errors/netErrors';

/** Собирает снимок контекста страницы при создании обращения. */
export function collectContext(): AutoContext {
    const fiveMinAgo = Date.now() - 5 * 60 * 1000;
    const oneMinAgo = Date.now() - 60 * 1000;

    const ctx: AutoContext = {
        url: location.href,
        referrer: document.referrer,
        userAgent: navigator.userAgent,
        viewport: {width: window.innerWidth, height: window.innerHeight},
        language: navigator.language,
        timestamp: Date.now(),
        jsErrors: jsErrors.filter(error => error.time >= fiveMinAgo),
        netErrors: netErrors.filter(error => error.time >= oneMinAgo),
        breadcrumb: [...breadcrumb],
    };
    D('support.context', {jsErrors: ctx.jsErrors.length, netErrors: ctx.netErrors.length,
        breadcrumb: ctx.breadcrumb.length});
    return ctx;
}
