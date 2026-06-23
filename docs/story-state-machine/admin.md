# Администратор — система стейт-машин

## Роль в иерархии

Администратор — **высшая машина** в системе. Он управляет всеми остальными машинами без исключения, в том числе может назначать других администраторов и управлять самой структурой платформы. Нет стейт-машины выше `AdminSM` — это корневая машина системы.

```
AdminSM (корень)
  │
  ├──► AccountSM (IS_ADMIN ↔, IS_OWNER ↔, IS_MODERATOR ↔, IS_DISABLED ↔)
  │
  ├──► все операции OwnerSM (наследует)
  │
  ├──► все операции ModerationSM (наследует)
  │
  ├──► BalanceSM (ручные корректировки)
  │
  ├──► AdminActionLogSM (читает полную историю + логирует свои действия)
  │
  └──► DbSM (DDL, миграции, структура БД) — только через CLI
```

**Принцип наследования:** Администратор включает в себя все права владельца, все права модератора, плюс управление ролью администратора и доступ к системным операциям.

---

## 1. AccountSM (администратор)

```
[не существует]
      │ регистрация
      ▼
  regular_user
      │ Admin: IS_ADMIN = 1
      │ (первый admin назначается через CLI/seed или напрямую в БД)
      ▼
  admin ◄───────────────────────────────────────────────────────┐
      │                                                          │
      │ Admin: IS_ADMIN = 0 (другим admin)                      │ Admin: IS_ADMIN = 1
      ▼                                                          │
  regular_user ─────────────────────────────────────────────────┘
      │
      │ IS_DISABLED = 1 (только другим admin)
      ▼
  disabled
```

**Поля:** `db_accounts_data.IS_ADMIN`, `db_accounts_data.IS_MODERATOR` (admin = true → IS_MODERATOR автоматически)

**Особенность первого администратора:** Самый первый `IS_ADMIN` назначается вне системы — через `DevLoginController` (в dev-среде) или напрямую через CLI/seed. `DbSM` (bootstrap) создаёт начальный аккаунт.

---

## 2. AdminSM — уникальная операция: управление IS_ADMIN

```
AccountSM.IS_ADMIN:

  non_admin (IS_ADMIN=0)
        │ Admin: POST /admin/~setUserFlag {IS_ADMIN: 1}
        ▼
  admin (IS_ADMIN=1)
        │ Admin: POST /admin/~setUserFlag {IS_ADMIN: 0}
        ▼
  non_admin (IS_ADMIN=0)

Побочный эффект:
  IS_ADMIN=1 → IS_MODERATOR=1 автоматически (admin включает модератора)
  AdminActionLogSM: +[admin, target, IS_ADMIN, 0→1 или 1→0]
```

---

## 3. AdminSM — операции над BalanceSM

Только администратор может выполнять **ручные корректировки** баланса без привязки к бронированию.

```
BalanceSM (любого аккаунта):

  balance: N
      │ Admin: ручной дебет/кредит
      ▼
  LedgerSM: +[manual, is_credit=0|1, amount=X, note="Admin adjustment"]
  BalanceSM: recalculate → N ± X
```

**Типы ledger-записей для admin:**

| entry_type | is_credit | Описание |
|-----------|-----------|----------|
| `manual` | 1 | Ручное начисление (кредит) |
| `manual` | 0 | Ручное списание (дебет) |

---

## 4. DbSM — системная машина (CLI-only)

Машина состояния базы данных. Управляется только через CLI-команды, недоступна через HTTP-API.

```
db_schema:

  [empty]
        │ CLI: migrate:init (создаёт db_migrations)
        ▼
  schema_v0
        │ CLI: migrate (M_0001)
        ▼
  schema_v1 (все основные таблицы)
        │ CLI: migrate (M_0002)
        ▼
  schema_v2
        │ ...
        ▼
  schema_vN
```

**Таблицы:** `ir_time_slots`, `ir_expert_profiles`, `ir_bookings`, `ir_account_balance`, `ir_balance_ledger`, `ir_payments`, `ir_payments_log`, `ir_user_cancellations`, `ir_expert_cancellations`, `ir_admin_action_log`, `ir_comments`

**Инварианты DbSM:**
- Миграции применяются строго последовательно (M_0001 → M_0002 → ...)
- Откат миграции не предусмотрен — только forward migration
- dev-среда: `reset-db` через `DevLoginController::post__resetDb()` (TRUNCATE + DELETE)

---

## 5. AdminActionLogSM — полный аудит

Администратор видит **всю историю** действий: своих, владельцев, модераторов.

```
AdminActionLogSM (иммутабельный агрегат):

  [
    {actor: mod1, target: expert1, IS_APPROVED: 0→1, t1},
    {actor: owner1, target: user5, IS_MODERATOR: 0→1, t2},
    {actor: admin, target: owner1, IS_OWNER: 0→1, t3},
    ...
  ]

Запись НЕ изменяется и НЕ удаляется.
Доступна только для чтения через /admin/~actionLog.
```

**Что логируется:**

| action | Кто пишет | Описание |
|--------|-----------|----------|
| `IS_APPROVED` | Mod/Owner/Admin | Одобрение/отзыв эксперта |
| `IS_DISABLED` | Mod/Owner/Admin | Блокировка/разблокировка |
| `IS_MODERATOR` | Owner/Admin | Управление ролью модератора |
| `IS_OWNER` | Owner/Admin | Управление ролью владельца |
| `IS_ADMIN` | Admin | Управление ролью администратора |

---

## 6. Полная история администратора

```
ЭТАП 1: Bootstrap платформы (CLI/seed)
DbSM: empty → schema_vN
AccountSM[admin]: (new) → registered → admin (IS_ADMIN=1)

ЭТАП 2: Запуск платформы
AdminSM выдаёт роль владельца операционному директору:
AccountSM[owner]: regular_user → owner (IS_OWNER=1)
AdminActionLogSM: +[admin, owner, IS_OWNER, 0→1]

ЭТАП 3: Мониторинг (ежедневно)
AdminSM читает: AdminActionLogSM (все действия модераторов)
AdminSM читает: BookingSM (все активные бронирования)
AdminSM читает: BalanceSM (балансы всех аккаунтов)

ЭТАП 4: Ручная корректировка баланса
AdminSM: POST /admin/~adjustBalance {account_id, amount, is_credit, note}
LedgerSM: +[manual, is_credit=1, amount=X]
BalanceSM: recalculate → +X

ЭТАП 5: Жалоба на администратора
AdminSM: POST /admin/~setUserFlag {IS_ADMIN: 0, target=abusive_admin}
AccountSM[abusive_admin]: admin → regular_user
AdminActionLogSM: +[admin, abusive_admin, IS_ADMIN, 1→0]

ЭТАП 6: Системный инцидент — сброс данных (dev)
DbSM (dev only): DevLoginController::post__resetDb()
  TRUNCATE все ir_* таблицы
  DELETE FROM db_accounts WHERE login LIKE '__dev_%'
  BalanceSM: reset (все балансы = 0)
  LedgerSM: сброс
  BookingSM: все бронирования удалены

ЭТАП 7: Обновление схемы (CLI)
DbSM: schema_vN → schema_vN+1
```

---

## 7. Полная таблица привилегий

```
Операция                    │ User   │ Expert │ Moderator │ Owner │ Admin
────────────────────────────┼────────┼────────┼───────────┼───────┼──────
Бронировать слот            │   ✓    │   ✓    │    ✓      │  ✓    │  ✓
Отменить своё бронирование  │   ✓    │   ✓    │    ✓      │  ✓    │  ✓
Отменить чужое бронирование │   ✗    │   ✗    │    ✓      │  ✓    │  ✓
Создать слот                │   ✗    │   ✓    │    ✗      │  ✗    │  ✓
Одобрить эксперта (IS_APPR.)│   ✗    │   ✗    │    ✓      │  ✓    │  ✓
Заблокировать аккаунт       │   ✗    │   ✗    │    ✓      │  ✓    │  ✓
Выдать роль модератора      │   ✗    │   ✗    │    ✗      │  ✓    │  ✓
Выдать роль владельца       │   ✗    │   ✗    │    ✗      │  ✓    │  ✓
Выдать роль администратора  │   ✗    │   ✗    │    ✗      │  ✗    │  ✓
Ручная корректировка баланса│   ✗    │   ✗    │    ✗      │  ✗    │  ✓
Сброс БД (dev only)         │   ✗    │   ✗    │    ✗      │  ✗    │  ✓
Читать аудит-лог            │   ✗    │   ✗    │    ✓      │  ✓    │  ✓
```

---

## 8. Инварианты всей системы

1. **Баланс >= 0** — невозможно списать больше, чем есть
2. **LedgerSM иммутабелен** — записи только добавляются
3. **AdminActionLogSM иммутабелен** — полный аудит навсегда
4. **Каскад одобрения** — `IS_APPROVED` эксперта влияет на видимость его слотов
5. **Иерархия ролей** — нельзя заблокировать/разжаловать аккаунт выше себя
6. **Бронирование атомарно** — списание баланса + создание бронирования в одной транзакции
7. **Вместимость слота** — `pending + confirmed <= max_users`
8. **Слот в прошлом** — нельзя забронировать слот с `start_at <= now()`

---

## Код

| Операция | Метод | Файл |
|----------|-------|------|
| Управление флагами | `post__setUserFlag()` | `Apps/IRabi/Dashboard/Controllers/DashboardUsersController.php` |
| Корректировка баланса | `post__adjustBalance()` | `Apps/IRabi/Dashboard/Controllers/DashboardBalanceController.php` |
| Аудит-лог | `get__main()` | `Apps/IRabi/Dashboard/Controllers/DashboardActionLogController.php` |
| Список пользователей | `get__main()` | `Apps/IRabi/Dashboard/Controllers/DashboardUsersController.php` |
| Список бронирований | `get__main()` | `Apps/IRabi/Dashboard/Controllers/DashboardBookingsController.php` |
| Балансы | `get__main()` | `Apps/IRabi/Dashboard/Controllers/DashboardBalanceController.php` |
| Dev login | `post__main()` | `Apps/IRabi/Foreground/Controllers/DevLoginController.php` |
| Reset DB (dev) | `post__resetDb()` | `Apps/IRabi/Foreground/Controllers/DevLoginController.php` |
