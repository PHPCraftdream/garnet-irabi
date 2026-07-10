# Playwright Testing Guide

## Running tests

```bash
cd tests
npm test                              # 8-way parallel + isolation, default
PW_WORKERS=1 npm test                 # sequential, still isolated
PW_WORKER_ISOLATION=0 PW_WORKERS=1 npm test   # legacy db_* tables, debugging only
```

Two knobs:

- `PW_WORKERS=N` — number of parallel Playwright workers. **Default 8**.
  Each worker has its own DB scope, so `N>1` is race-free.
- `PW_WORKER_ISOLATION=0` — drops back to the legacy shared `db_*`
  tables (handy for comparing failures pre/post isolation, or for
  poking at live data with the test harness). Defaults to ON; only
  safe with `PW_WORKERS=1` when off.

---

## Greening Workflow — one full circle per iteration

When a full run lands with N failures, **don't fix one test at a time
and re-run the whole suite for each fix.** That burns ~9 minutes per
iteration on a setup pipeline that hasn't changed.

The cheaper loop:

1. **Walk the full failure list in a single pass.** For each failure:
   - Open the spec, read the assertion, find the race or
     missing-data root cause.
   - Apply the fix. Don't re-run anything yet.
   - Move to the next failure.
2. **At the end of the pass, run the affected specs together** with
   a targeted command, e.g.:
   ```bash
   PW_WORKERS=2 npx playwright test \
       --project=admin-tests --project=cross-role \
       specs/iRabi/admin/admin-static-pages.spec.ts \
       specs/iRabi/cross-role/admin-moderates-support.spec.ts
   ```
   ~5 min instead of ~9 min, and only the changed surface gets the
   parallel-stress.
3. **If the targeted run is green, do one full sanity run.** That
   single full run is where you catch:
   - new failures that the previous fix unmasked (cascade shifted to
     the next test in a `describe.serial` chain);
   - cross-file flake-rotation that only surfaces under full load.
4. **Repeat the circle.** Same protocol: collect all failures in
   that run, walk them in one pass, fix each, targeted-run, full-run.
   Stop when the full run hits 0 failed.

### Why one-pass beats one-test-at-a-time

- The setup pipeline (template → clone → per-worker login) costs
  ~80 seconds. Re-running it for every single fix dominates wall
  clock.
- Most failures in a `describe.serial` chain share a root cause
  (one missing `waitForResponse`, one stale state). Fixing them
  together avoids the "shifted-cascade" pattern where every fix
  reveals the next failure in the same file.
- A few flakes auto-recover on retry (Playwright `retries: 1`); you
  only learn what's truly stable after the full pass.

### When to drop to single-test debugging

Drop the workflow when:

- A failure repro requires a specific config that breaks the rest of
  the suite (e.g. `PW_WORKER_ISOLATION=0` to compare against legacy).
- You're chasing a real product bug that the test surfaced — at that
  point you're not greening the suite, you're fixing the app, and
  you want the fastest possible repro loop on that one path.

For the regular green-up grind, walk the circle.

---

## Test Isolation: Per-Worker DB Prefix

Every test worker has its **own** namespace of DB tables. Worker 0
reads and writes to `test_worker_0_*`, worker 1 to `test_worker_1_*`,
etc. Two workers never see each other's rows — race conditions on
shared seed accounts (admin flag flips, approval toggles) are
physically impossible.

Note on the prefix: in legacy (`PW_WORKER_ISOLATION=0`) the base
prefix from `db.ini` is `db_ir` for IRabi (a different prefix per app) —
the bundle infix lives **inside** the prefix, not in the table name.
Isolation mode replaces the entire base prefix with `test_worker_N`
(no `_ir` suffix preserved), so isolated tables are
`test_worker_0_bookings`, `test_worker_0_accounts`, not
`test_worker_0_ir_bookings`. Spec code never spells either prefix
out — `tn('bookings')` resolves whichever is active.

### Lifecycle

```
0. globalSetup (once per `npm test`)
   ─ drop leftover test_worker_*
   ─ ./garnet migration migrate (DB_PREFIX_OVERRIDE=test_worker_template)
   ─ ./garnet seed --force      (DB_PREFIX_OVERRIDE=test_worker_template)
   ─ register testuser_setup_*  (direct SQL into template tables)
   ─ for each worker N:
       CREATE TABLE LIKE + INSERT SELECT  (template → test_worker_N_*)
       dev-login each role with X-Test-Worker:N → save .auth/{role}_w{N}.json

1. each worker's HTTP request flow
   ─ Playwright worker N sets X-Test-Worker: N on every request
     (playwright.config.ts → use.extraHTTPHeaders).
   ─ Apps/IRabi/run_web.php applies WorkerScopeMiddleware BEFORE
     IoRunWeb::run reads Session — critical, see "Pitfalls" below.
   ─ middleware chain runs WorkerScopeMiddleware again (idempotent),
     then auth / app middleware, all reading prefix=test_worker_N.
   ─ DbTable::getPrefix() resolves table names per request → MySQL
     hits test_worker_N_*.

2. globalTeardown
   ─ DROP TABLE every test_worker_*
```

Two safety gates: middleware is a **no-op** unless app.ini `env=dev`
AND the runtime sits in a dev directory; and only `\d+` worker
indices in `[0, 64]` are honored. Production traffic that accidentally
forwards the header is silently ignored.

### Writing a NEW test

Always import `test` from `helpers/scoped-test`, NEVER from
`@playwright/test` directly:

```ts
import { test, expect, tn } from '../../helpers/scoped-test';
import mysql from 'mysql2/promise';

test('booking lands in DB', async ({ page, workerIndex, dbPrefix }) => {
    await page.goto('/system/bookings');
    // page.* requests carry X-Test-Worker automatically (via
    // playwright.config.ts → use.extraHTTPHeaders).

    // For DIRECT DB queries (asserting state), interpolate via tn():
    const conn = await mysql.createConnection(DB_CONFIG);
    const [rows] = await conn.execute(
        `SELECT * FROM ${tn('bookings')} WHERE user_id = ?`,
        [userId]
    );
});
```

The `tn()` helper accepts the **bare business name** of the table
(`bookings`, `accounts`, `session`, `time_slots`) — no `ir_` / `n72_`
infix, that's part of the prefix. `tn()` prepends whichever framework
prefix is active for this worker. Outside isolation it returns
`db_ir_*`; inside isolation it returns `test_worker_${idx}_*`.
**Never** hardcode `db_ir_*` in raw SQL.

```ts
// ❌ breaks parallel runs
`SELECT * FROM db_ir_bookings WHERE user_id = ?`

// ❌ double-stamps the infix → `test_worker_0_ir_bookings` (no such table)
`SELECT * FROM ${tn('ir_bookings')} WHERE user_id = ?`

// ✅ portable across isolation modes
`SELECT * FROM ${tn('bookings')} WHERE user_id = ?`
```

### Manual contexts (cross-role flows)

`browser.newContext()` does **not** inherit `extraHTTPHeaders` from
`use:` — they only attach to the default `context` fixture. Tests
that spin up secondary contexts (admin moderates user, expert chats
with user) must use the helper:

```ts
import { newScopedContext } from '../../helpers/scoped-test';

test.beforeAll(async ({ browser }) => {
    expertCtx = await newScopedContext(browser, { storageState: '.auth/expert_w' + idx + '.json' });
    userCtx   = await newScopedContext(browser);
});
```

The helper re-injects `X-Test-Worker` when isolation is on, otherwise
it's a thin pass-through to `browser.newContext()`.

### Two layers, one rule

| layer | how it routes to the right tables |
|---|---|
| HTTP requests via `page` / `request` (default fixture) | automatic — header sent on every request |
| `browser.newContext()` for secondary contexts | use `newScopedContext(browser, ...)` |
| Direct mysql queries from the test | use `${tn('bookings')}` in the SQL string |
| CLI tools (`./garnet migration`, `./garnet seed`) | export `DB_PREFIX_OVERRIDE=test_worker_N` |

### Pitfalls (blind spots that bit us)

**`Session::$instance` is loaded BEFORE the per-route middleware chain.**
`IoRunWeb::run` calls `getSession()->readDataAsync()` to hydrate the
user's session before delegating into `$init` (where the per-route
middleware lives). If `WorkerScopeMiddleware` were applied only inside
that chain, Session would read from the legacy `db_session` and
`flush` to the per-worker `test_worker_N_session` — every request
would write a session the next request couldn't see. **Fix in place:**
`run_web.php` invokes `WorkerScopeMiddleware::process()` once, BEFORE
`IoRunWeb::run`, so the prefix override is set when Session reads.

**Singletons cache the wrong prefix at boot if you're not careful.**
Anything that calls `DbTable::getTableName()` once and stashes the
result will keep targeting whatever prefix was active at that moment.
If you add a new framework-level cache, make it sensitive to the
runtime override OR resolve table names lazily.

### Tooling

- `Framework/Bundle/Middlewares/WorkerScopeMiddleware.php`
  — server-side prefix swap (header → `IniConfig::db()->setRuntimeOverride`).
- `Framework/Kernel/Io/IniConfig/IniConfig.php`
  — `setRuntimeOverride` / `clearRuntimeOverride` /
  `clearAllRuntimeOverrides`.
- `Apps/IRabi/run_web.php`
  — applies WorkerScopeMiddleware before `IoRunWeb::run` so Session
  is loaded against the right prefix.
- `Apps/IRabi/run_cmd.php`
  — honours `DB_PREFIX_OVERRIDE=test_worker_N` env var for CLI
  commands (migrations, seed). Used by globalSetup.
- `tests/helpers/scoped-test.ts`
  — `tn()`, `dbPrefix` and `workerIndex` fixtures, `newScopedContext()`.
- `tests/helpers/isolation-setup.ts`
  — globalSetup pipeline (drop / migrate / seed / register / clone /
  per-worker login).
- `tests/playwright.config.ts`
  — `extraHTTPHeaders` (gated by `PW_WORKER_ISOLATION`), per-project
  `storageState` resolution via `process.env.TEST_PARALLEL_INDEX`.
- `tests/scripts/migrate-table-refs.mjs`
  — one-shot rewrite tool. Re-run with an extended whitelist when a
  new table joins the codebase.

---

## Running the suite against a remote box (prod / staging)

The same suite can run against an external server without exposing its DB or
shipping `/dev-login` to prod. One command drives the whole lifecycle from
your local machine:

```bash
php garnet test:remote --base-url=https://example.com
php garnet test:remote --base-url=https://example.com --project=admin-tests
php garnet test:remote --base-url=https://example.com --keep   # skip teardown
```

What happens:

1. A one-time secret token is generated.
2. Over SSH (params from `ssh.ini`), `php garnet test:provision` plants
   `.allow_tests`, then builds the isolated `test_worker_0` scope
   (migrate + seed + `testuser_setup_*` role accounts).
3. Playwright runs **locally** against the remote URL with `PW_PROD=1`,
   1 worker. Every request carries `run-test-garnet-team: <token>` +
   `X-Test-Worker: 0`, so the server (via `WorkerScopeMiddleware` +
   `TestScope`) flips DB prefix → `test_worker_0` and uploads → `UploadTest`.
4. `php garnet test:teardown` drops the scope, `UploadTest`, and the token
   — always, even if the run fails (unless `--keep`).

How the two cross-cutting needs are met on prod:

- **Auth.** No `/dev-login` on prod. Login uses the real passwordless flow;
  `IrabiAuthMiddleware` auto-completes the code step for `.test` mailboxes
  when `TestScope` is active, so `loginAccount`-style helpers work unchanged.
  Real email is suppressed for `*.test` (`FwAppMailer`), and the auth code is
  still written to `mail_log.meta` if a spec needs it.
- **Direct DB.** The prod MySQL isn't reachable locally, so
  `helpers/ssh-bridge.ts` patches `mysql.createConnection` to route SQL over
  SSH → `php garnet sql --json`. SQL already targets `test_worker_0_*` (via
  `tn()`), so it only touches the isolated scope. Limitations: one SSH
  round-trip per query (slow — keep the spec set small), no `insertId` on
  INSERT (re-select by a unique key), no cross-call transactions.

⚠️ **Safety.** A request that reaches prod WITHOUT the token header is served
as normal traffic against LIVE tables. The token is stamped on every context
centrally (`scopeHeaders()` in `helpers/scoped-test.ts`, plus the prod config
and `_sharedContext`). When extending the harness, never open a browser
context without it. Smoke a new prod run with a read-only spec first and
confirm it lands on `test_worker_0_*` before running anything that mutates.

Files: `playwright.prod.config.ts`, `global-setup.prod.ts` (role logins),
`global-teardown.prod.ts`, `helpers/ssh-bridge.ts`,
`Framework/Kernel/Io/GarnetCli/GarnetTestRemoteCommand.php` (orchestrator),
`Apps/IRabi/Common/Commands/CMDTestProvision.php` / `CMDTestTeardown.php`.

---

## Writing Fast Tests — rules that compound across 600+ specs

These aren't style preferences; they're per-call costs in a suite that
already hits ~140s wall on a 32-worker pool. A 200ms regression in a
helper called 50 times eats 10s back. Follow these rules from day one,
not as a clean-up pass afterwards.

### Batch independent assertions with `Promise.all`

Every `await expect(locator).toBeVisible()` polls until the locator
is attached and visible. **Sequential polls add up:** four 100ms polls
in a row = 400ms wall. Inside `Promise.all([...])` they run
concurrently, so the wall is `max(polls)` instead of `Σ`.

```ts
// ❌ Serial polling — 4 × ~100ms = ~400ms
await expect(page.locator('[data-test-id="tabnav-btn-bookings"]')).toBeVisible();
await expect(page.locator('[data-test-id="tabnav-btn-expert-cancellations"]')).toBeVisible();
await expect(page.locator('[data-test-id="tabnav-btn-user-cancellations"]')).toBeVisible();

// ✅ Parallel polling — wall = max(polls), typically ~100ms
await Promise.all([
    expect(page.locator('[data-test-id="tabnav-btn-bookings"]')).toBeVisible(),
    expect(page.locator('[data-test-id="tabnav-btn-expert-cancellations"]')).toBeVisible(),
    expect(page.locator('[data-test-id="tabnav-btn-user-cancellations"]')).toBeVisible(),
]);

// ✅ Same idea for loops over independent ids
await Promise.all(
    ['actions', 'mails', 'requests', 'errors', 'cron'].map(id =>
        expect(page.locator(`[data-test-id="tabnav-btn-${id}"]`)).toBeVisible({ timeout: 5000 })
    )
);
```

Applies to any assertion that internally retries: `toBeVisible`,
`toBeHidden`, `toBeEnabled`, `toBeDisabled`, `toBeChecked`,
`toHaveText`, `toHaveAttribute`, `toHaveCount`, `toContainText`,
`not.toBeVisible`, etc.

**When NOT to batch.** If an assertion's *truth depends on the
previous step's effect*, keep them serial — `Promise.all` evaluates
all polls from the same start time and the second assertion will race
the first. Rule of thumb: batch only sibling assertions that all just
check "this thing is on screen" against the same point-in-time DOM.

### Don't `waitForLoadState('networkidle')` after `goto` if the next
line is auto-waiting

`networkidle` waits a full 500ms of zero in-flight requests. After
`await page.goto(...)` the next `expect(locator).toBeVisible()` or
`waitForSelector(...)` *already* polls for the element, so the idle
wait is dead time. Same for `click`, `fill`, `selectOption`, etc. —
Playwright auto-waits on the target before acting.

```ts
// ❌ Adds ~500ms before every poll
await page.goto('/admin/logs/');
await page.waitForLoadState('networkidle');
await expect(page.locator('[data-test-id="tabnav-btn-actions"]')).toBeVisible();

// ✅ The expect polls; the idle wait is redundant
await page.goto('/admin/logs/');
await expect(page.locator('[data-test-id="tabnav-btn-actions"]')).toBeVisible();
```

Keep `networkidle` only when the *very next* statement is a DB query,
a `page.evaluate(...)`, or anything else that doesn't have its own
auto-wait — those genuinely need the browser to have drained its
in-flight XHRs.

### Use specific `waitForResponse` predicates

```ts
// ❌ Catches the first POST <500 — likely CSRF refresh, not your
//   real response. The test then polls UI for the *next* fetch.
page.waitForResponse(r => r.request().method() === 'POST' && r.status() < 500)

// ✅ Pinned to the endpoint you actually triggered
page.waitForResponse(r =>
    r.request().method() === 'POST' &&
    r.url().includes('~createTicket') &&
    r.status() < 500
)
```

### Tighten `expect.poll` intervals

Default Playwright cadence is `[100, 250, 500, 1000]`. A condition
that flips at t=120ms isn't noticed until t=250ms — 130ms of pure
wait. For polls that hit cheap selectors (`.count()`, `isVisible()`):

```ts
await expect.poll(
    () => rows.count(),
    { timeout: 5000, intervals: [50, 150, 400] }
).toBe(0);
```

### Use `waitUntil: 'domcontentloaded'` for admin navigations

`page.goto()` defaults to `waitUntil: 'load'`, which blocks until
every CSS/JS/img/font sub-resource has finished. On warm-cache pages
that's an extra 200-500ms after the React island already hydrated.
The next `expect(...).toBeVisible()` poll will catch the island as
soon as it mounts.

```ts
// ✅ Used in openAdminPage() — saves ~250ms × ~60 callers
await page.goto(path, { waitUntil: 'domcontentloaded' });
```

### Assert on specific data-test-id, not aggregate counts

Counting `[data-test-id^="slot-card"]` across an admin page is racy by
construction: the seed dataset has unrelated rows, other parallel
tests touch them, and your single state change may not move the
total. Create the row you care about and assert on it by its own id.

```ts
// ❌ Brittle — other approved experts also show on /slots, so
//   flipping ONE expert's approval doesn't necessarily change the
//   aggregate count
const before = await page.locator('[data-test-id^="slot-card"]').count();
await flipApproval();
const after  = await page.locator('[data-test-id^="slot-card"]').count();
expect(after).toBeGreaterThan(before);

// ✅ Create a slot YOU control and watch THAT card
const slotId = await createSlotFor(expertId);
await page.goto('/slots');
await expect(page.locator(`[data-test-id="slot-card-${slotId}"]`)).toBeVisible();
```

### Use ranges, not exact counts, when the seed drifts

A hard-coded `toHaveCount(N)` against seed data eats its full timeout
every time someone adds a fixture row. Use `expect.poll` + a range
matcher when you care that the count is "non-trivial" rather than a
specific value.

```ts
// ❌ Burns the full 5s timeout if the seed ever has !== 23 users
await expect(rows).toHaveCount(23, { timeout: 5000 });

// ✅ Resolves as soon as the count is plausibly populated
await expect.poll(
    () => rows.count(),
    { timeout: 5000, intervals: [50, 150, 400] },
).toBeGreaterThan(10);
```

### `count()` is a snapshot — wrap polling around it when state is async

`locator.count()` returns the DOM size at the moment of the call. If
the React island re-renders the list in two passes (empty placeholder
→ fetched data), a bare `.count()` may capture the placeholder.
Either use `expect.poll(() => locator.count())` or wait for one
known row before reading the count.

### Mind the UI's visible window (calendar, pagination, filters)

A row can be in the database, pass every server-side predicate, and
**still be hidden by a client-side filter**:
- `/slots` shows one week at a time (Sun–Sat in this app's locale)
  — a slot with `start_at = now + 7d` is in next week's column,
  invisible until you advance the week.
- Default page size is 10 — row 11 needs a page click.
- An "Active" filter hides disabled rows by default.

**Don't try to be clever with offsets** like `now + 4h` "to keep it
in today's column". That works most of the day and fails the moment
the suite runs at 23:00 — `+4h` rolls past midnight, the slot lands
on the next calendar day, and depending on day-of-week that may be
the first day of next week. Two of our flakes were exactly this
(commits 7b7c342a, e43bae16).

The robust shape is to **walk the calendar's week-next button until
the row shows up**, capped at N weeks so a truly missing row still
fails fast:

```ts
async function navigateUntilSlotVisible(page, slotId, maxWeeks = 5): Promise<boolean> {
    const card = page.locator(`[data-test-id="slot-card-${slotId}"]`);
    for (let i = 0; i < maxWeeks; i++) {
        if (await card.isVisible({ timeout: 1000 }).catch(() => false)) return true;
        const nextBtn = page.locator('[data-test-id="week-next"]');
        if (!(await nextBtn.isVisible({ timeout: 500 }).catch(() => false))) return false;
        await nextBtn.click();
    }
    return false;
}

// Approved branch
expect(await navigateUntilSlotVisible(userPage, slotId)).toBe(true);

// Unapproved branch — walk through every visible week, confirm
// the card never shows up regardless of which week we land in.
const found = await navigateUntilSlotVisible(userPage, slotId);
expect(found).toBe(false);
```

Same idea applies to pagination ("walk pages until the row appears")
and any other one-frame-at-a-time view that hides off-screen rows.
Don't bet on the offset that puts your row in the starting frame —
bet on the navigation widget that lets the test find it anywhere.

### Prefer role-page fixtures over `newScopedContext`

`browser.newContext()` costs ~150-250ms (storageState parsing +
cookie injection + page-init scripts). The default `page` fixture
already shares a worker-scoped context for the project's own
storage state. For **secondary roles** (a user-tests spec that
also needs an admin page, a cross-role spec that needs both an
admin and an expert), use the role fixtures defined in
`helpers/scoped-test.ts` instead of allocating a context per test:

```ts
// ❌ Two contexts allocated per test, closed at the end. If the
//   describe has 5 such tests, that's 10 newScopedContext calls.
test('admin moderates user', async ({ browser }) => {
    const adminCtx = await newScopedContext(browser, { storageState: resolveStorageStatePath('admin') });
    const userCtx  = await newScopedContext(browser, { storageState: resolveStorageStatePath('user') });
    const adminPage = await adminCtx.newPage();
    const userPage  = await userCtx.newPage();
    try { /* … */ } finally {
        await adminCtx.close();
        await userCtx.close();
    }
});

// ✅ Worker-scoped fixtures: one context per (worker, role) for
//   the whole worker lifetime. Page is fresh per test, with
//   cookies + localStorage reset to the saved storageState before
//   each test, so previous-test state can't leak in.
test('admin moderates user', async ({ adminPage, userPage }) => {
    /* … */
});
```

Fixtures available: `adminContext`, `expertContext`, `userContext`,
`moderatorContext`, `ownerContext` (raw contexts when you need
multiple pages on the same role) and `adminPage` / `expertPage` /
`userPage` / `moderatorPage` / `ownerPage` (fresh page per test).

Pick the page fixture for ~95% of cases. Reach for the raw context
only when one test legitimately wants `await ctx.newPage()` more
than once.

**Side-effects to know:**
- Fixtures are **lazy** — a worker that never sees an `expertPage`-
  taking test will never allocate `expertContext`. Cost is paid on
  first request only.
- State reset between tests is automatic; it uses
  `resetContextToStorageState()` which clears cookies, re-adds the
  ones from the role's `.auth/{role}_w{idx}.json`, and wipes
  `localStorage` + `sessionStorage` on any pages already open in
  the context.
- The X-Test-Worker header is wired up the same way as the default
  `page` fixture — every HTTP request routes to the worker's DB
  scope.
- If you call `page.context().addInitScript(...)` on a role page,
  the init script applies to the next page opened in the same
  worker's context too — until that context closes at worker
  teardown. Don't use `addInitScript` on a role page for
  test-local setup; do the setup imperatively after `goto`.

### Reuse a single browser context across a serial test

Spinning up `newScopedContext(browser)` + `newPage()` + dev-login
takes ~500-1000ms on the FastCGI pool. If your test flow is
`book → DB-confirm → cancel`, the intervening DB UPDATE doesn't
invalidate the user's session — keep one context for all three HTTP
calls instead of opening a fresh login per step.

```ts
// ❌ Two dev-logins per scenario × 3 scenarios = ~5s pure overhead
const s1 = await devLogin(browser, 'user');
await bookViaHttp(s1.page, slotId);
await s1.context.close();
// ... DB writes ...
const s2 = await devLogin(browser, 'user');
await cancelViaHttp(s2.page, bookingId);
await s2.context.close();

// ✅ Same context — DB writes don't touch session state
const s = await devLogin(browser, 'user');
try {
    await bookViaHttp(s.page, slotId);
    // ... DB writes ...
    await cancelViaHttp(s.page, bookingId);
} finally {
    await s.context.close();
}
```

If `devLogin` exists because the test wants a temporary, throw-away
session, fine — keep using it. But if you only need "an authenticated
admin page", the `adminPage` fixture above is one less context per
test and already comes with the session baked into storageState.

### Share a context across the whole describe when tests are read-only

For describes whose tests just assert on a rendered page (no
mutations, no toast races), open the context once in `beforeAll` and
reset state with a cheap `page.goto(...)` in `beforeEach`. Closing
and re-creating a context per test eats ~600ms each.

```ts
test.describe('Admin — dashboard UI', () => {
    let context: BrowserContext, page: Page;
    test.beforeAll(async ({ browser }) => {
        context = await newScopedContext(browser);
        page = await context.newPage();
        await loginAsAdmin(page);
    });
    test.beforeEach(async () => { await page.goto('/__garnet/'); });
    test.afterAll(async () => { await context.close(); });
    // ... read-only tests ...
});
```

NB: doesn't work for tests that mock with `page.route(...)` — those
handlers stack across tests and the second test sees the first's
mock.

### Trust globalSetup — don't pre-warm what's already seeded

`isolation-setup.ts` registers the setup-* accounts in every worker's
DB scope, mirrors them into `ir_expert_profiles` where relevant, and
saves dev-login storage states. A "warm-up" `devLogin(browser, role)`
+ immediate `context.close()` in an entry test is pure overhead — the
account is already there and the next real test will open its own
context with the saved storageState.

### Mark read-only files `mode: 'parallel'`

Files that don't mutate cross-test state (admin grid views, page-
loads-and-has-X assertions, structural checks) can fan out across
all PW workers via `test.describe.configure({ mode: 'parallel' })` at
the file top. Caveat: works only when every `beforeAll` is genuinely
self-contained — a beforeAll that registers a user and stores its id
in a module-scoped `let` is per-worker, so siblings in the same file
on a different worker see id=0. The full file-by-file audit is
tracked as #152.

### Replace racy "asymmetric structure" assertions with structural ones

A test like "prev and next pagination buttons must both be present
or both absent" sounds reasonable but isn't true — the grid renders
only `next` on the first page and only `prev` on the last. The
assertion fires intermittently depending on which page the test
lands on. If you can't state the invariant precisely, the assertion
probably encodes a false invariant. Either prove a structural
property that holds in every state, or assert on a specific value
you set up yourself.

### Helpers don't earn waits the caller will also do

Every spec that calls `openStaticPages()` immediately reads from the
page with `expect(...).toBeVisible({ timeout: ... })`. A helper that
does its own `waitForLoadState('networkidle')` adds 500ms before that
caller's poll. Trim helpers to *only* what callers can't also do —
auto-waiting matchers handle the wait for free.

```ts
// ❌ Helper paid for 15s on empty tables (catch swallowed the timeout)
async function openStaticPages(page) {
    await page.goto('/admin/pages/');
    await expect(page.locator('[data-test-id="admin-static-pages"]')).toBeVisible();
    await page.locator('table tbody tr').first().waitFor({ timeout: 15000 }).catch(() => {});
}

// ✅ Caller's `waitForPageRow(slug)` already polls when it needs a row
async function openStaticPages(page) {
    await page.goto('/admin/pages/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-test-id="admin-static-pages"]')).toBeVisible();
}
```

### Pool sizing: pair PW workers with php-cgi workers

`PW_WORKERS=8` × `--workers=32` (php-cgi pool) is the empirical sweet
spot on this box. The FastCGI pool needs ~4× headroom over PW
workers so bursts of `mode:'parallel'` files don't queue at the
front. Below the threshold tests start failing on `502` /
`connect() refused` and we lose more time to retries than we save
on parallelism.

### When a test flakes, debug live with `mcp__garnet-browser__*`

Re-running the suite to diagnose one failing test is the slow way.
The browser-MCP tools let you inspect the same database the test
uses, navigate the UI as the same role, evaluate JS in the page,
and watch testid diffs after a state change — usually pinpointing
whether the bug is in product code, the test setup, or a UI filter
in 3-4 round-trips instead of a 250s suite run.

The approval-flow flake was nailed this way: `db_query` to confirm
the predicate's inputs, `navigate /slots`, observe which slot ids
render, INSERT a row with `start_at = now + 4h`, observe it appear,
UPDATE `IS_APPROVED='0'`, observe it disappear. The bug turned out
to be a `+7d` start_at in the test, completely outside the calendar's
visible week — no product issue at all.

---

## Core Principle: Never Rely on Text

Tests **must not** match elements by visible text content. Text changes with locale, copy rewrites,
and i18n key renames — any of which silently breaks tests.

**Always prefer `data-test-id` selectors.**

---

## data-test-id Convention

All interactive elements in admin panel components expose `data-test-id` attributes.

### Naming rules

| Pattern | Description | Example |
|---------|-------------|---------|
| `tabnav-btn-{tabId}` | Tab button in TabNav | `tabnav-btn-experts` |
| `tabnav-close-{tabId}` | Close (×) button on closeable tab | `tabnav-close-expert-42` |
| `breadcrumb-btn-{tabId}` | Ancestor link in breadcrumb | `breadcrumb-btn-experts` |
| `filter-tab-{key}` | Filter tab in UsersSection | `filter-tab-all`, `filter-tab-students` |
| `user-login-{id}` | Clickable user login in users grid | `user-login-7` |
| `expert-name-{id}` | Clickable expert name in experts grid | `expert-name-3` |
| `flag-{FLAG}-{id}` | Flag toggle button (IS_APPROVED etc.) | `flag-IS_APPROVED-7` |
| `admin-grid-search` | Search input in AdminGrid | — |
| `sort-col-{key}` | Sortable column header | `sort-col-id`, `sort-col-login` |
| `admin-grid-prev` / `admin-grid-next` | Pagination buttons | — |
| `expand-section-slots-{expertId}` | "Слоты" tab in ExpertExpandPanel | `expand-section-slots-5` |
| `user-detail-tab-{key}` | Tab inside UserDetailPanel | `user-detail-tab-personal` |
| `slot-card-{id}` | Slot card in UserDetailPanel | `slot-card-9` |

### Implementation rule

Every component that renders interactive elements **must** add `data-test-id`.
Add the attribute when the element is first created — not as an afterthought.

```tsx
// ✅ Good
<button data-test-id={`user-login-${r.id}`} ...>

// ❌ Bad — breaks with locale changes
page.locator('button', { hasText: 'Пользователи' })
page.locator('button', { hasText: /Teacher|Преподаватель/i })
```

---

## Locator Helpers

```typescript
// Get by testid (preferred)
page.getByTestId('filter-tab-all')
page.locator('[data-test-id="admin-grid-search"]')

// Prefix match (when ID is dynamic)
page.locator('[data-test-id^="tabnav-btn-"]')           // all tab buttons
page.locator('[data-test-id^="expert-name-"]')  // any expert's name button

// Active tab — use aria-selected instead of CSS class
page.locator('[data-test-id^="tabnav-btn-"][aria-selected="true"]')
```

---

## Active State Detection

TabNav buttons expose `aria-selected={active}`.
**Do not** use `.border-blue-500` CSS class to detect active state.

```typescript
// ✅ Good
const activeTab = page.locator('[data-test-id^="tabnav-btn-"][aria-selected="true"]');

// ❌ Bad
const activeTab = page.locator('ul button.border-blue-500');
```

---

## What IS still OK to use

- **Structural selectors**: `tbody tr`, `thead th`, `td[colspan]` — these reflect DOM structure, not UI copy.
- **Type/class selectors**: `input[type="search"]` is fine as a fallback but `data-test-id` is preferred.
- **`count()`** assertions on collections selected by testid prefix.

---

## Sidebar Navigation

The `SidebarMenu` component auto-generates testids from item labels:
```
data-test-id="sidebar-{label-lowercased}"
```
Example: `sidebar-пользователи`, `sidebar-эксперты`, `sidebar-материалы`.

---

## Adding testids to new components

1. Identify every button, link, or interactive container.
2. Pick a name from the convention table above (or extend it with a new pattern).
3. Document new patterns in this file.
4. Update tests to use the new testids immediately.
