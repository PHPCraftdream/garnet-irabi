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
 * Query-count signal: this codebase has no existing per-request query
 * counter (checked: no QueryLog/queryCount in the framework's Db layer, no
 * Kahlan spec or Playwright helper measuring this). MySQL's
 * `performance_schema` is enabled but the app DB user has no grants on it
 * (`SHOW GRANTS` → only `app_db.*`). The available signal without adding
 * new production instrumentation is the server's GLOBAL `Questions` status
 * counter (available to any user, no special grants), diffed tightly
 * around the single HTTP call. `Questions` — not `Com_select` — is used
 * deliberately: the framework's DB layer (Kernel\Db\Query\QueryEx) executes
 * everything through mysqli prepared statements, which increment
 * `Com_stmt_prepare`/`Com_stmt_execute`, NOT `Com_select` (verified
 * empirically). `Questions` is the umbrella counter that covers both plain
 * and prepared-statement execution, so it reliably reflects statement
 * volume regardless of how a given query path talks to MySQL.
 *
 * Empirically (measured directly against this dev instance, single
 * isolated worker, no concurrent traffic): the counter is exact and
 * repeatable for this endpoint — two consecutive baseline calls both
 * produced delta=49 with zero variance, and adding 50 synthetic experts to
 * the pre-fix (N+1) code raised the delta to 149 (+100, i.e. exactly the
 * expected 2 queries/expert). Against the fixed code the delta after
 * adding the same 50 experts should stay within single-digit noise of the
 * baseline. The threshold below (extra cost after +LARGE_N experts must be
 * under 20 statements) sits far below the ~100 the old N+1 code would add,
 * while comfortably above the handful of legitimate queries the fixed
 * batched lookup performs once regardless of N.
 *
 * ── Concurrency / flakiness note (follow-up review P2 fix) ─────────────
 * `Questions` is a GLOBAL, process-wide MySQL counter. The Playwright
 * suite runs `fullyParallel: true` against ONE SHARED MySQL instance —
 * worker isolation here is per-table-prefix only, not a separate DB
 * server per worker — so during the measurement window this counter also
 * picks up every OTHER concurrently-running test's queries, in this file
 * or anywhere else in the suite. That's a real source of both false
 * failures (unrelated noise inflates a delta) and false passes (noise
 * lands in the "before" sample instead of "after", making the delta look
 * artificially small).
 *
 * Two mitigations, layered:
 *   1. This spec is split into its own Playwright PROJECT
 *      (`cross-role-query-count` in playwright.config.ts) with a
 *      per-project `workers: 1` cap, so it no longer shares a worker pool
 *      with the other ~20 `cross-role` specs (previously the single
 *      biggest noise source). This does NOT fully isolate it from OTHER
 *      projects (admin-tests, user-tests, …) that may still be mid-flight
 *      in sibling workers during a plain `npm test` — Playwright has no
 *      built-in way to pause unrelated projects for one project's
 *      duration within a single invocation (only a separate, standalone
 *      `--project=cross-role-query-count` run gets that guarantee).
 *   2. As defense in depth against whatever residual noise still leaks in
 *      during a full-suite run, the test below samples BOTH the baseline
 *      delta and the large-batch delta `TRIALS` times each and takes the
 *      MINIMUM of each side before diffing them. A genuine N+1 regression
 *      inflates every large-batch trial by roughly the same (large)
 *      amount, so the minimum still clears the threshold; transient
 *      cross-worker/cross-project noise instead only inflates a handful
 *      of individual samples and is unlikely to inflate the minimum of
 *      either side.
 *
 * For a fully noise-free run (e.g. re-establishing the empirical baseline
 * above), run this spec in isolation:
 *   npm test -- --project=cross-role-query-count
 * If the global `workers`/`fullyParallel` defaults in playwright.config.ts
 * ever change, re-validate that TRIALS/MAX_ALLOWED_EXTRA_STATEMENTS still
 * give enough margin — see playwright.config.ts's comment on this project
 * for the scheduling details this relies on.
 */
import { test, expect, tn } from '../helpers/scoped-test';
import { newScopedContext } from '../helpers/scoped-test';
import { withConnection } from '../helpers/db';
import { roleLogin } from '../helpers/role-login';
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

            await c.execute(
                `INSERT INTO ${tn('expert_profiles')} (account_id, display_name, is_approved) VALUES (?, ?, 1)`,
                [id, `${prefix} Expert ${i}`],
            );
        }
        return ids;
    });
}

async function cleanupExperts(prefix: string, ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    await withConnection(async (c) => {
        const placeholders = ids.map(() => '?').join(',');
        await c.execute(`DELETE FROM ${tn('expert_profiles')} WHERE account_id IN (${placeholders})`, ids);
        await c.execute(`DELETE FROM ${tn('accounts_data')} WHERE account_id IN (${placeholders})`, ids);
        await c.execute(`DELETE FROM ${tn('accounts')} WHERE id IN (${placeholders})`, ids);
    });
}

async function questionsCounter(): Promise<number> {
    return withConnection(async (c) => {
        const [rows] = await c.query<any[]>("SHOW GLOBAL STATUS LIKE 'Questions'");
        return Number(rows[0]?.Value ?? 0);
    });
}

async function searchRecipients(page: Page, query: string): Promise<{ status: number; body: any }> {
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
        return { status: res.status, body };
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

    /**
     * Measure the statement cost of one `~searchRecipients` call, tightly
     * bracketed by `Questions` samples immediately before/after — kept as a
     * separate helper (rather than one inline before/after around 2N
     * calls) to keep each individual measurement window as short as
     * possible, minimizing exposure to noise from other concurrently
     * running tests/projects (see file docblock).
     */
    async function measureOnce(query: string): Promise<{ delta: number; body: any }> {
        const before = await questionsCounter();
        const result = await searchRecipients(userPage, query);
        const after = await questionsCounter();
        expect(result.status).toBe(200);
        return { delta: after - before, body: result.body };
    }

    test('adding many candidate experts does not proportionally increase query volume', async () => {
        // Baseline: measure the statement cost of one search call against
        // whatever (small) default seed data this worker's template has.
        // Repeated TRIALS times; the MINIMUM delta is used as the
        // reference — see docblock's "defense in depth" note. A stray
        // concurrent query inflating one baseline sample would otherwise
        // make deltaBaseline look artificially high and mask a real
        // regression in the extraStatements computation below.
        const baselineDeltas: number[] = [];
        for (let i = 0; i < TRIALS; i++) {
            baselineDeltas.push((await measureOnce('')).delta);
        }
        const deltaBaseline = Math.min(...baselineDeltas);

        // Now add a large batch of additional approved/active experts and
        // measure the SAME call again — isolated, not cumulative. Also
        // repeated TRIALS times, keeping the MINIMUM delta so transient
        // noise can't inflate it; a real N+1 regression inflates every
        // trial by roughly the same (large) amount, so the minimum still
        // clears MAX_ALLOWED_EXTRA_STATEMENTS in that case.
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
