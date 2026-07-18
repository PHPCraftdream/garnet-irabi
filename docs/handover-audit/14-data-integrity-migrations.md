# Аудит 14 — Целостность данных и миграции схемы БД

Дата: 2026-07-17
Область: `Migrations/Items/M_0001–M_0012`, `Migrations/AppMigration.php`, `Migrations/Helpers/StaticPagesSeed.php`, `Migrations/SeedData/*`, `Common/Tables/*.php` (37 файлов), родительские Fw-таблицы фреймворка (`vendor/phpcraftdream/garnet-framework/…`), `docs/database.md`, `docs/data-model.md`.
Метод: чтение всех файлов миграций и определений таблиц целиком (включая родительские классы фреймворка и билдер `TableBuilderMySQL`), без запуска БД, без внесения изменений.

---

## Резюме

Схема из 40+ таблиц создаётся 12 миграциями «только вперёд». Общая инженерная культура заметно выше средней: деньги в живом контуре хранятся как `INT`, все даты — единообразный unix-timestamp `INT(11)`, ключевые бизнес-инварианты (анти-дубль брони, идемпотентность леджера, атомарный счётчик мест) закреплены на уровне СУБД уникальными индексами и generated-колонкой, а миграции M_0003–M_0012 корректно идемпотентны.

Однако есть четыре системные проблемы, важные для поставки «под ключ»:

1. **Во всей схеме нет ни одного FOREIGN KEY.** Ссылочная целостность держится исключительно на коде приложения; билдер таблиц фреймворка вообще не умеет генерировать FK. Любой прямой доступ к БД или баг в коде создаёт осиротевшие записи, которые СУБД не заметит.
2. **Механизма отката (down/rollback) не существует в принципе** — интерфейс `IMigrationItem` содержит только `update()`. Откат релиза возможен только восстановлением из бэкапа.
3. **M_0001 и M_0002 не идемпотентны**, а M_0002 при повторном запуске ещё и **уничтожает контент статических страниц** (включая правки администратора) через `StaticPagesSeed::install() → wipe()`. При потере записи в таблице-трекере `migration` (одна строка `id=1000`) повторный прогон на живой БД частично упадёт и частично затрёт данные.
4. **Документация схемы (`docs/database.md`, `docs/data-model.md`) существенно устарела** и в ряде мест описывает несуществующие колонки/типы (в т.ч. `rating DECIMAL(3,2)`, `payments.amount INT + status ENUM`, суффиксы `created_ut`, префиксы `ir_`/`db_` вместо фактического `db_ir_`), а ~28 реально существующих таблиц не описаны вовсе.

Реальных персональных данных в сид-данных не обнаружено — только синтетика (`*@dev.test`) и юридические тексты с плейсхолдерами.

---

## Находки

### HIGH

#### H-1. Полное отсутствие FK-constraints — системно
- **Где:** вся схема. Билдер `TableBuilderMySQL` (`vendor/phpcraftdream/garnet-framework/Kernel/Db/Tables/TableBuilderMySQL.php`) не имеет API для внешних ключей; ни одна миграция не добавляет их сырым SQL (грепом `FOREIGN KEY` по фреймворку и приложению — единственное совпадение в spec-файле теста).
- **Затронутые связи (примеры):** `bookings.user_id → accounts.id`, `bookings.bookable_id → time_slots.id`, `time_slots.expert_id → accounts.id`, `expert_profiles.account_id → accounts.id`, `balance_ledger.account_id → accounts.id`, `support_messages.ticket_id → support_tickets.id`, `im_messages.conversation_id → im_conversations.id`, `static_page_blocks.page_id → static_pages.id`, `mail_log_recipients.mail_log_id → mail_log.id`, `invite_registrations.token_id → invite_tokens.id` и т.д. — все «FK» существуют только как обычные индексы.
- **Последствия:** при ручных правках в БД (что заказчик «под ключ» будет делать), при багах в коде или при частичном сбое многотабличных операций СУБД молча примет осиротевшие строки: бронь на несуществующий слот, сообщение в несуществующем тикете, блок несуществующей страницы. Никакого `ON DELETE CASCADE/RESTRICT` нет — вся каскадность вручную закодирована в `ClearUserService`/контроллерах.
- **Рекомендация:** как минимум зафиксировать это как осознанное архитектурное решение в handover-документации; как максимум — добавить миграцию с FK на критичные финансовые/бронировочные связи (`balance_ledger`, `bookings`, `time_slots`) с `ON DELETE RESTRICT`.

#### H-2. M_0002 не идемпотентна и разрушительна при повторном прогоне
- **Где:** `Migrations/Items/M_0002.php`.
- **Три сырых ALTER без защитных проверок** (в отличие от M_0003–M_0012):
  - `ALTER TABLE {bookings} ADD COLUMN active_dup_key … VIRTUAL` → повторный запуск падает с «Duplicate column name»;
  - `ALTER TABLE {bookings} ADD UNIQUE INDEX uq_active_booking …` → «Duplicate key name»;
  - `ALTER TABLE {ledger} ADD UNIQUE INDEX uq_ledger_ref …` → «Duplicate key name».
- **`StaticPagesSeed::install(time())` в конце миграции** вызывает `wipe()`: `DELETE FROM static_page_blocks / static_pages / static_snippets` — **все** строки, включая созданные/отредактированные администратором после установки. Повторный прогон M_0002 (потеря строки трекера, ручной сброс версии, восстановление части БД из бэкапа) даже не дойдёт до сида — упадёт на первом ALTER; но если ALTER-ы кто-то «починит» вручную и перезапустит — контент страниц будет молча заменён каноническим сидом.
- **Усугубляется устройством раннера** (`vendor/…/Kernel/Db/Entity/Migration/Migration.php`): версия в таблице `migration` записывается только **после** полного успеха элемента, транзакций нет (DDL в MySQL и так автокоммитится). Сбой в середине M_0002 (например, на ALTER из-за таймаута) оставляет БД в промежуточном состоянии: часть таблиц создана, версия не записана, повторный прогон падает уже на другом месте.
- **Рекомендация:** обернуть три ALTER в проверки `SHOW COLUMNS`/`SHOW INDEX` (по образцу M_0007), а `StaticPagesSeed::install` вызывать только если таблица страниц пуста.

#### H-3. Отката миграций не существует
- **Где:** `vendor/…/Kernel/Interfaces/Migration/IMigrationItem.php` — интерфейс содержит единственный метод `public static function update(Stdio $stdio): void;`. Ни `down()`, ни `rollback()` нет ни в интерфейсе, ни в раннере `Migration::migrate()` (умеет только `range($dbVersion+1, $fsVersion)` вперёд), ни в одной из M_0001–M_0012.
- **Последствия:** если после релиза в проде обнаружится баг миграции (например, некорректный backfill M_0012), штатного пути назад нет: либо ручной SQL, либо восстановление всей БД из бэкапа с потерей данных, накопленных после релиза. Понижение числа в трекере (`UPDATE migration SET version=…`) схему не меняет.
- **Рекомендация:** зафиксировать в runbook для заказчика обязательный бэкап перед `php garnet migrate` и процедуру восстановления; это единственный реальный механизм отката.

#### H-4. M_0001 не идемпотентна
- **Где:** `Migrations/Items/M_0001.php`.
- Блок `DbTableBuilderFactory::newAlterTable(DbAccount…)->addColumn('type'…)->addColumn('photo'…)->addColumn('photo_cropped'…)->addColumn('crop_info'…)->addIndex('type'…)` выполняется без проверки существования колонок/индекса → повторный запуск на существующей БД падает с «Duplicate column name 'type'».
- `MODIFY COLUMN login VARCHAR(128)` / `MODIFY COLUMN name VARCHAR(64)` сами по себе идемпотентны, но до них дело не дойдёт при повторном прогоне после сбоя внутри миграции (см. H-2 о раннере: если сбой случился ПОСЛЕ create-таблиц, но ДО записи версии, повторный прогон дойдёт до ALTER и упадёт).
- **Сценарий срабатывания:** тот же, что для H-2 — потеря/повреждение строки трекера `migration` (таблица из одной строки `id=1000`, `version VARCHAR(5)`), восстановление БД из частичного бэкапа, ручной сброс версии.
- **Рекомендация:** добавить `SHOW COLUMNS … LIKE 'type'`-guard по образцу M_0005.

### MEDIUM

#### M-1. Документация схемы расходится с фактической структурой
- **Где:** `docs/database.md`, `docs/data-model.md` против фактических `Common/Tables/*` + Fw-родителей.
- Конкретные расхождения:
  - **Префиксы таблиц.** Документы используют `ir_*` и `db_accounts`; фактически префикс задаётся конфигом `WorkDir/Config/db.ini: prefix = "db_ir"` → реальные имена `db_ir_bookings`, `db_ir_accounts` и т.д. Ни один документ этого не отражает.
  - **`expert_profiles.rating DECIMAL(3,2)`** описан в обоих документах — **такой колонки не существует** (`Common/Tables/ExpertProfiles.php`: id, account_id, display_name, bio, specialization, photo, is_approved).
  - **`payments`**: документы описывают `amount INT` + `status ENUM('pending','paid','refunded','failed')`; фактически (`Common/Tables/Payments.php`) — `sum FLOAT`, `commission FLOAT`, `paid_at INT NULL`, `timezone VARCHAR(45)`, и никакого `status` нет.
  - **Суффикс времени**: документы — `created_ut`; фактически везде `created_at`.
  - **`accounts`**: doc — `login VARCHAR(255)`, `type ENUM('user','expert')`; факт — `login VARCHAR(128)` (после M_0001), `type VARCHAR(32)`. Не описаны `photo`, `photo_cropped`, `crop_info`, `consent_pd_at`, `consent_marketing_at`, `consent_marketing_withdrawn_at` (M_0005), `about VARCHAR(1024)`.
  - **`accounts_data`**: doc — колонки `prop`/`data TEXT`; факт — `param`/`value VARCHAR(255)`.
  - **`bookings`**: не описаны `confirmed_at`, `cancelled_at`, generated-колонка `active_dup_key` + `uq_active_booking`.
  - **`time_slots`**: не описаны `booked_count` (M_0012), `cancellation_penalty_percent`, `created_at`.
  - **`balance_ledger`**: не описаны `ref_type`, `note`, `actor_id` (IRabi-расширение), уникальный индекс `uq_idempotent`.
  - **`user_cancellations`/`expert_cancellations`**: не описаны `kind` (M_0007), `booking_id`+`slot_id`+`expert_id`/`user_id` в полном составе.
  - **~28 таблиц вообще отсутствуют в документации**: support_* (4), im_* (4), news_* (3), mail_log*/email_* (5), static_* (3), invite_* (2), entity_history, admin_action_log, cron_log, js_errors, idempotency_keys, email_throttle, sys_log_throttle, payments_log, session/session_data, settings, entity_log, fw_pending_uploads, migration.
- **Последствия:** заказчик, ориентируясь на доки, будет писать запросы к несуществующим колонкам/таблицам; «Индексы для оптимизации» в data-model.md §4 предлагают `CREATE INDEX` на несуществующие имена.
- **Рекомендация:** перегенерировать оба документа из фактической схемы (или удалить database.md, оставив одну актуальную модель).

#### M-2. Деньги как FLOAT в `payments.sum` / `payments.commission`
- **Где:** `Common/Tables/Payments.php` — `sum FLOAT(11)`, `commission FLOAT(11)`.
- Живой финансовый контур приложения через эту таблицу **не проходит** (единственные записи создаёт `Common/Services/DevSeedService.php`; реальные деньги идут через `balance_ledger.amount INT` + `account_balance.balance INT`). Тем не менее таблица создаётся в прод-схеме (M_0002), описана в доках как «Платежи» с иным устройством, и при будущем подключении платёжного шлюза разработчик заказчика с высокой вероятностью начнёт писать именно в неё — с классическими ошибками округления двоичного FLOAT (0.1+0.2≠0.3, потеря копеек на комиссиях).
- **Рекомендация:** либо удалить/переименовать вестигиальные `payments`/`payments_log`, либо мигрировать колонки на `INT` (минимальные единицы) или `DECIMAL(12,2)`, и синхронизировать доки.

#### M-3. Осиротевшие данные: политика не формализована, есть реальные дыры
- **Блокировка аккаунта** (флаг `IS_DISABLED` в EAV `accounts_data`) — данные сознательно сохраняются, представление маскируется (`Common/Services/AccountDisplay.php`). Осиротения нет, но: активные брони/слоты заблокированного эксперта никем на уровне БД не отменяются — это зона ответственности кода.
- **Жёсткое удаление** существует только в `Common/Services/ClearUserService.php`, вызываемом CLI-командой `clear-user`, **гейтированной test-mode** — т.е. в проде штатного пути стирания аккаунта нет (важно для 152-ФЗ/GDPR-запросов «удалите мои данные»; сам сервис написан аккуратно: каскадный проход + generic-снос по колонкам-владельцам через information_schema).
- **Конкретные дыры:**
  - `ExpertSlotsService::deleteSlot()` (`Foreground/Controllers/ExpertPanel/ExpertSlotsService.php:576-608`): проверка «нет активных броней» и `deleteById` — две отдельные операции без блокировки (TOCTOU): бронь, созданная между SELECT и DELETE, останется указывать на несуществующий слот. Без FK (H-1) СУБД это пропустит.
  - Исторические брони (`completed`/`cancelled`) при удалении слота сохраняются с висящим `bookable_id` — видимо by design, но нигде не задокументировано.
  - `comments.entity_id` (тип `expert` = account_id) — при удалении/блокировке эксперта комментарии остаются; чистятся только generic-проходом ClearUserService по `author_id`, но не по `entity_id` (колонка `entity_id` не входит в `OWNER_COLUMNS`) → после `clear-user` эксперта остаются чужие комментарии «о» нём с висящей ссылкой.
  - `email_queue`/`mail_log` чистятся по `recipient_email` и `account_id`, но `mail_log.body_html LONGTEXT` для писем, где адресат был в CC через `mail_log_recipients`, остаётся (частично закрыто проходом по `account_id`).
- **Рекомендация:** описать retention/erasure-политику в handover-доке; добавить `entity_id` (для `comments` с `entity_type='expert'`) в чистку; закрыть TOCTOU в deleteSlot условным `DELETE … WHERE status='free'` + повторной проверкой affected rows.

#### M-4. `accounts.login` VARCHAR(128) для email + непин sql_mode
- **Где:** `M_0001` (`MODIFY COLUMN login VARCHAR(128)`), исходно `DbAccount::init()` — VARCHAR(32).
- RFC 5321 допускает адреса до 254 символов. 128 покрывает практически все реальные адреса, но формально возможен адрес длиннее.
- Критичнее общий момент: **приложение нигде не устанавливает `sql_mode`** (греп по фреймворку и конфигам пуст). На MySQL 5.7+/8.0 strict-режим включён по умолчанию (вставка длиннее поля = ошибка), но если заказчик развернёт БД с ослабленным `sql_mode` (частая практика на shared-хостингах), все VARCHAR-переполнения по всей схеме начнут **молча обрезаться** — включая `login` (обрезанный email = недоставка писем аутентификации при UNIQUE-коллизии «тихого» дубля не будет, но адрес станет невалидным).
- **Рекомендация:** пиннить `sql_mode` (STRICT_TRANS_TABLES) при установке соединения; при случае расширить login до 255.

#### M-5. `accounts_data.account_id` — VARCHAR(32) для числового id
- **Где:** `vendor/…/Kernel/Db/Entity/Account/DbAccountData.php` — `account_id VARCHAR(32)`, при том что `accounts.id` — `INT(11) AUTO_INCREMENT`.
- **Последствия:** соединения/фильтры `accounts_data.account_id = accounts.id` идут через неявное приведение типов; при сравнении число-к-строке MySQL приводит **строку к числу построчно**, что в общем случае ломает использование индекса и создаёт риск сюрпризов ('1abc' = 1). Работает, но это мина под производительность EAV-выборок на росте данных.
- **Рекомендация:** фреймворочная миграция `MODIFY COLUMN account_id INT(11)` (значения уже числовые).

### LOW

#### L-1. Дублирующиеся уникальные индексы на `balance_ledger`
- `FwBalanceLedger::init()` уже создаёт `uq_idempotent (account_id, entry_type, ref_type, ref_id)`; M_0002 дополнительно добавляет `uq_ledger_ref (account_id, ref_type, ref_id, entry_type)` — тот же набор колонок в другом порядке. Два UNIQUE-индекса с одинаковой семантикой: лишнее место, лишняя работа на каждой вставке. M_0010 на свежей установке корректно скипается (индекс уже есть от init).
- Также: сценарий M_0010 «нашли дубликаты → скипаем создание индекса, но версия всё равно фиксируется» означает, что на легаси-БД с дубликатами миграция «пройдёт», а идемпотентного индекса не будет — и никто об этом не вспомнит, кроме строки в логе миграции. Стоит добавить постоянный health-check.

#### L-2. Латентные баги билдера таблиц (фреймворк)
- `TableBuilderMySQL::DEFAULT_TABLE_ENGINE = 'CREATE'` — если в `db.ini` отсутствует `defaultTableEngine`, сгенерируется `ENGINE = CREATE` → синтаксическая ошибка на каждом CREATE TABLE. Все три конфига (`Config`, `ConfigExample`, `TestConfig`) сейчас содержат `InnoDB`, поэтому не стреляет, но свежий конфиг заказчика без этой строки положит установку.
- В ветке ALTER: `$sql .= " COLLATE={$this->engine}"` — collate подставляется из **engine** (копипаст-баг). Не срабатывает, потому что ни один вызов `alter()` в кодовой базе не передаёт collate/engine.
- Комментарий в `StaticPagesSeed::install()` утверждает, что static-pages таблицы «MyISAM, picked for read-throughput» — фактически все таблицы создаются с `defaultTableEngine = InnoDB`. Комментарий вводит в заблуждение относительно транзакционных гарантий.

#### L-3. Нет UNIQUE на `time_slots.uid`
- `uid VARCHAR(16)` заполняется `bin2hex(random_bytes(8))` (64 бита энтропии) и используется в `SlotsController` для сверки актуальности слота. Коллизия крайне маловероятна, но уникальность нигде не закреплена — при ручной вставке/копировании строк дубль пройдёт незамеченным.

#### L-4. Трекер версий — одна строка `version VARCHAR(5)`
- `MigrationTable`: версия схемы хранится строкой (VARCHAR(5)) в единственной строке `id=1000`. Нет журнала применённых миграций (кто/когда/какая), только текущее число — при расследовании инцидентов невозможно узнать историю. VARCHAR(5) хватит до версии 99999 — практически не ограничение, но тип странный для числа.

#### L-5. `ExpertProfiles`, `Payments`, `AdminActionLog` — колонки без явного NOT NULL/default
- В ряде `init()` (`ExpertProfiles`: все колонки кроме id; `Payments.sum/commission`; `AdminActionLog.actor_id` и др.) не указаны `null:`/`default:` — фактическое поведение зависит от дефолтов билдера и sql_mode сервера. Не баг сегодня, но недетерминизм схемы между окружениями.

---

## Проверено — без находок

1. **Даты/время.** Все временные поля во всех 40+ таблицах — `INT(11)` unix timestamp (`created_at`, `updated_at`, `start_at`, `end_at`, `paid_at`, `reg_time`, `consent_*_at`, `last_sent_at`, `window_start`, …). Ни одного `DATETIME`/`TIMESTAMP` — риска путаницы часовых поясов между представлениями нет. Часовой пояс пользователя хранится отдельно (`accounts.time_zone`, `payments.timezone`).
2. **Деньги в живом контуре.** `account_balance.balance`, `balance_ledger.amount`, `time_slots.cost` — `INT` (целые единицы). Пересчёт баланса — атомарный `INSERT … SELECT SUM(...) ON DUPLICATE KEY UPDATE` (`FwAccountBalance::recalculate`), защищённый UNIQUE на `account_id`; запись в леджер идемпотентна через UNIQUE + перехват duplicate-key (`FwBalanceLedger::addEntry`). (FLOAT — только в вестигиальной `payments`, см. M-2.)
3. **Уникальные ограничения на уровне БД** (не только PHP): `accounts.login` UNIQUE (email-логин защищён от гонок регистрации); `accounts_data (account_id, param)` UNIQUE; `invite_tokens.token` UNIQUE; `static_pages.slug`, `static_snippets.slug` UNIQUE; `im_conversations (participant_a, participant_b)` UNIQUE (+нормализация min/max в коде); `news_reads`/`news_archived (account_id, event_id)` UNIQUE; `email_throttle (account_id, category)` UNIQUE; `sys_log_throttle.ip` UNIQUE; `idempotency_keys (account_id, idem_key, route_path)` UNIQUE; `js_errors.hash` UNIQUE; `session.name` UNIQUE.
4. **Анти-дубль брони** — generated-колонка `bookings.active_dup_key` (VIRTUAL, NULL вне pending/confirmed) + `uq_active_booking`: двойное активное бронирование одной пары (user, slot) невозможно на уровне хранилища. Ёмкость слота — атомарный `UPDATE … WHERE booked_count < max_users` (`TimeSlots::reserveSeat`), backfill в M_0012 консистентен с реальным COUNT активных броней.
5. **Идемпотентность M_0003–M_0012** — все десять миграций защищены: `SHOW COLUMNS`/`SHOW INDEX`/`SHOW TABLES`-guard'ы (M_0003, M_0005, M_0007, M_0008, M_0009, M_0010, M_0011, M_0012) либо идемпотентные по построению UPDATE/upsert по slug (M_0004, M_0006). M_0010 дополнительно детектирует существующие дубликаты перед созданием UNIQUE и не блокирует пайплайн.
6. **Сид-данные — без реальных ПД.** `Migrations/SeedData/*.md` — только юридические/маркетинговые тексты с плейсхолдерами (`{title}`, `{support-email}`); греп email-паттернов — ноль совпадений. Dev-сиды (`DevSeedService`, вне миграций) используют исключительно синтетические `*@dev.test` и вымышленные имена; команда сидинга гейтирована dev-окружением (`Env::isDevDir()` + подтверждение), dev-login-контроллер имеет отдельный прод-guard.
7. **Кодировка** — единый `utf8mb4_unicode_ci` (эмодзи/полный юникод в именах и текстах не обрежутся по кодировке); движок — InnoDB из конфига всех окружений.
8. **Squash-история** (комментарий в AppMigration: M_0003–M_0019 схлопнуты в M_0002, легаси-БД v19 → трекер v2) — согласована: повторяемые на легаси-БД M_0003+ идемпотентны, разрушительные ALTER'ы сосредоточены в неповторяемой на легаси M_0002.
9. **Длины VARCHAR прочих полей** — `original_name`/`stored_name` 255, `mime_type` 100, `ip` 45 (вмещает IPv6), `user_agent` 255, `url`/`message` в js_errors 1024 — адекватны данным.

---

## Приоритетные действия перед передачей

1. (H-2/H-4) Добавить guard'ы в M_0001/M_0002 и условие «таблица пуста» перед `StaticPagesSeed::install` — дешёвая правка, закрывает сценарий разрушительного повторного прогона.
2. (H-3) В runbook заказчика: обязательный дамп БД перед `migrate`; восстановление из дампа = единственный откат.
3. (M-1) Перегенерировать `docs/database.md`/`docs/data-model.md` из фактической схемы (убрать `rating`, `created_ut`, неверные префиксы, дописать 28 таблиц).
4. (H-1/M-3) Зафиксировать в handover-документации: FK отсутствуют by design, целостность — на коде; описать политику удаления/блокировки аккаунтов и судьбу исторических записей.
5. (M-2) Решить судьбу `payments`/`payments_log` (FLOAT-деньги): удалить или привести к INT/DECIMAL до передачи.
