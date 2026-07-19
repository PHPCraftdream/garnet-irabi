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

### Ссылочная целостность (без FOREIGN KEY)

Во всей схеме из 40+ таблиц **нет ни одного ограничения `FOREIGN KEY`** — ни `ON DELETE CASCADE`, ни `ON DELETE RESTRICT`. Это осознанное архитектурное решение, а не недосмотр; у него две причины.

1. **Ограничение билдера таблиц фреймворка.** `TableBuilderMySQL` умеет только `addIdColumn` / `addColumn` / `addIndex` — API для создания внешних ключей у него нет, поэтому ни одна миграция приложения не может породить FK штатным путём.
2. **Сознательный перенос ссылочной целостности в код приложения.** Каскадная логика (что удалить/отменить вместе с аккаунтом, слотом, тикетом) закодирована явно в сервисах (`Common/Services/ClearUserService.php`, `ExpertSlotsService` и контроллерах), а не декларативно в СУБД. Это даёт полный контроль над поведением — например, «при блокировке эксперта отменить только активные брони, но сохранить историю», что плохо выражается через стандартные правила FK.

**Что реально защищено на уровне СУБД** (не только кодом):

- уникальные индексы на критичных идентификаторах: `accounts.login` (защита email-логина от гонок регистрации), `accounts_data (account_id, param)` (консистентность EAV), `invite_tokens.token`, `static_pages.slug`, `im_conversations (participant_a, participant_b)`, `idempotency_keys (account_id, idem_key, route_path)` и др.;
- **анти-дубль брони** — generated-колонка `bookings.active_dup_key` (VIRTUAL, `NULL` вне `pending`/`confirmed`) + уникальный индекс `uq_active_booking`: повторное активное бронирование одной пары (user, slot) невозможно на уровне хранилища;
- **баланс и места** — пересчёт баланса через `INSERT … SELECT SUM(…) ON DUPLICATE KEY UPDATE` (UNIQUE на `account_id`); идемпотентная запись в леджер через UNIQUE-индекс + перехват duplicate-key; атомарный захват места слота через `UPDATE … WHERE booked_count < max_users`.

**Практическое следствие для заказчика.** Прямые ручные правки в БД (`INSERT`/`UPDATE`/`DELETE` в обход приложения) **могут создать осиротевшие записи без какого-либо предупреждения со стороны СУБД**: бронь на несуществующий слот, сообщение в удалённый тикет, комментарий об удалённом эксперте. СУБД здесь не страховка — связи проверяет только код. Рекомендация: **не выполнять ручных правок в рабочей БД** без полного понимания связей; любые срочные правки проводить через штатные пути приложения или CLI-команды (`php garnet …`), а не через прямой SQL в таблицы.

### Удаление и блокировка аккаунтов, судьба исторических записей

В системе сосуществуют три механизма работы с данными аккаунта. Заказчику важно понимать разницу.

**1. Блокировка аккаунта** (soft, обратимо). Ставится флагом `IS_DISABLED` в EAV-таблице `accounts_data`. Данные аккаунта **сознательно сохраняются целиком** — не удаляется ни одна строка. В пользовательском интерфейсе блокировка маскируется централизованно (`Common/Services/AccountDisplay.php`): вместо реального имени и аватара показывается плейсхолдер вида «Пользователь #{id} отключён». Активные брони и слоты заблокированного эксперта отменяются кодом приложения (не СУБД): именно код, а не `ON DELETE CASCADE`, отвечает за каскадную отмену.

**2. Жёсткое удаление аккаунта** (безвозвратно, запрос на стирание по 152-ФЗ/GDPR). Единственный сервис стирания — `ClearUserService::clearByEmail()`. Предусмотрено два входа:

| Вход | Доступ | Назначение |
|---|---|---|
| CLI `php garnet clear-user <email>` (`Common/Commands/CMDClearUser.php`) | **только test-mode** (файл `.test-mode`) | QA-инструмент для очистки тестовых аккаунтов между прогонами; на проде заблокирован |
| Web-эндпоинт `DashboardUsersController::post__clearUser()` | **owner-only** (admin или owner, не moderator) + двойное подтверждение (`confirm_login` = email цели) | **Штатный продакшен-путь** исполнения запроса субъекта на удаление данных (152-ФЗ); не требует SSH-доступа, действие залогировано в `admin_action_log` |

Сервис написан аккуратно и двумя проходами гарантирует, что осиротевших дочерних строк не остаётся: сначала каскадно собираются родительские id (слоты, диалоги, тикеты, платежи, сессии) и удаляются их дочерние записи, затем generic-проход по `information_schema` сносит все строки, где аккаунт фигурирует как владелец (по колонкам `account_id`, `user_id`, `expert_id`, `sender_id`, `author_id` и др.). Это auto-adapts к новым таблицам без правки кода.

**3. Известные краевые случаи** (некритичные, квалифицированы аудитом как MEDIUM, не блокеры поставки). Перечислено честно — это ограниченные сценарии, о которых стоит знать:

- **TOCTOU при удалении слота.** `ExpertSlotsService::deleteSlot()` проверяет «нет активных броней» и затем удаляет слот двумя отдельными операциями без блокировки; бронь, созданная между проверкой и удалением, останется указывать на несуществующий слот. Без FK СУБД это пропустит. На практике окно узкое и ограничено запросом владельца слота к собственному слоту.
- **Исторические брони при удалении слота.** Записи со статусами `completed`/`cancelled` переживают удаление слота с висящим `bookable_id` — это **by design** (история бронирований сохраняется), но ранее нигде не задокументировано.
- **Комментарии об удалённом/заблокированном эксперте.** `comments.entity_id` (при `entity_type='expert'` равен `account_id` эксперта) не входит в список `OWNER_COLUMNS` сервиса очистки, поэтому generic-проход чистит только комментарии, где эксперт был **автором** (`author_id`), но не комментарии **о** нём. После `clear-user <expert>` чужие отзывы об этом эксперте остаются с висящей ссылкой. При блокировке (а не удалении) комментариям ничего не грозит — они просто отображаются с маской «отключён».
- **Тела писем с CC-адресатами.** `mail_log.body_html` для писем, где адресат был в копии (через `mail_log_recipients`), частично переживает чистку по `account_id`: очередь и метаданные получателей очищаются, но тело исходного письма может остаться, если основной адресат не был целевым аккаунтом.

Все эти случаи относятся к удалению/блокировке и не влияют на штатную работу бронирования, оплаты и обмена сообщениями. Подробный технический разбор — в аудите [`handover-audit/14-data-integrity-migrations.md`](handover-audit/14-data-integrity-migrations.md) (находки H-1 и M-3).

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
