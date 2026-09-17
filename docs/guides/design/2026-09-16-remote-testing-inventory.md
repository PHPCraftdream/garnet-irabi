# Тесты на удалённом: инвентаризация и целевое окружение (#393)

## Решение: целевое окружение

**Боевой `slotbook.ru`, изоляция по префиксу воркера `test_worker_0`,
запуск через `php garnet test:remote --base-url=https://slotbook.ru`.**

Отдельный стенд НЕ заводим: инфраструктура для безопасного прогона по
боевому уже реализована и задокументирована (`Tests/TESTING.md`,
раздел «Running the suite against a remote box»):

- `GarnetTestRemoteCommand` — оркестратор: провижн → прогон → снос.
- `CMDTestProvision` / `CMDTestTeardown` — поднимают/сносят
  `test_worker_0_*` таблицы и одноразовый токен `run-test-garnet-team`
  на удалённой стороне.
- `WorkerScopeMiddleware` + `TestScope` — на каждый запрос с валидным
  токеном и `X-Test-Worker: 0` подменяют префикс БД и каталог загрузок
  (`UploadTest`) на изолированные.
- `IrabiAuthMiddleware` — на бою нет `/dev-login`; авторизация идёт
  через реальный passwordless-флоу, для `*.test`-адресов под активным
  `TestScope` код подтверждения авто-проходит.
- `helpers/ssh-bridge.ts` — подменяет `mysql2/promise.createConnection`
  так, что прямые SQL-запросы спеков уходят по SSH через
  `php garnet sql --json`, никогда не касаясь боевой БД напрямую.

Запрос без токена обслуживается как обычный боевой трафик — гарантия
изоляции лежит на токене+заголовке, не на выборе окружения.

## Инвентаризация: что привязано к локальной машине

| # | Механизм | Где используется | Статус | Комментарий |
|---|---|---|---|---|
| 1 | HTTP через `page`/`request` (дефолтная fixture) | весь набор | **работает удалённо как есть** | `playwright.prod.config.ts` подставляет `baseURL` + `X-Test-Worker`/токен на каждый запрос |
| 2 | Прямые SQL через `mysql.createConnection` / `withConnection` (`helpers/db.ts`) | ~110 spec-файлов | **работает удалённо как есть** | `ssh-bridge.ts` патчит `mysql2` под `PW_PROD=1`; SQL уже адресован `tn()`-префиксом, значит бьёт только в изолированный `test_worker_0` |
| 3 | Чтение `WorkDir/ConfigDev/db.ini` / `deploy.ini` для конфигурации подключения (`helpers/db.ts`, `helpers/ssh-bridge.ts`) | инфраструктурные хелперы | **работает удалённо как есть** | Это чтение локальных *defaults* для локального режима; под `PW_PROD` `BASE_URL`/`RUN_TEST_TOKEN` приходят из env от `test:remote`, ini-фолбэк просто не используется |
| 4 | Auth / `/dev-login` | `helpers/auth.ts`, `setup/*.setup.ts` | **работает удалённо как есть** | На бою нет `/dev-login` — `global-setup.prod.ts` логинится через реальный UI-флоу, testuser-аккаунты заведены `test:provision` |
| 5 | **Прямая запись в `WorkDir/ConfigDev/app.ini`** (переключение feature-флага) | `specs/framework-bundle/registration-gate.spec.ts`, `specs/framework-bundle/public-catalog-toggle.spec.ts` | **требует переделки** | Правит файл на ЛОКАЛЬНОЙ машине — на боевом сервере это не производит никакого эффекта. Нужен SSH-тоггл (`php garnet ssh 'sed ...'` или отдельная test-only серверная команда) прежде чем эти два спека смогут идти в prod-режиме |
| 6 | **`spawnSync('php', ['run_cmd.php', ...])`** — прогон крона/миграции/произвольного PHP посреди теста | `expert/slot-vanishes-on-failed-booking.spec.ts`, `time-shift.spec.ts`, `user/booking-time-guards.spec.ts` (×3), `specs/framework-bundle/{db-backup-cron,email-queue-cron-lock,email-watchdog,finance-reconciliation×2,log-rotation-cron×3,migration-idempotency,process-static-cache-reset,session-retention-cron×2}.spec.ts` — 12 файлов, 16 вызовов | **требует переделки** | Выполняется на ЛОКАЛЬНОЙ машине с `cwd: APP_DIR` — под `PW_PROD` либо упадёт (нет локального чекаута с боевым состоянием БД), либо (хуже) молча выполнится против локального инстанса вместо боевого. Нужно завернуть в `php garnet ssh "cd <remote_runtime_dir> && php run_cmd.php ..."`, аналогично `ssh-bridge.ts`. Это отдельная задача — **#396** |
| 7 | `spawnSync('php', ['run_cmd.php', ...])` в `helpers/isolation-setup.ts` | `global-setup.ts` (легаси/локальный `globalSetup`) | **не требует переделки, вне охвата** | Этот файл — часть ЛОКАЛЬНОГО пайплайна изоляции (`PW_WORKER_ISOLATION`), под `PW_PROD` вообще не вызывается — прод использует отдельный `global-setup.prod.ts`, который провижнится через `test:provision` по SSH |
| 8 | `BASE_URL` по умолчанию `http://localhost:8001` (`playwright.config.ts`) | базовый конфиг | **не требует переделки** | Прод использует отдельный `playwright.prod.config.ts`, где `BASE_URL` обязателен (кидает `Error`, если не задан) — фолбэк на localhost просто недостижим в prod-режиме |
| 9 | Загрузка файлов (`Public/upload`) | спеки с аплоадом фото/документов | **работает удалённо как есть** | `TestScope` подменяет каталог загрузок на `UploadTest` — см. README, п.3 |

## Вывод

Основная масса набора (HTTP-флоу, прямой SQL, авторизация, загрузки)
уже прозрачно работает в prod-режиме без единой правки спеков —
инфраструктура (`ssh-bridge.ts`, `TestScope`, `test:remote`) была
построена именно с этим свойством как целью. Единственные два класса,
требующие переделки:

- **прямая правка локального `app.ini`** (2 спека, #5) — нужен
  SSH-тоггл feature-флагов;
- **`spawnSync` вызовы `run_cmd.php`/`php -r` мимо HTTP** (12 файлов,
  #6) — нужен SSH-обёртка вместо локального `spawnSync`, это #396.

Следующая задача по цепочке — **#394** (безопасность прогона по
боевому: изоляция, запрет разрушительного, уборка после падения) —
может проектироваться поверх уже существующего провижн/teardown цикла,
описанного выше, без ожидания переделки пунктов #5/#6.
