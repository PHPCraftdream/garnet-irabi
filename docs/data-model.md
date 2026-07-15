# Модель данных IRabi

## 1. ER-диаграмма (концептуальная)

```
┌─────────────┐
│   Account   │
│(Пользователь)│
└──────┬──────┘
       │
       ├──────────────────────┐
       │                      │
       ▼                      ▼
┌─────────────┐        ┌─────────────┐
│ExpertProfile│        │  TimeSlot   │
│  (Профиль   │        │(Слот времени)│
│  эксперта)  │        └──────┬──────┘
└─────────────┘               │
                               ▼
                        ┌─────────────┐    ┌─────────────┐
                        │  Booking    │───►│  Payment    │
                        │  (Бронь)    │    │  (Оплата)   │
                        └─────────────┘    └─────────────┘
```

## 2. Таблицы базы данных

### 2.1 db_accounts — Аккаунты

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | INT | Первичный ключ |
| `login` | VARCHAR(255) | Логин; для email-auth это email |
| `login_type` | VARCHAR(32) | Тип логина, обычно `email` |
| `token16` / `token32` | VARCHAR | Auth/session tokens; парольная аутентификация не используется |
| `type` | ENUM | `user`, `expert` |
| `time_zone` | VARCHAR(45) | Часовой пояс |
| `reg_time` | INT | Unix timestamp регистрации |

### 2.2 db_account_data — Данные аккаунта (EAV)

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | INT | Первичный ключ |
| `account_id` | INT | FK на db_accounts |
| `prop` | VARCHAR | Имя свойства |
| `data` | TEXT | Значение |

**Ключевые флаги:**
- `IS_ADMIN` — администратор
- `IS_OWNER` — владелец
- `IS_MODERATOR` — модератор
- `IS_APPROVED` — одобренный эксперт
- `IS_DISABLED` — заблокирован

### 2.3 ir_expert_profiles — Профили экспертов

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | INT | Первичный ключ |
| `account_id` | INT | ID аккаунта |
| `display_name` | VARCHAR(255) | Отображаемое имя |
| `bio` | TEXT | Описание |
| `specialization` | VARCHAR(255) | Специализация |
| `photo` | VARCHAR(255) | Путь к фото |
| `rating` | DECIMAL(3,2) | Рейтинг (0-5) |
| `is_approved` | TINYINT | Одобрен ли как эксперт |

### 2.4 ir_time_slots — Слоты времени

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | INT | Первичный ключ |
| `expert_id` | INT | ID аккаунта эксперта |
| `start_at` | INT | Unix timestamp начала |
| `end_at` | INT | Unix timestamp окончания |
| `duration_min` | INT | Длительность в минутах |
| `cost` | INT | Стоимость |
| `is_online` | TINYINT | Онлайн (1) или офлайн (0) |
| `location` | VARCHAR(255) | Место проведения |
| `max_users` | INT | Макс. пользователей |
| `status` | ENUM | `free`, `booked`, `completed`, `cancelled` |
| `uid` | VARCHAR | Уникальный идентификатор |
| `created_ut` | INT | Unix timestamp создания |

### 2.5 ir_bookings — Бронирования

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | INT | Первичный ключ |
| `user_id` | INT | ID пользователя |
| `bookable_type` | ENUM | `time_slot` |
| `bookable_id` | INT | ID слота |
| `status` | ENUM | `pending`, `confirmed`, `completed`, `cancelled` |
| `created_ut` | INT | Unix timestamp создания |

### 2.6 ir_user_cancellations — Отмены пользователей

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | INT | Первичный ключ |
| `booking_id` | INT | ID бронирования |
| `user_id` | INT | ID пользователя |
| `reason` | TEXT | Причина отмены |
| `created_ut` | INT | Unix timestamp |

### 2.7 ir_expert_cancellations — Отмены экспертов

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | INT | Первичный ключ |
| `slot_id` | INT | ID слота |
| `expert_id` | INT | ID эксперта |
| `reason` | TEXT | Причина отмены |
| `created_ut` | INT | Unix timestamp |

### 2.8 ir_account_balance — Балансы

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | INT | Первичный ключ |
| `account_id` | INT | ID аккаунта |
| `balance` | INT | Текущий баланс |

### 2.9 ir_balance_ledger — Журнал транзакций

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | INT | Первичный ключ |
| `account_id` | INT | ID аккаунта |
| `entry_type` | ENUM | `top_up`, `booking_invoice`, `booking_payment`, `booking_refund`, `manual` |
| `is_credit` | TINYINT | Кредит (1) или дебет (0) |
| `amount` | INT | Сумма |
| `ref_id` | INT | ID связанной сущности |
| `created_ut` | INT | Unix timestamp |

### 2.10 ir_payments — Платежи

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | INT | Первичный ключ |
| `account_id` | INT | ID плательщика |
| `amount` | INT | Сумма |
| `status` | ENUM | `pending`, `paid`, `refunded`, `failed` |
| `created_ut` | INT | Unix timestamp создания |

### 2.11 ir_comments — Комментарии

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | INT | Первичный ключ |
| `author_id` | INT | ID автора |
| `entity_type` | VARCHAR | Тип сущности (напр. `expert`) |
| `entity_id` | INT | ID сущности |
| `body` | TEXT | Текст комментария |
| `created_ut` | INT | Unix timestamp |

## 3. Связи между таблицами

```
db_accounts (1) ────────► (1) ir_expert_profiles
db_accounts (1) ────────► (N) ir_time_slots (через expert_id)
db_accounts (1) ────────► (N) ir_bookings (через user_id)
db_accounts (1) ────────► (1) ir_account_balance
db_accounts (1) ────────► (N) ir_balance_ledger

ir_time_slots (1) ──────► (N) ir_bookings
ir_bookings (1) ────────► (1) ir_user_cancellations
ir_time_slots (1) ──────► (1) ir_expert_cancellations
ir_bookings (1) ────────► (N) ir_payments
```

## 4. Индексы для оптимизации

```sql
-- Запросы экспертов
CREATE INDEX idx_time_slots_expert_status ON ir_time_slots(expert_id, status, start_at);

-- Запросы пользователей
CREATE INDEX idx_bookings_user ON ir_bookings(user_id, status);
CREATE INDEX idx_time_slots_free ON ir_time_slots(status, start_at);

-- Финансы
CREATE INDEX idx_payments_status ON ir_payments(status, created_ut);
CREATE INDEX idx_ledger_account ON ir_balance_ledger(account_id, entry_type);
```
