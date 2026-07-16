# Свежий security/authorization review IRabi

Дата: 2026-07-15  
Область: `D:\dev\garnet\Apps\IRabi`, `D:\dev\garnet\garnet-framework`, `Apps\IRabi\vendor\phpcraftdream\garnet-framework`  
Метод: независимый статический review текущего исходного кода и текущего git diff. Код не изменялся.

## Итог

**Решение: GO. Все 4 находки (M-01, M-02, M-03, L-01) исправлены и покрыты regression-тестами (см. "Статус исправлений" ниже).**

Текущий `git diff` в `Apps\IRabi` и `garnet-framework` пустой. Основные серверные gates после последних правок выглядят сильнее: authenticated routes проходят через auth, Origin/CSRF, disabled-account deny и idempotency; admin routes дополнительно gated moderator/owner; booking/payment paths имеют CAS/unique/capacity guards. Однако остались прямые HTTP-обходы бизнес-границ вокруг disabled/unapproved/demoted expert profiles, чужих user profiles и IM/comments allow-list.

## Проверенные server-side gates

- Общий authenticated middleware: `WorkerScopeMiddleware -> MaintenanceMiddleware -> IrabiAuthMiddleware::authOnly -> UserDataMiddleware::notDisabled -> UserDataMiddleware::process -> IdempotencyMiddleware::before` (`IRabi.php:191`-`209`).
- Authenticated foreground routes включают slots, user/expert profiles, bookings, balance, support, comments, IM, news, users (`IRabi.php:219`-`230`).
- Expert panel: общий authenticated chain плюс `expertOnly` (`IRabi.php:214`-`217`).
- Admin: общий chain плюс `moderatorOnly` (`IRabi.php:248`-`260`); system/pages owner-only на уровне route/controller.
- Global POST Origin/CSRF для authenticated routes: `EmailAuthMiddleware::authOnly()` вызывает `processOrigin()` и `processCSRF()` до controller dispatch (`EmailAuthMiddleware.php:127`-`144`), CSRF сравнивается через `hash_equals()` (`EmailAuthMiddleware.php:192`-`205`).
- Disabled session actor blocked до бизнес-ролей и staff-rank gates (`UserDataMiddleware.php:78`-`84`).

## Findings

### M-01: Disabled/demoted expert profile доступен по прямому `/expert/id~N` и раскрывает слоты/метрики

- **Статус: ИСПРАВЛЕНО.** `ExpertController::get__main()` теперь gate'ится через новый `UserEntityConfig::isApprovedExpertAccount($expertId)` (account-level type=expert + IS_APPROVED, без учёта IS_DISABLED) вместо строки `expert_profiles.is_approved`. Demoted/unapproved -> 404. Для disabled — сохранена и уточнена существующая продуктовая политика анонимизации (тест `blocked-user-display.spec.ts`): профиль остаётся доступен (200) с anonymised именем/без аватара (как в news-feed/IM), но future free slots и booking/decline/conducted counters теперь редактируются (раньше утекали, это и было ядро находки). Regression: `Tests/expert/expert-profile-requires-active-approved.spec.ts` (4/4 green) — baseline active-approved 200+slot виден; disabled -> 200 anonymised, slot id не утекает; demoted/unapproved -> 404.
- **Severity:** Medium
- **Impact:** disabled или demoted account может оставаться видимым через прямой expert URL; раскрываются будущие free slots, specialization/bio, counters, факт наличия expert profile. Public slots listing и booking POST уже используют более строгий approved-active gate, но direct profile route его не повторяет.
- **Preconditions:** атакующий имеет любую валидную сессию; знает `account_id` эксперта. Target имеет `expert_profiles.is_approved=1`, но account уже disabled или больше не является `type='expert'` / не имеет account-level approval.
- **Файл/строки:** `Foreground\Controllers\ExpertController.php:56`-`68`, `:118`-`:139`.
- **Exploit scenario:** после отключения эксперта модератором пользователь открывает `GET /system/expert/id~123`. Controller проверяет только `expert_profiles.is_approved`, затем выбирает future free slots по `expert_id` и возвращает профиль. `AccountDisplay::isDisabled()` скрывает имя/avatar, но не останавливает страницу и не убирает slots/counters.
- **Invariant:** публичный expert surface должен совпадать с booking/listing invariant: видим и bookable только `type='expert'`, account approved, not disabled.
- **Remediation:** в `ExpertController::get__main()` заменить проверку `ExpertProfiles::is_approved` на `UserEntityConfig::isApprovedActiveExpert($expertId)` и дополнительно фильтровать slots только после этого. При demotion/disable можно также каскадно сбрасывать `expert_profiles.is_approved`, но route-level gate обязателен.
- **Regression test:** Playwright/API test: disabled approved expert с future free slot -> `GET /system/expert/id~<id>` должен вернуть 404/403 и не содержать slot id; аналогично demoted `type='user'` с оставшимся expert profile.

### M-02: IM allow-list считает expert profile достаточным, не проверяя active approved expert account

- **Статус: ИСПРАВЛЕНО.** Обе ветки `ImController::canMessage()` (sender-is-expert и recipient-is-expert) переведены на `UserEntityConfig::isApprovedActiveExpert()` вместо truthy-проверки строки `expert_profiles`. Existing-conversation bypass сознательно оставлен без изменений (не входил в core fix, а report указывал его как опциональное усиление). Regression: `Tests/cross-role/im-send-inactive-expert.spec.ts` (4/4 green) — user->active-approved expert 200 (baseline), user->disabled/unapproved/demoted expert 403.
- **Severity:** Medium
- **Impact:** обычный пользователь может отправить IM disabled, unapproved или demoted account, если у target осталась строка `expert_profiles`. Это обходит бизнес-границу "users may message experts only" в смысле active approved experts, создает conversation/news/email для аккаунта, который уже не должен быть доступной expert target.
- **Preconditions:** sender authenticated, valid CSRF; recipient id известен; recipient имеет `expert_profiles` row, но account disabled/unapproved/demoted.
- **Файл/строки:** `Foreground\Controllers\ImController.php:183`-`186`, enforcement перед отправкой `:192`-`:199`, после успешной отправки news/email `:208`-`:219`.
- **Exploit scenario:** пользователь вызывает `POST /system/im/~send` с `recipient_id=<disabled expert id>`, `message=...`, `CSRF_TOKEN=...`. `canMessage()` возвращает true только из-за `ExpertProfiles::selectOneByField('account_id', ...)`; parent controller создает conversation/message, затем IRabi создает news/email.
- **Invariant:** direct send должен enforce тот же recipient set, что продукт показывает пользователю: active approved expert/staff или уже разрешенный business relation; disabled targets не должны получать новые user-initiated conversations.
- **Remediation:** заменить checks `ExpertProfiles::get()->selectOneByField(...)` в `canMessage()` и `searchRecipients()` на account-aware predicate: `UserEntityConfig::isApprovedActiveExpert($recipientId)` для user->expert, а для expert sender проверять `type='expert'`, approved, not disabled. Existing conversation exception стоит ограничить: не разрешать новые messages в disabled account, либо разрешать только staff.
- **Regression test:** direct `POST /im/~send` от user к disabled/unapproved/demoted expert-profile target должен давать 403; active approved expert должен оставаться доступен.

### M-03: `/user/id~N` раскрывает чужие user profile stats и не анонимизирует disabled users

- **Статус: ИСПРАВЛЕНО.** Принята policy: профиль виден self / staff (moderator+) / эксперту, у которого реально была бронь от этого пользователя (real counterparty); остальным — 404 (existence не подтверждается, единообразно с остальным контроллером). Реализовано как новый приватный `UserProfileController::canViewProfile()`, проверяющий TimeSlots+Bookings для counterparty-случая. Regression: `Tests/cross-role/user-profile-access-policy.spec.ts` (5/5 green) — unrelated user 404, self 200, moderator 200 (любая цель), expert без брони с этим пользователем 404, expert с реальной бронью 200.
- **Severity:** Medium
- **Impact:** любой authenticated actor может перебирать `/system/user/id~N` и получать `name`, completed/total bookings, user cancellations/declines для чужих обычных пользователей. Для disabled accounts отсутствует анонимизация, хотя другие surfaces используют `AccountDisplay`.
- **Preconditions:** валидная сессия; знание или перебор numeric account id.
- **Файл/строки:** `Foreground\Controllers\UserProfileController.php:38`-`53`, `:59`-`:91`; route подключен как authenticated common route в `IRabi.php:220`.
- **Exploit scenario:** обычный user вызывает `GET /system/user/id~456` для чужого или disabled account и получает имя и booking/cancellation counters. UI может не давать ссылку, но route server-side это не ограничивает.
- **Invariant:** чужие non-expert profiles должны быть либо явно публичной product feature с документированным минимальным набором данных, либо доступны только self/staff/authorized counterparty. Disabled accounts должны быть anonymized consistently.
- **Remediation:** определить policy. Минимально: разрешить self, moderator+, confirmed/past counterparty expert; для остальных 404/403. Если profile остается публичным, убрать booking/cancellation counters для non-staff и применять `AccountDisplay::isDisabled()` как в `MainController`/`ExpertController`.
- **Regression test:** user A не видит имя/stats user B; disabled user profile возвращает 404/403 или anonymized placeholder без counters.

### L-01: Comments можно создавать на неактивный expert profile, который публично недоступен

- **Статус: ИСПРАВЛЕНО.** `CommentsController::post__create()` для `entity_type='expert'` теперь проверяет `UserEntityConfig::isApprovedActiveExpert($entityId)` вместо простого существования строки `expert_profiles`. Regression: `Tests/user/comments-target-validation.spec.ts` (4/4 green) — baseline active-approved expert 200, disabled/unapproved/demoted expert 404, счётчик комментариев не меняется.
- **Severity:** Low
- **Impact:** authenticated user может заранее записать комментарий на demoted/unapproved/disabled expert profile. Если профиль позже станет active/approved, комментарий появится как легитимный; для disabled/demoted target это также загрязняет moderator/admin surfaces.
- **Preconditions:** authenticated sender, valid CSRF, target id с существующим `expert_profiles` row.
- **Файл/строки:** `Foreground\Controllers\CommentsController.php:78`-`87`, `:110`-`:124`.
- **Exploit scenario:** `POST /system/comments/~create` с `entity_type=expert`, `entity_id=<unapproved expert id>`, `body=...`, `CSRF_TOKEN=...`. Controller проверяет только наличие строки в `ExpertProfiles`, не active/approved account predicate.
- **Invariant:** comment target должен быть текущим публично доступным entity; hidden/unapproved/disabled profiles не должны принимать user-generated public content.
- **Remediation:** для `entity_type='expert'` использовать `UserEntityConfig::isApprovedActiveExpert($entityId)`; для self-comment denial оставить. При staff moderation можно сделать отдельный admin-only path, если нужен.
- **Regression test:** direct comment create на unapproved/disabled/demoted expert returns 404/403; active approved expert succeeds.

## Проверено без finding

- Role hierarchy: `user/expert` как business type и `moderator/owner/admin` как staff rank разделены; `isModerator()`, `isOwner()`, `isAdmin()` кодируют hierarchy admin -> owner -> moderator (`UserEntityConfig.php:139`-`156`).
- Role mutation: moderators могут approval/disabled; owner может moderator; admin может owner/admin; `IS_OWNER` admin-only, target-rank/self guard есть через `actorMayActOn()` в user flag/type/balance actions.
- Booking/payment: direct booking checks slot future/free, self-book deny, active approved expert, atomic `reserveSeat()`, duplicate-key handling, CAS debit, ledger recalculation. Multi-slot path аналогично использует approved-active gate and reserve/recalculate.
- User cancellation and expert cancellation: ownership/expert-slot checks присутствуют, state transitions limited to pending/confirmed, past confirmed cancellation blocked for refund paths.
- Support: user-side ticket/message/download scoped by `account_id`; admin-side gated moderator+; internal messages not returned to users; admin attachment download is moderator+.
- CMS/system settings: `/admin/pages/` and `/admin/system/` owner-only; mutating methods re-check `isAllowed()`.
- CSRF/Origin: central check exists for authenticated POST; controller-local checks are defense in depth on critical endpoints.
- Idempotency/replay: middleware scope includes account id + key + route path and runs after auth for `$common` routes.
- Dev/test gates: `/dev-login` is not in `$common`, but requires both `$globals->isDev()` and `Env::isDevDir()`; `.test` auto-login in auth middleware requires dev or active `TestScope`.
- Public log endpoint `/sys/log`: unauthenticated by design, but category validation, size caps and DB-backed rate limit are present.

## Непроверенные области и остаточный риск

- Не поднимался runtime server и не выполнялись Playwright scenarios; вывод основан на статическом review.
- Не проверялась фактическая production `app.ini`: `base_url`, allowed origins, HTTPS, cookie flags, `env=prod`.
- Не проверялась реальная DB schema на наличие всех unique/index constraints, кроме чтения table code.
- Не проверялись external mail delivery side effects и actual upload storage ACL на production.
- Не проверялись race conditions под нагрузкой фактическими параллельными запросами; кодовые CAS/unique guards просмотрены статически.

## Реальные commands/tests

- `git status --short` в `D:\dev\garnet\Apps\IRabi` -> пусто.
- `git diff --stat` в `D:\dev\garnet\Apps\IRabi` -> пусто.
- `git status --short` в `D:\dev\garnet\garnet-framework` -> пусто.
- `git diff --stat` в `D:\dev\garnet\garnet-framework` -> пусто.
- `rg --files` в `Apps\IRabi`.
- `rg "public static function (get|post)__|function cmd|class CMD" -n Foreground Dashboard Common vendor\phpcraftdream\garnet-framework D:\dev\garnet\garnet-framework`.
- Targeted reads: `IRabi.php`, auth/session middleware, role config, foreground controllers, dashboard controllers, support/IM/news/balance framework controllers, expert services, CLI commands.
- Тесты не запускались: задача была review без изменения кода; рекомендованные targeted regression tests перечислены в findings.

## Статус исправлений

Все 4 находки (M-01, M-02, M-03, L-01) исправлены в текущей рабочей копии, единым паттерном: `UserEntityConfig::isApprovedActiveExpert()` как единый account-level predicate для target-based authorization (M-01/M-02/L-01), плюс новый `UserProfileController::canViewProfile()` для counterparty-политики M-03. Все исправления — явные inline-проверки внутри контроллеров (не middleware), т.к. это target-based (кто/что запрашивается), а не actor-based (кто делает запрос) авторизация: id цели приходит в разных местах запроса (URL id, POST `recipient_id`, POST `entity_id`), и единая router-level middleware для этого не подходит.

`composer check` (PHPStan + CS) — чисто. Regression-тесты (Playwright, живая MySQL57): все 4 набора зелёные (`expert-profile-requires-active-approved.spec.ts` 4/4, `im-send-inactive-expert.spec.ts` 4/4, `user-profile-access-policy.spec.ts` 5/5, `comments-target-validation.spec.ts` 4/4).

## Release blockers

- Blocker 1 (M-01) и Blocker 2 (M-02) сняты — исправлены и покрыты тестами.
- M-03 и L-01 также исправлены (изначально были privacy/content hardening перед релизом, не hard blockers).
- **Перед коммитом/пушем:** прогнать широкий regression sweep (expert/user/moderator/cross-role projects) для проверки отсутствия collateral breakage, особенно от M-03's `canViewProfile()`.
