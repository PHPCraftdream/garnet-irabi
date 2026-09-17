/**
 * Островки и сорванный чанк: страница не должна оставаться мёртвой молча.
 *
 * `createIsland` грузит код островка по требованию (`import()`), и раньше у
 * этого промиса не было `.catch()`: сорванный запрос чанка означал, что
 * островок просто не смонтируется — ни повтора, ни сообщения, на экране
 * серверная разметка без интерактива. Под burst'ом запросов шейред-хостинг
 * отвечает именно так: документ отдаёт, а js/css срывает (так флейкал
 * D-221, и там же это нашлось). ErrorBoundary не помогает — он оборачивает
 * УЖЕ отрендеренный компонент.
 *
 * Проверяем обе половины нового поведения на реальном чанке, который
 * находим сами: один сорванный запрос островок переживает (повтор), а если
 * чанк не приходит совсем — об этом уходит запись с ИМЕНЕМ островка, а не
 * безымянный unhandledrejection.
 */
import { test, expect } from '../../../helpers/scoped-test';
import { newScopedContext } from '../../../helpers/scoped-test';
import type { BrowserContext } from '@playwright/test';

/** Гостевая страница, на которой рендерится островок авторизации. */
const GUEST_PAGE = '/balance';
const ISLAND_INPUT = '[data-test-id="auth-login-input"]';
/** Строка, по которой узнаём чанк островка среди прочих. */
const ISLAND_MARKER = 'auth-login-input';
/** Точки входа: их грузит сама страница, к отложенным чанкам они не относятся. */
const ENTRY_CHUNK = /\/gen\/js\/(auth|framework|foreground|vendor-[a-z]+|gridtable|yandextarget)\./;

let ctx: BrowserContext;
let islandChunk = '';

test.describe('createIsland: сорванный чанк', () => {
    test.describe.configure({ mode: 'serial' });

    test.beforeAll(async ({ browser }) => {
        // Свой контекст без сохранённой сессии: островок авторизации
        // рендерится только гостю.
        ctx = await newScopedContext(browser);
    });

    test.afterAll(async () => {
        await ctx?.close();
    });

    test('найти чанк островка по его содержимому, а не по имени', async () => {
        const page = await ctx.newPage();
        const seen: string[] = [];
        page.on('request', (r) => {
            if (/\.gen\.js(\?|$)/.test(r.url())) {
                seen.push(r.url());
            }
        });

        await page.goto(GUEST_PAGE);
        await expect(page.locator(ISLAND_INPUT)).toBeVisible({ timeout: 30000 });

        // Имена отложенных чанков — числовые и меняются от сборки к сборке,
        // поэтому ищем по маркеру внутри, а не по имени файла.
        for (const url of seen) {
            if (ENTRY_CHUNK.test(url)) {
                continue;
            }
            const body = await page.request.get(url).then((r) => r.text()).catch(() => '');

            if (body.includes(ISLAND_MARKER)) {
                islandChunk = url;
                break;
            }
        }
        await page.close();

        // Если код островка оказался в точке входа, отдельного запроса нет и
        // проверять нечего — честнее сказать это, чем утверждать неверное.
        test.skip(islandChunk === '', 'код островка не в отложенном чанке — повторять нечего');
        expect(islandChunk).toContain('.gen.js');
    });

    test('один сорванный запрос островок переживает', async () => {
        test.skip(islandChunk === '', 'чанк островка не найден');

        const page = await ctx.newPage();
        let aborts = 0;
        await page.route(islandChunk, async (route) => {
            if (aborts === 0) {
                aborts++;
                await route.abort('failed');

                return;
            }
            await route.continue();
        });

        await page.goto(GUEST_PAGE);
        // Смонтировался — значит повторная попытка импорта сработала.
        await expect(page.locator(ISLAND_INPUT)).toBeVisible({ timeout: 30000 });
        expect(aborts, 'запрос чанка так и не был сорван — проверка ничего не проверила').toBe(1);
        await page.close();
    });

    test('чанк не пришёл совсем — уходит запись с именем островка', async () => {
        test.skip(islandChunk === '', 'чанк островка не найден');

        const page = await ctx.newPage();
        const reports: string[] = [];
        page.on('request', (r) => {
            if (r.url().includes('/js-error/~report')) {
                reports.push(r.postData() ?? '');
            }
        });
        await page.route(islandChunk, (route) => route.abort('failed'));

        await page.goto(GUEST_PAGE);

        // Сообщение называет островок: безымянное «Loading chunk 1052 failed»
        // не говорит, какая часть страницы осталась мёртвой.
        await expect.poll(() => reports.join('\n'), { timeout: 25000 }).toContain('did not mount');
        // И островка на экране действительно нет — ради этого и запись.
        await expect(page.locator(ISLAND_INPUT)).toBeHidden();
        await page.close();
    });
});
