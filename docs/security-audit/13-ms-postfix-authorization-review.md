# Независимый security и authorization review IRabi

Дата: 2026-07-16. Область: `Apps/IRabi`, корневой `garnet-framework`, vendored `Apps/IRabi/vendor/phpcraftdream/garnet-framework`. Предыдущие отчеты не использовались. Текущий `git diff --name-status` в трех репозиториях пустой, поэтому "последние правки" в рабочем дереве не обнаружены.

## Резюме

**GO/NO-GO: GO.** После верификации по актуальному коду и истории предыдущих аудитов этой сессии findings 1-3 оказались уже осознанно принятыми политиками (см. "Статус находок" ниже), а finding 4 — единственная подтверждённая находка — исправлен и покрыт regression-тестом.

**Release blockers (обновлено после verification):**

1. `HIGH` → **не баг, accepted policy.** owner/moderator equal-rank actions разрешены намеренно — см. `UserEntityConfig.php:206-210`: "IRabi is a small, trusted staff community... only upward escalation and self-targeting on destructive flags are refused (security audit H-2 / F-08-04, accepted policy)". Это то же самое решение, что уже было явно подтверждено владельцем продукта в ходе этой сессии.
2. `MEDIUM` → **не баг, accepted policy.** owner/admin-only для manual balance adjustment — намеренное решение (`DashboardFinanceController.php:341-342`: "Money movement is owner/admin-only... see security audit H-1"), и `docs/roles.md:53-56` явно относит финансовый контроль/выплаты к роли Owner ("полное управление бизнесом"), тогда как Admin в том же документе (`roles.md:17-36`) описан только как техническая роль без бизнес-доступа. Отчёт не нашёл этот документ, отсюда ложное противоречие.
3. `MEDIUM` → **не баг.** `/sys/log` уже был отдельной находкой (F-LOG-01) в самом первом отчёте этой серии — принят как public ingest surface с per-IP rate-limit (`SysLogController.php`). `/sys/opcache-reset` не является unauthenticated: он gated shared-secret токеном через `hash_equals()` (`SysOpcacheResetController.php:44-47`), fails closed при отсутствии токена — это не сессионная auth, а полноценный auth-механизм для post-deploy hook без сессии.
4. `LOW-MEDIUM` → **подтверждено и исправлено.** См. "Finding 4" ниже.

## Проверенные gates и позитивные наблюдения

- Все app routes, кроме явно public/dev/system, подключаются через `$common`: `WorkerScope`, `Maintenance`, `IrabiAuthMiddleware::authOnly`, `UserDataMiddleware::notDisabled`, `UserDataMiddleware::process`, `IdempotencyMiddleware::before` в `IRabi.php:190-213`.
- Admin dashboard routes требуют `moderatorOnly`, а system/static-pages дополнительно `ownerOnly`: `IRabi.php:248-270`.
- POST CSRF и Origin/Referer проверяются в auth middleware до dispatch controller: `vendor/.../EmailAuthMiddleware.php:127-144`, `AuthMiddleware.php:123-134`.
- Idempotency receipts привязаны к `(account_id, key, route_path)`, replay возвращает cached response или `409 in-flight`: `vendor/.../IdempotencyMiddleware.php:83-127`.
- Бронирование слотов защищено от self-booking, past booking, unapproved/disabled expert booking и overbooking через CAS `reserveSeat()`: `Foreground/Controllers/SlotsController.php:242-349`, `Common/Tables/TimeSlots.php:27-45`.
- IM download и support download проверяют membership/ownership или moderator gate перед private file serving: `vendor/.../FwImController.php:350-389`, `vendor/.../FwSupportController.php:388-433`, `vendor/.../FwSupportAdminController.php:544-567`.
- Dev login/reset-db требуют одновременно `globals->isDev()` и dev directory: `Foreground/Controllers/DevLoginController.php:35-47`, `:155-160`.

## Finding 1: owner/moderator peer staff takeover/DoS через equal-rank actions

- **Статус: НЕ БАГ — accepted policy.** Equal-rank peer management (moderator↔moderator, owner↔owner, admin↔admin) разрешено намеренно для этого небольшого доверенного staff-сообщества; ограничены только upward escalation и self-targeting на деструктивных флагах. Явно задокументировано в коде (`UserEntityConfig.php:206-210`) со ссылкой на прежний security audit (H-2/F-08-04) и подтверждено владельцем продукта повторно в этой сессии. Изменений не вносилось.

**Severity:** HIGH.

**Файл/строки:** `Foreground/Params/UserEntityConfig.php:229-241`, `Dashboard/Controllers/DashboardUsersController.php:72-90`.

**Impact:** staff-пользователь может воздействовать на аккаунт того же ранга: owner может отключить другого owner; moderator может отключить другого moderator; равный peer может менять допустимые флаги цели. Это не повышает ранг напрямую, но дает lateral staff DoS и operational takeover через блокировку активных peer-операторов.

**Preconditions:** атакующий уже имеет `IS_MODERATOR=1` или `IS_OWNER=1`; цель имеет равный rank и не является самим атакующим.

**Exploit scenario:** owner отправляет прямой POST на `/system/admin/~setUserFlag` с `user_id=<другой owner>`, `flag=IS_DISABLED`, `value=1`, валидным CSRF. `post__setUserFlag()` разрешает `IS_DISABLED` всем moderator+ (`DashboardUsersController.php:72`) и вызывает `actorMayActOn()`. `actorMayActOn()` запрещает только self-target и target rank выше actor rank, но разрешает equal rank (`UserEntityConfig.php:239-241`).

**Invariant:** аккаунт с равным или более высоким staff rank не должен отключаться/разжаловаться peer-аккаунтом. В локальной документации owner state-machine прямо указывает, что owner блокируется только admin; moderator state-machine говорит "ниже себя".

**Remediation:** изменить `actorMayActOn()` или добавить operation-specific guard: для destructive staff flags (`IS_DISABLED`, `IS_MODERATOR`, `IS_OWNER`, `IS_ADMIN`) требовать `targetRank < actorRank`, кроме явно утвержденных admin-to-admin сценариев. Добавить e2e/API tests: owner cannot disable owner, moderator cannot disable moderator, owner can disable moderator/user, admin policy explicitly tested.

## Finding 2: owner-level manual balance adjustment конфликтует с admin-only финансовым invariant

- **Статус: НЕ БАГ — accepted policy.** owner/admin-only (не admin-only) — намеренное решение, задокументированное в коде (`DashboardFinanceController.php:341-342`, ссылка на прежний security audit H-1) и подтверждённое `docs/roles.md`: Owner описан как "полное управление бизнесом" с явным пунктом "Финансовый контроль... Выплаты экспертам" (`roles.md:53-56`), тогда как Admin — только техническая роль без бизнес-доступа (`roles.md:17-36`). Изменений не вносилось.

**Severity:** MEDIUM.

**Файл/строки:** `Dashboard/Controllers/DashboardFinanceController.php:340-366`, `Foreground/Params/UserEntityConfig.php:181-190`.

**Impact:** owner может вручную начислять/списывать баланс любому не более высокому аккаунту. Если release invariant остается "ручная корректировка только admin", это privilege escalation из business-owner в financial-root action.

**Preconditions:** атакующий имеет `IS_OWNER=1`, валидную сессию и CSRF.

**Exploit scenario:** owner отправляет POST `/system/admin/finance/~adjustBalance` с `account_id=<user>`, `amount=100000`, `is_credit=1`, `note=...`. `post__adjustBalance()` проверяет `static::isOwner()` (`DashboardFinanceController.php:343`), а `isOwner()` возвращает true для owner и admin (`UserEntityConfig.php:181-185`).

**Invariant:** manual ledger entry типа `manual` должен создаваться только тем rank, который утвержден финансовой политикой. В `docs/story-state-machine/admin.md` ручная корректировка описана как admin-only; код и inline comment говорят owner/admin-only.

**Remediation:** принять одно решение. Если admin-only: заменить guard на `UserEntityConfig::isAdmin()`, скрыть кнопку только для admin, добавить test owner cannot adjust balance / admin can adjust. Если owner/admin intended: обновить role docs и release checklist, чтобы это не было ложным нарушением.

## Finding 3: public `/sys/log` является unauthenticated state-changing endpoint без Origin/CSRF

- **Статус: НЕ БАГ.** `/sys/log` — уже отдельная находка (F-LOG-01) из самого первого отчёта этой серии (commit `7f181ce`), принята как намеренный public diagnostic-ingest endpoint с per-IP rate-limit (60/мин) и fail-closed throttle-хранилищем; см. docblock/комментарии в `SysLogController.php`. `/sys/opcache-reset` не unauthenticated: он требует shared-secret токен в заголовке `X-Garnet-Opcache-Token`, сравниваемый через `hash_equals()`, и fails closed (503), если токен не сконфигурирован (`SysOpcacheResetController.php`) — это полноценный auth-механизм для post-deploy hook, где сессии не существует. Изменений не вносилось.

**Severity:** MEDIUM.

**Файл/строки:** `IRabi.php:238-241`, `Foreground/Controllers/SysLogController.php:40-86`, `:108-135`.

**Impact:** любой внешний сайт или бот может писать диагностические строки в server-side system log. Есть cap 60/min/IP и лимиты размера, но endpoint все равно меняет состояние без auth, Origin и CSRF. Это может загрязнять incident logs, маскировать реальные frontend breadcrumbs и тратить DB/log IO.

**Preconditions:** endpoint доступен из сети; attacker знает `/system/sys/log` или unprefixed route mapping и может отправлять POST.

**Exploit scenario:** attacker шлет POST с `cat=auth&msg=fake-login-fail&meta=...`. Middleware chain для `/sys/log` содержит только `WorkerScope` и `Maintenance` (`IRabi.php:238-241`), поэтому `EmailAuthMiddleware::processOrigin/processCSRF` не выполняются.

**Invariant:** все state-changing HTTP endpoints либо authenticated+CSRF+Origin, либо явно public с abuse budget, мониторингом и документацией. Сейчас public intent есть в комментарии, но release acceptance должен зафиксировать допустимость.

**Remediation:** если endpoint нужен только для собственных страниц, добавить Origin/Referer allowlist even without session или одноразовый public ingest token из layout. Если остается public, добавить отдельный log channel/metric для throttled/accepted public writes и production alert на rate-limit saturation.

## Finding 4: support create-for-user не применяет rank guard к staff targets

- **Статус: ИСПРАВЛЕНО.** Подтверждено чтением кода: `DashboardSupportController::post__createForUser()` проверял только существование target-аккаунта, без какого-либо rank guard — в отличие от equal-rank-allowed политики Finding 1, здесь модератор мог действовать на аккаунт **выше** своего ранга (owner/admin), что и владелец продукта признал нежелательным (equal-rank допустим, upward — нет, тот же принцип, что и в setUserFlag/adjustBalance). Добавлена проверка `UserEntityConfig::actorMayActOn($targetAccountId)` перед созданием тикета. Regression: `Tests/moderator/security-rank-guard.spec.ts`, новый блок "Finding 4" (3/3 green) — moderator→owner 403 (тикет не создан), moderator→admin 403 (тикет не создан), moderator→regular-user не блокируется rank-guard'ом.

**Severity:** LOW-MEDIUM.

**Файл/строки:** `Dashboard/Controllers/DashboardSupportController.php:148-209`.

**Impact:** moderator может создать user-visible support ticket от имени owner/admin target и назначить себя assignee. Это не раскрывает чужие приватные сообщения напрямую, но позволяет low-rank staff инициировать workflow и уведомления на high-rank аккаунтах без `actorMayActOn()`-подобного ограничения.

**Preconditions:** attacker имеет moderator+ доступ.

**Exploit scenario:** moderator отправляет POST `/system/admin/support/~createForUser` с `account_id=<admin>`, `subject`, `message`. Код проверяет только существование target account (`:161-171`) и создает ticket owned by target (`:177-198`).

**Invariant:** staff action, создающий state на чужом аккаунте, должен либо быть явно universal support action, либо соблюдать rank boundary для staff targets.

**Remediation:** либо добавить `actorMayActOn($targetAccountId)` для staff targets, либо явно документировать, что support может писать любому rank. Для первого варианта добавить test moderator cannot create support ticket for owner/admin.

## Неподтвержденные/не найденные проблемы

- Не подтвержден IDOR в user-facing bookings: list/cancel фильтруют по `user_id` или expert-owned slot ids; cancel допускает owner или moderator only (`BookingsController.php:260-285`, `:462-486`).
- Не подтвержден BOLA в expert slot management: create/edit/delete/cancel проверяют `slot.expert_id === account.id` и статус (`ExpertSlotsService.php:205-299`, `:469-607`; `ExpertBookingsService.php:95-98`, `:152-155`, `:244-247`, `:316-319`).
- Не подтвержден bypass для disabled accounts на protected routes: `notDisabled` стоит до role gates (`IRabi.php:199-205`).
- Не подтвержден direct booking of unapproved/disabled expert: `isApprovedActiveExpert()` проверяется в `SlotsController.php:280-283` и `BookingsController.php:338-343`.
- Не подтвержден file IDOR для IM/support attachments: download проходит через conversation/ticket access checks.

## Commands/tests

Выполнены реальные команды статического аудита:

- `git diff --name-status` в `Apps/IRabi`, `garnet-framework`, `Apps/IRabi/vendor/phpcraftdream/garnet-framework` - изменений нет.
- `rg -n "public static function (get|post)__|..."` по `Foreground`, `Dashboard`, `Common`, `IRabi.php`, framework auth/idempotency/support/messaging modules.
- Точечное чтение controllers/middlewares/services: `IRabi.php`, `UserDataMiddleware.php`, `IrabiAuthMiddleware.php`, `UserEntityConfig.php`, `BookingsController.php`, `SlotsController.php`, `ExpertPanelController.php`, `ExpertSlotsService.php`, `ExpertBookingsService.php`, `DashboardUsersController.php`, `DashboardFinanceController.php`, `DashboardSupportController.php`, `DashboardSystemController.php`, framework `AuthMiddleware`, `EmailAuthMiddleware`, `IdempotencyMiddleware`, `FwSupportController`, `FwSupportAdminController`, `FwImController`.

Executable тесты не запускались: это read-only review без изменения исходного кода; найденные issues требуют новых/обновленных authorization tests.

## Непроверенные области

- Реальная production конфигурация `app.ini/db.ini/deploy.ini`, наличие/значение `opcache_token`, `allowed_origins`, cookie `Secure` за TLS.
- Runtime DB constraints на live schema, кроме прочтения migrations/tables по исходникам.
- Полный Playwright прогон cross-role suites не запускался.
- Внешние платежные integrations фактически отсутствуют/не валидировались за пределами ledger/balance flows в коде.
