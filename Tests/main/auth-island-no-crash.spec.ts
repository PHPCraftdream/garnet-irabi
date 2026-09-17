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
import { test, expect } from '../helpers/scoped-test';
import type { BrowserContext, Page } from '@playwright/test';
import { newScopedContext } from '../helpers/scoped-test';

const REACT_130 = /Minified React error #130|element type is invalid/i;

/** Ассет страницы: без css/js не будет ни стилей, ни островка. */
const ASSET = /\.(js|css)(\?|$)/i;

type Probe = {
    /** Необработанные ошибки страницы — среди них ищем React #130. */
    errors: string[];
    /** Сорванные и 4xx/5xx запросы ассетов: признак отказа хоста. */
    assetFailures: string[];
};

type Attempt = { probe: Probe; page: Page; failure?: Error };

/**
 * Один заход: открыть /balance и дождаться поля авторизации, записав по пути
 * ошибки страницы и судьбу запросов ассетов. Падение не бросается, а
 * возвращается — вызывающему нужно и оно, и собранные данные.
 */
async function attempt(ctx: BrowserContext): Promise<Attempt> {
    const page = await ctx.newPage();
    const probe: Probe = { errors: [], assetFailures: [] };

    page.on('pageerror', (e) => probe.errors.push(String(e?.message ?? e)));
    page.on('requestfailed', (r) => {
        if (ASSET.test(r.url())) {
            probe.assetFailures.push(`${r.failure()?.errorText ?? 'failed'} ${r.url()}`);
        }
    });
    page.on('response', (r) => {
        if (r.status() >= 400 && ASSET.test(r.url())) {
            probe.assetFailures.push(`HTTP ${r.status()} ${r.url()}`);
        }
    });

    try {
        // Logged-out /balance renders the Auth2 island (auth-login-input).
        await page.goto('/balance');
        // If the island crashed (#130) its input never renders → this fails too.
        // 30s, not 15s: 8 truly concurrent PHP-FPM requests against a
        // shared-hosting worker pool can legitimately queue past 15s under
        // load — that's host contention, not the React #130 this test
        // guards against. The regression signal is REACT_130 below, not
        // this deadline.
        await expect(page.locator('[data-test-id="auth-login-input"]')).toBeVisible({ timeout: 30000 });
        return { probe, page };
    } catch (e) {
        return { probe, page, failure: e as Error };
    }
}

/**
 * Заход с одним повтором — и повтор только тогда, когда хост отказал в
 * АССЕТАХ.
 *
 * Зачем различать. Burst из восьми контекстов с одного адреса шейред-хостинг
 * иногда обслуживает частично: документ отдаёт, а запрос css/js срывает (или
 * отвечает 4xx/5xx). На экране тогда голый каркас без стилей, поля
 * авторизации в DOM нет вовсе — `toBeVisible` падает с «element(s) not
 * found», и выглядит это как дефект островка, хотя островку просто нечего
 * было исполнить. Так этот файл и флейкал (D-221): падал первым заходом,
 * проходил с повтора, и ни одного React #130 при этом не возникало —
 * воспроизведено на проде, 1 из 3 заходов, скриншот показал страницу вообще
 * без стилей.
 *
 * Предмет проверки не ослаблен: если ассеты пришли, а островок не
 * смонтировался — падаем сразу, без повтора. И в сообщении теперь видно,
 * какие запросы сорвались, — раньше это приходилось узнавать из скриншота.
 */
async function loadAuthPageWithAssetRetry(ctx: BrowserContext): Promise<string[]> {
    const first = await attempt(ctx);
    const firstAssets = [...first.probe.assetFailures];
    const firstErrors = [...first.probe.errors];
    await first.page.close();

    if (!first.failure) {
        return firstErrors;
    }

    if (firstAssets.length === 0) {
        throw new Error(
            `${first.failure.message}\n`
            + 'Сорванных запросов ассетов не было — значит падение не про отказ хоста.',
        );
    }

    // Печатаем сразу: иначе доказательство отказа хоста видно только в
    // падении, а при успешном повторе исчезает вообще.
    console.log(`[auth-island] повтор: хост сорвал ассеты\n  ${firstAssets.join('\n  ')}`);

    const second = await attempt(ctx);
    const secondAssets = [...second.probe.assetFailures];
    const secondErrors = [...second.probe.errors];
    await second.page.close();

    if (second.failure) {
        throw new Error(
            `${second.failure.message}\n`
            + `Сорванные ассеты, заход 1:\n  ${firstAssets.join('\n  ')}\n`
            + `Сорванные ассеты, заход 2:\n  ${secondAssets.join('\n  ') || '(нет)'}`,
        );
    }

    return [...firstErrors, ...secondErrors];
}

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

        const errorBatches = await Promise.all(contexts.map((ctx) => loadAuthPageWithAssetRetry(ctx)));

        const reactErrors = errorBatches.flat().filter((e) => REACT_130.test(e));
        expect(reactErrors, `auth island crashed with React #130:\n${reactErrors.join('\n')}`).toHaveLength(0);
    } finally {
        await Promise.all(contexts.map((c) => c.close()));
    }
});
