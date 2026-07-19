# Модель данных IRabi

> **Единственный актуальный источник истины по схеме БД.** Файл
> [`database.md`](database.md) оставлен только как короткая заглушка со
> ссылкой сюда; всё содержательное описание — ниже.

Эта страница сгенерирована на основании **живой базы данных** (команды
`SHOW TABLES` и `SHOW CREATE TABLE` через `php garnet sql`), а не по
памяти или по `init()`-билдерам классов таблиц — последние могут
расходиться с реальностью из-за framework-дефолтов и последующих
`ALTER`-миграций. База, против которой снималось состояние:
`WorkDir/Config/db.ini` → `dbname = "app_db"`, `prefix = "db_ir"`.

Всего в схеме **46 таблиц** (по состоянию на миграцию **M_0014**,
трекер `db_ir_migration` на версии `14`).

---

## 1. Соглашения схемы

Эти правила единообразно выполняются во **всех** 46 таблицах — на них
можно опираться без проверки в каждой колонке.

- **Префикс таблиц — `db_ir_`** для **всех** таблиц без исключения,
  включая framework-базовые. Значение берётся из
  `WorkDir/Config/db.ini: prefix = "db_ir"` и применяется фреймворком к
  каждому `CREATE TABLE`. *(Замечание: более ранние версии документации
  использовали выдуманные префиксы `ir_` и `db_accounts` — это неверно.)*
- **Все временные поля — `INT(11)` unix-timestamp** (`created_at`,
  `updated_at`, `start_at`, `end_at`, `paid_at`, `reg_time`,
  `consent_*_at`, `last_sent_at`, `window_start`, …). Ни одного
  `DATETIME`/`TIMESTAMP` в схеме нет — риска путаницы часовых поясов
  между представлениями нет. Часовой пояс пользователя хранится отдельно
  (`accounts.time_zone`, `payments.timezone`).
- **Деньги в живом контуре — `INT`** (целые единицы):
  `account_balance.balance`, `balance_ledger.amount`, `time_slots.cost`.
  Пересчёт баланса — атомарный `INSERT … SELECT SUM(...) ON DUPLICATE
  KEY UPDATE`, запись в леджер идемпотентна через UNIQUE-индекс.
  Исключение — вестигиальная таблица `payments`, где сумма хранится как
  `FLOAT` (через неё реальный платёж не проходит, см. §4.2).
- **Кодировка/движок:** единый `utf8mb4_unicode_ci`, `ENGINE=InnoDB`
  (из `db.ini: defaultTableEngine` / `defaultCollate`).
- **Внешних ключей (FOREIGN KEY) в схеме НЕТ** — намеренно. Билдер
  таблиц фреймворка (`TableBuilderMySQL`) не умеет генерировать FK, ни
  одна миграция не добавляет их сырым SQL. Ссылочная целостность
  держится исключительно на коде приложения; все «FK» в схеме существуют
  только как обычные `KEY`-индексы. Каскадность при удалении аккаунта
  закодирована вручную в `Common/Services/ClearUserService.php` (CLI
  `clear-user`, гейтирована test-mode). Учитывайте это при любых прямых
  правках в БД — СУБД молча примет осиротевшую строку.
- **Отката миграций (down/rollback) не существует** — интерфейс
  `IMigrationItem` содержит только `update()`. Единственный механизм
  отката — восстановление БД из дампа (обязательно перед
  `php garnet migration`).

---

## 2. Классификация таблиц: framework vs app

Чтобы будущий разработчик знал, **где искать определение** каждой
таблицы, они помечены ниже как **framework** или **app**.

| Тип | Где определяется | Где создаётся |
|-----|------------------|---------------|
| **framework** | Классы в `vendor/phpcraftdream/garnet-framework/Kernel/Db/Entity/` (только читать) | `M_0001` (или самим раннером миграций для `migration`) |
| **app** | Классы в `Common/Tables/*.php` | В основном `M_0002`; часть — более поздними `M_0008/M_0011/M_0014` |

**Framework-базовые (8 таблиц):** `accounts`, `accounts_data`,
`entity_log`, `migration`, `pending_uploads`, `session`,
`session_data`, `settings`.

Все остальные **38 таблиц — app-специфичные**.

План миграций и соответствие «миграция → что делает» описано в
`Migrations/AppMigration.php`. Текущая версия схемы — `14`.

---

## 3. ER-диаграмма (концептуальная)

Только ключевые бизнес-связи. Стрелки — логические (физических FK нет,
см. §1).

```
        ┌──────────┐
        │ accounts │◄──────────────────────────────────────┐
        └────┬─────┘                                        │
   1:1       │       1:N                                    │ 1:1
   ┌─────────┴──────────┐                                   │
   ▼                    ▼                                   ▼
┌──────────────┐  ┌──────────────┐                  ┌────────────────┐
│expert_profile│  │  time_slots  │                  │ account_balance│
└──────────────┘  └──────┬───────┘                  └────────────────┘
                         │ 1:N
                         ▼
                  ┌──────────────┐   1:1     ┌──────────────────┐
                  │   bookings   │◄─────────►│ user_cancellations│
                  └──────┬───────┘           └──────────────────┘
                         │                          ▲
            ┌────────────┼────────────┐             │ 1:1
            ▼            ▼            ▼     ┌────────────────────┐
   ┌──────────────┐ ┌───────────┐ ┌──────────────┐
   │ balance_ledger│ │ comments  │ │expert_cancel.│
   └──────────────┘ └───────────┘ └──────────────┘

   accounts 1:N → im_conversations/support_tickets/news_events/mail_log/…
```

Связи по доменам (полные списки колонок-«внешних ключей» см. в §4):

- `accounts.id` ← `accounts_data.account_id`, `expert_profiles.account_id`,
  `account_balance.account_id`, `balance_ledger.account_id`,
  `bookings.user_id`, `time_slots.expert_id`, `comments.author_id` /
  `comments.entity_id` (когда `entity_type='expert'`),
  `support_tickets.account_id`, `im_conversations.participant_a/_b`,
  `news_events.audience_id` / `news_reads.account_id`, `consents.account_id`,
  `mail_log.account_id`, `invite_registrations.account_id`, и т.д.
- `time_slots.id` ← `bookings.bookable_id` (при `bookable_type='time_slot'`),
  `user_cancellations.slot_id`, `expert_cancellations.slot_id`.
- `bookings.id` ← `user_cancellations.booking_id`,
  `expert_cancellations.booking_id`.
- `support_tickets.id` ← `support_messages.ticket_id`,
  `support_assignment_log.ticket_id`.
- `im_conversations.id` ← `im_messages.conversation_id`,
  `im_read_status.conversation_id`.
- `static_pages.id` ← `static_page_blocks.page_id`.
- `mail_log.id` ← `mail_log_recipients.mail_log_id`.
- `invite_tokens.id` ← `invite_registrations.token_id`.
- `im_messages.id` / `support_messages.id` ← `im_attachments.message_id` /
  `support_attachments.message_id`.

---

## 4. Таблицы базы данных

Колонка **Idx** в таблицах ниже показывает флаг ключа из
`information_schema`: `PK` — первичный, `UNI` — уникальный, `MUL` —
часть обычного индекса. Полные составные индексы перечислены отдельно
после колонок.

### 4.1 Аккаунты, профили и баланс

#### `db_ir_accounts` — Аккаунты *(framework, M_0001; класс `DbAccount`)*

Идентичности пользователей и экспертов; email-аутентификация по токенам
(паролей в схеме нет — `token16`/`token32`). EAV-флаги ролей
(`IS_ADMIN`, `IS_OWNER`, `IS_MODERATOR`, `IS_APPROVED`, `IS_DISABLED`)
живут в `accounts_data`, а не здесь.

| Колонка | Тип | NULL | Default | Назначение |
|---------|-----|------|---------|-----------|
| `id` | int(11) | NO | — | PK |
| `login` | varchar(128) | NO | — | Логин; для email-auth это email. UNIQUE |
| `login_type` | varchar(32) | NO | — | Тип логина (`email`) |
| `name` | varchar(64) | YES | NULL | Отображаемое имя |
| `time_zone` | varchar(32) | YES | NULL | Часовой пояс (IANA) |
| `token16` | varchar(16) | YES | NULL | Короткий auth-токен |
| `token32` | varchar(32) | YES | NULL | Длинный session-токен |
| `reg_time` | int(11) | YES | NULL | Unix-ts регистрации |
| `last_auth_time` | int(11) | YES | NULL | Unix-ts последней аутентификации |
| `last_online_time` | int(11) | YES | NULL | Unix-ts последнего онлайна |
| `about` | varchar(1024) | YES | NULL | Краткое «о себе» |
| `type` | varchar(32) | YES | NULL | Тип аккаунта (`user`, `expert`) |
| `photo` | varchar(128) | YES | NULL | Путь к фото профиля |
| `photo_cropped` | varchar(128) | YES | NULL | Путь к кропнутому фото |
| `crop_info` | varchar(128) | YES | NULL | JSON координат кропа |
| `consent_pd_at` | int(10) unsigned | YES | NULL | Unix-ts согласия на обработку ПД (M_0005) |
| `consent_marketing_at` | int(10) unsigned | YES | NULL | Unix-ts согласия на маркетинг (M_0005) |
| `consent_marketing_withdrawn_at` | int(10) unsigned | YES | NULL | Unix-ts отзыва маркетингового согласия (M_0005) |

**Индексы:** PK(`id`); UNIQUE `login`(`login`); `token16`; `token32`; `type`.

> Колонки `about`, `photo`, `photo_cropped`, `crop_info`, `consent_*_at`
> и индекс `type` добавляются в самом `M_0001` поверх базового
> `DbAccount::init()`. **Колонки `rating` в этой таблице нет** —
> рейтинга нет ни в одном профиле (ранние доки описывали выдуманный
> `expert_profiles.rating DECIMAL(3,2)` — это ошибка).

#### `db_ir_accounts_data` — EAV-данные аккаунта *(framework, M_0001; класс `DbAccountData`)*

Флаги и произвольные параметры аккаунта в формате ключ-значение.

| Колонка | Тип | NULL | Default | Назначение |
|---------|-----|------|---------|-----------|
| `id` | int(11) | NO | — | PK |
| `account_id` | varchar(32) | YES | NULL | ID аккаунта (**строка**, не INT — см. замечание) |
| `param` | varchar(32) | YES | NULL | Имя параметра (`IS_ADMIN`, `IS_APPROVED`, …) |
| `value` | varchar(255) | YES | NULL | Значение |

**Индексы:** PK(`id`); UNIQUE `login`(`account_id`, `param`) *(имя
индекса исторически `login` — артефакт копипасты, реально уникальна пара
account+param)*.

> `account_id` здесь — `VARCHAR(32)`, при том что `accounts.id` — `INT`.
> Соединения идут через неявное приведение типов (минорная мина под
> производительность EAV-выборок на росте данных). Ранние доки
> называли колонки `prop`/`data TEXT` — фактически это
> `param`/`value VARCHAR(255)`.

#### `db_ir_account_balance` — Баланс аккаунта *(app, M_0002; `Common\Tables\AccountBalance`)*

Денормализованный кэш текущего баланса; пересчитывается атомарно из
`balance_ledger` (UNIQUE на `account_id` обеспечивает upsert).

| Колонка | Тип | NULL | Default | Назначение |
|---------|-----|------|---------|-----------|
| `id` | int(11) | NO | — | PK |
| `account_id` | int(11) | NO | — | ID аккаунта. UNIQUE |
| `balance` | int(11) | NO | 0 | Текущий баланс (целые единицы) |
| `updated_at` | int(11) | NO | 0 | Unix-ts последнего пересчёта |

**Индексы:** PK(`id`); UNIQUE `account_id`(`account_id`).

#### `db_ir_expert_profiles` — Профили экспертов *(app, M_0002; `Common\Tables\ExpertProfiles`)*

| Колонка | Тип | NULL | Default | Назначение |
|---------|-----|------|---------|-----------|
| `id` | int(11) | NO | — | PK |
| `account_id` | int(11) | YES | NULL | ID аккаунта эксперта |
| `display_name` | varchar(255) | YES | NULL | Отображаемое имя |
| `bio` | text | YES | NULL | Описание/био |
| `specialization` | varchar(255) | YES | NULL | Специализация |
| `photo` | varchar(255) | YES | NULL | Путь к фото |
| `is_approved` | tinyint(1) | YES | NULL | Одобрен ли как эксперт |

**Индексы:** PK(`id`); `account_id`; `is_approved`.

### 4.2 Финансы и леджер

#### `db_ir_balance_ledger` — Журнал транзакций *(app, M_0002; `Common\Tables\BalanceLedger`)*

Иммутабельный журнал всех финансовых операций. Идемпотентность вставок
под ретаями обеспечена двумя UNIQUE-индексами (см. ниже — они
перекрывают один и тот же набор колонок в разном порядке; дубль,
оставленный исторически).

| Колонка | Тип | NULL | Default | Назначение |
|---------|-----|------|---------|-----------|
| `id` | int(11) | NO | — | PK |
| `account_id` | int(11) | NO | — | ID аккаунта |
| `is_credit` | tinyint(1) | NO | 0 | Кредит (1) или дебет (0) |
| `amount` | int(11) | NO | 0 | Сумма (целые единицы) |
| `entry_type` | enum('top_up','booking_invoice','booking_payment','booking_refund','manual') | YES | NULL | Тип операции |
| `ref_type` | varchar(50) | YES | NULL | Тип связанной сущности |
| `ref_id` | int(11) | YES | NULL | ID связанной сущности |
| `note` | varchar(255) | YES | NULL | Заметка |
| `created_at` | int(11) | NO | 0 | Unix-ts |
| `actor_id` | int(11) | YES | NULL | Кто инициировал (IRabi-расширение) |

**Индексы:** PK(`id`); UNIQUE `uq_ledger_ref`(`account_id`, `ref_type`,
`ref_id`, `entry_type`); UNIQUE `uq_idempotent`(`account_id`,
`entry_type`, `ref_type`, `ref_id`); `account_id`; `ref`(`ref_type`,
`ref_id`).

#### `db_ir_payments` — Платежи *(app, M_0002; `Common\Tables\Payments`) — вестигиальная*

> **Внимание:** ранние доки описывали здесь `amount INT` +
> `status ENUM('pending','paid','refunded','failed')`. **Фактически**
> колонок `amount` и `status` нет — есть `sum`/`commission` типа `FLOAT`
> и поля `paid_at`/`timezone`. Реальный финансовый контур приложения
> через эту таблицу **не проходит** (живые деньги — в
> `balance_ledger.amount INT`). Единственные записи создаёт
> `DevSeedService`. При подключении платёжного шлюза избегайте хранить
> деньги как `FLOAT` (потеря копеек на комиссиях).

| Колонка | Тип | NULL | Default | Назначение |
|---------|-----|------|---------|-----------|
| `id` | int(11) | NO | — | PK |
| `account_id` | int(11) | YES | NULL | ID плательщика |
| `sum` | float | YES | NULL | Сумма |
| `commission` | float | YES | NULL | Комиссия |
| `created_at` | int(11) | NO | 0 | Unix-ts создания |
| `paid_at` | int(11) | YES | NULL | Unix-ts оплаты |
| `timezone` | varchar(45) | YES | NULL | Часовой пояс контекста платежа |

**Индексы:** PK(`id`); `account_id`.

#### `db_ir_payments_log` — Лог действий по платежам *(app, M_0002)*

| Колонка | Тип | NULL | Default | Назначение |
|---------|-----|------|---------|-----------|
| `id` | int(11) | NO | — | PK |
| `payment_id` | int(11) | YES | NULL | ID платежа |
| `timezone` | varchar(45) | YES | NULL | Часовой пояс |
| `created_at` | int(11) | NO | 0 | Unix-ts |
| `action` | varchar(255) | YES | NULL | Действие |
| `info` | longtext | YES | NULL | Детали (JSON) |

**Индексы:** PK(`id`); `payment_id`.

### 4.3 Слоты и бронирования

#### `db_ir_time_slots` — Слоты времени *(app, M_0002; `Common\Tables\TimeSlots`)*

Свободное время, создаваемое экспертами. Атомарная ёмкость слота —
через `UPDATE … WHERE booked_count < max_users` (`TimeSlots::reserveSeat`),
`booked_count` бэкфиллен в `M_0012`.

| Колонка | Тип | NULL | Default | Назначение |
|---------|-----|------|---------|-----------|
| `id` | int(11) | NO | — | PK |
| `expert_id` | int(11) | YES | NULL | ID аккаунта эксперта |
| `start_at` | int(11) | NO | 0 | Unix-ts начала |
| `end_at` | int(11) | NO | 0 | Unix-ts окончания |
| `duration_min` | int(11) | YES | NULL | Длительность в минутах |
| `cost` | int(11) | YES | NULL | Стоимость (целые единицы) |
| `is_online` | tinyint(1) | YES | NULL | Онлайн (1) или офлайн (0) |
| `location` | varchar(255) | YES | NULL | Место проведения |
| `max_users` | int(11) | YES | NULL | Макс. пользователей |
| `status` | enum('free','booked','completed','cancelled') | YES | NULL | Статус слота |
| `uid` | varchar(16) | NO | '' | 64-бит энтропии; сверка актуальности в `SlotsController` |
| `created_at` | int(11) | NO | 0 | Unix-ts создания |
| `cancellation_penalty_percent` | tinyint(3) | NO | 0 | Процент штрафа за отмену |
| `booked_count` | int(11) | NO | 0 | Атомарный счётчик занятых мест (M_0012) |

**Индексы:** PK(`id`); `expert_id`; `expert_status`(`expert_id`,
`status`, `start_at`); `status_start`(`status`, `start_at`).

#### `db_ir_bookings` — Бронирования *(app, M_0002; `Common\Tables\Bookings`)*

Анти-дубль активного бронирования пары (user, slot) — generated-колонка
`active_dup_key` + UNIQUE `uq_active_booking`: двойное активное
(`pending`/`confirmed`) бронирование невозможно на уровне хранилища.

| Колонка | Тип | NULL | Default | Назначение |
|---------|-----|------|---------|-----------|
| `id` | int(11) | NO | — | PK |
| `user_id` | int(11) | YES | NULL | ID пользователя |
| `bookable_type` | enum('time_slot') | YES | NULL | Тип бронируемого |
| `bookable_id` | int(11) | YES | NULL | ID слота |
| `status` | enum('pending','confirmed','cancelled','completed') | YES | NULL | Статус брони |
| `created_at` | int(11) | NO | 0 | Unix-ts создания |
| `confirmed_at` | int(11) | YES | NULL | Unix-ts подтверждения |
| `cancelled_at` | int(11) | YES | NULL | Unix-ts отмены |
| `active_dup_key` | varchar(64) | — | GENERATED | `VIRTUAL`: `CONCAT(user_id,':',bookable_type,':',bookable_id)` для `status IN ('pending','confirmed')`, иначе `NULL` |

**Индексы:** PK(`id`); UNIQUE `uq_active_booking`(`active_dup_key`);
`user_id`; `user_status`(`user_id`, `status`); `bookable`(`bookable_type`,
`bookable_id`).

#### `db_ir_user_cancellations` — Отмены пользователей *(app, M_0002 + M_0007 `.kind`)*

| Колонка | Тип | NULL | Default | Назначение |
|---------|-----|------|---------|-----------|
| `id` | int(11) | NO | — | PK |
| `user_id` | int(11) | NO | — | ID пользователя |
| `booking_id` | int(11) | NO | — | ID бронирования |
| `slot_id` | int(11) | NO | — | ID слота |
| `expert_id` | int(11) | NO | — | ID эксперта |
| `reason` | text | NO | — | Причина отмены |
| `created_at` | int(11) | NO | 0 | Unix-ts |
| `kind` | varchar(16) | NO | 'cancel' | Тип отмены (`cancel`, `decline`, …) — M_0007 |

**Индексы:** PK(`id`); `user_id`; `expert_id`; `created_at`;
`user_kind`(`user_id`, `kind`).

#### `db_ir_expert_cancellations` — Отмены экспертов *(app, M_0002 + M_0007 `.kind`)*

| Колонка | Тип | NULL | Default | Назначение |
|---------|-----|------|---------|-----------|
| `id` | int(11) | NO | — | PK |
| `expert_id` | int(11) | NO | — | ID эксперта |
| `slot_id` | int(11) | NO | — | ID слота |
| `booking_id` | int(11) | NO | — | ID бронирования |
| `user_id` | int(11) | NO | — | ID пользователя |
| `reason` | text | NO | — | Причина отмены |
| `created_at` | int(11) | NO | 0 | Unix-ts |
| `kind` | varchar(16) | NO | 'cancel' | Тип отмены — M_0007 |

**Индексы:** PK(`id`); `expert_id`; `user_id`; `created_at`;
`expert_kind`(`expert_id`, `kind`).

### 4.4 Комментарии

#### `db_ir_comments` — Комментарии *(app, M_0002; `Common\Tables\Comments`)*

Полиморфные комментарии к сущностям (`entity_type='expert'` →
`entity_id` = account_id эксперта).

| Колонка | Тип | NULL | Default | Назначение |
|---------|-----|------|---------|-----------|
| `id` | int(11) | NO | — | PK |
| `author_id` | int(11) | NO | — | ID автора |
| `entity_type` | varchar(64) | NO | '' | Тип сущности (`expert`, …) |
| `entity_id` | int(11) | NO | — | ID сущности |
| `body` | text | NO | — | Текст комментария |
| `created_at` | int(11) | NO | 0 | Unix-ts |
| `is_hidden` | tinyint(1) | NO | 0 | Скрыт модератором |

**Индексы:** PK(`id`); `entity`(`entity_type`, `entity_id`);
`author_id`; `entity_created`(`entity_type`, `entity_id`, `created_at`);
`is_hidden`.

### 4.5 Поддержка (support)

#### `db_ir_support_tickets` — Тикеты *(app, M_0002)*

| Колонка | Тип | NULL | Default | Назначение |
|---------|-----|------|---------|-----------|
| `id` | int(11) | NO | — | PK |
| `account_id` | int(11) | NO | — | Автор-пользователь |
| `subject` | varchar(255) | NO | — | Тема |
| `status` | enum('open','investigation','in_progress','waiting_user','waiting_support','escalated','on_hold','deferred','low_priority','resolved','rejected') | NO | 'open' | Статус тикета |
| `assignee_id` | int(11) | YES | NULL | Назначенный сотрудник |
| `unread_user` | int(11) | NO | 0 | Счётчик непрочитанного для пользователя |
| `unread_staff` | int(11) | NO | 0 | Счётчик непрочитанного для персонала |
| `context` | text | YES | NULL | Контекст создания |
| `created_at` | int(11) | NO | 0 | Unix-ts |
| `updated_at` | int(11) | NO | 0 | Unix-ts обновления |

**Индексы:** PK(`id`); `account_id`; `assignee_id`; `status`;
`updated_at`; `status_assignee`(`status`, `assignee_id`).

#### `db_ir_support_messages` — Сообщения тикета *(app, M_0002)*

| Колонка | Тип | NULL | Default | Назначение |
|---------|-----|------|---------|-----------|
| `id` | int(11) | NO | — | PK |
| `ticket_id` | int(11) | NO | — | ID тикета |
| `author_id` | int(11) | NO | — | ID автора |
| `body` | text | NO | — | Текст |
| `is_internal` | tinyint(1) | NO | 0 | Внутренняя заметка персонала |
| `msg_type` | enum('user','staff','system') | NO | 'user' | Источник сообщения |
| `created_at` | int(11) | NO | 0 | Unix-ts |

**Индексы:** PK(`id`); `ticket_id`; `ticket_internal`(`ticket_id`,
`is_internal`).

#### `db_ir_support_attachments` — Вложения сообщений *(app, M_0002)*

| Колонка | Тип | NULL | Default | Назначение |
|---------|-----|------|---------|-----------|
| `id` | int(11) | NO | — | PK |
| `message_id` | int(11) | NO | — | ID сообщения |
| `original_name` | varchar(255) | NO | — | Исходное имя файла |
| `stored_name` | varchar(255) | NO | — | Имя на диске |
| `mime_type` | varchar(100) | NO | — | MIME |
| `size` | int(11) | NO | 0 | Размер в байтах |
| `created_at` | int(11) | NO | 0 | Unix-ts |

**Индексы:** PK(`id`); `message_id`.

#### `db_ir_support_assignment_log` — История назначений *(app, M_0002)*

| Колонка | Тип | NULL | Default | Назначение |
|---------|-----|------|---------|-----------|
| `id` | int(11) | NO | — | PK |
| `ticket_id` | int(11) | NO | — | ID тикета |
| `actor_id` | int(11) | NO | — | Кто переназначил |
| `from_id` | int(11) | YES | NULL | Предыдущий исполнитель |
| `to_id` | int(11) | YES | NULL | Новый исполнитель |
| `created_at` | int(11) | NO | 0 | Unix-ts |

**Индексы:** PK(`id`); `ticket_id`; `to_id`.

### 4.6 Личные сообщения (IM)

#### `db_ir_im_conversations` — Диалоги *(app, M_0002)*

Пара участников нормализуется в коде (min/max) под UNIQUE `pair`.

| Колонка | Тип | NULL | Default | Назначение |
|---------|-----|------|---------|-----------|
| `id` | int(11) | NO | — | PK |
| `participant_a` | int(11) | NO | — | ID участника A |
| `participant_b` | int(11) | NO | — | ID участника B |
| `last_message_at` | int(11) | NO | 0 | Unix-ts последнего сообщения |
| `created_at` | int(11) | NO | 0 | Unix-ts создания |

**Индексы:** PK(`id`); UNIQUE `pair`(`participant_a`, `participant_b`);
`participant_a`; `participant_b`; `last_message_at`.

#### `db_ir_im_messages` — Сообщения *(app, M_0002)*

| Колонка | Тип | NULL | Default | Назначение |
|---------|-----|------|---------|-----------|
| `id` | int(11) | NO | — | PK |
| `conversation_id` | int(11) | NO | — | ID диалога |
| `sender_id` | int(11) | NO | — | ID отправителя |
| `body` | text | NO | — | Текст |
| `created_at` | int(11) | NO | 0 | Unix-ts |

**Индексы:** PK(`id`); `conversation_id`; `conv_created`(`conversation_id`,
`created_at`).

#### `db_ir_im_attachments` — Вложения *(app, M_0002)*

| Колонка | Тип | NULL | Default | Назначение |
|---------|-----|------|---------|-----------|
| `id` | int(11) | NO | — | PK |
| `message_id` | int(11) | NO | — | ID сообщения |
| `original_name` | varchar(255) | NO | — | Исходное имя |
| `stored_name` | varchar(255) | NO | — | Имя на диске |
| `mime_type` | varchar(100) | NO | — | MIME |
| `size` | int(11) | NO | 0 | Размер в байтах |
| `created_at` | int(11) | NO | 0 | Unix-ts |

**Индексы:** PK(`id`); `message_id`.

#### `db_ir_im_read_status` — Статус прочтения *(app, M_0002)*

| Колонка | Тип | NULL | Default | Назначение |
|---------|-----|------|---------|-----------|
| `id` | int(11) | NO | — | PK |
| `conversation_id` | int(11) | NO | — | ID диалога |
| `account_id` | int(11) | NO | — | ID участника |
| `last_read_message_id` | int(11) | NO | 0 | ID последнего прочитанного сообщения |
| `updated_at` | int(11) | NO | 0 | Unix-ts |

**Индексы:** PK(`id`); UNIQUE `conv_account`(`conversation_id`,
`account_id`); `account_id`.

### 4.7 Лента новостей (news)

#### `db_ir_news_events` — События ленты *(app, M_0002)*

| Колонка | Тип | NULL | Default | Назначение |
|---------|-----|------|---------|-----------|
| `id` | int(11) | NO | — | PK |
| `event_type` | varchar(50) | YES | NULL | Тип события |
| `audience_type` | enum('broadcast','personal') | YES | NULL | Рассылка всем или лично |
| `audience_id` | int(11) | YES | NULL | ID адресата (для `personal`) |
| `actor_id` | int(11) | NO | — | Инициатор |
| `target_key` | varchar(64) | YES | NULL | Ключ цели |
| `payload` | text | NO | — | Полезная нагрузка (JSON) |
| `created_at` | int(11) | NO | 0 | Unix-ts |

**Индексы:** PK(`id`); `audience`(`audience_type`, `audience_id`);
`actor_id`; `event_type`; `target_key`; `created_at`.

#### `db_ir_news_reads` — Отметки «прочитано» *(app, M_0002)*

| Колонка | Тип | NULL | Default | Назначение |
|---------|-----|------|---------|-----------|
| `id` | int(11) | NO | — | PK |
| `account_id` | int(11) | NO | — | ID аккаунта |
| `event_id` | int(11) | NO | — | ID события |
| `read_at` | int(11) | NO | 0 | Unix-ts прочтения |

**Индексы:** PK(`id`); UNIQUE `account_event`(`account_id`, `event_id`);
`event_id`.

#### `db_ir_news_archived` — Архив (скрытые) *(app, M_0002)*

| Колонка | Тип | NULL | Default | Назначение |
|---------|-----|------|---------|-----------|
| `id` | int(11) | NO | — | PK |
| `account_id` | int(11) | NO | — | ID аккаунта |
| `event_id` | int(11) | NO | — | ID события |
| `archived_at` | int(11) | NO | 0 | Unix-ts архивации |

**Индексы:** PK(`id`); UNIQUE `account_event`(`account_id`, `event_id`);
`event_id`.

### 4.8 Почта и уведомления

#### `db_ir_email_queue` — Очередь отправки *(app, M_0002)*

Обрабатывается кроном (`php garnet cron`); retry-логика по `attempts` /
`max_attempts` / `next_attempt_at`.

| Колонка | Тип | NULL | Default | Назначение |
|---------|-----|------|---------|-----------|
| `id` | int(11) | NO | — | PK |
| `account_id` | int(11) | YES | NULL | ID аккаунта-адресата |
| `recipient_email` | varchar(255) | YES | NULL | Email адресата |
| `subject` | varchar(255) | YES | NULL | Тема |
| `body_html` | longtext | YES | NULL | HTML-тело |
| `status` | enum('queued','sending','sent','error') | YES | NULL | Статус |
| `attempts` | int(11) | NO | 0 | Число попыток |
| `max_attempts` | int(11) | NO | 3 | Лимит попыток |
| `next_attempt_at` | int(11) | YES | NULL | Unix-ts следующей попытки |
| `sent_at` | int(11) | YES | NULL | Unix-ts отправки |
| `created_at` | int(11) | NO | 0 | Unix-ts |

**Индексы:** PK(`id`); `status`; `account_id`; `next_attempt_at`;
`created_at`.

#### `db_ir_email_attempts` — Попытки отправки *(app, M_0002)*

| Колонка | Тип | NULL | Default | Назначение |
|---------|-----|------|---------|-----------|
| `id` | int(11) | NO | — | PK |
| `queue_id` | int(11) | YES | NULL | ID записи очереди |
| `attempt_number` | int(11) | YES | NULL | Номер попытки |
| `status` | enum('success','error') | YES | NULL | Результат |
| `error_message` | text | YES | NULL | Текст ошибки |
| `created_at` | int(11) | NO | 0 | Unix-ts |

**Индексы:** PK(`id`); `queue_id`; `created_at`.

#### `db_ir_email_throttle` — Throttling уведомлений *(app, M_0008)*

Пер-аккаунт, пер-категория частота email-уведомлений.

| Колонка | Тип | NULL | Default | Назначение |
|---------|-----|------|---------|-----------|
| `id` | int(11) | NO | — | PK |
| `account_id` | int(11) | NO | — | ID аккаунта |
| `category` | varchar(32) | NO | — | Категория уведомления |
| `last_sent_at` | int(11) | NO | 0 | Unix-ts последней отправки |

**Индексы:** PK(`id`); UNIQUE `account_category`(`account_id`,
`category`); `account_id`.

#### `db_ir_mail_log` — Архив отправленных писем *(app, M_0002)*

| Колонка | Тип | NULL | Default | Назначение |
|---------|-----|------|---------|-----------|
| `id` | int(11) | NO | — | PK |
| `account_id` | int(11) | YES | NULL | ID аккаунта-адресата |
| `recipient_email` | varchar(255) | YES | NULL | Email |
| `mail_type` | varchar(64) | YES | NULL | Тип письма |
| `subject` | varchar(255) | YES | NULL | Тема |
| `body_html` | longtext | YES | NULL | HTML-тело |
| `meta` | text | YES | NULL | Метаданные |
| `status` | varchar(32) | YES | NULL | Статус |
| `error_log` | text | YES | NULL | Лог ошибок |
| `created_at` | int(11) | NO | 0 | Unix-ts |

**Индексы:** PK(`id`); `account_id`; `mail_type`; `status`; `created_at`.

#### `db_ir_mail_log_recipients` — Получатели письма *(app, M_0002)*

Поддержка CC/BCC — много получателей на одно письмо.

| Колонка | Тип | NULL | Default | Назначение |
|---------|-----|------|---------|-----------|
| `id` | int(11) | NO | — | PK |
| `mail_log_id` | int(11) | NO | — | ID письма |
| `account_id` | int(11) | YES | NULL | ID аккаунта-получателя |
| `recipient_email` | varchar(255) | YES | NULL | Email получателя |

**Индексы:** PK(`id`); `mail_log_id`; `account_id`.

### 4.9 Статические страницы (CMS)

#### `db_ir_static_pages` — Страницы *(app, M_0002 + M_0009 SEO)*

| Колонка | Тип | NULL | Default | Назначение |
|---------|-----|------|---------|-----------|
| `id` | int(11) | NO | — | PK |
| `slug` | varchar(128) | NO | — | URL-slug. UNIQUE |
| `title` | varchar(255) | NO | '' | Заголовок |
| `is_published` | tinyint(1) | NO | 0 | Опубликована |
| `visibility` | varchar(16) | NO | 'all' | Видимость |
| `meta_description` | varchar(500) | NO | '' | Meta description |
| `seo_title` | varchar(255) | NO | '' | SEO-заголовок (M_0009) |
| `og_image` | varchar(500) | NO | '' | OpenGraph image (M_0009) |
| `max_width` | varchar(16) | NO | '3xl' | Макс. ширина контента |
| `sort_order` | int(11) | NO | 0 | Порядок |
| `updated_at` | int(11) | NO | 0 | Unix-ts |
| `updated_by` | int(11) | YES | NULL | ID редактора |
| `created_at` | int(11) | NO | 0 | Unix-ts |
| `header_snippet_id` | int(11) | YES | NULL | Сниппет шапки |
| `footer_snippet_id` | int(11) | YES | NULL | Сниппет подвала |

**Индексы:** PK(`id`); UNIQUE `slug`(`slug`); `is_published`.

#### `db_ir_static_page_blocks` — Блоки страницы *(app, M_0002)*

| Колонка | Тип | NULL | Default | Назначение |
|---------|-----|------|---------|-----------|
| `id` | int(11) | NO | — | PK |
| `page_id` | int(11) | NO | — | ID страницы |
| `block_type` | varchar(32) | NO | 'text' | Тип блока |
| `content` | text | NO | — | Содержимое |
| `sort_order` | int(11) | NO | 0 | Порядок |
| `is_hidden` | tinyint(1) | NO | 0 | Скрыт |
| `visibility` | varchar(16) | NO | 'all' | Видимость |
| `created_at` | int(11) | NO | 0 | Unix-ts |

**Индексы:** PK(`id`); `page_id`; `page_order`(`page_id`, `sort_order`).

#### `db_ir_static_snippets` — Переиспользуемые сниппеты *(app, M_0002)*

| Колонка | Тип | NULL | Default | Назначение |
|---------|-----|------|---------|-----------|
| `id` | int(11) | NO | — | PK |
| `slug` | varchar(128) | NO | — | Slug. UNIQUE |
| `name` | varchar(255) | NO | '' | Название |
| `snippet_type` | varchar(32) | NO | 'block' | Тип |
| `content` | text | NO | — | Содержимое |
| `is_active` | tinyint(1) | NO | 1 | Активен |
| `sort_order` | int(11) | NO | 0 | Порядок |
| `updated_at` | int(11) | NO | 0 | Unix-ts |
| `created_at` | int(11) | NO | 0 | Unix-ts |

**Индексы:** PK(`id`); UNIQUE `slug`(`slug`).

### 4.10 Инвайты

#### `db_ir_invite_tokens` — Токены приглашений *(app, M_0002 + M_0003 `account_type`)*

| Колонка | Тип | NULL | Default | Назначение |
|---------|-----|------|---------|-----------|
| `id` | int(11) | NO | — | PK |
| `token` | varchar(64) | NO | — | Сам токен. UNIQUE |
| `label` | varchar(255) | NO | '' | Метка |
| `expires_at` | int(11) | YES | NULL | Unix-ts истечения |
| `max_uses` | int(11) | NO | 1 | Макс. использований |
| `uses_left` | int(11) | NO | 1 | Осталось использований |
| `is_disabled` | tinyint(1) | NO | 0 | Отключён |
| `created_at` | int(11) | NO | 0 | Unix-ts |
| `created_by` | int(11) | YES | NULL | Кто создал |
| `account_type` | varchar(16) | NO | 'user' | Тип создаваемого аккаунта (`user`/`expert`) — M_0003 |

**Индексы:** PK(`id`); UNIQUE `token`(`token`).

#### `db_ir_invite_registrations` — Регистрации по инвайтам *(app, M_0002)*

| Колонка | Тип | NULL | Default | Назначение |
|---------|-----|------|---------|-----------|
| `id` | int(11) | NO | — | PK |
| `token_id` | int(11) | NO | — | ID токена |
| `account_id` | int(11) | NO | — | ID созданного аккаунта |
| `registered_at` | int(11) | NO | 0 | Unix-ts |
| `ip` | varchar(45) | NO | '' | IP |
| `user_agent` | varchar(255) | NO | '' | User-Agent |

**Индексы:** PK(`id`); `token_id`.

### 4.11 Согласия (consents)

#### `db_ir_consents` — Журнал согласий *(app, M_0014; `Common\Tables\Consents`)*

Полный audit-trail согласий (grant/withdraw), в дополнение к
последним timestamp'ам на `accounts.consent_*_at`. Каждое
выдача/отзыв согласия — отдельная строка с IP, User-Agent и версией
документа.

| Колонка | Тип | NULL | Default | Назначение |
|---------|-----|------|---------|-----------|
| `id` | int(11) | NO | — | PK |
| `account_id` | int(11) | NO | — | ID аккаунта |
| `consent_type` | enum('personal_data','marketing') | NO | — | Тип согласия |
| `action` | enum('given','withdrawn') | NO | 'given' | Действие |
| `document_version` | varchar(32) | NO | — | Версия документа, с которым согласились |
| `ip` | varchar(45) | YES | NULL | IP |
| `user_agent` | varchar(255) | YES | NULL | User-Agent |
| `created_at` | int(11) | NO | — | Unix-ts |

**Индексы:** PK(`id`); `account_id`.

### 4.12 Идемпотентность

#### `db_ir_idempotency_keys` — Ключи идемпотентности *(app, M_0002)*

Защита от повторной обработки POST-запросов: сохраняет ответ по ключу
`(account_id, idem_key, route_path)`.

| Колонка | Тип | NULL | Default | Назначение |
|---------|-----|------|---------|-----------|
| `id` | int(11) | NO | — | PK |
| `account_id` | int(11) | NO | 0 | ID аккаунта |
| `idem_key` | varchar(64) | NO | — | Ключ идемпотентности от клиента |
| `route_path` | varchar(255) | NO | — | Маршрут |
| `http_status` | int(11) | NO | 0 | HTTP-статус ответа |
| `content_type` | varchar(128) | YES | NULL | Content-Type ответа |
| `response_body` | mediumtext | YES | NULL | Тело ответа (для ретрая) |
| `created_at` | int(11) | NO | 0 | Unix-ts |
| `finalized_at` | int(11) | NO | 0 | Unix-ts финализации |

**Индексы:** PK(`id`); UNIQUE `uniq_triple`(`account_id`, `idem_key`,
`route_path`); `created_at`.

### 4.13 Аудит, логи, мониторинг

#### `db_ir_admin_action_log` — Журнал действий администратора *(app, M_0002)*

| Колонка | Тип | NULL | Default | Назначение |
|---------|-----|------|---------|-----------|
| `id` | int(11) | NO | — | PK |
| `actor_id` | int(11) | YES | NULL | ID администратора |
| `actor_login` | varchar(128) | YES | NULL | Логин администратора |
| `target_id` | int(11) | YES | NULL | ID цели |
| `target_login` | varchar(128) | YES | NULL | Логин цели |
| `action` | varchar(64) | YES | NULL | Действие |
| `old_value` | varchar(64) | YES | NULL | Старое значение |
| `new_value` | varchar(64) | YES | NULL | Новое значение |
| `created_at` | int(11) | NO | 0 | Unix-ts |

**Индексы:** PK(`id`); `target_id`; `actor_id`; `created_at`.

#### `db_ir_entity_history` — История изменений сущностей *(app, M_0002)*

Детальный аудит (diff + snapshot) изменений бизнес-сущностей
админ-панелью.

| Колонка | Тип | NULL | Default | Назначение |
|---------|-----|------|---------|-----------|
| `id` | int(11) | NO | — | PK |
| `entity_type` | varchar(64) | NO | '' | Тип сущности |
| `entity_id` | varchar(128) | NO | '' | ID сущности (строка) |
| `action` | varchar(32) | NO | 'update' | Действие |
| `actor_id` | int(11) | NO | 0 | Кто изменил |
| `actor_login` | varchar(128) | NO | '' | Логин |
| `diff_json` | text | YES | NULL | Diff (JSON) |
| `snapshot_json` | text | YES | NULL | Снапшот (JSON) |
| `comment` | varchar(500) | NO | '' | Комментарий |
| `created_at` | int(11) | NO | 0 | Unix-ts |
| `ip` | varchar(45) | NO | '' | IP |
| `user_agent` | varchar(255) | NO | '' | User-Agent |

**Индексы:** PK(`id`); `entity`(`entity_type`, `entity_id`);
`actor_id`; `created_at`.

#### `db_ir_entity_log` — Базовый журнал сущностей *(framework, M_0001; `Kernel\Db\Entity\DbLog\EntityLog`)*

Универсальный аудиторский лог фреймворка.

| Колонка | Тип | NULL | Default | Назначение |
|---------|-----|------|---------|-----------|
| `id` | int(11) | NO | — | PK |
| `user_id` | int(11) | NO | — | ID пользователя |
| `ut` | int(11) | NO | — | Unix-ts |
| `action` | varchar(32) | NO | — | Действие |
| `entity` | varchar(32) | NO | — | Тип сущности |
| `entity_id` | int(11) | NO | — | ID сущности |
| `is_diff` | tinyint(1) | NO | — | Это diff-запись |
| `data` | mediumtext | NO | — | Данные (JSON) |

**Индексы:** PK(`id`); `user_id`; `entity`(`entity`, `entity_id`).

#### `db_ir_js_errors` — Клиентские JS-ошибки *(app, M_0002)*

Дедуплицируются по `hash` (UNIQUE), `count` нарастает.

| Колонка | Тип | NULL | Default | Назначение |
|---------|-----|------|---------|-----------|
| `id` | int(11) | NO | — | PK |
| `hash` | varchar(64) | NO | '' | Хеш ошибки. UNIQUE |
| `message` | varchar(1024) | NO | '' | Сообщение |
| `stack` | text | YES | NULL | Stack trace |
| `file` | varchar(512) | YES | NULL | Файл |
| `line` | int(11) | NO | 0 | Строка |
| `col` | int(11) | NO | 0 | Колонка |
| `url` | varchar(1024) | YES | NULL | URL страницы |
| `user_agent` | varchar(512) | YES | NULL | User-Agent |
| `account_id` | int(11) | YES | NULL | ID аккаунта |
| `count` | int(11) | NO | 1 | Сколько раз поймана |
| `first_seen_at` | int(11) | NO | 0 | Unix-ts первого |
| `last_seen_at` | int(11) | NO | 0 | Unix-ts последнего |

**Индексы:** PK(`id`); UNIQUE `uq_hash`(`hash`); `last_seen_at`;
`account_id`.

#### `db_ir_cron_log` — Лог cron-задач *(app, M_0002)*

| Колонка | Тип | NULL | Default | Назначение |
|---------|-----|------|---------|-----------|
| `id` | int(11) | NO | — | PK |
| `task_name` | varchar(100) | NO | '' | Имя задачи |
| `started_at` | int(11) | NO | 0 | Unix-ts старта |
| `finished_at` | int(11) | NO | 0 | Unix-ts финиша |
| `duration_ms` | int(11) | NO | 0 | Длительность в мс |
| `status` | enum('success','error','running') | NO | 'running' | Статус |
| `output` | text | YES | NULL | Вывод |
| `error_message` | varchar(1024) | YES | NULL | Текст ошибки |
| `created_at` | int(11) | NO | 0 | Unix-ts |

**Индексы:** PK(`id`); `task_name`; `started_at`.

#### `db_ir_sys_log_throttle` — Throttling `/sys/log` *(app, M_0011)*

Пер-IP rate limit на публичный breadcrumb-эндпоинт `/sys/log`.

| Колонка | Тип | NULL | Default | Назначение |
|---------|-----|------|---------|-----------|
| `id` | int(11) | NO | — | PK |
| `ip` | varchar(45) | NO | — | IP. UNIQUE |
| `window_start` | int(11) | NO | 0 | Unix-ts начала окна |
| `cnt` | int(11) | NO | 0 | Счётчик в окне |

**Индексы:** PK(`id`); UNIQUE `ip`(`ip`).

### 4.14 Framework-инфраструктура

#### `db_ir_session` — Сессии *(framework, M_0001; `Kernel\Db\Entity\Session\SessionTable`)*

| Колонка | Тип | NULL | Default | Назначение |
|---------|-----|------|---------|-----------|
| `id` | int(11) | NO | — | PK |
| `name` | varchar(64) | YES | NULL | Имя сессии (cookie). UNIQUE |
| `lastUsage` | int(11) | YES | NULL | Unix-ts последнего использования |

**Индексы:** PK(`id`); UNIQUE `name`(`name`).

#### `db_ir_session_data` — Данные сессии *(framework, M_0001; `Kernel\Db\Entity\Session\SessionDataTable`)*

| Колонка | Тип | NULL | Default | Назначение |
|---------|-----|------|---------|-----------|
| `id` | int(11) | NO | — | PK |
| `sessionId` | int(11) | YES | NULL | ID сессии |
| `param` | varchar(32) | YES | NULL | Имя параметра |
| `value` | varchar(255) | YES | NULL | Значение |

**Индексы:** PK(`id`); UNIQUE `session_param`(`sessionId`, `param`).

#### `db_ir_settings` — Настройки приложения *(framework, M_0001; `Kernel\Db\Entity\Settings\SettingsTable`)*

| Колонка | Тип | NULL | Default | Назначение |
|---------|-----|------|---------|-----------|
| `id` | int(11) | NO | — | PK |
| `param` | varchar(16) | YES | NULL | Ключ. UNIQUE |
| `value` | varchar(255) | YES | NULL | Значение |

**Индексы:** PK(`id`); UNIQUE `param`(`param`).

#### `db_ir_pending_uploads` — Стэгинг загрузок файлов *(framework, M_0001; `Kernel\Io\FileUpload\PendingUploadsTable`)*

| Колонка | Тип | NULL | Default | Назначение |
|---------|-----|------|---------|-----------|
| `id` | int(11) | NO | — | PK |
| `session_id` | varchar(64) | NO | — | ID сессии |
| `account_id` | int(11) | NO | — | ID аккаунта |
| `stored_name` | varchar(255) | NO | — | Имя на диске |
| `original_name` | varchar(255) | NO | — | Исходное имя |
| `mime_type` | varchar(100) | NO | — | MIME |
| `size` | int(11) | NO | 0 | Размер в байтах |
| `created_at` | int(11) | NO | 0 | Unix-ts |

**Индексы:** PK(`id`); `session_id`; `account_id`; `created_at`.

#### `db_ir_migration` — Трекер версий миграций *(framework, создаётся раннером `Migration`)*

| Колонка | Тип | NULL | Default | Назначение |
|---------|-----|------|---------|-----------|
| `id` | int(11) | NO | — | PK |
| `version` | varchar(5) | NO | — | Текущая версия схемы |

**Индексы:** PK(`id`).

> В таблице одна рабочая строка (`id = 1000`, `version = '14'`). Журнала
> применённых миграций (кто/когда) нет — только текущее число. Проверить
> версию: `php garnet migrate:status`.

---

## 5. Целостность и политика данных

- **Нет FK (см. §1).** Все «внешние ключи» — обычные индексы;
  каскадность удалений закодирована вручную в
  `Common/Services/ClearUserService.php` (гейтирован test-mode → в проде
  штатного пути стирания аккаунта нет; для 152-ФЗ/GDPR-запросов «удалите
  данные» сегодня нужен ручной SQL или восстановление из дампа).
- **Политика блокировки:** флаг `IS_DISABLED` в EAV `accounts_data` —
  данные сохраняются, представление маскируется
  (`Common/Services/AccountDisplay.php`).
- **Известные дыры целостности (без FK):** см. аудит
  `docs/handover-audit/14-data-integrity-migrations.md`, находки H-1 и
  M-3 (TOCTOU в `ExpertSlotsService::deleteSlot`; комментарии `entity_id`
  эксперта не чистятся при `clear-user`).

---

## 6. Об индексах

Раньше в этом документе был раздел «Индексы для оптимизации» с
`CREATE INDEX` на несуществующие имена колонок/таблиц (`ir_time_slots`,
`created_ut`, `payments.status` и т.п.). Эти примеры были **неверны** и
**удалены**. Все реально нужные индексы уже созданы миграциями и
перечислены выше в каждой таблице; при необходимости добавить новый
индекс сначала сверьтесь с актуальной схемой (например,
`SHOW INDEX FROM db_ir_<table>`), чтобы не предлагать `CREATE INDEX` на
несуществующие сущности.
