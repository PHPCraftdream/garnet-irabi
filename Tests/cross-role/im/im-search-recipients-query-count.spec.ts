/**
 * Perf regression, release review F-03 (P1): ImController::searchRecipients()
 * used to call UserEntityConfig::isApprovedActiveExpert() once PER expert
 * profile in the candidate set. Each call did its own `Account::getAccounts()`
 * round trip, which in turn read `DbAccountData::getAllUsersData()` — a full,
 * unfiltered scan of the ENTIRE `accounts_data` table — so one recipient
 * search cost roughly `2 * N` SQL statements (N = number of experts) and
 * re-parsed the whole `accounts_data` table N times.
 *
 * The fix (see ImController.php::searchRecipients()) batches the
 * approved/active-expert lookup into a single `Account::getAccounts()` call
 * covering the whole candidate id set (`WHERE id IN (...)`), so the query
 * count for the expert-eligibility check no longer depends on N.
 *
 * This spec proves the fix by measuring the SQL statement volume of a
 * single `~searchRecipients` call BEFORE and AFTER seeding a large batch of
 * additional synthetic expert accounts into this worker's isolated tables,
 * and asserting the extra cost of the large batch is small and bounded —
 * not proportional to how many experts were added.
 *
 * ── Чем мерим (переделано после ложной тревоги) ───────────────────────
 * Стоимость запроса называет сам сервер: заголовок `X-Garnet-Db-Queries`
 * (фреймворк alpha73 — DbPool считает свои запросы, IoRunWeb отдаёт
 * разницу за один запрос). Заголовок появляется только в авторизованном
 * тестовом контуре (`.allow_tests` + `run-test-garnet-team`) или в
 * каталоге разработки, на боевом трафике его нет.
 *
 * До этого мерили глобальный счётчик MySQL `Questions` до и после вызова.
 * Счётчик общий на сервер, а прогон идёт параллельными воркерами по одной
 * базе — и в замер попадали чужие запросы. Защитой от этого был минимум
 * из нескольких попыток, и он не выдержал: на полном боевом прогоне вышло
 * +2483 запроса против эталонных 94, ВСЕ пять попыток оказались
 * заражены, и проверка отрапортовала об N+1-регрессии, которой не было
 * (повтор прошёл чисто). Для проверки, чья работа — отличать регрессию от
 * фона, это худший вид падения: она врёт именно там, где ей верят.
 *
 * Эмпирика на прежнем способе замера остаётся верной как порядок величин:
 * один вызов стоил ~49 запросов, а старая схема с проверкой каждого
 * кандидата по отдельности добавляла ровно 2 запроса на эксперта (+100 на
 * 50 экспертов). Порог ниже (< 20 лишних запросов на +LARGE_N экспертов)
 * стоит далеко под этими 100 и заметно выше горстки законных запросов
 * батчевой проверки, не зависящей от N.
 *
 * Отдельный проект `cross-role-query-count` с `workers: 1` в
 * playwright.config.ts теперь нужен не для чистоты замера (она больше не
 * зависит от соседей), а лишь чтобы сеяние 50 аккаунтов не шло
 * одновременно с другими cross-role проверками по тем же таблицам.
 */
import { test, expect, tn } from '../../helpers/scoped-test';
import { newScopedContext } from '../../helpers/scoped-test';
import { withConnection } from '../../helpers/db/db';
import { roleLogin } from '../../helpers/auth/role-login';
import type { BrowserContext, Page } from '@playwright/test';

const LARGE_N = 50;

// Old N+1 code cost ~2 extra statements per candidate expert. The fixed
// code's per-request cost is independent of N, so allow generous headroom
// above legitimate constant-ish overhead while staying far below what
// LARGE_N experts would add under the old code (~2 * LARGE_N = 100).
const MAX_ALLOWED_EXTRA_STATEMENTS = 20;

// Defense-in-depth against residual cross-project `Questions` noise (see
// docblock above) — repeat the before/after pair this many times and keep
// the MINIMUM observed extraStatements. A real N+1 regression reproduces
// on every trial; transient noise from another project's concurrent
// traffic does not reliably hit the noise floor on all of them.
const TRIALS = 5;

async function getAccountId(login: string): Promise<number> {
    return withConnection(async (c) => {
        const [rows] = await c.execute<any[]>(`SELECT id FROM ${tn('accounts')} WHERE login = ?`, [login]);
        return rows[0]?.id ?? 0;
    });
}

/** Seed `count` synthetic approved+active expert accounts, return their ids. */
async function seedExperts(prefix: string, count: number): Promise<number[]> {
    return withConnection(async (c) => {
        const ids: number[] = [];
        for (let i = 0; i < count; i++) {
            const login = `${prefix}-${i}@dev.test`;
            const [res]: any = await c.execute(
                `INSERT INTO ${tn('accounts')} (login, login_type, type, name) VALUES (?, 'email', 'expert', ?)`,
                [login, `${prefix} Expert ${i}`],
            );
            const id = res.insertId;
            ids.push(id);

            await c.execute(
                `INSERT INTO ${tn('accounts_data')} (account_id, param, value)
                 VALUES (?, 'IS_APPROVED', '1'), (?, 'IS_DISABLED', '0')
                 ON DUPLICATE KEY UPDATE value = VALUES(value)`,
                [id, id],
            );
        }
        return ids;
    });
}

async function cleanupExperts(prefix: string, ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    await withConnection(async (c) => {
        const placeholders = ids.map(() => '?').join(',');
        await c.execute(`DELETE FROM ${tn('accounts_data')} WHERE account_id IN (${placeholders})`, ids);
        await c.execute(`DELETE FROM ${tn('accounts')} WHERE id IN (${placeholders})`, ids);
    });
}

/**
 * Один вызов `~searchRecipients` вместе с ценой, которую он стоил базе.
 *
 * Цену называет сам сервер заголовком `X-Garnet-Db-Queries` (DbPool
 * считает запросы, IoRunWeb отдаёт разницу за запрос; заголовок живёт
 * только в тестовом контуре и в каталоге разработки). До этого цену мерили
 * глобальным счётчиком MySQL `Questions` до и после вызова — см. шапку
 * файла: счётчик общий на сервер, и параллельные воркеры прогона попадали
 * в замер вместе с нами.
 */
async function searchRecipients(page: Page, query: string): Promise<{ status: number; body: any; queries: number }> {
    return page.evaluate(async (searchQuery) => {
        let csrf = '';
        document.querySelectorAll('[data-props]').forEach((el) => {
            try {
                const p = JSON.parse(el.getAttribute('data-props') || '{}');
                if (p.csrf) csrf = p.csrf;
            } catch {}
        });
        if (!csrf) csrf = (window as any).__GARNET_CSRF__ || '';

        const fd = new FormData();
        fd.append('query', searchQuery);
        fd.append('CSRF_TOKEN', csrf);
        const res = await fetch('/im/~searchRecipients', { method: 'POST', body: fd });
        const body = await res.json().catch(() => null);
        const header = res.headers.get('X-Garnet-Db-Queries');

        return { status: res.status, body, queries: header === null ? -1 : Number(header) };
    }, query);
}

test.describe('Perf F-03: searchRecipients() query count does not scale with candidate count', () => {
    test.describe.configure({ mode: 'serial' });

    let userCtx: BrowserContext;
    let userPage: Page;
    let largeIds: number[] = [];

    test.beforeAll(async ({ browser }) => {
        const context = await newScopedContext(browser);
        const page = await context.newPage();
        await page.goto('/');
        await roleLogin(page, 'user');
        await page.goto('/im/');
        userCtx = context;
        userPage = page;

        const userId = await getAccountId('user1@dev.test');
        expect(userId).toBeGreaterThan(0);
    });

    test.afterAll(async () => {
        await cleanupExperts('qcount-large', largeIds);
        await userCtx?.close().catch(() => {});
    });

    /** Стоимость одного вызова в запросах к базе — по слову сервера. */
    async function measureOnce(query: string): Promise<{ delta: number; body: any }> {
        const result = await searchRecipients(userPage, query);
        expect(result.status).toBe(200);
        expect(
            result.queries,
            'сервер не прислал X-Garnet-Db-Queries: либо тестовый контур не авторизован ' +
            '(нет .allow_tests или заголовка run-test-garnet-team), либо на хосте фреймворк ' +
            'старее alpha73 — без этого замерять нечем',
        ).toBeGreaterThanOrEqual(0);

        return { delta: result.queries, body: result.body };
    }

    test('adding many candidate experts does not proportionally increase query volume', async () => {
        // Эталон: стоимость одного вызова на том, что лежит в схеме
        // воркера. Берём минимум из TRIALS — не от шума (счётчик теперь
        // свой, а не общий на сервер), а от законной разницы между первым
        // и последующими запросами: первый может дописать сессию или
        // настройки, и это лишние запросы, не относящиеся к поиску.
        const baselineDeltas: number[] = [];
        for (let i = 0; i < TRIALS; i++) {
            baselineDeltas.push((await measureOnce('')).delta);
        }
        const deltaBaseline = Math.min(...baselineDeltas);

        // Теперь добавляем большую партию одобренных активных экспертов и
        // мерим ТОТ ЖЕ вызов. Если бы вернулась старая схема с проверкой
        // каждого кандидата по отдельности, цена выросла бы примерно на
        // 2 запроса на эксперта.
        largeIds = await seedExperts('qcount-large', LARGE_N);
        const largeDeltas: number[] = [];
        let largeIdsInResults: number[] = [];
        for (let i = 0; i < TRIALS; i++) {
            const { delta, body } = await measureOnce('');
            largeDeltas.push(delta);
            largeIdsInResults = (body?.recipients ?? []).map((r: any) => Number(r.id));
        }
        const deltaLarge = Math.min(...largeDeltas);
        for (const id of largeIds) {
            expect(largeIdsInResults).toContain(id);
        }

        const extraStatements = deltaLarge - deltaBaseline;
        expect(
            extraStatements,
            `Adding ${LARGE_N} candidate experts increased the search call's SQL statement ` +
            `count from ${deltaBaseline} to ${deltaLarge} (+${extraStatements}), using the best ` +
            `of ${TRIALS} trials each (baseline trials: [${baselineDeltas.join(', ')}], large ` +
            `trials: [${largeDeltas.join(', ')}]) — looks like an N+1 regression (old per-id ` +
            `isApprovedActiveExpert() loop cost ~2 statements/expert, i.e. would add ` +
            `~${LARGE_N * 2} here).`,
        ).toBeLessThan(MAX_ALLOWED_EXTRA_STATEMENTS);
    });
});
