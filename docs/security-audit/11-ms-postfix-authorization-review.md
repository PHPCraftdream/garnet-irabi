# Независимый security и authorization review IRabi

Дата: 2026-07-15.

Область проверки: `Apps/IRabi`, `garnet-framework`, `Apps/IRabi/vendor/phpcraftdream/garnet-framework`. Предыдущие security-audit отчёты не использовались как источник выводов. Текущий git diff проверен отдельно: `Apps/IRabi` и `garnet-framework` без незакоммиченных изменений на момент проверки.

## Итог

Вердикт (обновлено 2026-07-15 после фиксов): **GO**.

Оба release blocker закрыты:

1. **HIGH A-01 — fixed.** `IS_OWNER` перемещён из ветки `$callerIsOwner` в ветку `$callerIsAdmin` в `DashboardUsersController::post__setUserFlag()` — теперь назначать owner может только admin, как и требует `docs/roles.md`. `IS_MODERATOR` остаётся owner-settable (без изменений). Регресс: `Tests/owner/owner-cannot-mint-owner.spec.ts` (owner получает 400 на IS_OWNER, admin — 200; owner по-прежнему может ставить IS_MODERATOR).
2. **MEDIUM A-02 — fixed.** По решению продукта (слоты неутверждённого эксперта в любом случае невидимы публично) добавлен defense-in-depth API-гейт: `ExpertPanelController` теперь требует `isApproved()` (или staff-ранг — ортогональная ось) во всех мутирующих методах (`post__slots`, `post__batchSlots`, `post__editSlot`, `post__deleteSlot`, `post__confirmBooking`, `post__cancelBooking`, `post__cancelBookedSlot`, `post__cancelSlot`). GET-страницы (`get__slots`/`get__bookings`) и read-only `post__userPreview`/`post__batchPreview` не тронуты — сохраняют легитимный UX "ожидание одобрения". Регресс: `Tests/expert/unapproved-expert.spec.ts` (обновлён под новую политику — 403 вместо тихого создания без news), `Tests/expert/unapproved-expert-mutation-guards.spec.ts` (остальные 4 мутирующих эндпоинта + staff bypass).

Оба фикса верифицированы на реальном MySQL57; широкий регресс-прогон (~330 тестов: user/expert/moderator/owner) не показал новых провалов, кроме двух известных parallel-worker-contention флейков (подтверждены нерелевантными при изолированном прогоне).

## Проверенная модель доступа

Фактическая server-side цепочка маршрутов:

- Защищённые пользовательские маршруты получают `IrabiAuthMiddleware::authOnly`, `UserDataMiddleware::notDisabled`, `UserDataMiddleware::process`, `IdempotencyMiddleware::before`: `Apps/IRabi/IRabi.php:191-210`.
- `/expert/` дополнительно gated только через `UserDataMiddleware::expertOnly`: `Apps/IRabi/IRabi.php:214-217`.
- `/admin/*` gated через `moderatorOnly`: `Apps/IRabi/IRabi.php:248-264`.
- `/admin/system/` и `/admin/static-pages/` gated через `ownerOnly`: `Apps/IRabi/IRabi.php:265-272`.
- Public/no-auth: `/sys/log`, `/sys/opcache-reset`, `/first-step/{token}`, `/page/{view}`, `/dev-login`: `Apps/IRabi/IRabi.php:234-246`.

Роли фактически двухосевые:

- business role `type=user|expert`: `Apps/IRabi/Foreground/Params/UserEntityConfig.php:154-170`.
- staff flags `IS_ADMIN`, `IS_OWNER`, `IS_MODERATOR` с иерархией admin > owner > moderator: `Apps/IRabi/Foreground/Params/UserEntityConfig.php:184-199`.
- disabled-account deny gate есть до всех business/staff gates: `Apps/IRabi/Foreground/Middlewares/UserDataMiddleware.php:78-85`.

## Findings

### A-01 HIGH: owner может назначать owner, хотя invariant требует admin-only

Severity: **HIGH**.

Файл и строки:

- `Apps/IRabi/Dashboard/Controllers/DashboardUsersController.php:56-87`: `post__setUserFlag`.
- `Apps/IRabi/Dashboard/Controllers/DashboardUsersController.php:65-76`: owner получает право менять `IS_OWNER`.
- `Apps/IRabi/Foreground/Params/UserEntityConfig.php:273-282`: `actorMayActOn()` проверяет только текущий rank цели, не итоговый rank после изменения.
- Invariant в документации ролей: `Apps/IRabi/docs/roles.md:157-160` указывает, что owner назначается только администратором.

Impact: бизнес-владелец без `IS_ADMIN` может создать второго owner из обычного user/expert/moderator. Новый owner получает owner-only маршруты `/admin/system/` и `/admin/static-pages/`, а также owner-level финансовые действия, включая manual balance adjustment.

Preconditions: атакующий уже имеет `IS_OWNER=1`, но не `IS_ADMIN`; цель имеет rank <= owner и не является самим атакующим.

Сценарий эксплуатации:

1. Owner отправляет прямой HTTP POST на `/admin/users/~setUserFlag` с валидным `CSRF_TOKEN`.
2. Тело: `user_id=<обычный пользователь>&flag=IS_OWNER&value=1`.
3. `post__setUserFlag()` разрешает флаг, потому что `UserEntityConfig::isOwner()` true добавляет `IS_OWNER` в `$allowed`.
4. `actorMayActOn()` пропускает цель, потому что сравнивает только текущий rank цели с rank actor.
5. Цель становится owner без участия admin.

Нарушенный invariant: "назначение владельца только администратором"; проверка должна учитывать не только текущий rank цели, но и запрашиваемое изменение привилегии.

Remediation:

- Разрешить изменение `IS_OWNER` только `UserEntityConfig::isAdmin()`.
- Для `post__setUserFlag()` добавить проверку итогового rank: actor может устанавливать только флаги, итоговый rank которых строго ниже либо явно разрешён политикой.
- Добавить regression test: owner не может POST `IS_OWNER=1`; admin может.

### A-02 MEDIUM: unapproved expert имеет server-side доступ к expert panel и slot management

Severity: **MEDIUM**.

Файл и строки:

- `Apps/IRabi/IRabi.php:214-217`: `/expert/` защищён `expertOnly`, без `isApproved`.
- `Apps/IRabi/Foreground/Middlewares/UserDataMiddleware.php:87-93`: `expertOnly()` проверяет только business role.
- `Apps/IRabi/Foreground/Params/UserEntityConfig.php:154-155`: `isExpert()` равен `type === 'expert'`.
- `Apps/IRabi/Foreground/Controllers/ExpertPanelController.php:84-121`: create/edit/delete slot endpoints доступны после `expertOnly`.
- `Apps/IRabi/Foreground/Controllers/ExpertPanel/ExpertSlotsService.php:258-271`: создаётся `time_slots` row.
- Invariant в документации ролей: `Apps/IRabi/docs/roles.md:144-150` описывает approval перед доступом к `/expert`.

Impact: неутверждённый expert может прямыми POST-запросами создавать и менять слоты, наполняя операционные таблицы и готовя слоты, которые станут публичными после approval. Бронирование таких слотов дополнительно блокируется проверкой approved active expert, поэтому прямого списания денег не найдено, но server-side gate не соответствует бизнес-инварианту approval.

Preconditions: аккаунт имеет `type=expert`, но `IS_APPROVED` отсутствует/0 и аккаунт не disabled.

Сценарий эксплуатации:

1. Неутверждённый expert логинится.
2. Отправляет POST `/expert/~slots` с датой, длительностью, ценой и валидным `CSRF_TOKEN`.
3. Middleware пропускает, потому что `expertOnly()` проверяет только `type=expert`.
4. `ExpertSlotsService::createSlot()` вставляет слот.

Нарушенный invariant: expert получает доступ к `/expert` после approval, а не только после выставления business role.

Remediation:

- Заменить gate `/expert/` на `approvedExpertOnly`: `type=expert && IS_APPROVED && !IS_DISABLED`.
- Если onboarding unapproved experts нужен, вынести его в отдельный ограниченный маршрут без slot/bookings mutations.
- Добавить regression tests: unapproved expert получает 403 на `post__slots`, `post__batchSlots`, `post__editSlot`, `post__deleteSlot`, `post__confirmBooking`, `post__cancelBooking`.

## Подтверждённые защиты

- CSRF и Origin/Referer проверяются для всех protected POST в `authOnly()`: `garnet-framework/Bundle/Modules/Auth/Middlewares/AuthMiddleware.php:119-134`, `:184-210`; allowed origins берутся из `allowed_origins` или `base_url`: `garnet-framework/Bundle/Modules/Auth/AuthStrategy/AuthConfig.php:62-82`.
- Disabled-account deny стоит до role gates и idempotency: `Apps/IRabi/IRabi.php:198-210`, `Apps/IRabi/Foreground/Middlewares/UserDataMiddleware.php:78-85`.
- Booking direct-ID guards: self-booking, past slot, unapproved/disabled expert, duplicate active booking и CAS seat reservation: `Apps/IRabi/Foreground/Controllers/SlotsController.php:242-325`, `:341-412`.
- Capacity race guard: `TimeSlots::reserveSeat()` атомарно инкрементирует `booked_count` только при `booked_count < max_users`: `Apps/IRabi/Common/Tables/TimeSlots.php:27-31`.
- User booking cancellation ограничен owner-or-moderator и CAS status transition: `Apps/IRabi/Foreground/Controllers/BookingsController.php:480-520`.
- Expert booking actions проверяют ownership слота перед confirm/cancel: `Apps/IRabi/Foreground/Controllers/ExpertPanel/ExpertBookingsService.php:95-98`, `:152-155`, `:244-247`, `:316-319`.
- Balance manual adjustment owner/admin-only, с target-rank guard и self-adjust deny: `Apps/IRabi/Dashboard/Controllers/DashboardFinanceController.php:340-366`.
- Manual debit не уводит баланс ниже нуля: `Apps/IRabi/Dashboard/Controllers/DashboardFinanceController.php:382-399`.
- Support user endpoints фильтруют tickets/messages по `account_id`; internal comments не отдаются user; attachment download дополнительно проверяет ticket ownership: `Apps/IRabi/vendor/phpcraftdream/garnet-framework/Bundle/Modules/Support/Controllers/FwSupportController.php:203-265`, `:335-383`, `:388-433`.
- Support admin endpoints требуют moderator+: `Apps/IRabi/vendor/phpcraftdream/garnet-framework/Bundle/Modules/Support/Controllers/FwSupportAdminController.php:214-217`, `:318-321`, `:413-416`, `:458-460`.
- IM message read/download проверяют participant membership; send проверяет CSRF: `Apps/IRabi/vendor/phpcraftdream/garnet-framework/Bundle/Modules/Messaging/Controllers/FwImController.php:206-227`, `:276-287`.
- IRabi IM send добавляет recipient allow-list до framework send: `Apps/IRabi/Foreground/Controllers/ImController.php:192-202`.
- Public opcache reset требует shared secret и отказывает при пустом token config: `Apps/IRabi/Foreground/Controllers/SysOpcacheResetController.php:31-47`.
- Public sys log endpoint ограничивает category/msg/meta и rate-limits per IP fail-closed on DB error: `Apps/IRabi/Foreground/Controllers/SysLogController.php:45-65`, `:109-135`.
- Dev login/reset gated двумя условиями dev context + dev dir: `Apps/IRabi/Foreground/Controllers/DevLoginController.php:35-43`, `:155-159`.
- Destructive CLI `clear-user` и `clear-logs` gated test-mode marker: `Apps/IRabi/Common/Commands/CMDClearUser.php:30-35`, `Apps/IRabi/Common/Commands/CMDClearLogs.php:31-36`.
- HTTP idempotency middleware существует для POST с `X-Idempotency-Key` и replay scoped by `(account_id, key, route_path)`: `garnet-framework/Bundle/Modules/Idempotency/IdempotencyMiddleware.php:62-128`.

## State-changing endpoints/actions reviewed

Protected HTTP POST reviewed: profile edit, notification prefs, booking create/cancel, slot book/bookData, expert slot create/batch/edit/delete, expert booking confirm/cancel/cancel slot, comments hide/unhide, users set flag/type/remove photo, balance adjustment, invite token CRUD, support create/reply/status/assign/internal, IM send, news read/archive, system settings save/send test/opcache, static pages/snippets CRUD, log/mail/request/entity-history list endpoints.

Public/no-auth POST reviewed: `/sys/log/~log`, `/sys/opcache-reset/~run`, `/first-step/token~...`, `/dev-login`, `/dev-login/~resetDb`, JS error report.

CLI/admin actions reviewed from source: `clear-user`, `clear-logs`, `log-tail`, remote wrappers, cron/test-mode/seed/provision command registrations in `Apps/IRabi/IRabi.php:487-493`.

## Непроверенные области и ограничения

- Тесты не запускались: ограничение задачи разрешает запись только в этот отчёт, а Playwright/Kahlan обычно пишут артефакты, логи, storage state или БД.
- Runtime configuration `app.ini`, реальные `base_url`, `allowed_origins`, `opcache_token`, cookie Secure flags на production не проверялись, только кодовые gates.
- Реальная БД/миграции не прогонялись; наличие всех unique indexes подтверждалось чтением migrations/source, не introspection production schema.
- Frontend UI visibility не считался защитой; выводы основаны на server-side controllers/middleware.

## Рекомендованные release-blocker проверки после фикса

- Добавить и запустить targeted tests на owner/admin role changes: owner не может поставить `IS_OWNER`, admin может.
- Добавить и запустить targeted tests на unapproved expert: прямые POST к `/expert/~slots`, `/expert/~batchSlots`, `/expert/~editSlot`, `/expert/~deleteSlot` должны возвращать 403.
- Добавить negative direct-HTTP tests для money/booking/support/IM endpoints с валидным CSRF, но чужими IDs.
