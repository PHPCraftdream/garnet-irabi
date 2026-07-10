# Security Audit 03 — Auth / Sessions / System Endpoints (IRabi)

**Scope:** authentication, session, and special system HTTP endpoints that
sit outside the normal role model.
**Type:** authorized defensive review of an open-source example app.
**Date:** 2026-07-10
**Auditor:** automated code review (Fable 5).

## Files reviewed

- `Foreground/Middlewares/IrabiAuthMiddleware.php`
- `Foreground/Controllers/DevLoginController.php`
- `Foreground/Controllers/SysOpcacheResetController.php`
- `Foreground/Controllers/SysLogController.php`
- `Foreground/Middlewares/UserDataMiddleware.php`
- Framework support code:
  - `garnet-framework/Kernel/Core/Env/TestScope.php`
  - `garnet-framework/Kernel/Core/Env/Env.php`
  - `garnet-framework/Kernel/Db/Entity/Session/Session.php`
  - `garnet-framework/Bundle/Modules/Auth/Middlewares/EmailAuthMiddleware.php`
  - `garnet-framework/Bundle/Modules/Auth/Middlewares/RegMiddleware.php`
  - `garnet-framework/Bundle/Middlewares/WorkerScopeMiddleware.php`
  - `garnet-framework/Kernel/Io/IniConfig/IniConfig.php`
  - `garnet-framework/Kernel/Core/GlobalReqParams/GlobalReqParams.php`
  - `garnet-framework/Kernel/Db/Entity/Account/Account.php`
  - `IRabi.php` (routing / middleware wiring)

---

## Summary

No **critical** authentication-bypass vulnerability was found. The two
mechanisms that at first glance look risky — the `.test` auto-login and the
`.allow_tests` production test scope — are correctly gated:

- The `.test` auto-login in `IrabiAuthMiddleware::processPhaseNullPost` is
  reachable **only after** the parent `authOnly()` has already run the
  `Origin`/`Referer` allow-list check and the CSRF-token check, and it is
  gated by `env=dev` (a server-only ini file) **OR** `TestScope::isActive()`
  (a secret token file plus a constant-time-compared header). Neither gate
  can be flipped by an unauthenticated attacker in a correctly-configured
  production deployment.
- `TestScope::isActive()` requires a secret on disk (`.allow_tests`) that a
  remote attacker cannot read or plant, compared in constant time. Verified,
  not a vulnerability.
- `Env::isDevDir()` is a pure filesystem check (presence of `.idea`/`.vscode`
  etc. in the runtime directory tree) and is not influenced by any request
  input. Verified, not a vulnerability.

The residual findings below are **defense-in-depth / misconfiguration-impact**
observations (mostly Medium/Low), the most important being that the
state-changing dev/system endpoints (`/sys/log`, `/sys/opcache-reset`,
`/dev-login`) are wired with **no CSRF middleware** and rely entirely on their
own gate, so their safety is 100% dependent on that gate (and, for dev-login,
on the deployment never shipping a dev marker directory).

---

## Findings

### F-1 — `/dev-login` is fully authenticated-session-granting and its only gate is a filesystem heuristic (`Env::isDevDir`)

- **File / Line:** `Foreground/Controllers/DevLoginController.php:35-36`, `:150-153`; gate impl `garnet-framework/Kernel/Core/Env/Env.php:15-47`
- **Severity:** Medium (High **if** a dev-marker directory is ever shipped to prod)
- **Description:**
  `post__main` mints a fully authenticated session for an arbitrary role
  (`admin`, `owner`, `moderator`, `expert`, `user`) or for any `*.test`
  login, with **no password, no email code, and no CSRF token**. `post__resetDb`
  wipes tables and deletes `%@%.test` accounts. Both are gated solely by
  `Env::isDevDir()`, which returns `true` when any of the last 6 ancestor
  directories of the framework contains a dev-tool marker file
  (`.idea`, `.vs`, `.xcodeproj`, `.vscode`, `.atom`).
  This is a **server-side filesystem** check — it does **not** read any header,
  cookie, GET or POST value, so an attacker cannot flip it from a request.
  That part is safe.
  The residual risk is purely deployment hygiene: if a `.idea/` (or other
  marker) directory is ever rsync'd/copied to the production host within 6
  levels of the framework directory, `isDevDir()` flips to `true` on prod and
  `/system/dev-login` becomes a **full unauthenticated admin/owner login and
  DB-reset endpoint** for anyone on the internet. There is no second factor
  (no `env=prod` cross-check, unlike `WorkerScopeMiddleware::isDevContext()`
  which requires BOTH `isDev()` AND `isDevDir()`).
- **Exploitation scenario:**
  Prod only, and only under the misconfiguration above. Attacker POSTs
  `role=owner` to `https://victim/system/dev-login/~main` → receives a
  session cookie with owner privileges; or POSTs to `.../~resetDb` to
  truncate ledger/bookings/payments and delete every `*.test` account. No
  token needed. In a correct prod deploy (no marker dirs) the endpoint
  returns `403 {"error":"Not available"}` and is not exploitable.
- **Recommendation:**
  1. Add a second, positive gate that cannot be satisfied by an accidental
     file copy — require `IniConfig::app()->paramString('env','prod') === 'dev'`
     **AND** `Env::isDevDir()` (mirror `WorkerScopeMiddleware::isDevContext`),
     so a stray `.idea` alone can't open it.
  2. Ensure deploy tooling excludes IDE/dev marker directories
     (`.idea`, `.vscode`, `.vs`, `.atom`, `.xcodeproj`) from the production
     artifact (add to deploy ignore list / `.gitattributes export-ignore`).
  3. Consider not registering the `/dev-login` route at all when `env!=dev`.

### F-2 — State-changing system endpoints run with no CSRF / no auth middleware

- **File / Line:** `IRabi.php:229-241` (route wiring); `Foreground/Controllers/SysLogController.php:37`; `SysOpcacheResetController.php:31`; `DevLoginController.php:35`
- **Severity:** Low–Medium
- **Description:**
  `/sys/log`, `/sys/opcache-reset` and `/dev-login` are attached only to the
  `$maintenanceOnly` chain (`WorkerScope` + `Maintenance`) or, for dev-login,
  to `WorkerScope` alone. None of them pass through `IrabiAuthMiddleware::authOnly`,
  so the framework's `processOrigin()` + `processCSRF()` (which only run inside
  the auth middleware — `EmailAuthMiddleware.php:127-151`) never execute for
  these routes. Each endpoint is responsible for its own protection:
    - `/sys/opcache-reset` — self-protected by a shared-secret header
      (`hash_equals`), so CSRF is a non-issue (see F-4, verified safe).
    - `/dev-login` — protected only by `isDevDir()` (see F-1).
    - `/sys/log` — write-only append of low-value tracing breadcrumbs
      (see F-3).
  This is a **routing-level observation**: there is a legitimate class of
  state-changing endpoints in `Foreground/Controllers` that deliberately does
  NOT go through the framework CSRF mechanism. That is acceptable for the
  token-gated and log-only ones, but it means `/dev-login`'s CSRF exposure is
  entirely coupled to F-1's gate.
- **Exploitation scenario:**
  If F-1's misconfiguration holds, `/dev-login` is additionally CSRF-able: a
  logged-out victim who visits an attacker page could be silently logged into
  an attacker-chosen role (though the practical value of forcing a *victim's*
  browser into a *dev* role is low; the direct-request abuse in F-1 is the
  real risk). Not exploitable in a correct prod deploy.
- **Recommendation:** Keep the token gate on `/sys/opcache-reset`; harden
  `/dev-login` per F-1. Document that these routes intentionally bypass the
  auth-layer CSRF and must each carry their own gate.

### F-3 — `/sys/log` is an unauthenticated, no-CSRF public log-write endpoint (log spam / minor injection surface)

- **File / Line:** `Foreground/Controllers/SysLogController.php:37-84`
- **Severity:** Low
- **Description:**
  The endpoint is intentionally public and CSRF-free. Input handling is
  reasonably hardened: `cat` is whitelisted to `^[A-Za-z0-9_\-]+$` and capped
  at 32 chars (so **no path traversal** into `Logger::append('fe-'.$cat, …)`
  — no `/`, `\`, `.` can reach the filename), `msg`/`meta` are capped at 1 KB,
  and the payload is written as `json_encode`'d single-line records. It reads
  **no** file and cannot be used to read arbitrary files — it is write-only.
  Residual issues:
    - Any anonymous client can append arbitrary attacker-controlled `msg`/`meta`
      text and spoofed `ua` to server log files with no rate limit → log
      flooding / disk-fill DoS, and log-forging (attacker-chosen `t`? no — `t`
      is `time()` server-side; `ip` is server-derived; `uid` from session).
      `msg`/`meta`/`ua` are attacker-controlled but JSON-encoded, so no log-line
      injection (newlines are escaped by `json_encode`).
    - Downstream log viewers that render these records must treat `msg`/`meta`
      as untrusted (stored-content risk lives in the viewer, not here).
- **Exploitation scenario:**
  Prod, unauthenticated. Attacker scripts a loop POSTing to
  `/system/sys/log/~log` with `cat=x&msg=<1KB>` to grow
  `WorkDir/LogJournal/System/<date>/APP_LOGGER-fe-x.log` without bound.
- **Recommendation:** Add a per-IP rate limit (the framework already has
  `RateLimit::hit`, used in the auth flow); optionally require a same-origin
  `Origin` check. Ensure the log-tail/admin viewers HTML-escape `msg`/`meta`.

### F-4 — `SysOpcacheResetController` token check — reviewed, correct

- **File / Line:** `Foreground/Controllers/SysOpcacheResetController.php:31-64`
- **Severity:** Informational (no vulnerability)
- **Description / verification:**
  - Empty/missing/unreadable `opcache_token` → `$expected` becomes `''` after
    `trim`, and the code returns `503 token_not_configured` **before** any
    compare (line 40-42). There is **no** path where an empty configured token
    still passes the check. Good — fails closed.
  - The provided value is read from `HTTP_X_GARNET_OPCACHE_TOKEN` and rejected
    if empty (`$provided === ''`) before `hash_equals` (line 45), so an empty
    header can never match.
  - Comparison is `hash_equals($expected, $provided)` — constant-time, correct
    argument order (known string first, user string second). No timing leak on
    length beyond what `hash_equals` inherently tolerates.
  - `opcache_reset()` guarded by `function_exists` and `@`-suppressed; worst
    case is a benign no-op. The action itself (flushing opcode cache) is
    low-impact even if the token ever leaked.
  **Conclusion: verified, not a vulnerability.** Only caveat: it is a bearer
  token in a header, so it must be sent over TLS and kept out of logs — a
  deployment concern, not a code defect.

### F-5 — `DevLoginController::post__resetDb` raw SQL — no injection, but note

- **File / Line:** `Foreground/Controllers/DevLoginController.php:150-180`
- **Severity:** Informational / Low
- **Description:**
  The `TRUNCATE` / `DELETE` statements build table names via
  `self::prefixed($table)` where `$table` comes from a **hardcoded** array
  (`balance_ledger`, `account_balance`, …) and the prefix comes from
  `IniConfig::db()->paramString('prefix','db')` (server config, or the
  `WorkerScopeMiddleware` runtime override which is itself validated to
  `test_worker_<0-64>`). **No user-supplied value is concatenated into the
  SQL** — the `login LIKE '%@%.test'` pattern is a constant literal, not
  request input. So there is **no SQL injection** here.
  The real risk is not injection but *availability*: if this endpoint is ever
  reachable in prod (F-1), it performs `SET FOREIGN_KEY_CHECKS=0` +
  `TRUNCATE` of ledger/bookings/payments/expert tables and deletes all
  `%@%.test` accounts — a destructive DB wipe. The `.test` account filter
  limits account deletion, but the `TRUNCATE`s hit the **live** prefixed
  tables unconditionally.
- **Exploitation scenario:** Same precondition as F-1 (marker dir on prod).
  Not otherwise reachable.
- **Recommendation:** Gate as in F-1 (require `env=dev`). The SQL itself needs
  no change.

---

## Проверено, не уязвимость (Reviewed — not a vulnerability)

### V-1 — `.test` auto-login gate `IniConfig::app()->paramString('env','prod') === 'dev'` is not attacker-influenceable

- **File:** `IrabiAuthMiddleware.php:39-49`; config impl `IniConfig.php:143-177`
- The `env` value is read exclusively from the parsed `app.ini` file
  (`parse_ini_file`, `IniConfig::init()`). `effectiveValue()` consults
  `runtimeOverrides` first, but the **only** producer of runtime overrides in
  the codebase is `WorkerScopeMiddleware`, which overrides the **`prefix`** key
  on `IniConfig::db()` — never `env` on `IniConfig::app()`. There is no code
  path where a request header/cookie/GET/POST value reaches the `env` param.
  An attacker cannot make `env` evaluate to `dev`. **Not a vulnerability.**
- Note: the IRabi override deliberately uses the on-disk `env` ini value rather
  than `$globals->isDev()`. That is the safer choice — `isDev()` also trusts
  `SERVER_NAME`/`SERVER_SOFTWARE` heuristics (`GlobalReqParams.php:136-163`);
  the `GARNET_DEV=1` escape there reads `$_SERVER['GARNET_DEV']` (an env var),
  not the `HTTP_GARNET_DEV` header a client could send, so even `isDev()` is
  not client-flippable — but `env`-from-ini is stricter still.

### V-2 — `TestScope::isActive()` requires an on-disk secret token + constant-time header match

- **File:** `garnet-framework/Kernel/Core/Env/TestScope.php:64-138`
- The gate is **off by default**. It returns `true` only when:
  1. A file `.allow_tests` exists in the active app directory **and** holds a
     non-empty, trimmed secret (`fileToken()`), **and**
  2. The request proves knowledge of that secret via header
     `run-test-garnet-team: <token>` (arrives as
     `$_SERVER['HTTP_RUN_TEST_GARNET_TEAM']`), compared with
     `hash_equals($token, $header)` (constant-time), **or** (CLI only) env var
     `GARNET_TEST_TOKEN`.
  A remote attacker cannot read the on-disk file, cannot plant it, and cannot
  guess the secret; the compare is timing-safe and the empty-token case is
  handled (`fileToken()` returns `null` → gate closed). Therefore the `.test`
  auto-login cannot be reached in prod via TestScope without server
  compromise. **Not a vulnerability.**

### V-3 — The `.test` auto-login does NOT bypass CSRF / Origin

- **File:** `IrabiAuthMiddleware.php:35-77` (override) reached from
  `EmailAuthMiddleware::authOnly` `:123-160`
- `processPhaseNullPost` is invoked from `authOnly()` at line 158-160, which is
  **after** `processOrigin()` (`:134`) and `processCSRF()` (`:140`) have already
  run and returned early on failure. So even in dev/TestScope, the auto-login
  POST must carry a valid same-origin `Origin`/`Referer` and a matching
  `CSRF_TOKEN`. It is not an unauthenticated cross-site login primitive.
  **Not a vulnerability.**

### V-4 — `Env::isDevDir()` is request-independent

- **File:** `garnet-framework/Kernel/Core/Env/Env.php:15-47`
- Pure filesystem inspection of ancestor directories for IDE marker files.
  Reads no header/cookie/GET/POST. An attacker cannot flip it from a request.
  Its only risk is deployment hygiene (see F-1). **Not a request-exploitable
  vulnerability.**

### V-5 — CSRF token generation and verification are sound

- **File:** `Session.php:91-159` (mint), `EmailAuthMiddleware.php:192-225` (verify)
- `checkCSRF()` reads the POSTed `CSRF_TOKEN`, requires it be non-empty, mints/
  reads the session token, requires it non-empty, and compares with
  `hash_equals` (`EmailAuthMiddleware`). The base `AuthMiddleware` variant uses
  `===` (`AuthMiddleware.php:197`) which is not constant-time, but IRabi uses
  `IrabiAuthMiddleware extends EmailAuthMiddleware`, i.e. the `hash_equals`
  path. The CSRF cookie is `HttpOnly`, `SameSite=Lax`, `Secure` outside local
  dev. **Not a vulnerability** for IRabi. (Minor framework note: unify the base
  `AuthMiddleware::checkCSRF` on `hash_equals` too, for consistency — CSRF token
  compare is low-value for timing attacks but consistency is cheap.)

### V-6 — `UserDataMiddleware` has no trust-the-client identity pattern

- **File:** `UserDataMiddleware.php` + `RegMiddleware::process` `:68-85` +
  `Account::fromSession` (`Account.php:64-92`)
- Role checks (`expertOnly`/`moderatorOnly`/`adminOnly`/`ownerOnly`) delegate to
  `UserEntityConfig::isExpert()` etc., which resolve the account from
  `Account::fromSession()`. `fromSession()` derives the login **only** from the
  server-side session value `auth_login` (written server-side during the auth
  flow); it never reads an `account_id` from a cookie, header, or request body.
  The `account_id` emitted into layout params (`IRabi.php:588`) is output-only
  (for the frontend), not an input to authorization. Registration
  (`RegMiddleware::processPost`) also operates on `Account::fromSession()`, and
  admin/moderator promotion is driven by `admin_emails`/`moderator_emails` from
  server config matched against the session-derived login — not by client input.
  **No trust-the-client identity acceptance. Not a vulnerability.**

---

## Overall verdict

- **Critical findings: none.** The authentication/session core is sound: identity
  comes from the server-side session, the `.test` auto-login and prod test scope
  are correctly gated behind an on-disk secret / server-only ini value and still
  enforce Origin+CSRF, and the opcache endpoint uses a correct fail-closed,
  constant-time token check.
- **Primary residual risk (Medium, escalates to High under misconfiguration):**
  `/dev-login` (F-1/F-5) grants full admin/owner sessions and can wipe the DB,
  gated only by the filesystem heuristic `Env::isDevDir()` with no `env=prod`
  cross-check. A single stray IDE marker directory on a prod host would expose
  it. Hardening it with a positive `env=dev` requirement and excluding dev
  marker directories from prod artifacts closes this.
- **Lower-priority:** rate-limit `/sys/log` (F-3); document that `/sys/*` and
  `/dev-login` intentionally bypass the auth-layer CSRF and each carry their own
  gate (F-2).
