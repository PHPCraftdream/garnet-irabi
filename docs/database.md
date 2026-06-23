# Структура базы данных

> **Актуальная модель данных описана в [data-model.md](data-model.md)**

## Текущие таблицы

### ir_expert_profiles — Профили экспертов

Профили экспертов с расширенной информацией.

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | INT | Первичный ключ |
| `account_id` | INT | ID аккаунта эксперта |
| `display_name` | VARCHAR(255) | Отображаемое имя |
| `bio` | TEXT | Описание |
| `specialization` | VARCHAR(255) | Специализация |
| `photo` | VARCHAR(255) | Путь к фото |
| `rating` | DECIMAL(3,2) | Рейтинг |
| `is_approved` | TINYINT | Одобрен ли модератором |

### ir_time_slots — Слоты времени

Слоты свободного времени, создаваемые экспертами.

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | INT | Первичный ключ |
| `expert_id` | INT | ID аккаунта эксперта |
| `start_at` | INT | Unix timestamp начала |
| `end_at` | INT | Unix timestamp окончания |
| `duration_min` | INT | Длительность в минутах |
| `cost` | INT | Стоимость |
| `is_online` | TINYINT | Онлайн или офлайн |
| `location` | VARCHAR(255) | Место проведения |
| `max_users` | INT | Макс. пользователей |
| `status` | ENUM | `free`, `booked`, `completed`, `cancelled` |
| `uid` | VARCHAR | Уникальный идентификатор |

### ir_bookings — Бронирования

Бронирования слотов пользователями.

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | INT | Первичный ключ |
| `user_id` | INT | ID пользователя |
| `bookable_type` | ENUM | `time_slot` |
| `bookable_id` | INT | ID слота |
| `status` | ENUM | `pending`, `confirmed`, `completed`, `cancelled` |
| `created_ut` | INT | Unix timestamp создания |

### ir_account_balance — Балансы

Текущий баланс каждого аккаунта (денормализованный кэш).

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | INT | Первичный ключ |
| `account_id` | INT | ID аккаунта |
| `balance` | INT | Текущий баланс |

### ir_balance_ledger — Журнал транзакций

Иммутабельный журнал всех финансовых операций.

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | INT | Первичный ключ |
| `account_id` | INT | ID аккаунта |
| `entry_type` | ENUM | `top_up`, `booking_invoice`, `booking_payment`, `booking_refund`, `manual` |
| `is_credit` | TINYINT | Кредит (1) или дебет (0) |
| `amount` | INT | Сумма |
| `ref_id` | INT | ID связанной сущности |
| `created_ut` | INT | Unix timestamp |

### ir_payments — Платежи

Информация о платежах.

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | INT | Первичный ключ |
| `account_id` | INT | ID плательщика |
| `amount` | INT | Сумма |
| `status` | ENUM | `pending`, `paid`, `refunded`, `failed` |
| `created_ut` | INT | Unix timestamp создания |

### ir_comments — Комментарии

Комментарии к сущностям (эксперты и т.д.).

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | INT | Первичный ключ |
| `author_id` | INT | ID автора |
| `entity_type` | VARCHAR | Тип сущности |
| `entity_id` | INT | ID сущности |
| `body` | TEXT | Текст комментария |
| `created_ut` | INT | Unix timestamp |
