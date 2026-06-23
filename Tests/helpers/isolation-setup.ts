/**
 * Per-worker isolation setup pipeline.
 *
 * Active when `PW_WORKER_ISOLATION=1`. Builds N independent DB
 * "namespaces" (table prefixes `test_worker_0_*` … `test_worker_${N-1}_*`)
 * via a one-time template:
 *
 *   1. Drop any leftover `test_worker_*` tables.
 *   2. Migrate + seed the template prefix `test_worker_template`.
 *   3. Register the `testuser_setup_*` accounts ONCE in template (UI
 *      flow with `X-Test-Worker: template`).
 *   4. Clone every template table into `test_worker_${i}_*` for each
 *      worker — fast: `CREATE TABLE LIKE` + `INSERT SELECT`.
 *   5. dev-login each role per worker, save storage state to
 *      `.auth/${role}_w${i}.json`. This is the per-worker auth state
 *      the per-role test projects pick up at runtime via
 *      `resolveStorageStatePath`.
 *
 * Total overhead: ~45–60 s on a warm DB. The payoff is workers >1 with
 * no shared-row races.
 */
import { Browser, BrowserContext, chromium } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import mysql from 'mysql2/promise';
import { ADMIN_LOGIN, EXPERT_LOGIN, USER_LOGIN, MODERATOR_LOGIN, OWNER_LOGIN, EXPERT_MODERATOR_LOGIN, EXPERT_ADMIN_LOGIN } from './logins';
import { storageStatePath } from './state';
import { DB as DB_CONFIG } from './db';

// Harness now lives inside the app at `<app>/Tests/helpers/`, so the app
// root is two levels up. (Was `../../Apps/IRabi` when the harness lived in
// the monorepo's Framework/tests/.)
const APP_DIR = path.resolve(__dirname, '../..');
const BASE_URL = process.env.BASE_URL || 'http://localhost:8001';

const TEMPLATE_PREFIX = 'test_worker_template';

interface SeedAccount {
    role: 'admin' | 'expert' | 'user' | 'moderator' | 'owner' | 'expert-moderator' | 'expert-admin';
    login: string;
    name: string;
    accountType: 'user' | 'expert';
    timezone: string;
    flags: Record<string, string>;
}

const SETUP_ACCOUNTS: SeedAccount[] = [
    { role: 'admin',     login: ADMIN_LOGIN,     name: 'Setup Admin',     accountType: 'user',   timezone: 'UTC',            flags: { IS_ADMIN: '1', IS_MODERATOR: '1' } },
    { role: 'expert',    login: EXPERT_LOGIN,    name: 'Setup Expert',    accountType: 'expert', timezone: 'Europe/Moscow',  flags: { IS_APPROVED: '1' } },
    { role: 'user',      login: USER_LOGIN,      name: 'Setup User',      accountType: 'user',   timezone: 'UTC',            flags: {} },
    { role: 'moderator', login: MODERATOR_LOGIN, name: 'Setup Moderator', accountType: 'user',   timezone: 'UTC',            flags: { IS_MODERATOR: '1' } },
    { role: 'owner',     login: OWNER_LOGIN,     name: 'Setup Owner',     accountType: 'user',   timezone: 'UTC',            flags: { IS_OWNER: '1', IS_MODERATOR: '1' } },
    { role: 'expert-moderator', login: EXPERT_MODERATOR_LOGIN, name: 'Setup Expert-Mod', accountType: 'expert', timezone: 'Europe/Moscow', flags: { IS_APPROVED: '1', IS_MODERATOR: '1' } },
    { role: 'expert-admin',     login: EXPERT_ADMIN_LOGIN,     name: 'Setup Expert-Adm', accountType: 'expert', timezone: 'Europe/Moscow', flags: { IS_APPROVED: '1', IS_ADMIN: '1', IS_MODERATOR: '1' } },
];

function workerCount(explicit?: number): number {
    if (typeof explicit === 'number' && explicit > 0) {
        return explicit;
    }
    // Fallback for direct invocations (tests of the helper, ad-hoc
    // scripts). `npm test` always passes the resolved value from
    // FullConfig — see global-setup.ts.
    const raw = process.env.PW_WORKERS;
    const n = raw ? parseInt(raw, 10) : 1;
    if (Number.isNaN(n) || n < 1) return 1;
    return n;
}

function runCli(prefix: string, args: string[]) {
    const env = { ...process.env, DB_PREFIX_OVERRIDE: prefix };
    const res = spawnSync('php', ['run_cmd.php', ...args], {
        cwd: APP_DIR,
        env,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (res.status !== 0) {
        if (res.stdout) process.stdout.write(res.stdout);
        if (res.stderr) process.stderr.write(res.stderr);
        throw new Error(`CLI [${args.join(' ')}] for ${prefix} failed (exit ${res.status})`);
    }
}

async function dropAllWorkerTables(): Promise<void> {
    const conn = await mysql.createConnection(DB_CONFIG);
    try {
        const [rows] = await conn.execute<any[]>(
            `SELECT TABLE_NAME FROM information_schema.tables
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME LIKE 'test_worker_%'`,
            [DB_CONFIG.database]
        );
        await conn.execute('SET FOREIGN_KEY_CHECKS = 0');
        for (const r of rows) {
            await conn.execute(`DROP TABLE IF EXISTS \`${r.TABLE_NAME}\``);
        }
        await conn.execute('SET FOREIGN_KEY_CHECKS = 1');
    } finally {
        await conn.end();
    }
}

async function listTemplateTables(): Promise<string[]> {
    const conn = await mysql.createConnection(DB_CONFIG);
    try {
        const [rows] = await conn.execute<any[]>(
            `SELECT TABLE_NAME FROM information_schema.tables
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME LIKE ?`,
            [DB_CONFIG.database, `${TEMPLATE_PREFIX}_%`]
        );
        return rows.map((r) => r.TABLE_NAME as string);
    } finally {
        await conn.end();
    }
}

async function cloneTemplateTo(workerIndex: number): Promise<void> {
    const tables = await listTemplateTables();
    const targetPrefix = `test_worker_${workerIndex}`;
    const conn = await mysql.createConnection(DB_CONFIG);
    try {
        for (const src of tables) {
            const tgt = src.replace(`${TEMPLATE_PREFIX}_`, `${targetPrefix}_`);
            await conn.execute(`CREATE TABLE \`${tgt}\` LIKE \`${src}\``);
            // Skip generated/virtual columns when copying rows — MySQL
            // refuses INSERT VALUES against them. Read the real column
            // list from information_schema and project explicitly.
            const [colRows] = await conn.execute<any[]>(
                `SELECT COLUMN_NAME FROM information_schema.columns
                 WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
                       AND (EXTRA NOT LIKE '%GENERATED%' OR EXTRA IS NULL)
                 ORDER BY ORDINAL_POSITION`,
                [DB_CONFIG.database, src]
            );
            if (colRows.length === 0) continue;
            const colList = colRows.map((r) => `\`${r.COLUMN_NAME}\``).join(', ');
            await conn.execute(`INSERT INTO \`${tgt}\` (${colList}) SELECT ${colList} FROM \`${src}\``);
        }
    } finally {
        await conn.end();
    }
}

async function newScopedContext(browser: Browser, scope: string): Promise<BrowserContext> {
    return await browser.newContext({
        baseURL: BASE_URL,
        extraHTTPHeaders: { 'X-Test-Worker': scope },
    });
}

/**
 * Insert a testuser_setup_* account directly into the template scope.
 *
 * The legacy setup projects walked the email-auth UI under a generated
 * invite token — useful when we needed real session state, but here
 * those rows are only consumed by admin-grid lookups that match by
 * login or display name. SQL is shorter, deterministic, and dodges the
 * UI race we saw on warm starts (auth-submit-btn lingering after the
 * auto-login redirect). Auth state for the worker comes from the
 * subsequent dev-login pass against *@dev.test seed accounts.
 */
async function registerSetupAccount(_browser: Browser, account: SeedAccount): Promise<void> {
    const conn = await mysql.createConnection(DB_CONFIG);
    try {
        await conn.execute(
            `INSERT INTO \`${TEMPLATE_PREFIX}_accounts\` (login, login_type, name, type, time_zone)
             VALUES (?, 'email', ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                 name = VALUES(name), type = VALUES(type), time_zone = VALUES(time_zone)`,
            [account.login, account.name, account.accountType, account.timezone]
        );

        for (const [param, value] of Object.entries(account.flags)) {
            await conn.execute(
                `INSERT INTO \`${TEMPLATE_PREFIX}_accounts_data\` (account_id, param, value)
                 SELECT id, ?, ? FROM \`${TEMPLATE_PREFIX}_accounts\` WHERE login = ?
                 ON DUPLICATE KEY UPDATE value = VALUES(value)`,
                [param, value, account.login]
            );
        }

        // Seed an initial balance for everyone — DevSeedService tops up
        // *@dev.test users to 50k via BalanceLedger::addEntry; tests
        // routinely book paid slots via testuser_setup_* accounts and
        // expect a non-zero starting balance the same way. Without this
        // their poll-for-balance-after-topup loops time out (the topup
        // flow itself is brittle) and assertions trip on
        // `expect(balance).toBeGreaterThanOrEqual(SLOT_COST)`.
        const [accRows] = await conn.execute<any[]>(
            `SELECT id FROM \`${TEMPLATE_PREFIX}_accounts\` WHERE login = ?`,
            [account.login]
        );
        const accountId = accRows[0]?.id as number | undefined;
        if (accountId) {
            const now = Math.floor(Date.now() / 1000);
            await conn.execute(
                `INSERT INTO \`${TEMPLATE_PREFIX}_account_balance\` (account_id, balance, updated_at)
                 VALUES (?, 50000, ?)
                 ON DUPLICATE KEY UPDATE balance = VALUES(balance), updated_at = VALUES(updated_at)`,
                [accountId, now]
            );
            await conn.execute(
                `INSERT INTO \`${TEMPLATE_PREFIX}_balance_ledger\`
                 (account_id, is_credit, amount, entry_type, ref_type, ref_id, note, created_at, actor_id)
                 VALUES (?, 1, 50000, 'top_up', '', 0, 'Setup seed top-up', ?, NULL)`,
                [accountId, now]
            );
        }

        if (account.accountType === 'expert' && accountId) {
            // Mirror legacy expert.setup.ts: a real `ir_expert_profiles`
            // row + a few free future slots, otherwise admin grids and
            // /slots views hide the expert and any test asserting on
            // slot visibility fails before it starts.
            await conn.execute(
                `INSERT INTO \`${TEMPLATE_PREFIX}_expert_profiles\`
                 (account_id, display_name, bio, specialization, is_approved)
                 VALUES (?, ?, 'Test expert bio', 'Mathematics', 1)
                 ON DUPLICATE KEY UPDATE display_name = VALUES(display_name), is_approved = 1`,
                [accountId, account.name]
            );
            const now = Math.floor(Date.now() / 1000);
            const day = 86400;
            for (let i = 1; i <= 3; i++) {
                const startAt = now + day * i + 36000;
                const uid = [...Array(16)]
                    .map(() => Math.floor(Math.random() * 16).toString(16))
                    .join('');
                await conn.execute(
                    `INSERT INTO \`${TEMPLATE_PREFIX}_time_slots\`
                     (expert_id, start_at, end_at, duration_min, cost, is_online, location, max_users, status, uid, created_at)
                     VALUES (?, ?, ?, 60, 500, 1, 'https://meet.example.com/test', 1, 'free', ?, ?)`,
                    [accountId, startAt, startAt + 3600, uid, now]
                );
            }
        }
    } finally {
        await conn.end();
    }
}

/**
 * One-shot login in the **template** scope, persisted to
 * `.auth/${role}_template.json`. After `cloneTemplateTo` runs, the
 * session row (created in `test_worker_template_session` /
 * `_session_data`) is copied into every worker prefix, so the same
 * cookie that this file stores will resolve in any `test_worker_${i}_*`
 * scope. The per-worker `.auth/${role}_w${i}.json` files are then plain
 * `fs.copyFile` of this template state — no N×role re-logins needed.
 *
 *   admin    → dev-login as `admin` (binds storage to admin@dev.test)
 *   others   → dev-login by login → binds to testuser_setup_${role}@irabi.test
 */
async function loginAndPersistTemplate(browser: Browser, account: SeedAccount): Promise<void> {
    const ctx = await newScopedContext(browser, 'template');
    try {
        const form: Record<string, string> = account.role === 'admin'
            ? { role: 'admin' }
            : { login: account.login };
        const resp = await ctx.request.post(`${BASE_URL}/dev-login`, { form });
        if (!resp.ok()) {
            throw new Error(`dev-login ${account.role} in template failed: ${resp.status()}`);
        }
        await ctx.storageState({ path: templateStatePath(account.role) });
    } finally {
        await ctx.close();
    }
}

function templateStatePath(role: string): string {
    return path.resolve(__dirname, `../.auth/${role}_template.json`);
}

export async function isolationSetup(workers?: number): Promise<void> {
    workers = workerCount(workers);
    console.log(`[isolation] preparing ${workers} worker(s) — template + clone + per-worker login`);

    const t0 = Date.now();

    console.log('[isolation] dropping leftover test_worker_* tables');
    await dropAllWorkerTables();

    console.log('[isolation] migrating template');
    runCli(TEMPLATE_PREFIX, ['migration', 'init']);
    // `migration init` creates the tracker table and sets version=1,
    // assuming the v1 schema is already present. For a fresh prefix it
    // isn't — push the tracker back to 0 so the migrate loop applies
    // M_0001 (which actually creates the tables) and onward.
    {
        const conn = await mysql.createConnection(DB_CONFIG);
        try {
            await conn.execute(
                `UPDATE \`${TEMPLATE_PREFIX}_migration\` SET version = '0' WHERE id = 1000`
            );
        } finally {
            await conn.end();
        }
    }
    runCli(TEMPLATE_PREFIX, ['migration', 'migrate']);

    console.log('[isolation] seeding template (dev users + sample data)');
    runCli(TEMPLATE_PREFIX, ['seed']);

    // Clear server-side JS error logs in the template so the post-run
    // check in global-teardown starts from a clean slate. The
    // cloneTemplateTo step below copies template tables verbatim into
    // every worker prefix, so all per-worker tables inherit the empty
    // state automatically. Pattern-match `%_js_errors` so renames in
    // the app layer (ir_js_errors today, anything tomorrow) don't
    // require a code change here.
    {
        const conn = await mysql.createConnection(DB_CONFIG);
        try {
            const [tables] = await conn.execute<any[]>(
                `SELECT TABLE_NAME FROM information_schema.tables
                 WHERE TABLE_SCHEMA = ? AND TABLE_NAME LIKE ?`,
                [DB_CONFIG.database, `${TEMPLATE_PREFIX}_%_js_errors`]
            );
            for (const t of tables) {
                await conn.execute(`TRUNCATE TABLE \`${t.TABLE_NAME}\``);
            }
        } finally {
            await conn.end();
        }
    }

    console.log('[isolation] registering setup users in template');
    const browser = await chromium.launch();
    try {
        // ensure .auth dir
        const authDir = path.resolve(__dirname, '../.auth');
        if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });

        for (const acc of SETUP_ACCOUNTS) {
            await registerSetupAccount(browser, acc);
        }

        console.log(`[isolation] login once per role into template scope (${SETUP_ACCOUNTS.length} logins)`);
        // Login each role ONCE against the template scope. The session
        // row lands in `test_worker_template_session(_data)`; the next
        // `cloneTemplateTo` copies those rows into every worker prefix,
        // so the same cookie is valid in any scope. Skips the N×role
        // re-login loop the old code did against each worker prefix.
        // Sequential, not Promise.all — 5 concurrent /dev-login hits on
        // a cold php-cgi pool gave us 502s during the benchmark sweep.
        // 5 round-trips × ~200 ms is cheap; race-free start is the
        // priority here.
        for (const acc of SETUP_ACCOUNTS) {
            await loginAndPersistTemplate(browser, acc);
        }

        console.log(`[isolation] cloning template → test_worker_0..${workers - 1}`);
        // Parallel clone: CREATE TABLE LIKE + INSERT SELECT on distinct
        // target prefixes are independent — no shared state, InnoDB
        // handles concurrent DDL fine. Sequential was the bottleneck
        // that made setup grow linearly with worker count.
        await Promise.all(
            Array.from({ length: workers }, (_, i) => cloneTemplateTo(i))
        );

        console.log(`[isolation] fanning storageState → ${workers}×${SETUP_ACCOUNTS.length} per-worker files`);
        // Plain file copy: the session row was cloned with the rest of
        // the template, so the same cookie this storageState carries
        // resolves in any `test_worker_${i}_*` scope.
        for (const account of SETUP_ACCOUNTS) {
            const src = templateStatePath(account.role);
            for (let i = 0; i < workers; i++) {
                fs.copyFileSync(src, storageStatePath(account.role, i));
            }
        }
    } finally {
        await browser.close();
    }

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`[isolation] setup complete in ${elapsed}s`);
}

export async function isolationTeardown(): Promise<void> {
    console.log('[isolation] dropping all test_worker_* tables');
    await dropAllWorkerTables();
}
