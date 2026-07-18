# 11 — Аудит тестового покрытия перед передачей заказчику

**Дата:** 2026-07-17.
**Аудитор:** независимый (read-only, код не менялся).
**Область:** `Tests/` (134 spec-файла, ~864 `test()`-вызова), код приложения `Foreground/`, `Dashboard/`, `Common/`, `IRabi.php`, `.github/workflows/ci.yml`, `docs/security-audit/*.md`.

---

## Резюме

Тестовая база IRabi — **зрелая и нетипично честная** для проекта такого размера: 134 Playwright-спека, ~864 теста, из них 75 спеков делают прямые SQL-ассерты состояния БД после действия (не «театр HTTP 200»). Все бизнес-критичные потоки имеют и happy-path, и негативные/edge-тесты; все security-фиксы из `docs/security-audit/*.md`, для которых в отчётах заявлены regression-тесты, **реально существуют на диске и по содержанию соответствуют заявленному**. Изоляция параллельных воркеров (`tn()` / `test_worker_N_*` префиксы) включена по умолчанию и последовательно применяется.

Главные риски передачи — **не в пробелах покрытия потоков, а в инфраструктуре**:

1. **E2e-тесты НЕ запускаются в CI** (осознанное решение, зафиксировано комментарием в `ci.yml`). Вся ценность 864 тестов зависит от дисциплины ручного запуска `composer test:e2e` перед релизом. Для заказчика «под ключ» это риск №1.
2. **PHP-unit-тестов (kahlan) в приложении нет вообще** — `kahlan-config.php` существует, но ни одного `*Spec.php` в `Foreground/Dashboard/Common` не найдено. Вся защита — e2e-слой.
3. **Visual regression отсутствует полностью** — ни одного `toHaveScreenshot`/`toMatchSnapshot` в тестах.
4. **~258 «мягких скипов»** (`if (!slot) { return; }` / `test.skip()`) — при деградации сидов часть тестов молча становится no-op и прогон остаётся зелёным.
5. Rank-guard-тесты покрывают ключевые, но **не все** комбинации ролей (см. §6).

Вердикт: покрытие потоков — GO; передавать заказчику **можно**, но до передачи настоятельно рекомендуется закрыть пункты из раздела «Критичные пробелы» (прежде всего — CI-запуск e2e хотя бы по расписанию/тегу релиза).

---

## Таблица покрытия по бизнес-критичным потокам

Обозначения: ✔ — есть реальный тест; ✔DB — тест дополнительно ассертит состояние БД; ✖ — нет; (n) — число тестов в файле.

| Поток | Happy path | Негатив / edge | Ключевые спеки | Качество |
|---|---|---|---|---|
| **Регистрация** (форма, consent, invite) | ✔DB | ✔ | `specs/framework-bundle/registration-form.spec.ts` (6), `registration-consent`, `invite-magic-link`, `invite-account-type`, `email-auth.spec.ts` (8, ассерт строки в `accounts`) | Высокое: проверяется создание/несоздание строки аккаунта в БД |
| **Registration gate** (registrations_enabled OFF) | ✔ | ✔ | `registration-gate.spec.ts`: unknown email → 403, existing → re-login OK, ON → allowed | Высокое |
| **Аутентификация / magic-link** | ✔DB | ✔ | `magic-link.spec.ts` (сквозной: POST кода → аккаунта ещё НЕТ в БД → код из `mail_log.meta` → verify → аккаунт появился; регрессии #175/#176), `email-auth` (8: логин/логаут/повторный логин), `auth-magic-link-defer`, `auth-magic-link-samepage-hashchange`, `auth-email-preserved-on-error`, `email-link-csrf`, `consent-csrf`, `cookie-samesite` | Высокое: включая CSRF/rate-limit-осведомлённость (уникальный email per run из-за 5/10min лимита) |
| **Бронирование слота** | ✔DB | ✔DB | `user/booking.spec.ts`, `cross-role/user-expert-booking.spec.ts`, `user-expert-booking-balance.spec.ts` (баланс до/после), `news-book-slot`; негатив: `booking-guards`, `booking-time-guards` (past slot), `booking-unapproved-expert`, `booking-modal` | Высокое |
| **Гонки бронирования / overbooking** | — | ✔DB | `cross-role/booking-overbooking-race.spec.ts` (реальная конкурентность через `Promise.all`, ровно N успешных при max_users=1/2), `user/booking-race-booked-count.spec.ts`, `confirm-cancelled-booking-race.spec.ts`, `framework-bundle/idempotency.spec.ts`, `invite-consume-race.spec.ts` | Очень высокое — редко встречающийся класс тестов |
| **Отмена: user** | ✔DB | ✔ | `user/booking-cancel.spec.ts` (10) | Высокое |
| **Отмена: expert** (+ штраф/рефанд) | ✔DB | ✔DB | `cross-role/expert-cancels-booking.spec.ts`, `expert/slot-cancel.spec.ts` (6), `cancellation-kind`, `cancellation-stats`, `cross-role/booking-penalty-cancel.spec.ts`, `booking-refund-flow.spec.ts` (ассерты `balance_ledger`, статусов слота/брони) | Высокое: ledger-строки проверяются в БД |
| **Отмена: moderator** | ✔ | ✔ | `moderator/booking-cancel.spec.ts` (8) | Высокое |
| **Approval эксперта** | ✔DB | ✔DB | `cross-role/approval-flow.spec.ts`, `moderator/approval.spec.ts` (9), `approval-news`, `owner-moderator-chain.spec.ts` (3-уровневая цепочка owner→moderator→approve→видимость слотов, всё с DB-ассертами); негатив: `expert/unapproved-expert.spec.ts`, `unapproved-expert-mutation-guards.spec.ts` (4 мутирующих эндпоинта + staff bypass), `expert-profile-requires-active-approved.spec.ts` (demoted/unapproved → 404, disabled → анонимизация) | Высокое |
| **IM (сообщения)** | ✔ | ✔ | `framework-bundle/cross-role/im-messages.spec.ts` (12), `user/im-partner-name`; негатив: `cross-role/im-send-allowlist.spec.ts` (user→user запрещён), `im-send-inactive-expert.spec.ts` (4: disabled/unapproved/demoted → 403) | Высокое |
| **Support-тикеты** | ✔ | ✔DB | `framework-bundle/cross-role/support-tickets.spec.ts` (23), `admin-moderates-support`, `admin/support-filters`; негатив: `support-assign-validation.spec.ts`, блок «Finding 4» в `moderator/security-rank-guard.spec.ts` (createForUser на owner/admin → 403 + count тикетов не изменился) | Высокое |
| **Comments** | ✔ | ✔DB | `user/comments.spec.ts` (5); негатив: `comments-target-validation.spec.ts` (4: disabled/unapproved/demoted expert → 404, счётчик комментариев в БД не растёт) | Высокое |
| **Balance / finance** | ✔DB | ✔DB | `user/balance.spec.ts` (13: top-up XHR, ledger-строка появляется), `expert/balance.spec.ts`, `admin/finance/balance-adjust.spec.ts` (11), `balances-filters`, `finance-filters`; негатив: rank-guard adjustBalance (403 + баланс не изменился — прямой SQL-ассерт `account_balance`) | Высокое. ⚠️ Top-up — dev-заглушка, реального платёжного провайдера в проекте нет (подтверждено security-отчётом 14) |
| **Admin user-management** | ✔DB | ✔DB | `admin/users/users-grid`, `user-detail`, `roles.spec.ts` (grant/revoke IS_ADMIN + ассерт `accounts_data` + ассерт action-log), `owner/roles.spec.ts` (IS_MODERATOR + action-log), `tokens`, `promote-expert`, `remove-user-photo`, `moderator/account-disable`; негатив: `security-rank-guard.spec.ts`, `owner-cannot-mint-owner.spec.ts`, `dead-legacy-save-user-route.spec.ts` (legacy route → 404, `accounts_data` не меняется), `cross-role/disabled-account-server-side-deny.spec.ts` (3 сценария server-side deny) | Очень высокое |
| **Static pages / CMS** | ✔ | ✔ | `framework-bundle/admin/static-pages.spec.ts` (23), `static-pages-snippets`, `seo-og-image`; публичная сторона: `seo-meta.spec.ts`, `html-lang` | Хорошее (глубоко не разбирался построчно; объём и структура соответствуют остальным) |
| **Профиль пользователя / privacy** | ✔ | ✔ | `user/account-profile`, `profile-edit-settings`, `profile-avatar`; негатив: `cross-role/user-profile-access-policy.spec.ts` (переписан под финальную публичную политику F-14-02), `preview-disabled-anonymization.spec.ts` (4), `blocked-user-display` | Высокое |
| **Disabled-аккаунт (server-side deny)** | — | ✔DB | `cross-role/disabled-account-server-side-deny.spec.ts` (disabled user → comments, disabled expert → создание слота, disabled moderator → setUserFlag) | Высокое |
| **News-лента** | ✔ | ✔ | `framework-bundle/cross-role/news-feed.spec.ts`, `user/news-name-resolution`, `cross-role/approval-news`, `news-book-slot` | Хорошее |
| **Dual-axis роли** (expert+moderator, expert+admin) | ✔ | — | `cross-role/dual-axis-roles.spec.ts` (6) | Хорошее |
| **Idempotency / реплеи** | — | ✔ | `framework-bundle/idempotency.spec.ts` | Высокое |
| **Системные потоки** (mail-log, action-log, cron, js-errors, opcache) | ✔ | ✔ | `framework-bundle/admin/*` (mail-log+filters, action-log, cron-log, js-errors-flow, opcache-reset, account-history), `cron-cli`, `user/syslog-rate-limit.spec.ts` (rate-limit + fail-CLOSED при недоступном throttle-хранилище) | Высокое |
| **Визуальная регрессия вёрстки** | ✖ | ✖ | — | **Полный пробел** (см. §7) |
| **PHP unit-тесты (kahlan)** | ✖ | ✖ | `kahlan-config.php` есть, но в приложении ни одного `*Spec.php` | **Полный пробел** — вся пирамида стоит на e2e |

**Вывод по карте:** ни один из перечисленных в задании бизнес-потоков не остался без покрытия. Явных «дыр по потокам» нет; дыры — инфраструктурные (CI, visual, unit-слой) и точечные (комбинации рангов, см. §6).

---

## Качество существующих тестов (выборочная проверка «на театр»)

Проверены построчно: `moderator/security-rank-guard.spec.ts`, `user/booking.spec.ts`, `cross-role/booking-refund-flow.spec.ts`, `specs/framework-bundle/magic-link.spec.ts`, `email-auth.spec.ts`, `registration-gate.spec.ts`, `owner/roles.spec.ts`, `admin/users/roles.spec.ts`, `cross-role/owner-moderator-chain.spec.ts`, `helpers/scoped-test.ts`, `helpers/db.ts`, `playwright.config.ts`.

**Это НЕ театр.** Признаки настоящих тестов:

- **DB-ассерты после действия** — 75 из 134 спеков импортируют `mysql2/promise` и проверяют реальное состояние: строка в `accounts` появилась/НЕ появилась, `balance` не изменился после отклонённого adjustBalance, `ledger`-записи рефанда, счётчик тикетов/комментариев, `accounts_data`-флаги после grant/revoke, записи в admin action-log.
- **Негативные тесты проверяют и код ответа, и отсутствие побочного эффекта** (403 + «balance unchanged», 403 + «no ticket created», 404 + «accounts_data не изменился»).
- **Изоляция воркеров** — образцовая: `helpers/scoped-test.ts` даёт `tn()`/`getDbPrefix()` (per-worker `test_worker_N_*`), `X-Test-Worker` заголовок прошивается в конфиге и в `newScopedContext()`; серверная часть — `WorkerScopeMiddleware`. Изоляция включена по умолчанию (`PW_WORKER_ISOLATION!=0`), 6 воркеров. Прямые импорты `test` из `@playwright/test` остались только в 4 низкоуровневых спеках (`api-no-react-import`, `backend-error-toast`, `cookie-samesite`, `email-link-csrf`) — они не пишут в БД, а заголовок изоляции для дефолтных fixtures всё равно приходит из `use.extraHTTPHeaders` конфига; риск минимален (но console-guard авто-fixture на них не действует).
- **Console-guard как авто-fixture** — любой console.error/warning или uncaught exception в браузере валит тест. Это редкая и ценная страховка.
- **Настоящие гонки** — `Promise.all`-конкурентность в overbooking/invite-consume/confirm-cancelled, с ассертом «ровно N успешных».

**Слабые места качества:**

1. **~258 «мягких скипов»** — паттерн `const slot = await getFreeSlot(); if (!slot) { console.log('skipping'); return; }` (пример: `user/booking.spec.ts`). При деградации сидов/globalSetup тест молча зеленеет как no-op. Частично смягчено «entry»-тестами (`expect(ownerId).toBeGreaterThan(0)`), но не везде.
2. **`retries: 1` локально / `2` в CI** — осознанный компромисс (задокументирован в конфиге как временный до починки flaky-спеков), но retry может маскировать недетерминированные регрессии.
3. `user/booking.spec.ts` держит **локальный хардкод DB_CONFIG** (host/app_db) вместо централизованного `helpers/db.ts` — дрейф при смене конфига именно у этого спека.
4. Часть UI-смоуков (`user/balance.spec.ts` — «page loads», «element visible») — это действительно смоук-уровень, но они дополняются мутационными тестами в тех же файлах, так что как класс — приемлемо.

---

## Регрессионное покрытие security-фиксов (`docs/security-audit/*.md`)

Проверено: каждый regression-тест, заявленный в отчётах 08–14, существует на диске и по содержанию соответствует заявленному. Ни один не удалён и не выхолощен.

| Фикс (отчёт) | Заявленный тест | Статус на диске |
|---|---|---|
| H-1 adjustBalance → isOwner + rank guard (02, 08) | `moderator/security-rank-guard.spec.ts` | ✔ есть, 403 + SQL-ассерт «balance unchanged» |
| H-2 setUserFlag/setUserType rank guard (02, 08) | там же | ✔ есть (moderator→owner/admin 403; IS_OWNER/IS_ADMIN → 400/403) |
| F-08-03 removeUserPhoto rank guard | там же | ✔ есть, + ассерт photo-поля в БД |
| Finding 4 (13): createForUser rank guard | там же, блок «Finding 4» | ✔ есть, 3/3 как описано (403 + count тикетов) |
| F-PRIV-01 анонимизация disabled в preview (01, 08) | `cross-role/preview-disabled-anonymization.spec.ts` | ✔ есть (4 теста) |
| F-LOG-01 `/sys/log` rate-limit + fail-closed (01/03, 08, 09) | `user/syslog-rate-limit.spec.ts` | ✔ есть (включая «throttle storage failure fails CLOSED») |
| IM allowlist user→user (01, 08) | `cross-role/im-send-allowlist.spec.ts` | ✔ есть |
| Overbooking CAS `reserveSeat()` (09) | `cross-role/booking-overbooking-race.spec.ts` | ✔ есть (2 конкурентных сценария) |
| Invite consume race (09) | `framework-bundle/invite-consume-race.spec.ts` | ✔ есть |
| Support assign validation (09) | `framework-bundle/cross-role/support-assign-validation.spec.ts` | ✔ есть |
| Confirm-cancelled race (08) | `cross-role/confirm-cancelled-booking-race.spec.ts` | ✔ есть |
| booked-count race (08) | `user/booking-race-booked-count.spec.ts` | ✔ есть |
| Dead legacy save-user route → 404 (10) | `moderator/dead-legacy-save-user-route.spec.ts` | ✔ есть (404 + `accounts_data` не меняется) |
| Disabled-account server-side deny (10) | `cross-role/disabled-account-server-side-deny.spec.ts` | ✔ есть (3 сценария) |
| A-01 owner не может mint owner/admin (11) | `owner/owner-cannot-mint-owner.spec.ts` | ✔ есть (owner→400, admin→200, IS_MODERATOR разрешён) |
| Unapproved-expert mutation guards (11) | `expert/unapproved-expert-mutation-guards.spec.ts` | ✔ есть (4 эндпоинта + staff bypass) |
| Expert profile active-approved gate (12) | `expert/expert-profile-requires-active-approved.spec.ts` | ✔ есть (4/4 как в отчёте) |
| IM → inactive expert 403 (12) | `cross-role/im-send-inactive-expert.spec.ts` | ✔ есть (4/4) |
| Comments target validation (12) | `user/comments-target-validation.spec.ts` | ✔ есть (4/4) |
| F-14-02 публичная политика профиля (14) | `cross-role/user-profile-access-policy.spec.ts` | ✔ есть, переписан под финальную политику |
| Booking of unapproved expert (00 §4) | `user/booking-unapproved-expert.spec.ts` | ✔ есть |

**Без регрессионного пина (осознанно или по недосмотру):**

- **`/dev-login` hardening** (топ-находка №1 в 00-SUMMARY: `isDev()` + dev-dir). Автотеста «в prod-режиме роут отдаёт 404» нет — e2e-стенд сам dev, поэтому это принципиально не тестируется текущим харнессом. Остаточный риск переносится на deploy-процедуру (исключение IDE-каталогов из артефакта) — стоит зафиксировать в release-чеклисте заказчика.
- **F-14-01 (accepted policy: модератор ведёт тикеты owner/admin)** — политика принята без пинning-теста; рекомендация отчёта 14-ms («добавить тесты moderator может ticketDetail/reply…») не реализована.
- **Equal-rank policy (owner↔owner, moderator↔moderator)** — принятая политика (13-ms Finding 1) также не запинена тестом.
- Low-находки F-05-01 (nosniff) и F-05-02 (re-encode OG-картинок) — тестов нет (grep по `nosniff` в тестах пуст); соответствует их статусу «hardening-бэклог».

---

## §6. Rank-guard: матрица покрытых комбинаций ролей

Иерархия по коду (`UserEntityConfig`): admin ≥ owner ≥ moderator; бизнес-роли user/expert — отдельная ось.

| Actor → Target | Покрыто тестом? | Где |
|---|---|---|
| moderator → owner (balance/flag/type/photo/ticket) | ✔ 403 | `security-rank-guard.spec.ts` |
| moderator → admin (то же) | ✔ 403 | там же |
| moderator → user (не блокируется rank-guard'ом) | ✔ | там же |
| moderator → self IS_ADMIN (legacy route) | ✔ 404 | `dead-legacy-save-user-route.spec.ts` |
| disabled moderator → setUserFlag | ✔ deny | `disabled-account-server-side-deny.spec.ts` |
| owner → user: mint IS_OWNER | ✔ 400 | `owner-cannot-mint-owner.spec.ts` |
| owner → user: grant/revoke IS_MODERATOR | ✔ 200 + DB + action-log | `owner/roles.spec.ts` |
| owner → user: grant IS_ADMIN | ✔ deny | `owner/roles.spec.ts` |
| admin → user: grant/revoke IS_ADMIN, IS_OWNER | ✔ 200 + DB | `admin/users/roles.spec.ts`, `owner-cannot-mint-owner.spec.ts` |
| **owner → admin (upward: disable/flag/type/balance)** | **✖ не покрыто** | — |
| **owner → owner (equal-rank, accepted policy)** | **✖ не покрыто** | — |
| **moderator → moderator (equal-rank)** | **✖ не покрыто** | — |
| **admin → admin (equal-rank)** | **✖ не покрыто** | — |
| **self-target деструктивных флагов (owner → self)** | **✖ не покрыто явно** | — |

Итого: покрыты все комбинации, которые были **багами** (upward-эскалация модератора, mint owner/admin), но НЕ покрыты: (а) upward owner→admin — по коду должен давать 403, теста нет; (б) equal-rank разрешения — это принятая политика, и без пиннинг-теста будущий рефакторинг `actorMayActOn()` может незаметно её сломать или, наоборот, незаметно открыть новую дыру. Матрица «частных случаев», а не полная — вопрос из задания подтверждается.

---

## §5. CI-интеграция — оценка риска

`.github/workflows/ci.yml`: два джоба — `quality` (cs-fixer + phpstan + build) и `frontend` (oxlint + tsgo). В шапке явный комментарий: *«e2e (Playwright) is intentionally NOT run here to keep CI usage light — run `composer test:e2e` locally / on demand instead»*. Скрипт `composer test:e2e` существует (`npm --prefix Tests test`), есть `Tests/docker-compose.test.yml` + `Tests/docker/` (Dockerfile.php-fpm, nginx, config) — т.е. контейнерная обвязка для автономного прогона уже написана, но воркфлоу её не использует.

**Да, для передачи «под ключ» это самостоятельный риск, и существенный:**

- Единственный автоматический гейт заказчика — статанализ и сборка. **Ни один из 864 поведенческих тестов не встанет на пути регрессии**, если у команды заказчика нет привычки запускать e2e руками.
- Внутри команды-разработчика дисциплина есть (отчёты security-серии фиксируют реальные прогоны «N/N green»), но дисциплина **не передаётся вместе с репозиторием**. Через 2–3 месяца после handover вероятность регулярного ручного запуска стремится к нулю.
- Ситуация парадоксальная: проект имеет тестовую базу выше среднего уровня, но её ценность после передачи де-факто обнуляется отсутствием автоматического запуска.
- Дополнительный фактор: unit-слоя нет (см. выше), т.е. e2e — **единственный** поведенческий барьер; выключенный барьер = ноль барьеров.

---

## §7. Snapshot / визуальные тесты

Отсутствуют полностью: ни одного `toHaveScreenshot`/`toMatchSnapshot` в спеках (единственное упоминание — в служебном скрипте `Tests/scripts/batch-expects.js`, это рефакторинг-утилита, не тест). Защита вёрстки — только косвенная: функциональные локаторы (`data-test-id`), `seo-meta`/`html-lang`-спеки и console-guard (падение на JS-ошибках). Случайная поломка CSS/layout, не роняющая локаторы и консоль, не будет замечена ни одним тестом. Для продукта с публичным лицом (профили экспертов, календарь) это пробел, но по важности — ниже CI и rank-guard-матрицы.

---

## Критичные пробелы — закрыть ДО передачи заказчику

Приоритет 1 (блокирующие по духу «под ключ»):

1. **Включить e2e в CI** хотя бы в одном из режимов (см. рекомендации ниже). Без этого тестовая база после handover мертва.
2. **Дописать rank-guard-матрицу**: owner→admin (upward, ожидаем 403 на setUserFlag/setUserType/adjustBalance/removeUserPhoto); пиннинг-тесты принятых политик equal-rank (owner→owner disable разрешён, moderator→moderator разрешён) и self-target. Это ~6–8 дешёвых API-тестов в существующий `security-rank-guard.spec.ts`.
3. **Зафиксировать в release-чеклисте заказчика** непокрываемое автотестом: `/dev-login` (исключение `.idea`/`.vscode` из prod-артефакта + `env=prod`), значения `opcache_token`/`allowed_origins`, отсутствие `.allow_tests` на проде.

Приоритет 2 (желательно):

4. **Пиннинг-тест F-14-01** (модератор может ticketDetail/reply/assign по тикету owner — принятая политика) — чтобы будущий «security-фикс» не сломал support-workflow и наоборот.
5. **Аудит «мягких скипов»**: конвертировать паттерн `if (!data) return` в `test.fail`/`expect(data).toBeTruthy()` хотя бы в booking/balance-спеках, либо добавить в глобальный teardown ассерт «за прогон нет ни одного soft-skip» (счётчик).
6. Убрать локальный хардкод DB_CONFIG в `Tests/user/booking.spec.ts` → `helpers/db.ts`.

Приоритет 3 (бэклог):

7. Базовый набор visual-снапшотов (5–10 ключевых страниц: главная, календарь, профиль эксперта, booking-форма, admin users-grid) через `toHaveScreenshot` с маскированием динамики.
8. Минимальный kahlan/unit-слой для чистой бизнес-логики (`computeRefundAmounts`, `actorMayActOn`, календарные хелперы) — они сейчас тестируются только сквозь браузер.
9. Перевести 4 спека с прямым `import { test } from '@playwright/test'` на `helpers/scoped-test` (получат console-guard бесплатно).

---

## Рекомендации по CI

Минимально достаточная схема (не раздувая минуты GitHub Actions):

1. **`e2e-nightly.yml`** — schedule (cron, 1×/сутки) + `workflow_dispatch`: поднять стек из уже существующего `Tests/docker-compose.test.yml`, `composer test:e2e`, артефакты — playwright-report + traces on-first-retry. Ночной прогон ловит регрессии максимум через сутки и не тратит минуты на каждый push.
2. **Release-гейт**: тот же джоб триггером на теги `v*` / пуш в релизную ветку, с обязательным статусом (branch protection). Это переносит «дисциплину ручного запуска» из головы человека в механику репозитория — ключевая мера для заказчика.
3. **PR-smoke (опционально)**: подмножество ~30–50 быстрых спеков (`security-rank-guard`, `booking-guards`, `email-auth`, `disabled-account-server-side-deny`, races) отдельным грепом/тегом `@smoke` на каждый PR — 5–7 минут, ловит 80% болезненных регрессий.
4. В README/handover-док заказчика — короткая инструкция: как запустить полный прогон локально (`composer test:e2e`, требования: MySQL, `php garnet serve`, 6 воркеров), как читать flaky-retry, и правило «релиз без зелёного e2e не выкатывается».
5. После включения CI пересмотреть `retries: 2` → цель `retries: 0` c точечной починкой перечисленных в конфиге flaky-классов (toast-intercept, in-flight XHR) — иначе ночные прогоны будут прятать недетерминизм.

---

## Приложение: сводные цифры

- Spec-файлов: **134** (без node_modules); `test()`-вызовов: **~864**.
- Спеков с прямыми SQL-ассертами состояния БД: **75** (56%).
- Спеков с негативными проверками (403/400/denied/rejected): **59**.
- Мягких скипов (`skipping`/`test.skip()`): **~258** вхождений.
- Visual-снапшотов: **0**. PHP-unit-спеков: **0**.
- Изоляция: per-worker DB-префикс `test_worker_N_*` (по умолчанию ON), 6 воркеров, per-worker auth-стейты `.auth/{role}_w{N}.json`.
- CI: только статика/сборка/линт; e2e — осознанно исключены (комментарий в `ci.yml`).
