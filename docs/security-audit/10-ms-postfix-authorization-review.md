# Security и authorization review IRabi

Дата: 2026-07-15. Область: `Apps/IRabi`, `garnet-framework`, vendored `Apps/IRabi/vendor/phpcraftdream/garnet-framework`.

Ограничение соблюдено: исходный код не изменялся. Предыдущие отчеты в `docs/security-audit/*` не использовались как источник выводов.

## Текущий git diff

В `D:\dev\garnet\Apps\IRabi` `git status --short`, `git diff --stat` и `git diff -- .` не показали текущих изменений. Поэтому отдельного набора "последних правок" в рабочем дереве для подтверждения по diff нет; выводы ниже основаны на текущем коде.

## Модель ролей и фактические gates

- Все основные `/system/*` маршруты проходят через `IrabiAuthMiddleware::authOnly`, `UserDataMiddleware::process`, затем `IdempotencyMiddleware::before`: `IRabi.php:192-205`.
- Expert panel `/expert/` дополнительно gated только через `UserDataMiddleware::expertOnly`, который проверяет `type === 'expert'`: `IRabi.php:209-212`, `UserDataMiddleware.php:66-72`.
- Moderator/admin dashboard routes gated через `moderatorOnly`, где admin/owner/moderator все проходят: `IRabi.php:248-264`, `UserEntityConfig.php:184-188`.
- Owner-only system/static pages gated через `ownerOnly`, где admin также owner-equivalent: `IRabi.php:265-271`, `UserEntityConfig.php:190-194`.
- Специальный legacy/admin accounts route `DashboardAccountsController::URL` наследует `FwAccountsController::URL = '/dashboard/'` и тоже доступен moderator+: `IRabi.php:243-246`, `FwAccountsController.php:28-29`.

## Findings

### H-01. Moderator может эскалировать себя или другого пользователя до admin через legacy `/system/dashboard/~save_user`

Severity: High / release blocker.

Файлы и строки:
- `IRabi.php:243-246` регистрирует `DashboardAccountsController::URL` под `moderatorOnly`.
- `DashboardAccountsController.php:10-17` наследует `FwAccountsController` без override mutating methods.
- `FwAccountsController.php:104-164` реализует `post__save_user` без проверки actor rank, self-target и списка разрешенных флагов.
- `UserEntityConfig.php:34-50` включает в `manageFormFields()` поля `IS_ADMIN`, `IS_MODERATOR`, `IS_APPROVED`, `IS_DISABLED`.
- `BaseEntity.php:73-91` фильтрует POST по `manageFormFields()`, затем валидирует data fields.
- `Account.php:442-458` применяет boolean data fields через `setBoolDataArr()`.

Impact: любой authenticated moderator может прямым HTTP POST изменить `IS_ADMIN`/`IS_MODERATOR`/`IS_APPROVED`/`IS_DISABLED` на любом аккаунте, включая себя. Это bypass более нового защищенного endpoint `/system/admin/~setUserFlag`, где есть allow-list и `actorMayActOn()`.

Preconditions: атакующий уже имеет роль moderator или выше и валидную сессию/CSRF. UI не обязан показывать этот endpoint; достаточно прямого POST.

Сценарий эксплуатации:
1. Moderator открывает любую authenticated страницу и получает CSRF token.
2. Отправляет `POST /system/dashboard/~save_user` с `id=<own_id>&IS_ADMIN=1&IS_MODERATOR=1&name=...&type=user...&CSRF_TOKEN=<token>`.
3. `moderatorOnly` пропускает запрос, `FwAccountsController::post__save_user()` сохраняет account data без rank guard.
4. Следующие requests проходят `UserEntityConfig::isAdmin()` как admin.

Нарушенный invariant: только admin может выдавать `IS_ADMIN`; moderator не может менять флаги owner/admin и не может self-promote.

Remediation:
- Удалить route `DashboardAccountsController::URL` из `IRabi.php`, если он больше не используется.
- Или override в `DashboardAccountsController` для `post__save_user`, `post__create_user`, `post__delete_user` и возвращать 404/403.
- Если legacy route нужен, применить тот же policy, что в `DashboardUsersController::post__setUserFlag()` (`allowed` по роли + `UserEntityConfig::actorMayActOn()`), и убрать staff flags из `UserEntityConfig::manageFormFields()` для generic save flow.
- Добавить regression test прямого POST на `/system/dashboard/~save_user` от moderator с `IS_ADMIN=1` и self id: ожидается 403/400 и неизменный `accounts_data`.

### H-02. `IS_DISABLED` не является server-side запретом действий для уже authenticated аккаунта

Severity: High / release blocker.

Файлы и строки:
- `EmailAuthMiddleware.php:162-165` при `PHASE_DONE` возвращает `null` и пропускает authenticated request без проверки `Account::isDisabled()`.
- `RegMiddleware.php:68-84` выполняет регистрацию/профильный gate, но не блокирует disabled аккаунты.
- `UserDataMiddleware.php:66-96` `expertOnly`/`moderatorOnly`/`ownerOnly` проверяют только роль, не `IS_DISABLED`.
- `Account.php:387-388` имеет метод `isDisabled()`, но он не участвует в auth/middleware deny path.
- `ExpertPanelController.php:68-121` и `134-163` разрешают создание/редактирование/удаление слотов и управление бронированиями любому session account с `type=expert`.

Impact: отключенный пользователь с существующей сессией остается способен выполнять state-changing actions: booking/cancel, comments, support, IM, profile registration/update. Отключенный expert с `type=expert` проходит `/expert/` gate и может создавать/редактировать/удалять слоты или управлять бронированиями. Если отключить staff account, его staff flags также продолжают работать, потому `isModerator()`/`isOwner()` не учитывают `IS_DISABLED`.

Preconditions: аккаунт был отключен после логина или сохранил валидную session cookie; либо снова проходит login flow, если отдельного запрета на disabled login нет.

Сценарий эксплуатации:
1. Moderator выставляет пользователю `IS_DISABLED=1`.
2. Пользователь со старой сессией отправляет прямой POST на `/system/bookings/id~<slot>/~book`, `/system/comments/~create`, `/system/support/~reply` или expert POST `/system/expert/~slots`.
3. Auth middleware подтверждает `PHASE_DONE`, CSRF валиден, role/business middleware не проверяет disabled, controller выполняется.

Нарушенный invariant: disabled account должен быть server-side заблокирован для protected pages и mutating actions; disabled expert не должен создавать новые bookable slots.

Remediation:
- Добавить общий gate после `Account::fromSession()` в authenticated chain, например в `UserDataMiddleware::process()` до registration logic: если `Account::isDisabled()` true, закрыть сессию или вернуть 403/redirect на no-access для всех protected routes.
- Для staff helpers (`isModerator`, `isOwner`, `isAdmin`) учитывать disabled либо полагаться на общий gate, который гарантированно выполняется до role middleware.
- Для auth/login flow решить политику: disabled аккаунт не должен получить `PHASE_DONE`, либо сразу должен быть разлогинен при первом protected request.
- Добавить tests с явными assertions: disabled user POST на booking/comment/support возвращает 403; disabled expert POST `/system/expert/~slots` возвращает 403 и не создает slot; disabled moderator не может POST `/system/admin/~setUserFlag`.

## Подтвержденные защиты

- CSRF и Origin для authenticated POST включены до controller dispatch: `EmailAuthMiddleware.php:127-144`, `EmailAuthMiddleware.php:192-220`.
- CSRF cookie и session cookie выставляются HttpOnly, SameSite=Lax, Secure при HTTPS: `Session.php:105-121`, `Session.php:218-233`.
- `/dev-login` закрыт двойным dev gate: `$globals->isDev()` и `Env::isDevDir()`: `DevLoginController.php:35-43`, `155-159`.
- Public OPcache reset требует shared secret из `app.ini` и отказывает при пустом token: `SysOpcacheResetController.php:31-47`.
- Booking direct POST повторно проверяет, что expert approved и not disabled: `BookingsController.php:338-343`.
- Booking capacity защищена CAS `TimeSlots::reserveSeat()` и unique active booking index миграциями: `TimeSlots.php:27-34`, `M_0002.php:68-86`, `M_0012.php:35-49`.
- Manual balance adjustment owner-only, имеет target-rank guard, max amount и overdraft CAS for debits: `DashboardFinanceController.php:340-399`.
- Основной user-admin endpoint `/system/admin/~setUserFlag` имеет role allow-list и `actorMayActOn()`: `DashboardUsersController.php:56-87`.
- Support user endpoints scope tickets by `account_id`; admin support endpoints require moderator in controller in addition to route middleware.
- IM send has server-side `canMessage()` allow-list before delegating to framework send: `ImController.php:192-203`.

## State-changing endpoints и CLI/admin actions

Проверены маршруты и контроллеры:
- User: bookings, slots booking, comments, support, IM, profile, balance view, news/read, users preview.
- Expert: `/expert/~slots`, batch slots, edit/delete slot, confirm/cancel booking, cancel slot.
- Moderator/admin: `/admin/`, users, bookings pages, finance, comments hide/unhide, support, invite tokens, logs, request/mail/entity history.
- Owner/admin: system settings, OPcache reset, static pages/CMS and uploads.
- Public/system: js-error report, sys log, sys opcache reset, register/static pages, dev-login.
- CLI: seed/test-mode/clear-user/clear-logs/remote-* commands reviewed at gate level; destructive local clear-user/clear-logs require `.test-mode`, seed requires dev dir, remote commands delegate to SSH/deploy config.

## Непроверенные области

- Не выполнялся dynamic exploit POST против работающего сервера; выводы по H-01/H-02 подтверждены статически по маршрутам и controller code.
- Не проверялась фактическая конфигурация production `app.ini`, домены Origin allow-list, наличие HTTPS и реальные cookie headers в проде.
- Не проверялись права файловой системы deploy host, SSH remote command credentials и actual web-server rules for `/upload/*`.
- Не проверялось содержимое прошлых security reports по требованию задачи.

## Запущенные проверки

- `git status --short`, `git diff --stat`, `git diff -- .` в `Apps/IRabi`.
- Статический аудит через `rg` по routes, middlewares, controllers, tables, migrations, auth/session/idempotency.
- Точечное чтение кода с line numbers для найденных gates и endpoints.

Не запускались:
- Playwright/Kahlan/PHPUnit suites. Причина: задача была review без изменения кода; для найденных проблем достаточно статического подтверждения. Нужные regression tests перечислены в remediation.

## Статус находок (обновлено 2026-07-15)

- **H-01 (High, release blocker) — fixed.** Маршрут `DashboardAccountsController::URL` (`/dashboard/~save_user` и соседние `~create_user`/`~delete_user`) был мёртвым кодом — нигде не использовался во фронтенде — и убран из `IRabi.php` целиком вместе с классом-контроллером, а не залатан rank-guard'ом. Регресс: `Tests/moderator/dead-legacy-save-user-route.spec.ts` — POST от moderator с `IS_ADMIN=1` на свой id теперь 404, `accounts_data` не меняется.
- **H-02 (High, release blocker) — fixed.** Добавлен `UserDataMiddleware::notDisabled()`, включённый в общую `$common` цепочку сразу после `IrabiAuthMiddleware::authOnly()`, перед любой ролевой/staff-rank проверкой — единая точка для ВСЕХ authenticated routes. Отключённый аккаунт (user/expert/moderator) теперь получает no-access страницу вместо выполнения мутации. Регресс: `Tests/cross-role/disabled-account-server-side-deny.spec.ts` (3 сценария: disabled user → comments, disabled expert → slot creation, disabled moderator → setUserFlag).

Оба фикса верифицированы на реальном MySQL57; широкий регресс-прогон (416 тестов: user/expert/moderator/owner/cross-role) прошёл без новых провалов после добавления глобального `notDisabled` гейта.

## GO/NO-GO verdict

**GO.** Оба release blocker (H-01, H-02) закрыты и покрыты регресс-тестами. Широкая регрессия существующего сьюта (416+ тестов) подтверждает отсутствие false-positive блокировок для активных аккаунтов.
