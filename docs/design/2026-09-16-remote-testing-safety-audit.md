# Тесты на удалённом: аудит безопасности прогона по боевому (#394)

Проверка по факту (не по намерению) четырёх пунктов задачи + предохранитель
+ политика параллельности. Целевое окружение и инвентаризация — см.
`2026-09-16-remote-testing-inventory.md` (#393).

## 1) Каждая запись — только в префиксованные таблицы своего воркера

Проверено: grep по `Tests/**/*.spec.ts` на «сырые» `db_ir_*`/непрефиксованные
имена таблиц в SQL — ни одного совпадения. Все спеки, пишущие в БД, идут
через `tn()` (`helpers/db.ts`/`helpers/scoped-test.ts`), который резолвит
активный префикс (`test_worker_0_*` под токеном, `db_ir_*` иначе).

**Найдено и исправлено — 5 спеков строили СВОЙ HTTP-контекст в обход
`newScopedContext`/`scoped-test` fixtures и не проставляли токен
`run-test-garnet-team`, только `X-Test-Worker`:**

- `specs/framework-bundle/email-link-csrf.spec.ts` — POST `/system/`
  (мутирующий: минтит сессию).
- `specs/framework-bundle/cookie-samesite.spec.ts` — POST `/system/`
  (мутирующий: `start-session`).
- `specs/framework-bundle/backend-error-toast.spec.ts` — только GET.
- `specs/framework-bundle/https-redirect-dev-noop.spec.ts` — только GET.
- `specs/framework-bundle/robots-sitemap.spec.ts` — только GET, имел
  собственный локальный `scopeHeaders()`-шадоу без токена.

Без токена `WorkerScopeMiddleware::process()` (garnet-framework) видит
`!$devContext && !$tokenContext` → возвращает `null`, префикс НЕ
переключается → запрос идёт в LIVE `db_ir_*`. Для двух мутирующих спеков
(email-link-csrf, cookie-samesite) это значило бы реальную запись сессии в
боевые таблицы при прогоне под `PW_PROD=1`.

Фикс: все 5 теперь используют общий `scopeHeaders(workerIndex)` из
`helpers/scoped-test.ts` (та же функция, что и `newScopedContext`), которая
добавляет токен из `RUN_TEST_TOKEN` только когда `isProd()`. Локально
поведение не изменилось (проверено прогоном всех 5 файлов —
7/7 passed).

## 2) Общие, непрефиксуемые сущности

- **Загрузки** — `TestScope::uploadSubDir()` подменяет `Upload` → `UploadTest`
  пока токен активен. Не требует правок.
- **Очередь писем / cron-логи** — `mail_log` и подобные — обычные таблицы,
  идут через `tn()`, значит уже изолированы по префиксу.
- **Глобальные настройки в `app.ini`** (`registrations_enabled`,
  `public_catalog_enabled`, `cancellation_penalty_percent`,
  `support_contact_*`, SMTP) — читаются `FwAppSettings`/`AppSettings`
  НАПРЯМУЮ из файла на каждый запрос, БЕЗ префикса и без кеша. Правка одной
  из них на боевом сервере немедленно бьёт по всем живым посетителям.
  - `registration-gate.spec.ts` и `public-catalog-toggle.spec.ts` уже несут
    `test.skip(process.env.PW_PROD === '1', ...)` — проверено, это
    единственные два файла, которые пишут в `WorkDir/ConfigDev/app.ini`.
  - Никакой спек не бьёт по HTTP-эндпойнту `FwSystemSettingsController`
    (админский сейв настроек) — угроза теоретическая, но стоит на радаре:
    любой БУДУЩИЙ спек, дергающий `~saveSettings` (или аналог), обязан
    получить такой же `test.skip(PW_PROD)`.

## 3) Teardown отрабатывает и на падении/прерывании

`GarnetTestRemoteCommand::run()` уже оборачивал `runPlaywright()` в
`try/finally` и делал teardown даже при провале провижна — это работало.

**Найден и закрыт реальный пробел:** ни одного обработчика сигналов не было.
Ctrl-C / закрытие терминала шлёт SIGINT прямо процессу; PHP CLI по умолчанию
завершается МГНОВЕННО, не доходя до `finally` — токен и scope `test_worker_0`
остаются висеть на боевом сервере бессрочно (до следующего ручного
`test:teardown`).

Фикс — `installInterruptHandler()`:
- Unix: `pcntl_async_signals(true)` + `pcntl_signal(SIGINT/SIGTERM, …)`.
- Windows (машина оператора де-факто win32): `sapi_windows_set_ctrl_handler`
  (pcntl на Windows недоступен).
- Оба пути дергают тот же `$teardown` перед `exit(130)`; булев флаг
  `$torndown` не даёт сработать дважды (обычный `finally` мог бы
  выполниться следом).
- Отсутствие обоих механизмов (нет ни pcntl, ни `sapi_windows_set_ctrl_handler`)
  — тихо пропускается, не валит команду: это best-effort сеть безопасности
  поверх уже существующего `finally`, а не единственная линия защиты.

## 4) Тесты не шлют писем на реальные адреса

`FwAppMailer` подавляет фактическую отправку ТОЛЬКО для адресов с TLD
`.test`, и только когда `$isDev || TestScope::isActive()`.

Найдено: `email-link-csrf.spec.ts` намеренно шлёт код на
`csrftest_N@example.com` (не `.test`) — это специально: `.test`-адрес
получает dev/TestScope авто-логин и НИКОГДА не доходит до фазы
`INPUT_CODE`, которую спек и проверяет (проверено эмпирически — замена на
`.test` ломает тест, «code-phase» не достигается). Подмена домена — не
вариант, семантика теста была бы сломана.

Фикс: `test.skip(process.env.PW_PROD === '1', 'sends a real auth email to a
non-.test address — not safe against a live mail queue')`. Локально
по-прежнему проверяет реальный флоу; под `PW_PROD` не запускается.

`consent-csrf.spec.ts` использует `test@example.com`, но только в тесте
«submit заблокирован без согласия» — кнопка утверждённо `disabled`, запрос
никогда не улетает. Безопасно как есть, правка не нужна.

`public-catalog-toggle.spec.ts` использует `nobody-in-particular@example.com`,
но весь файл уже под `test.skip(PW_PROD)` (см. п.1/п.2) — не достигается
под прод.

## 5) Явный отказ без признаков изоляции — уже реализовано

- **Локально/оркестратор**: `playwright.prod.config.ts` кидает `Error`
  на загрузке конфига, если `BASE_URL`/`RUN_TEST_TOKEN` пусты — прогон
  не стартует вообще.
- **Сервер**: `TestScope::isActive()` требует ОБА — файл `.allow_tests`
  с секретом на диске И совпадающий (constant-time, `hash_equals`)
  заголовок/env. `WorkerScopeMiddleware` при отсутствии обоих контекстов
  (dev или token) явно `clearRuntimeOverride` и возвращает `null` —
  безопасный дефолт, префикс не меняется НИКОГДА без доказательства.
  Утечка одного заголовка `X-Test-Worker: N` без токена ничего не даёт.

Ничего чинить не потребовалось — уже настолько строго, насколько нужно.

## Политика параллельности

`test:remote` и `playwright.prod.config.ts` УЖЕ жёстко фиксируют
`PW_WORKERS=1` / `workers: 1, fullyParallel: false` — единственный scope
`test_worker_0`, набор никогда не гоняется параллельно сам с собой на бою.

Гонка с живым трафиком реальных пользователей физически невозможна для
ЭТОГО механизма: `test_worker_0_*` — полностью отдельные таблицы,
пересечения по строкам с `db_ir_*` нет ни при каких условиях.

Гонки за общими слотами, которые давали ложные находки ранее (класс
D-159/D-163), относятся к ДРУГОЙ модальности тестирования — ручным
UAT-персонам (браузерные агенты), которые ходят по /slots как реальные
посетители БЕЗ изоляции по дизайну (это и есть цель — вести себя как
живой пользователь). Это вне периметра `test:remote`/Playwright-набора и
не является предметом данной задачи.

## Итог

Один структурный пробел (нет обработки прерывания) и один класс пробелов
(5 спеков без токена в собственноручно созданном HTTP-контексте, один из
них — с реальной записью в боевые таблицы) — закрыты. Остальные пункты
задачи уже были реализованы корректно на момент проверки.
