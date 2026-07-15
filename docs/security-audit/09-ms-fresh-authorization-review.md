# Свежий независимый security и authorization review IRabi

Дата: 2026-07-15. Область: `Apps/IRabi`, `garnet-framework`, `Apps/IRabi/vendor/phpcraftdream/garnet-framework`.

Ограничение: предыдущие отчеты `docs/security-audit/*` не использовались как источник анализа.

## Роли и server-side gates

Фактическая модель ролей разделена на две оси:

- бизнес-тип аккаунта: `type=user` и `type=expert`; `UserEntityConfig::isUser()` и `isExpert()` проверяют только `Account::fromSession()->readParam('type')` (`Apps/IRabi/Foreground/Params/UserEntityConfig.php:154`, `:165`).
- staff-флаги: `IS_MODERATOR`, `IS_OWNER`, `IS_ADMIN`; иерархия реализована как `admin >= owner >= moderator` (`Apps/IRabi/Foreground/Params/UserEntityConfig.php:184`, `:190`, `:196`, `:218`).

Основные gates:

- все обычные authenticated routes получают `IrabiAuthMiddleware::authOnly`, `UserDataMiddleware::process`, `IdempotencyMiddleware::before` (`Apps/IRabi/IRabi.php:192`-`:205`);
- `/expert/` дополнительно требует `expertOnly` (`Apps/IRabi/IRabi.php:209`-`:212`);
- `/admin/*` в основном требует `moderatorOnly` (`Apps/IRabi/IRabi.php:248`-`:264`);
- `/admin/system/` и `/admin/pages/` требуют `ownerOnly` (`Apps/IRabi/IRabi.php:265`-`:272`);
- `/sys/log`, `/sys/opcache-reset`, `/first-step/{token}`, `/page/{view}` идут без session-auth, только через `WorkerScopeMiddleware` и `MaintenanceMiddleware` (`Apps/IRabi/IRabi.php:229`-`:239`);
- `/dev-login` без auth/CSRF, но gated по `isDev()` и `Env::isDevDir()` (`Apps/IRabi/Foreground/Controllers/DevLoginController.php:35`-`:43`, `:155`-`:159`).

## State-changing endpoints/actions

HTTP POST mutators reviewed:

- profile/session: `/~profile_edit`, `/~saveNotifPrefs`, auth POSTs, invite registration;
- bookings/slots: `/bookings/{id}~book`, `/bookings/{id}~cancel`, `/slots~bookData`, `/slots~book`, `/expert/~slots`, `/expert/~batchSlots`, `/expert/~editSlot`, `/expert/~deleteSlot`, `/expert/~confirmBooking`, `/expert/~cancelBooking`, `/expert/~cancelBookedSlot`, `/expert/~cancelSlot`;
- comments/IM/support: `/comments/~create`, `/comments/~delete`, `/im/~send`, support user/admin endpoints;
- admin: users flags/type/photo, finance adjustment, bookings/comments/tokens/pages/system/support actions;
- public system: `/sys/log/~log`, `/sys/opcache-reset/~run`;
- CLI: `seed`, `test-mode`, `clear-user`, `clear-logs`, `remote-*`, `sql`, migrations/cache/cron.

## Findings

### H-01. Race condition позволяет overbooking одного слота разными пользователями

Severity: High, release blocker.

Impact: один слот с `max_users=1` или N может получить больше активных `pending/confirmed` booking rows, чем разрешено. Это ломает инварианты вместимости, статуса слота, уведомлений и финансовых ledger-записей.

Preconditions: два или более аутентифицированных пользователя одновременно вызывают `/slots/~book` или `/bookings/{slotId}~book` для одного свободного слота.

Code:

- `Apps/IRabi/Foreground/Controllers/BookingsController.php:316`-`:324` считает активные брони до insert, затем insert делает без атомарного capacity predicate (`:341`-`:349`), а статус слота меняет уже после insert (`:416`-`:421`).
- `Apps/IRabi/Foreground/Controllers/SlotsController.php:297`-`:305` проверяет только свою уже существующую бронь, а общий capacity пересчитывает после insert (`:398`-`:409`).
- storage guard `active_dup_key` уникален по `(user_id, bookable_type, bookable_id)`, а не по capacity слота (`Apps/IRabi/Migrations/Items/M_0002.php:68`-`:85`).

Exploit scenario:

1. Пользователь A и пользователь B одновременно POSTят один `slot_id`.
2. Оба до insert видят `count(activeBookings) < max_users`.
3. Оба insert проходят, потому что UNIQUE защищает только повтор одного и того же пользователя.
4. Один или оба запроса выставляют slot `status='booked'`, но лишняя активная бронь уже создана.

Broken invariant: `count(active bookings for slot) <= time_slots.max_users` должен соблюдаться атомарно.

Remediation: вводить атомарную reservation primitive. Варианты: транзакция с `SELECT ... FOR UPDATE` по slot row; отдельная таблица capacity seats с unique seat claims; или CAS `UPDATE time_slots SET booked_count = booked_count + 1 WHERE id=? AND status='free' AND booked_count < max_users` перед insert, с обязательной компенсацией при ошибке insert. Unique `(user,slot)` оставить только как duplicate-user guard.

Regression tests:

- два разных пользователя параллельно бронируют один `max_users=1` slot; ожидается ровно один active booking;
- `max_users=2`, три параллельных пользователя; ожидается ровно две active bookings;
- проверка балансов/ledger после race-loss.

### M-01. Invite token max_uses можно превысить из-за игнорирования consume=false

Severity: Medium.

Impact: одноразовый или лимитированный invite может создать больше аккаунтов, чем `uses_left`. Это обход бизнес-ограничения регистрации и контроля выдачи expert/user invite links.

Preconditions: два клиента начинают регистрацию по одному token, когда `uses_left=1`, проходят `validate()` до финального profile POST.

Code:

- token валидируется до регистрации (`Apps/IRabi/Foreground/Controllers/RegisterController.php:67`-`:78`);
- профиль сохраняется до consume (`Apps/IRabi/Foreground/Controllers/RegisterController.php:106`-`:108`);
- `FwInviteTokenService::consume()` атомарно возвращает `false`, если `uses_left` уже исчерпан (`garnet-framework/Bundle/Modules/Invite/FwInviteTokenService.php:94`-`:105`);
- результат `consume()` игнорируется, регистрация все равно возвращает `$result` (`Apps/IRabi/Foreground/Controllers/RegisterController.php:113`-`:135`).

Exploit scenario:

1. Два браузера открывают один invite token при `uses_left=1`.
2. Оба получают valid token.
3. Оба отправляют `action=reg_user`.
4. Один decrement succeeds, второй получает `consume=false`, но аккаунт второго уже сохранен и ошибка не возвращается.

Broken invariant: регистрация по invite должна быть успешной только если атомарный consume succeeded.

Remediation: consume должен происходить до/вместе с финальным сохранением профиля либо результат `consume()` должен быть checked; при `false` возвращать 409/403 и не считать профиль зарегистрированным. Для полной консистентности нужен transactional flow или reservation token/session binding на этапе auth.

Regression tests:

- два параллельных `reg_user` по token с `max_uses=1`; один успех, второй отказ, `uses_left=0`, одна запись в `invite_registrations`.

### M-02. Admin support assignment принимает произвольный account_id как assignee

Severity: Medium/Low.

Impact: moderator может назначить support ticket на любого пользователя, включая обычного user/expert или несуществующий id. Это ломает staff-workflow invariant, может вводить операторов в заблуждение и выводит имя произвольного account в system message/админский контекст.

Preconditions: session moderator+ и прямой POST `/admin/support/~assign`.

Code:

- `assignee_id` читается из POST без проверки роли/существования (`garnet-framework/Bundle/Modules/Support/Controllers/FwSupportAdminController.php:458`-`:465`);
- ticket обновляется напрямую (`:482`-`:486`);
- lookup имени не отказывает при отсутствии/не-staff аккаунте (`:500`-`:508`).

Exploit scenario: moderator отправляет `ticket_id=...&assignee_id=<ordinary_user_id>`; ticket становится назначенным на пользователя, который не имеет admin/support доступа.

Broken invariant: `assignee_id` должен быть `NULL` или account с moderator/owner/admin rank.

Remediation: перед update валидировать `assignee_id` через тот же allowlist, что `fetchModerators()`, и отклонять non-staff/disabled/nonexistent targets.

Regression tests:

- moderator не может assign ticket обычному user/expert;
- assign `0/null` работает как unassign;
- assign moderator/owner/admin работает.

### L-01. Public sys/log fail-open при ошибке rate-limit storage

Severity: Low.

Impact: unauthenticated endpoint `/sys/log/~log` имеет caps по длине и per-IP rate limit, но при любой DB ошибке rate limiter fail-open, что позволяет log spam/disk growth до внешних лимитов.

Preconditions: endpoint доступен публично, `SysLogThrottle` недоступен/ошибается или attacker распределяет IP.

Code: public route без auth (`Apps/IRabi/IRabi.php:233`-`:235`), fail-open в `isRateLimited()` (`Apps/IRabi/Foreground/Controllers/SysLogController.php:98`-`:130`).

Exploit scenario: отправлять много валидных `cat/msg/meta` POST; при деградации DB throttle не блокирует записи.

Broken invariant: unauthenticated diagnostics must not be able to cause unbounded server-side writes.

Remediation: fail-closed или filesystem/in-memory fallback limiter; дополнительно общий дневной cap и отдельный лог sink с rotation/quota.

Regression tests: имитировать exception в throttle table и ожидать 429/503 или no-write.

## Подтвержденные защиты

- Глобальная auth/CSRF/Origin проверка применяется ко всем authenticated POST через `IrabiAuthMiddleware::authOnly()` до controller dispatch (`Apps/IRabi/IRabi.php:192`-`:205`, `garnet-framework/Bundle/Modules/Auth/Middlewares/EmailAuthMiddleware.php:127`-`:145`, `:192`-`:225`).
- Session и CSRF cookies выставляются `HttpOnly`, `SameSite=Lax`, `Secure` для HTTPS (`garnet-framework/Kernel/Db/Entity/Session/Session.php:105`-`:121`, `:218`-`:233`).
- Idempotency middleware привязан после auth и replay scope включает `(account_id, key, route_path)` (`garnet-framework/Bundle/Modules/Idempotency/IdempotencyMiddleware.php:62`-`:128`, `:179`-`:183`).
- Admin rank guard для user flags/type/photo/balance блокирует self-target и upward rank operations (`Apps/IRabi/Foreground/Params/UserEntityConfig.php:273`-`:282`; uses in `DashboardUsersController.php:82`-`:87`, `:173`-`:177`, `:231`-`:235`; `DashboardFinanceController.php:340`-`:366`).
- Expert actions проверяют ownership слота/booking перед confirm/cancel/edit/delete (`Apps/IRabi/Foreground/Controllers/ExpertPanel/ExpertBookingsService.php:95`-`:98`, `:152`-`:155`, `:240`-`:243`; `ExpertSlotsService.php:472`-`:473`, `:579`-`:580`).
- Direct booking проверяет own-slot запрет, future slot, free status, approved/non-disabled expert (`Apps/IRabi/Foreground/Controllers/BookingsController.php:298`-`:339`; `SlotsController.php:270`-`:284`).
- User support and IM downloads enforce ownership/participant checks (`garnet-framework/Bundle/Modules/Support/Controllers/FwSupportController.php:420`-`:433`; `garnet-framework/Bundle/Modules/Messaging/Controllers/FwImController.php:380`-`:389`).
- `/sys/opcache-reset` публичен, но требует configured shared secret header and denies empty token (`Apps/IRabi/Foreground/Controllers/SysOpcacheResetController.php:31`-`:47`).
- `/dev-login` и `/dev-login~resetDb` требуют одновременно `isDev()` и dev directory marker (`Apps/IRabi/Foreground/Controllers/DevLoginController.php:35`-`:43`, `:155`-`:159`).

## Непроверенные области

- Live production configuration: реальные `app.ini`, `deploy.ini`, web server rules, HTTPS/HSTS, cookie domain/path, CORS headers.
- Реальная DB schema на production: миграции просмотрены по коду, live schema не introspected.
- Фактические file permissions и upload directory exposure.
- Полная XSS/HTML sanitization CMS/static snippets: authorization gate проверен, content rendering глубоко не анализировался.
- Remote CLI/SSH credentials and operational access control outside PHP process.
- Vendor copy and root `garnet-framework` сравнивались выборочно по relevant files, полный diff не выполнялся.

## Commands/tests actually run

Commands run:

- `rg --files Apps\IRabi -g '!docs/security-audit/**' -g '!vendor/**'`
- `rg --files garnet-framework Apps\IRabi\vendor\phpcraftdream\garnet-framework`
- `rg -n "public static function (get|post|put|delete)__|..." Apps\IRabi\Foreground\Controllers Apps\IRabi\Dashboard\Controllers`
- targeted `Get-Content` with line numbering for reviewed controllers, middlewares, migrations, tables, framework auth/session/router/idempotency/support/IM/invite code
- `rg -n` searches for mutators, role checks, CSRF, idempotency, booking/capacity indexes, CLI commands
- `git status --short -- Apps/IRabi/docs/security-audit/09-ms-fresh-authorization-review.md` failed because `D:\dev\garnet` is not a git repository root for that command context.

Tests run: none. Это был static source review; live production testing не выполнялся.

Tests not run:

- Playwright suites under `Apps/IRabi/Tests`
- PHP/Kahlan/unit tests
- live HTTP probes against local or production server
- DB concurrency proof-of-concept

## Статус находок (обновлено 2026-07-15)

Все 4 находки исправлены и покрыты регресс-тестами Playwright, прогнанными на реальном MySQL57:

- **H-01 (High, release blocker) — fixed.** Добавлен атомарный CAS-счётчик `time_slots.booked_count` (миграция `M_0012`, `TimeSlots::reserveSeat()`/`releaseSeat()`) как реальная граница конкурентности перед INSERT брони в `BookingsController::post__book()` и `SlotsController::post__book()`, с компенсацией на всех путях отката/отмены (`ExpertBookingsService::cancelBooking/cancelBookedSlot/cancelSlot`). Регресс: `Tests/cross-role/booking-overbooking-race.spec.ts` (2 сценария: max_users=1 и max_users=2, настоящая конкурентность через `Promise.all`, ровно N успешных броней).
- **M-01 (Medium) — fixed.** `RegisterController::post__main()` теперь вызывает `FwInviteTokenService::consume()` ДО сохранения профиля и возвращает 409 при `consumed=false`, вместо игнорирования результата. Регресс: `Tests/specs/framework-bundle/invite-consume-race.spec.ts`.
- **M-02 (Medium/Low, **garnet-framework**) — fixed.** `FwSupportAdminController::post__assign()` валидирует `assignee_id` через существующий хук `fetchModerators()`; отклоняет non-staff/несуществующие id (кроме 0/null = unassign). Регресс: `Tests/specs/framework-bundle/cross-role/support-assign-validation.spec.ts`.
- **L-01 (Low) — fixed.** `SysLogController::isRateLimited()` теперь fail-closed при ошибке throttle-хранилища (было fail-open). Регресс: `Tests/user/syslog-rate-limit.spec.ts` (новый тест "throttle storage failure fails CLOSED").

## GO/NO-GO verdict

**GO.** Release blocker H-01 закрыт и подтверждён двумя тестами настоящей конкурентности. M-01/M-02/L-01 также закрыты. Framework-level фикс (M-02) требует отдельного релиза `garnet-framework` (новая alpha-версия) и обновления зависимости в `composer.json` IRabi — до тех пор IRabi использует патченную vendor-копию локально для тестовой верификации; committed source-of-truth фикс живёт в `garnet-framework` репозитории.
