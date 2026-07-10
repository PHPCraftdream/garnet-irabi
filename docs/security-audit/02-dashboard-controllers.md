# Security Audit — Dashboard Controllers (`Dashboard/Controllers/`)

Scope: `D:\dev\garnet\Apps\IRabi\Dashboard\Controllers\` — the admin panel. Defensive audit, authorized by the repository owner. Only risks reachable via an authenticated HTTP request (possibly by a low-privileged staff member) are reported.

## Threat model / role hierarchy (established before findings)

The staff role hierarchy is defined in `Foreground/Params/UserEntityConfig.php` and is **nested**:

- `isModerator()` → true for **moderator OR owner OR admin** (lowest staff gate).
- `isOwner()`    → true for **owner OR admin**.
- `isAdmin()`    → true for **admin** only.

Route wiring (`IRabi.php`, lines ~243-272):

- Every `/admin/*` controller is registered with the `$common` middleware chain, which includes `IrabiAuthMiddleware::authOnly` and then a role gate.
- The role gate for most dashboard controllers is `UserDataMiddleware::moderatorOnly`; for `DashboardSystemController` and `DashboardStaticPagesController` it is `UserDataMiddleware::ownerOnly`.
- The framework `Router` (`garnet-framework/Kernel/Io/Router/Router.php`) matches by base route value and dispatches `~subaction` calls to the **same** route entry, so the route-level middleware applies to every `post__*` / `get__*` sub-action, not just `get__main`.

**CSRF and Origin are enforced globally** for every POST on these routes: `IrabiAuthMiddleware` extends `EmailAuthMiddleware`, whose `authOnly()` runs `processOrigin()` + `processCSRF()` on every POST before the controller (`garnet-framework/Bundle/Modules/Auth/Middlewares/EmailAuthMiddleware.php:127-144`). A missing/invalid `CSRF_TOKEN` yields HTTP 403. Therefore CSRF (audit item #7) is **not** a finding — it is correctly enforced framework-wide, including for the state-changing finance / role / delete endpoints.

Because of this, the residual risk surface is **vertical privilege within the staff tier** (moderator doing what should be owner/admin-only) and data-exposure/IDOR *between staff and any account*, not anonymous access.

---

## Summary of findings

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High     | 2 |
| Medium   | 2 |
| Low      | 1 |

Note: No SQL injection, no command/shell execution from HTTP, no XXE, no path traversal, and no CSRF gaps were found — those are explicitly marked "checked, not a vulnerability" below. The findings are all **vertical-privilege / missing target-rank guard** issues within the staff tier.

---

## Findings

### H-1 — Moderator can arbitrarily credit/debit ANY account balance (financial privilege escalation)

- **File / Line:** `Dashboard/Controllers/DashboardFinanceController.php:328` (`post__adjustBalance`), gate at line 329.
- **Severity:** High
- **Description:** `post__adjustBalance` performs a direct manual money movement — it inserts a `manual` entry into `BalanceLedger` and recalculates `AccountBalance` — but is gated only by `static::isModerator()`. A moderator (the lowest staff rank) can therefore mint or remove funds on any account, including on an owner/admin account or on their own account. The only validations are `account_id > 0`, `amount > 0`, and `note` length 3–500; there is no cap on `amount`, no restriction to non-staff targets, and no requirement of owner/admin rank. The rest of the same controller (`fetchBalances`/`resolveRole`) is careful to distinguish moderator vs owner vs admin, and the neighbouring `DashboardUsersController::post__setUserFlag` explicitly restricts sensitive flags to owner/admin — so this is inconsistent, under-privileged protection for the single most sensitive action in the panel (real money).
- **Exploitation scenario:** Attacker role = **moderator**. `POST /admin/finance/~adjustBalance` with a valid session CSRF token and body `account_id=<self or any id>&amount=100000000&is_credit=1&note=grant`. Result: the target balance is credited by 100,000,000 units; the moderator can then spend it via the normal booking flow, or drain another user by sending `is_credit=0`. The action is logged (`balance.adjust`) but not prevented.
- **Recommendation:** Require `static::isOwner()` (owner/admin) — or a dedicated finance role — for `post__adjustBalance`, matching the sensitivity of role-flag changes. Additionally: reject adjustments that target staff accounts unless the actor outranks the target, add a sane per-operation `amount` ceiling, and consider a second-person approval for large adjustments. At minimum, move the route to the `ownerOnly` middleware group in `IRabi.php`.

---

### H-2 — Moderator can disable / lock out higher-privileged accounts (owner/admin) — no target-rank guard

- **File / Line:** `Dashboard/Controllers/DashboardUsersController.php:56` (`post__setUserFlag`); allowed-flag logic lines 69-76; write lines 89-94.
- **Severity:** High
- **Description:** `post__setUserFlag` correctly prevents a moderator from granting role flags (`IS_OWNER`/`IS_MODERATOR`/`IS_ADMIN` are only added to `$allowed` for owner/admin callers). However `IS_DISABLED` and `IS_APPROVED` are always in `$allowed` for any moderator, and there is **no check on the target's rank**. A moderator can therefore set `IS_DISABLED=1` on an owner's or admin's account (or on another moderator's), locking superiors out of the system — a vertical-privilege / denial-of-service escalation. There is also no guard preventing a staff member from toggling flags on themselves.
- **Exploitation scenario:** Attacker role = **moderator**. `POST /admin/~setUserFlag` with body `user_id=<owner_id>&flag=IS_DISABLED&value=1`. Result: the owner account is disabled; if the disabled flag blocks login, the moderator has locked out the account that could revoke their own moderator status, potentially achieving persistence.
- **Recommendation:** Before applying `IS_DISABLED`/`IS_APPROVED` (and any flag), verify the actor outranks the target: resolve the target's staff flags and refuse when the target is owner/admin (or equal-or-higher rank than the actor). Disallow self-targeting for disable. Apply the same target-rank rule in `post__setUserType` (`:154`) so a moderator cannot flip an owner/admin's `type`.

---

### M-1 — Moderator has full read access to all financial ledger, balances and cross-account PII

- **File / Line:** `Dashboard/Controllers/DashboardFinanceController.php:273` (`get__main` → `fetchLedger`/`fetchBalances`); `Dashboard/Controllers/DashboardUsersController.php:280` (`post__userDetail`).
- **Severity:** Medium
- **Description:** `get__main` (Finance) and `post__userDetail` (Users) expose the complete platform ledger (last 300 entries with counterparties), every account's current balance, and, for any `account_id`, that user's full balance ledger, bookings, support tickets, cancellations and profile — all behind only `isModerator()`. This is a design choice (moderators are staff), but it means the lowest staff rank can read every user's complete financial and personal history without any per-record ownership/scope check. If the intent is that only owner/admin should see finance data, this is an over-exposure; the Finance sidebar item and page are moderator-visible today. Not an IDOR in the classic sense (no tenant/scope boundary exists in this single-tenant app), but a broad sensitive-data exposure to a low-privileged staff role.
- **Exploitation scenario:** Attacker role = **moderator**. `GET /admin/finance/` returns the full ledger + all balances; `POST /admin/~userDetail` with `account_id=<any>` returns that account's complete ledger, bookings and tickets. No further privilege is needed.
- **Recommendation:** Decide the intended sensitivity boundary. If finance data should be owner/admin-only, gate `DashboardFinanceController` and the ledger/balance portions of `userDetail` behind `isOwner()`. Otherwise document explicitly that moderators are trusted with all financial/PII data. Consider redacting balance/ledger from `userDetail` for moderators while keeping profile/support visible.

---

### M-2 — Mail-log viewer exposes full email bodies to moderators via the rendered rows (only search is admin-gated)

- **File / Line:** `Dashboard/Controllers/DashboardLogsController.php:63-89` (`mailsGridConfig`), interplay with `isAdmin()` at `:71-74`; parent `FwDashboardLogsViewerController::post__mailsPage` (`:207`) gated on `isModerator()`.
- **Severity:** Medium
- **Description:** The mail-log tab distinguishes admin vs moderator only for **search fields** — `body_html` and `meta` are added to `searchFields` only when `isAdmin()` (`:71-74`). But the actual mail rows returned to the grid are produced by `FwLogsMailAdapter::run(... static::isAdmin() ...)`; whether `body_html` is stripped for non-admins depends on that adapter. The IRabi subclass only narrows *search*, implying body content is otherwise present. Mail bodies frequently contain password-reset / magic-login links, verification codes and PII. If the adapter returns `body_html` in the row payload for moderators (search gating is separate from column gating), a moderator can read every user's outbound email content — an authorization inconsistency where sibling gating (admin-only search) exists but body visibility does not clearly match.
- **Exploitation scenario:** Attacker role = **moderator**. Open `/admin/logs/?tab=mails`, then `POST /admin/logs/~mailsPage`. If rows include `body_html`, the moderator reads e.g. a target user's login-code email and can hijack the account.
- **Recommendation:** Verify `FwLogsMailAdapter::run()` strips `body_html`/`meta` from row payloads when the `isAdmin` argument is false; if it does not, gate those columns to `isAdmin()` the same way search is gated. Ensure the sensitivity of *displayed* mail bodies matches the sensitivity already assumed for *searching* them.

---

### L-1 — `announceFutureSlots` / news broadcast triggered by moderator flag change (low-impact side effect)

- **File / Line:** `Dashboard/Controllers/DashboardUsersController.php:99-116` and `:703` (`announceFutureSlots`), reached from `post__setUserFlag`.
- **Severity:** Low
- **Description:** When a moderator sets `IS_APPROVED` on an expert, the handler cascades to `ExpertProfiles`, sends approval/rejection emails, and broadcasts "new slot" news events for all future slots. This is intended behaviour, but combined with H-2's lack of a target-rank guard, a moderator can drive email/news side effects for arbitrary accounts (e.g. repeatedly approve/reject to generate email churn to a targeted expert). Impact is limited to notification spam, not data compromise.
- **Exploitation scenario:** Attacker role = **moderator**. Toggle `IS_APPROVED` on an expert repeatedly via `POST /admin/~setUserFlag`; each real transition dispatches an email and news broadcast. Rate-limited only by the moderator's manual effort.
- **Recommendation:** After fixing H-2 (target-rank guard + self-target restriction), additionally consider debouncing / rate-limiting the approval→email/news cascade so it cannot be used for notification abuse.

---

## Explicitly checked — NOT vulnerabilities

- **CSRF on state-changing actions (audit item #7):** Enforced globally. `IrabiAuthMiddleware::authOnly` (in every admin route's `$common` chain) runs `processOrigin()` + `processCSRF()` on all POSTs and returns 403 on a missing/invalid `CSRF_TOKEN` (`EmailAuthMiddleware.php:127-144`, `:184-225`). Verified for finance, role changes, invite-token delete, comment hide, etc.
- **SQL injection (item #5):** All user input reaches queries via bound placeholders (`:name` / `?`) through Aura SqlQuery / `DbTable` callbacks. The few string-concatenated fragments (`DashboardBookingsController.php:76-80`, `:220-224`; `:219` `$idsCsv`) concatenate only values that are `(int)`-cast or `array_map('intval', …)` before interpolation — no raw user string enters SQL. `commentsWhereCallback`, `bookingsWhereCallback`, invite-token `list`, etc. all use bound params. No `QueryEx::ex` raw concatenation of user input found in these controllers.
- **Command / shell / SQL execution from HTTP, XXE, arbitrary file read (item #4):** `DashboardSystemController` exposes only `~save`, `~sendTestEmail`, `~historyList`, `~uploadImage`/`~deleteImage`, `~opcacheReset` — each gated by `isAllowed()` = `isOwner()` AND behind the `ownerOnly` route middleware. `opcacheReset` calls only `opcache_reset()` (no argument, idempotent). No `exec`/`shell_exec`/`system`/`proc_open`/`eval` and no user-controlled file path in any dashboard controller. `DashboardLogsController`, `DashboardMailLogController`, `DashboardRequestLogController` are read-only log viewers / redirects; the legacy Mail/Request log controllers just 302 to `/admin/logs/`.
- **Path traversal on attachment download:** `FwSupportAdminController::get__download` (`:527`) looks the attachment up by integer `id`, then serves it via `SecureFileServing::serve()` using the DB-stored `stored_name` — the client never supplies a path. Gated by `isModerator()` + route middleware. Not exploitable.
- **Mass assignment (item #6):** State-changing handlers whitelist fields explicitly. `post__setUserFlag` restricts `flag` to an allow-list keyed by caller rank (`:69-80`); `post__setUserType` restricts `type` to `['user','expert']` (`:162`); `post__adjustBalance` builds the insert row field-by-field (`:369-379`); invite-token `create`/`update` set only named columns. No `->setParams($_POST)`-style blanket assignment found.
- **`DashboardEntityHistoryController`:** Whitelists `allowedEntityTypes()` (`:27-38`) so callers cannot scrape arbitrary entity types; gated by `moderatorOnly`. OK.
- **`DashboardAccountsController`, `DashboardBalancesController`, `DashboardCancellationsController`, `DashboardController`, `DashboardMainController`:** Base/redirect/aggregate controllers; `get__main` handlers all begin with `isModerator()`/`isOwner()` checks or are pure 302 redirects. No unauthenticated state change.
- **Consistency of role checks across sibling actions:** With the exceptions called out in H-1 and H-2, every `post__*` / `get__*` in every controller begins with the appropriate `isModerator()` / `isOwner()` / `isAdmin()` guard; there is **no** action lacking a role check while its siblings have one, and none that is anonymous-reachable given the route middleware.
