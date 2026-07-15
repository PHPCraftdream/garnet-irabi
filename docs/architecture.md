# Архитектура IRabi

## Слои приложения

```text
Public/index.php / run_web.php
        |
        v
IRabi::runWebApp()
        |
        +-- WorkerScopeMiddleware
        +-- MaintenanceMiddleware
        +-- RouterUriParams + Router
        +-- auth / user-data / idempotency middleware
        |
        +-- Foreground controllers
        +-- Dashboard controllers
        +-- Common services and DbTable classes
        |
        +-- Garnet DbPool / MySQL / Twig / React islands
```

Основной wiring находится в [`../IRabi.php`](../IRabi.php). Source of truth — код регистрации маршрутов, а не отдельный конфигурационный файл.

## Каталоги

| Каталог | Назначение |
|---|---|
| `Common/` | таблицы, сервисы, команды, mailer и общий бизнес-код |
| `Foreground/` | публичные страницы, auth, profile, experts, slots, bookings, IM, support |
| `Dashboard/` | панели moderator/owner/admin, finance, users, logs, CMS |
| `Front/` | React islands, entry points, TypeScript и Less |
| `Migrations/` | последовательные изменения схемы и seed data |
| `WorkDir/` | runtime config, logs, cache, uploads; не переносить секреты в git |
| `Tests/` | Playwright E2E и тестовые helpers |
| `docs/` | business, architecture, deployment, audit и handover docs |

## Routing

IRabi регистрирует маршруты в `IRabi::runWebApp()` через `Router::add()`.

- глобальный prefix сейчас: `/system`;
- public/no-prefix paths (landing, static pages) обслуживаются отдельно;
- URI parameters используют Garnet format `/{name}~{value}`;
- controller method вызывается как `GET__main`, `POST__book` и т.п.;
- dashboard routes дополнительно защищены `moderatorOnly`, а system settings — `ownerOnly`.

Типовой pipeline:

```text
WorkerScope -> Maintenance -> Auth -> UserData -> Idempotency -> Controller
```

Для точного списка маршрутов смотреть `IRabi.php`, а не этот документ: список меняется вместе с кодом.

## Middleware

Общий middleware chain приложения:

- `WorkerScopeMiddleware` — изоляция тестовых workers;
- `MaintenanceMiddleware` — блокировка запросов во время релиза;
- `IrabiAuthMiddleware::authOnly` — session/auth gate;
- `UserDataMiddleware::process` — загрузка и проверка account data;
- `UserDataMiddleware::expertOnly` — expert panel;
- `UserDataMiddleware::moderatorOnly` — dashboard;
- `UserDataMiddleware::ownerOnly` — system/CMS settings;
- `IdempotencyMiddleware` — защита повторной обработки state-changing запросов.

`/dev-login` намеренно остаётся отдельным dev/test endpoint и является security blocker, если dev marker может попасть в production artifact. См. [security audit](security-audit/00-SUMMARY.md).

## Frontend

Frontend использует React-islands: controller отдаёт mount point и props, а entry point лениво загружает island. App-level islands находятся в `Front/Islands/`; shared framework islands живут в установленном Garnet package.

Сборка выполняется из framework `FrontBuilder` через app CLI:

```bash
php garnet prepare
php garnet build
php garnet build:check
```

Generated `*Gen.php`, `Front/I18nGen/*` и content-hashed assets не редактируются вручную.

## Database

Каждая таблица приложения — класс `DbTable` в `Common/Tables/`; схема создаётся migrations. Таблица задаёт bare name, а prefix добавляет Garnet из `db.ini`, поэтому нельзя зашивать полное имя вида `db_ir_*` в SQL.

Garnet предоставляет sync и async CRUD. Для независимых read queries рекомендуется `selectAsync` + `DbPool::get()->pollFinishAll()`. Текущий уровень adoption в iRabi зафиксирован в [выборе фреймворка](framework-selection.md).

## Migrations

Текущая карта миграций находится в `Migrations/AppMigration.php` и включает `M_0001.php` ... `M_0009.php`. Запуск:

```bash
php garnet migrate:status
php garnet migration
```

Схема и модель сущностей: [`database.md`](database.md) и [`data-model.md`](data-model.md).

## Configuration

Runtime files:

| File | Назначение |
|---|---|
| `WorkDir/Config/app.ini` | URL, environment, timezone, brand, registration flags |
| `WorkDir/Config/db.ini` | MySQL connection, prefix, charset/table defaults |
| `WorkDir/Config/email.ini` | SMTP and mail queue |
| `WorkDir/Config/ssh.ini` | deploy/admin SSH credentials; never commit |
| `WorkDir/Config/deploy.ini` | four-folder remote layout |

Templates находятся в `WorkDir/ConfigExample/`, developer overrides — в `ConfigDev/`.
