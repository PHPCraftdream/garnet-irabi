# Модератор — система стейт-машин

## Роль в иерархии

Модератор — **регулятор контента**. Он управляет машинами нижнего уровня (`ExpertProfileSM`, `BookingSM`) но не может изменять структуру платформы (роли модераторов и выше). Сам управляется `OwnerSM`.

```
OwnerSM / AdminSM
     │ назначает IS_MODERATOR
     ▼
ModerationSM (модератор)
     │
     ├──► ExpertProfileSM  (is_approved ↔)
     │
     ├──► AccountSM (IS_DISABLED ↔)
     │
     ├──► BookingSM (отмена любого бронирования)
     │
     └──► AdminActionLogSM (каждое действие логируется)
```

---

## 1. AccountSM (модератор)

```
[не существует]
      │ регистрация (любым способом)
      ▼
  regular_user
      │ Owner/Admin: IS_MODERATOR = 1
      ▼
  moderator ◄─────────────────────────────────────────────────┐
      │                                                        │
      │ Owner/Admin: IS_MODERATOR = 0                         │ Owner/Admin: IS_MODERATOR = 1
      ▼                                                        │
  regular_user ───────────────────────────────────────────────┘
      │
      │ IS_DISABLED = 1 (другим модератором или owner)
      ▼
  disabled
```

**Поля:** `db_accounts_data.IS_MODERATOR`, `IS_DISABLED`

---

## 2. ModerationSM — операции над ExpertProfileSM

Модератор управляет **бинарной стейт-машиной одобрения** эксперта.

```
ExpertProfileSM.is_approved:

  not_approved (0)
        │ POST /admin/~setUserFlag {flag: IS_APPROVED, value: 1}
        ▼
    approved (1)
        │ POST /admin/~setUserFlag {flag: IS_APPROVED, value: 0}
        ▼
  not_approved (0)
```

**Побочные эффекты каждого переключения:**

```
IS_APPROVED = 1:
  ExpertProfileSM: not_approved → approved
  AdminActionLogSM: +[actor, target, IS_APPROVED, 0→1]

IS_APPROVED = 0:
  ExpertProfileSM: approved → not_approved
  AdminActionLogSM: +[actor, target, IS_APPROVED, 1→0]
```

**Что меняется для пользователей после отзыва одобрения:**
- Слоты этого эксперта перестают отображаться в каталоге (`ExpertProfileSM.is_approved = 0`)
- Существующие активные `BookingSM` **не отменяются автоматически**

---

## 3. ModerationSM — операции над AccountSM

Модератор может блокировать/разблокировать любые аккаунты **ниже себя** в иерархии (не может заблокировать owner/admin).

```
AccountSM.IS_DISABLED:

  active (IS_DISABLED=0)
        │ POST /admin/~setUserFlag {flag: IS_DISABLED, value: 1}
        ▼
  disabled (IS_DISABLED=1)
        │ POST /admin/~setUserFlag {flag: IS_DISABLED, value: 0}
        ▼
  active (IS_DISABLED=0)
```

**Побочные эффекты блокировки:**
```
IS_DISABLED = 1:
  AccountSM: active → disabled
  AdminActionLogSM: +[actor, target, IS_DISABLED, 0→1]
  → пользователь теряет доступ к API
  → существующие сессии — не инвалидируются немедленно
  → ExpertProfileSM — не затрагивается (is_approved сохраняется)
```

---

## 4. ModerationSM — операции над BookingSM

Модератор может отменить **любое** активное бронирование.

```
BookingSM (любого пользователя):

  pending/confirmed
        │ POST /bookings/id~{bookingId}/~cancel (с правами модератора)
        ▼
  cancelled

Побочный эффект:
  LedgerSM (пользователь): +[booking_refund, credit=1, amount=cost]
  LedgerSM (эксперт): +[booking_refund, credit=0, amount=cost]
  BalanceSM (пользователь): recalculate → +cost
  BalanceSM (эксперт): recalculate → −cost
  TimeSlotSM: booked → free (если место освободилось)
```

---

## 5. AdminActionLogSM

Иммутабельная машина аудита. Каждое действие модератора **обязательно** логируется.

```
(пусто)
  │ любое действие модератора над флагом
  ▼
[actor_id, actor_login, target_id, target_login, action, old_value, new_value, created_at]
  │ следующее действие
  ▼
[..., ...]
  │ ...
  ▼
[иммутабельная история]
```

**Таблица:** `ir_admin_action_log`

**Логируемые действия:**

| action | Описание |
|--------|----------|
| `IS_APPROVED` | Одобрение/отзыв эксперта |
| `IS_DISABLED` | Блокировка/разблокировка аккаунта |
| `IS_MODERATOR` | Выдача/отзыв прав модератора |
| `IS_OWNER` | Выдача/отзыв прав владельца |
| `IS_ADMIN` | Выдача/отзыв прав администратора |

---

## 6. Полная история модератора

```
ЭТАП 1: Получение прав
AccountSM: regular_user
Owner: POST /admin/~setUserFlag {IS_MODERATOR: 1}
AccountSM: regular_user → moderator
AdminActionLogSM: +[owner, target, IS_MODERATOR, 0→1]

ЭТАП 2: Одобрение нового эксперта
ModerationSM видит: ExpertProfileSM.is_approved = 0
ModerationSM: POST /admin/~setUserFlag {IS_APPROVED: 1}
ExpertProfileSM: not_approved → approved
AdminActionLogSM: +[moderator, expert, IS_APPROVED, 0→1]

ЭТАП 3: Жалоба на эксперта → отзыв одобрения
ModerationSM: POST /admin/~setUserFlag {IS_APPROVED: 0}
ExpertProfileSM: approved → not_approved
AdminActionLogSM: +[moderator, expert, IS_APPROVED, 1→0]

ЭТАП 4: Блокировка нарушителя
ModerationSM: POST /admin/~setUserFlag {IS_DISABLED: 1}
AccountSM: active → disabled
AdminActionLogSM: +[moderator, user, IS_DISABLED, 0→1]

ЭТАП 5: Отмена бронирования (по запросу)
ModerationSM: POST /bookings/id~{X}/~cancel
BookingSM: pending → cancelled
LedgerSM: +refund entries
BalanceSM: recalculate both parties
```

---

## Ограничения (guards)

Модератор **не может:**
- Выдать/отозвать роль `IS_MODERATOR`, `IS_OWNER`, `IS_ADMIN` (требует `IS_OWNER`)
- Заблокировать аккаунт с `IS_OWNER=1` или `IS_ADMIN=1`
- Создать/удалить эксперта напрямую — только управлять флагом `IS_APPROVED`

---

## Код

| Операция | Метод | Файл |
|----------|-------|------|
| Переключение флагов | `post__setUserFlag()` | `Apps/IRabi/Dashboard/Controllers/DashboardUsersController.php` |
| Список пользователей | `get__main()` | `Apps/IRabi/Dashboard/Controllers/DashboardUsersController.php` |
| Аудит-лог | `get__main()` | `Apps/IRabi/Dashboard/Controllers/DashboardActionLogController.php` |
