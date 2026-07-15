# Security/authorization review IRabi — 08-ms-authorization-review

Дата: 2026-07-15. Метод: статический review исходников текущего checkout, без live production testing и без выполнения атакующих запросов к production. Исходный код приложения не изменялся.

## 1. Инвентаризация ролей и middleware gates

### Роли и оси доступа

| Роль/флаг | Фактическая проверка | Файл/строки | Вывод |
|---|---|---:|---|
| `user` | `UserEntityConfig::isUser()` проверяет только `accounts.type === 'user'`; staff-флаги не исключают business-role `user`. | `Foreground/Params/UserEntityConfig.php:165-170` | Обычный business user может бронировать; staff с `type=user` тоже остаётся user для бизнес-UI. |
| `expert` | `UserEntityConfig::isExpert()` проверяет только `accounts.type === 'expert'`. | `Foreground/Params/UserEntityConfig.php:154-155` | Доступ к `/expert/` не требует `IS_APPROVED`; это осознанно допускает pending expert к панели и созданию слотов. Платёжный gate должен быть в booking path. |
| `moderator` | `isModerator()` пропускает `admin OR owner OR moderator`. | `Foreground/Params/UserEntityConfig.php:184-188`; middleware `UserDataMiddleware::moderatorOnly()` `:74-80` | Все `/admin/*`, кроме owner-only страниц, доступны moderator+. |
| `owner` | `isOwner()` пропускает `admin OR owner`. | `Foreground/Params/UserEntityConfig.php:190-194`; middleware `ownerOnly()` `Foreground/Middlewares/UserDataMiddleware.php:90-96` | `/admin/system/` и `/admin/static-pages/` owner+. |
| `admin` | `isAdmin()` требует только admin flag. | `Foreground/Params/UserEntityConfig.php:196-199` | Используется как дополнительная логическая ветка внутри admin UI, например full mail log. |
| Target-rank guard | `actorMayActOn()` запрещает self-target и разрешает цель с rank `<=` rank actor. | `Foreground/Params/UserEntityConfig.php:268-276` | Вертикальный guard добавлен, но равный ранг разрешён; для некоторых операций это может быть спорной product policy, не technical bypass. |

### Маршруты и middleware chain

| Route group | Chain | Файл/строки | Security posture |
|---|---|---:|---|
| Foreground app: `/`, `/slots`, `/profile`, `/bookings`, `/balance`, `/support`, `/comments`, `/im`, `/news`, `/users`, `/external` | `WorkerScope -> Maintenance -> IrabiAuthMiddleware::authOnly -> UserDataMiddleware::process -> IdempotencyMiddleware::before` | `IRabi.php:192-225` | Auth + global POST Origin/CSRF + idempotency. |
| Expert panel `/expert/` | `$common + UserDataMiddleware::expertOnly` | `IRabi.php:209-212`; `UserDataMiddleware.php:66-72` | Requires authenticated `type=expert`; approval is not checked here. |
| Public/system no-auth: JS errors, `/sys/log`, `/sys/opcache-reset`, invite register, static pages | `WorkerScope -> Maintenance` | `IRabi.php:229-238` | No auth/CSRF middleware. Each endpoint must self-gate. `/sys/opcache-reset` token-gated; `/sys/log` public by design. |
| `/dev-login` | `WorkerScope` only | `IRabi.php:239-241` | Controller now additionally requires `$globals->isDev()` and `Env::isDevDir()`, see status below. |
| Admin dashboard, finance, users, logs, bookings, comments, invite tokens, support | `$common + moderatorOnly` | `IRabi.php:248-264` | moderator+ can read broad operational/PII/financial data unless controller adds a tighter policy. |
| Admin system/static pages | `$common + ownerOnly` | `IRabi.php:265-272` | owner/admin only. |

Global POST protection: `EmailAuthMiddleware::authOnly()` runs Origin/Referer check then CSRF check before controller for all authenticated POSTs except `action=start-session` (`vendor/phpcraftdream/garnet-framework/Bundle/Modules/Auth/Middlewares/EmailAuthMiddleware.php:127-144`). CSRF uses non-empty posted token and `hash_equals(Session::touchCSRF_(), $postToken)` (`:192-205`). Missing Origin/Referer is tolerated, but CSRF remains required.

## 2. State-changing endpoint inventory

### Foreground authenticated POSTs

| Endpoint/method | State change | Server-side authorization summary | Status |
|---|---|---|---|
| `/profile~profile_edit`, `/profile~saveNotifPrefs` (`MainController`) | self profile/preferences | authenticated account only, fields constrained by entity config | no new finding |
| `/comments~create`, `/comments~delete` | comments | explicit CSRF in controller plus global CSRF; delete checks author/moderator in controller | no new finding |
| `/bookings/{id}~book` (`BookingsController::post__book`) | creates booking, ledger invoice/payment, slot status | auth user, CSRF, slot free/future, self-book deny, approved active expert check, CAS debit, unique active booking | prior booking approval finding fixed for this path |
| `/bookings/{id}~cancel` (`BookingsController::post__cancel`) | cancels own or moderator booking, refund ledger | owner or moderator+, CSRF, CAS status update, refund idempotency via ledger unique key | mostly OK; moderator-wide cancellation is policy-sensitive but route is intentionally moderator+ |
| `/slots~bookData` | returns modal data | auth, slot free/future/self-deny, approved active expert check | fixed vs direct ID exposure for unapproved expert |
| `/slots~book` (`SlotsController::post__book`) | multi-slot booking, ledger, slot status | auth, CSRF, self-deny, approved active expert check, unique active booking, CAS debit | approval fixed; residual consistency bug below |
| `/support~createTicket`, `/support~reply` | support ticket/messages | authenticated user owns own ticket; staff handled separately by dashboard | no new finding |
| `/im~send` | conversation + message + notification | parent checks auth/CSRF and recipient existence only; does not enforce IRabi recipient allow-list | open duplicate F-IM-01 |
| `/expert~slots`, `~batchSlots`, `~editSlot`, `~deleteSlot` | expert slots | requires `type=expert`, ownership checks in service; approval not required | not a bypass by itself; relies on booking gate |
| `/expert~confirmBooking` | booking status pending -> confirmed | expert owns slot, but update is not CAS/status-guarded at write time | new finding F-08-01 |
| `/expert~cancelBooking`, `~cancelBookedSlot`, `~cancelSlot` | cancellation + refunds | expert owns slot; CAS status update for bookings; refund ledger idempotency | no new auth finding |

### Dashboard/admin POSTs

| Endpoint/method | State change | Server-side authorization summary | Status |
|---|---|---|---|
| `/admin/users~setUserFlag` | approved/disabled/staff flags | moderator+ route; allowed flags depend on owner/admin; `actorMayActOn()` rank/self guard | prior H-2 fixed for upward/self target; equal-rank remains allowed by current code comments |
| `/admin/users~setUserType` | user/expert type | moderator+ plus `actorMayActOn()` | prior H-2 fixed for upward/self target |
| `/admin/users~removeUserPhoto` | moves/removes public profile photo fields | moderator+ only; no target-rank guard | open F-08-03 policy/DoS risk |
| `/admin/finance~adjustBalance` | manual ledger/balance correction | owner/admin only, max amount, note required, `actorMayActOn()`, overdraft CAS for debit | prior H-1 fixed |
| `/admin/support~createForUser`, `~reply` | support tickets/messages | moderator+ | expected admin function |
| `/admin/comments~hide`, `~unhide` | moderation status | moderator+ | expected admin function |
| `/admin/invite-tokens~create/update/enable/disable/delete` | registration tokens | moderator+ | product decision: moderator can create invites; no privilege escalation found in code review |
| `/admin/system~save`, `~sendTestEmail`, `~opcacheReset` | settings/email/cache | owner/admin route | expected owner-only |
| `/admin/static-pages/*` | CMS/static pages | owner/admin route | expected owner-only |

### Public/system POSTs and CLI actions

| Action | Gate | Status |
|---|---|---|
| `/dev-login~main`, `/dev-login~resetDb` | `IRabi.php` only WorkerScope, but controller requires `$globals->isDev()` and `Env::isDevDir()` (`DevLoginController.php:35-43`, `:155-159`) | prior `/dev-login` finding fixed in current checkout if `isDev()` is tied to explicit app env; keep regression test. |
| `/sys/opcache-reset~run` | self token check, constant-time compare (per previous audit) | not reproduced as vulnerability. |
| `/sys/log~log` | public log-write, no auth/CSRF | open duplicate low from 01/03. |
| `php garnet seed` | `Env::isDevDir()` only, destructive (`CMDSeed.php:69-99`) | fixed for HTTP; CLI remains local/dev-only operational risk, not remote authorization bypass. Consider env flag parity with `/dev-login`. |
| `clear-user`, `clear-logs` | require `.test-mode` marker (`CMDClearUser.php:30-35`, `CMDClearLogs.php:31-36`) | OK for local CLI; marker must not exist in prod. |
| `test:provision`, `test:teardown` | CLI only; token/prefix isolation | OK if SSH/CLI access is trusted. |
| `remote-*` commands | local CLI triggers SSH command; args POSIX-quoted (`RemoteCommand.php:29-50`) | no shell injection found in wrapper. |

## 3. Findings

### F-08-01 — Race: expert confirmation can resurrect a booking after user cancellation

- **Severity:** High.
- **Status:** open, new finding in this review.
- **Files/lines:** `Foreground/Controllers/ExpertPanel/ExpertBookingsService.php:87-112` checks pending state then performs unconditional `Bookings::get()->updateByField(['status' => 'confirmed', ...], 'id', $bookingId)`; user cancellation uses CAS only if current status is pending/confirmed in `Foreground/Controllers/BookingsController.php:496-507`.
- **Impact:** invalid business-state transition `cancelled -> confirmed`; user can receive refund/cancellation while expert later confirms the same booking. This can desynchronise slot availability, chat/news notifications, user/expert expectations and accounting/audit history.
- **Preconditions:** user owns a pending booking for expert slot; expert has a valid session and can call `/expert~confirmBooking`; user and expert requests race, or expert submits from a stale page after cancellation but before UI refresh.
- **Exploit scenario:** user submits `POST /bookings/{id}~cancel`; after `CasUpdate` changes status to `cancelled` and refunds, expert submits `POST /expert~confirmBooking` with same `booking_id`. The confirm method loaded an earlier `pending` row or is executed after stale UI and writes `status='confirmed'` without `WHERE status='pending'`, resurrecting the cancelled booking.
- **Expected invariant:** a booking status transition must be atomic and monotonic: only `pending -> confirmed` may confirm, and it must fail if the row is no longer pending at write time.
- **Remediation:** replace `updateByField()` with CAS SQL: `UPDATE bookings SET status='confirmed', confirmed_at=? WHERE id=? AND status='pending'`; if affected rows = 0 return 409/400 and do not emit news/email/chat. Add row-level regression for cancel-vs-confirm race and stale confirm replay.

### F-08-02 — Multi-slot booking can report/notify slots that were not actually booked after duplicate-key race

- **Severity:** Medium.
- **Status:** open, new finding in this review.
- **Files/lines:** `SlotsController::post__book` appends only successful booking IDs at `Foreground/Controllers/SlotsController.php:341-356`, but returns `booked_count => count($validSlots)` and iterates all `$validSlots` for news/email at `:439-469`; duplicate-key race is explicitly skipped at `:348-352`.
- **Impact:** on replay/race, API response and notifications can claim success for slots where no new booking was created. This is a state/authorization-adjacent integrity issue: users/experts may receive misleading booking notifications, stale `new_slot` announcements are deleted, and clients may trust a false `booked_count`.
- **Preconditions:** two submissions for same slot set, or one slot already becomes booked between validation and insert; valid auth/CSRF.
- **Exploit scenario:** attacker double-submits `/slots~book` with the same slot IDs using valid CSRF/idempotency-missing or different idempotency keys. One insert wins; the loser hits duplicate key and continues. Response still counts every validated slot and notification loop still processes every validated slot.
- **Expected invariant:** externally visible success, email/news side effects and `booked_count` must be derived from actually inserted booking rows, not pre-flight candidates.
- **Remediation:** track successful bookings as `(booking_id, slot)` pairs; return `count($createdBookingIds)`; emit notifications/news deletion only for inserted bookings or slots that truly reached full capacity. Add regression for duplicate-key replay on `/slots~book` with different idempotency keys.

### F-08-03 — Moderator can remove profile photos from owner/admin/peer accounts despite rank guard used elsewhere

- **Severity:** Medium.
- **Status:** open, new finding in this review.
- **Files/lines:** `DashboardUsersController::post__removeUserPhoto` requires only `static::isModerator()` at `Dashboard/Controllers/DashboardUsersController.php:221-228`; it does not call `UserEntityConfig::actorMayActOn()` before loading and clearing target photo fields at `:231-245` and below.
- **Impact:** lower staff can perform destructive moderation against higher-privileged accounts' public identity assets. This is not account takeover, but it bypasses the target-rank invariant already added to role/type/balance operations.
- **Preconditions:** attacker has moderator role and a target account id with `photo` or `photo_cropped` set.
- **Exploit scenario:** moderator posts `user_id=<owner/admin id>` to `/admin/users~removeUserPhoto`; route and method allow it, files are moved out of public upload folder and account photo params are cleared.
- **Expected invariant:** staff actions mutating another account's profile/security-visible state should not target self, equal-or-higher ranks unless explicitly owner/admin-only.
- **Remediation:** apply `UserEntityConfig::actorMayActOn($userId)` to `post__removeUserPhoto`; decide whether equal-rank peer moderation is acceptable. Add moderator-vs-owner/admin regression.

### F-IM-01 — `POST /im~send` bypasses recipient business boundary

- **Severity:** Low/Medium.
- **Status:** open, duplicate of `01-foreground-controllers.md` finding 4.
- **Files/lines:** IRabi recipient search restricts visible recipients by role/bookings in `Foreground/Controllers/ImController.php:122-220`; actual send delegates to framework `FwImController::post__send`, which checks auth, CSRF, non-self and recipient existence only at `vendor/phpcraftdream/garnet-framework/Bundle/Modules/Messaging/Controllers/FwImController.php:276-312`.
- **Impact:** ordinary users can message arbitrary ordinary users or staff accounts by numeric id, despite UI only showing allowed recipients. This is spam/privacy boundary bypass rather than direct data exfiltration.
- **Preconditions:** authenticated account, valid CSRF, known recipient id.
- **Exploit scenario:** user sends `POST /im~send recipient_id=<other user id>&message=...`; server creates/uses conversation at `FwImController.php:320-329`.
- **Expected invariant:** send target must be a member of the same allow-list used by `searchRecipients()` or an existing permitted conversation.
- **Remediation:** add `canMessage($senderId, $recipientId)` in IRabi controller/service and enforce before `parent::post__send`; keep existing conversation exception only if explicitly intended. Regression: user->unrelated user must 403; user->expert and expert->own student must pass.

### F-LOG-01 — Public `/sys/log` remains unauthenticated log-write endpoint

- **Severity:** Low.
- **Status:** open, duplicate of `01-foreground-controllers.md` finding 5 and `03-auth-middlewares.md` F-3.
- **Files/lines:** route is in no-auth `maintenanceOnly` chain at `IRabi.php:229-236`; controller `Foreground/Controllers/SysLogController.php:37` is public log write per existing audit.
- **Impact:** log spam / disk growth / operator-noise; not privilege escalation by itself.
- **Preconditions:** network access to app.
- **Exploit scenario:** repeated POSTs to `/sys/log~log` with large diagnostic messages.
- **Expected invariant:** public telemetry endpoints should rate-limit, size-limit and clearly separate untrusted client fields in viewers.
- **Remediation:** add body size cap, rate limit, sampling and structured escaping in log viewers.

## 4. Status vs existing reports 00-06

| Prior item | Current status | Evidence |
|---|---|---|
| 00/03/04 `/dev-login` privileged login/reset guarded only by filesystem heuristic | **fixed / not reproduced in current checkout** | controller now requires `$globals->isDev()` and `Env::isDevDir()` in `DevLoginController.php:35-43`, `:155-159`; route still has only WorkerScope, so regression test must verify prod `env!=dev` returns 403 even if IDE marker exists. |
| 02 H-1 moderator arbitrary balance adjustment | **fixed** | `DashboardFinanceController::post__adjustBalance` requires `static::isOwner()` at `Dashboard/Controllers/DashboardFinanceController.php:340-345`, caps amount at `:355-357`, applies `actorMayActOn()` at `:362-366`. |
| 02 H-2 moderator can disable owner/admin | **fixed for flag/type endpoints** | `post__setUserFlag` calls `actorMayActOn()` at `DashboardUsersController.php:82-87`; `post__setUserType` at `:173-177`. Residual photo removal is new F-08-03. |
| 01 findings 1-2 booking unapproved/disabled expert | **fixed for booking/payment paths** | `SlotsController::post__bookData` checks `isApprovedActiveExpert()` at `SlotsController.php:198-203`; `/slots~book` at `:280-284`; `/bookings/{id}~book` at `BookingsController.php:334-339`; helper checks `type=expert`, `IS_APPROVED`, `IS_DISABLED` at `UserEntityConfig.php:286-305`. |
| 04 F2 ledger race/no idempotency | **partially fixed** | ledger table has unique idempotency index in framework schema `FwBalanceLedger.php:41`; `addEntry()` ignores duplicate keys and recalculates at `:58-88`; `AccountBalance::recalculate()` is atomic INSERT...SELECT...ON DUPLICATE at `FwAccountBalance.php:42-56`; booking debit uses CAS. Residual state race remains in expert confirmation F-08-01. |
| 02 M-1 moderator broad financial/PII read access | **open / product policy** | admin routes remain moderator+ in `IRabi.php:248-264`; dashboard bookings/finance/users expose broad data to moderator. No technical bypass if product wants moderator as support staff. |
| 02 M-2 mail body to moderators | **fixed / not reproduced** | logs controller marks full mail access as admin-only: `DashboardLogsController::isAdmin()` `DashboardLogsController.php:38-40`; mail search includes `body_html`/`meta` only for admin at `:70-74`; framework unsets `body_html`/`meta` for non-admin (`FwDashboardMailLogController.php:83-86`). |
| 01 disabled user preview name disclosure | **open / duplicate low** | `UsersController::post__preview` still loads account name and avatar by arbitrary id at `UsersController.php:39-60`; `ExpertSlotsService::userPreview` loads name/login at `ExpertSlotsService.php:133-186`. |
| 05 file/upload hardening findings | **not re-reviewed deeply here; no auth escalation found** | CMS/static pages are owner-only via `IRabi.php:269-272`; previous Low items remain hardening backlog. |
| 06 frontend XSS | **not reproduced** | no new XSS review finding in this authorization-focused pass. |

## 5. Release blockers

1. **Blocker:** F-08-01 expert confirm must use atomic `WHERE status='pending'` CAS and suppress side effects on lost race.
2. **Blocker:** F-08-02 multi-slot booking must base success/notifications on actual inserted bookings.
3. **Blocker if moderator is not intended to moderate higher staff assets:** F-08-03 add rank guard to photo removal.
4. **Blocker if IM recipient boundaries are a product/security requirement:** F-IM-01 enforce send allow-list server-side.

## 6. Required regression tests

- `expert confirm vs user cancel race`: pending booking; cancel wins; subsequent/stale expert confirm returns 409/400 and row remains cancelled; no confirmed news/chat/email emitted.
- `expert confirm idempotency/replay`: repeated confirm after confirmed is no-op or clear 400 without duplicate notifications.
- `/slots~book duplicate-key replay`: two requests with different idempotency keys for same slot; second response `booked_count=0` or explicit already-booked, no false expert notification, no `new_slot` deletion unless slot actually full.
- `moderator cannot remove owner/admin photo`: moderator POST `/admin/users~removeUserPhoto` for owner/admin/self returns 403; owner/admin policy tested separately.
- `IM send recipient policy`: ordinary user cannot send to unrelated ordinary user by id; can send to allowed expert; expert can send only to own students/staff unless existing conversation exception is intended.
- `/dev-login prod negative`: with `env=prod`, `/dev-login~main` and `~resetDb` return 403 even if `.vscode/.idea` marker exists in deployed tree.
- `balance/role guard regressions`: moderator cannot adjust balance; owner cannot adjust admin/self; moderator cannot disable owner/admin or self.

## 7. Verdict

**NO-GO** до закрытия F-08-01 и F-08-02. После их исправления решение по F-08-03 и F-IM-01 зависит от принятой product policy, но для строгого authorization baseline их тоже следует закрыть до release.

Blockers: F-08-01, F-08-02, условно F-08-03, условно F-IM-01.
