# Security Audit 04 — Common Services, Entities & Tables (business logic behind HTTP controllers)

**Scope of this pass**
- `Common/Services/*.php` (all files)
- `Common/Entity/Account/Account.php`
- `Common/Tables/*.php` (query-building / logic only)
- Framework primitives directly invoked by the above where they determine security
  (`FwBalanceLedger`, `FwAccountBalance`, `Env::isDevDir()`), plus the HTTP controllers
  that reach into these services (to establish reachability).

**Focus areas requested:** raw SQL / SQLi, balance/ledger integrity (negative balance,
double-apply, idempotency), mass assignment via generic `setParam`, missing transactions,
email header injection, and reachability of destructive seed/clear services from HTTP.

---

## Summary

The application-level Services, the `Account` entity, and the `Tables` classes are, on the
whole, **well-hardened against the classic injection and mass-assignment classes**:

- **No SQL injection was found in scope.** Every raw-SQL string in the audited services
  (`EmailNotifications`, `ClearUserService`, `TestScopeDbService`, `ClearLogsService`,
  `NewsService`, `AppCronService`) binds user-derived values through placeholders (`?` / `:name`).
  Where a table/column name is interpolated into the SQL string, it is always sourced from the
  framework (`getTableName()`, an IniConfig prefix, or an `information_schema` lookup filtered by
  a `LIKE`-escaped prefix) — never from an HTTP parameter.
- **No mass-assignment was found.** Every `Account::setParam($key, $value)` call in scope uses a
  hard-coded literal key (`'name'`, `'type'`, `'time_zone'`, `'token16'`, …). No code path lets an
  attacker control the `$key` argument, so arbitrary EAV fields (role flags, `approved`, balance)
  cannot be set through these services.
- **No email header injection was found.** `EmailNotifications` never builds raw RFC-822 headers;
  it produces a `subject` (from i18n templates) and an HTML `body` (rendered through Twig, which
  auto-escapes) and hands them to `FwEmailQueueService::enqueue()`. No CRLF-carrying user string is
  concatenated into a header.
- **The destructive CLI services** (`ClearUserService`, `ClearLogsService`, `TestScopeDbService`,
  `TestScopeSeedService`) are **only reachable from `Common/Commands/CMD*` CLI commands**, which
  are themselves gated by test-mode / `Env::isDevDir()`. They are **not** wired to any HTTP route.
  → **Checked, not a web-reachable vulnerability.**

Two items warrant attention:

- **F1 (High, deployment-dependent):** `DevSeedService::seed()` and a full test-data wipe are
  reachable over HTTP through `DevLoginController` (`POST /dev-login`), whose route is registered
  **unconditionally**. The only guard is the `Env::isDevDir()` filesystem heuristic. The same
  endpoint also performs privilege escalation (grants `IS_ADMIN`/`IS_OWNER`/`IS_MODERATOR`). If the
  heuristic misfires on a production host, this is a critical takeover; on a correctly-deployed
  prod tree it is inert.
- **F2 (Medium, architectural):** The balance ledger primitive (`FwBalanceLedger::addEntry` →
  `FwAccountBalance::recalculate`) applies an insert-then-`SUM`-recalculate with **no surrounding
  transaction and no non-negative guard**. It cannot, by itself, reject an overdraft or serialise
  concurrent debits. Whether this is exploitable depends on the calling controllers (out of this
  pass's file scope), but the primitive offers them no safety net, so it is documented here.

No other real risks were identified in the audited files.

---

## Findings

### F1 — Dev-only seed + data-wipe + privilege-escalation reachable over HTTP, guarded only by a filesystem heuristic

- **Files / lines:**
  - `Common/Services/DevSeedService.php:58` (`seed()` entry point) — the in-scope service.
  - Reached from `Foreground/Controllers/DevLoginController.php:129` (`DevSeedService::seed()`),
    `:101-124` (role-flag escalation), `:150-180` (`post__resetDb` — `TRUNCATE` + `DELETE`).
  - Route registered unconditionally at `IRabi.php:239-241`.
  - Guard: `Env::isDevDir()` — `garnet-framework/Kernel/Core/Env/Env.php:15-47`.
- **Severity:** High (Critical if the guard is bypassable on the target host; inert on a clean prod tree).
- **Description:**
  `POST /dev-login` is always routed (no compile-time / config gate on route registration). Inside
  the handler the only protection is `Env::isDevDir()`, which walks up to 6 parent directories from
  `Env.php`'s own location and returns `true` if it finds a `.idea`, `.vscode`, `.vs`, `.xcodeproj`,
  or `.atom` directory. This is a **heuristic, not an explicit environment flag**. When it returns
  `true`, three distinct powerful operations become available to an unauthenticated client:
  1. `post__main` with `role=admin|owner|moderator|expert|user` → `touchAccount('<role>@dev.test')`,
     sets staff flags (`setAdmin/​setOwner/​setModerator/​setApproved`), then logs the caller in as
     that account with a fresh CSRF cookie — i.e. **instant admin session** (`DevLoginController.php:76-147`).
  2. `post__main` with `login=<anything>.test` → logs in as any existing `*.test` account without OTP.
  3. `post__resetDb` → `SET FOREIGN_KEY_CHECKS=0`, `TRUNCATE` of `balance_ledger`, `account_balance`,
     `bookings`, `time_slots`, `payments`, … and `DELETE` of every account whose login matches
     `%@%.test` (`DevLoginController.php:159-174`) — **destructive data loss**.

  `DevSeedService::seed()` itself is safe internally (all seed values are hard-coded or randomly
  generated; no user input reaches its SQL or its `setParam` keys). The risk is purely one of
  **exposure**: a dev-only surface whose kill-switch is a fragile directory-sniffing heuristic
  rather than a deny-by-default production config.
- **Exploitation scenario (HTTP):**
  If a production deployment ever ships or generates an IDE metadata directory (`.idea`, `.vscode`,
  etc.) within 6 directory levels above the vendored `garnet-framework/Kernel/Core/Env/Env.php`
  (e.g. an editor opened on the server, a CI artifact, a repo checkout retaining `.idea`), then:
  ```
  POST /dev-login
  Content-Type: application/x-www-form-urlencoded

  role=admin
  ```
  returns `{"success":true}` and a live **admin** session cookie for an unauthenticated attacker.
  A follow-up `POST /dev-login` with an `post__resetDb` action wipes financial and booking tables
  for the active DB prefix.
- **Recommendation:**
  - Do **not** rely on `Env::isDevDir()` as the sole gate for state-changing / privilege-granting
    endpoints. Add an explicit, deny-by-default configuration flag (e.g. `IRABI_ENABLE_DEV_LOGIN=1`,
    absent in prod), and require it *in addition to* the heuristic.
  - Prefer **not registering the `DevLoginController` route at all** unless the dev flag is set
    (move the gate to `IRabi.php:239` route registration, so the endpoint returns 404 in prod
    instead of relying on an in-handler check).
  - Ensure production build/deploy pipelines strip IDE metadata directories so the heuristic cannot
    be tricked; add a deploy-time assertion that `Env::isDevDir()` is `false`.

---

### F2 — Balance ledger primitive has no transaction and no non-negative / overdraft guard

- **Files / lines:**
  - In-scope: `Common/Tables/BalanceLedger.php` and `Common/Tables/AccountBalance.php`
    (thin subclasses that inherit the behaviour).
  - Primitive: `garnet-framework/Bundle/Modules/Balance/Tables/FwBalanceLedger.php:42-63`
    (`addEntry`), `FwAccountBalance.php:26-49` (`recalculate`), `:51-55` (`getBalance`).
  - Representative callers within scope: `DevSeedService.php:378-384`,
    `TestScopeSeedService.php:105` (both trusted/seed-only).
- **Severity:** Medium (architectural; exploitability depends on the debit-issuing controllers,
  which are outside this pass's file scope — see audit passes covering `Foreground/Controllers`).
- **Description:**
  `addEntry()` performs `INSERT` of a ledger row and then calls `recalculate()`, which recomputes
  the cached balance as `SUM(CASE WHEN is_credit THEN amount ELSE -amount END)` over the whole
  ledger and writes it into `account_balance`. Three structural gaps:
  1. **No transaction** wraps the insert + recalculate, and no row lock (`SELECT … FOR UPDATE`) is
     taken on `account_balance`. Two concurrent debits both read a stale pre-balance, both insert,
     and the derived `SUM` can reflect only a subset if reads/writes interleave — the classic
     read-modify-write race for a shared balance.
  2. **No non-negative / sufficient-funds check.** `recalculate()` writes whatever the `SUM`
     produces, including a **negative** balance. The primitive cannot reject an overdraft; a caller
     that debits without first checking `getBalance()` (or that checks non-atomically) can drive a
     user negative.
  3. **No idempotency at this layer.** `addEntry()` will happily insert a second identical debit for
     the same `ref_type/ref_id`. An `IdempotencyKeys` table exists (`Common/Tables/IdempotencyKeys.php`)
     but it is *not* consulted here — idempotency must be enforced by every caller, which is
     error-prone. A replayed booking-pay request that reaches `addEntry` twice double-charges.
- **Exploitation scenario (HTTP):**
  Requires a controller that (a) issues a debit via `BalanceLedger::addEntry(..., isCredit:false, ...)`
  from a user request and (b) either omits a pre-debit balance check or performs it non-atomically /
  omits an idempotency key. Under that condition, either firing two booking/pay requests
  concurrently (race) or replaying one (no idempotency) applies the debit twice / drives the balance
  below zero. The primitive provides no defence, so the correctness burden falls entirely on the
  caller. **The concrete reachability must be confirmed against the balance/booking controllers**
  (`BalanceController`, `BookingsController`, `DashboardFinanceController`), which are outside the
  file scope of this pass.
- **Recommendation:**
  - Wrap `addEntry` (insert + recalculate) in a single DB transaction and take a row lock on the
    `account_balance` row (`SELECT … FOR UPDATE`) before recomputing, so concurrent debits serialise.
  - Add an optional `enforceNonNegative` mode (or a dedicated `debit()` that rejects when the
    resulting balance would be `< 0`) so callers get an atomic sufficient-funds guarantee instead of
    a check-then-act TOCTOU.
  - Thread an idempotency key through `addEntry` (or require `ref_type/ref_id` uniqueness for
    debit entry types) so a replayed request cannot double-apply.

---

## Checked — not vulnerabilities

- **`EmailNotifications.php:210` — throttle upsert raw SQL.** `INSERT … ON DUPLICATE KEY UPDATE`
  with the account id, category and timestamp bound as `?` placeholders; the interpolated
  `{$table}` is `EmailThrottle::get()->getTableName()` (framework constant), not user input.
  No injection.
- **`EmailNotifications` subject/body construction.** Subjects come from i18n template methods;
  bodies are Twig-rendered (auto-escaped, `htmlspecialchars` on the few raw rows) and passed to
  `FwEmailQueueService::enqueue()`. No raw email headers are built from user input → no header /
  CRLF injection.
- **`EmailNotifications.php:223` — moderator subquery.** `param IN ('IS_ADMIN','IS_OWNER','IS_MODERATOR') AND value='1'`
  is a fully static string with an interpolated framework table name; no user input.
- **`ClearUserService.php` (all queries).** `clearByEmail($email)` binds `$email` and every account
  id / id-list via placeholders (`inList()` emits `?` placeholders, not values). Table names come
  from a framework-derived prefix and `information_schema` (with the prefix `LIKE`-escaped in
  `ownerColumns()`). Reachable only from `CMDClearUser` (CLI). No SQLi, not HTTP-reachable.
- **`TestScopeDbService.php:38-53` — `DROP TABLE` / FK-check DDL.** The table name is taken from an
  `information_schema` lookup filtered by an escaped `LIKE` prefix, then re-checked with
  `str_starts_with($table, $prefix.'_')` and stripped of backticks before the `DROP`. Prefix is not
  user input. Reachable only from `CMDTestTeardown`/`CMDTestProvision` (CLI). Defence-in-depth is
  sound.
- **`ClearLogsService.php:45` — `DELETE FROM <table>`.** `$table->getTableName()` is a framework
  constant; financial `PaymentsLog` is deliberately excluded. Reachable only from `CMDClearLogs`
  (CLI). No injection, not HTTP-reachable.
- **`TestScopeSeedService.php`.** All values hard-coded; `setParam` keys are literals; balance seed
  goes through `BalanceLedger::addEntry` with trusted amounts. Reachable only from
  `CMDTestProvision` (CLI). Not HTTP-reachable.
- **`AppCronService.php` / `CronCompletionService.php`.** Use the query-builder with bound
  parameters; run from cron/CLI, not from user requests. `extractFormatter()` reflection touches a
  vendor `Stdio` field only, no user input. No issue.
- **`NewsService.php`, `AccountDisplay.php`, `BookingChatNotifier.php`, `StaticPagesService.php`.**
  All DB access goes through the query-builder with bound parameters (`:name` / `?`); interpolated
  identifiers are `getTableName()` results. No user-controlled SQL, no mass assignment.
- **`Account.php` (entity).** Empty override of the framework `BaseAccount` — no new logic, no
  `setParam` surface introduced. Role model is two-axis EAV, mutated only via typed setters
  (`setAdmin`, etc.) from trusted call sites. No mass-assignment surface added here.
- **`Common/Tables/*.php` (schema classes).** `Bookings`, `TimeSlots`, `Payments`, `BalanceLedger`,
  `AccountBalance`, etc. are DDL/schema definitions (column/index builders). No runtime query
  construction from user input. `BalanceLedger` only adds a nullable `actor_id` column.
