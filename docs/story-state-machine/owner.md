# Владелец (Owner) — система стейт-машин

## Роль в иерархии

Владелец — **архитектор платформы**. Его уникальная привилегия — управление ролями (`IS_MODERATOR`, `IS_OWNER`). Он формирует команду модераторов, которая затем управляет контентом и экспертами. Сам владелец управляется только `AdminSM`.

```
AdminSM
  │ назначает IS_OWNER
  ▼
OwnerSM
  │
  ├──► AccountSM (IS_MODERATOR ↔, IS_OWNER ↔)
  │
  ├──► все операции ModerationSM (наследует)
  │
  └──► AdminActionLogSM (все действия логируются)
```

**Принцип наследования:** Владелец включает в себя все права модератора плюс управление ролями.

---

## 1. AccountSM (владелец)

```
[не существует]
      │ регистрация
      ▼
  regular_user
      │ Admin: IS_OWNER = 1
      ▼
  owner ◄──────────────────────────────────────────────────────┐
      │                                                         │
      │ Admin: IS_OWNER = 0                                     │ Admin: IS_OWNER = 1
      ▼                                                         │
  regular_user ────────────────────────────────────────────────┘
      │
      │ IS_DISABLED = 1 (только admin)
      ▼
  disabled
```

**Поля:** `db_accounts_data.IS_OWNER`, `IS_DISABLED`

**Особенность:** Заблокировать владельца (`IS_DISABLED`) может только `AdminSM`. Другие модераторы и владельцы — не могут.

---

## 2. OwnerSM — операции над AccountSM (роли)

Уникальная привилегия владельца — управление ролями ниже `IS_ADMIN`.

### Выдача/отзыв роли модератора:

```
AccountSM.IS_MODERATOR:

  regular_user (IS_MODERATOR=0)
        │ Owner: POST /admin/~setUserFlag {IS_MODERATOR: 1}
        ▼
  moderator (IS_MODERATOR=1)
        │ Owner: POST /admin/~setUserFlag {IS_MODERATOR: 0}
        ▼
  regular_user (IS_MODERATOR=0)

Побочный эффект:
  AdminActionLogSM: +[owner, target, IS_MODERATOR, 0→1 или 1→0]
```

### Выдача/отзыв роли владельца (делегирование):

```
AccountSM.IS_OWNER:

  regular_user (IS_OWNER=0)
        │ Owner: POST /admin/~setUserFlag {IS_OWNER: 1}
        ▼
  owner (IS_OWNER=1)
        │ Owner: POST /admin/~setUserFlag {IS_OWNER: 0}
        ▼
  regular_user (IS_OWNER=0)

Побочный эффект:
  AdminActionLogSM: +[owner, target, IS_OWNER, 0→1 или 1→0]
```

---

## 3. OwnerSM — унаследованные операции

Все операции `ModerationSM` доступны владельцу в полном объёме:

| Операция | Машина-цель | Метод |
|----------|-------------|-------|
| Одобрить/отозвать эксперта | `ExpertProfileSM` | `setUserFlag(IS_APPROVED)` |
| Заблокировать аккаунт | `AccountSM` | `setUserFlag(IS_DISABLED)` |
| Отменить бронирование | `BookingSM` | `BookingsController::cancel()` |

---

## 4. AdminActionLogSM

Владелец логируется так же, как модератор — каждое изменение флага записывается в аудит-лог.

```
Каждый вызов setUserFlag():
  AdminActionLogSM: +[
    actor_id   = owner.id,
    actor_login = owner.login,
    target_id,
    target_login,
    action     = 'IS_MODERATOR' | 'IS_OWNER' | 'IS_APPROVED' | ...,
    old_value,
    new_value,
    created_at
  ]
```

---

## 5. Полная история владельца

```
ЭТАП 1: Получение роли
AccountSM: regular_user
Admin: POST /admin/~setUserFlag {IS_OWNER: 1}
AccountSM: regular_user → owner
AdminActionLogSM: +[admin, target, IS_OWNER, 0→1]

ЭТАП 2: Формирование команды модераторов
OwnerSM: POST /admin/~setUserFlag {IS_MODERATOR: 1} для нескольких аккаунтов
AccountSM[moderator1]: regular_user → moderator
AccountSM[moderator2]: regular_user → moderator
AdminActionLogSM: +[owner, mod1, IS_MODERATOR, 0→1]
AdminActionLogSM: +[owner, mod2, IS_MODERATOR, 0→1]

ЭТАП 3: Делегирование прав владельца
OwnerSM: POST /admin/~setUserFlag {IS_OWNER: 1} для доверенного лица
AccountSM[delegate]: regular_user → owner
AdminActionLogSM: +[owner, delegate, IS_OWNER, 0→1]

ЭТАП 4: Отзыв прав нарушителя-модератора
OwnerSM: POST /admin/~setUserFlag {IS_MODERATOR: 0}
AccountSM[ex_moderator]: moderator → regular_user
AdminActionLogSM: +[owner, ex_mod, IS_MODERATOR, 1→0]

ЭТАП 5: Все операции модератора (одобрения, блокировки)
→ см. moderator.md
```

---

## Иерархия разрешений на изменение флагов

```
Флаг         │ Кто может менять
─────────────┼───────────────────────────────
IS_ADMIN     │ только Admin
IS_OWNER     │ Admin или Owner
IS_MODERATOR │ Admin или Owner
IS_APPROVED  │ Admin, Owner или Moderator
IS_DISABLED  │ Admin, Owner или Moderator
             │ (не может заблокировать Owner/Admin)
```

---

## Ограничения (guards)

Владелец **не может:**
- Выдать/отозвать `IS_ADMIN` (только `AdminSM`)
- Заблокировать аккаунт с `IS_ADMIN=1`
- Изменять данные платформы (конфигурацию, настройки сервера)

Владелец **может:**
- Заблокировать другого владельца (`IS_OWNER` не защищает от `IS_DISABLED`)
- Отозвать роль у другого владельца

---

## Код

| Операция | Метод | Файл |
|----------|-------|------|
| Управление ролями/флагами | `post__setUserFlag()` | `Apps/IRabi/Dashboard/Controllers/DashboardUsersController.php` |
| Список пользователей | `get__main()` | `Apps/IRabi/Dashboard/Controllers/DashboardUsersController.php` |
| Аудит-лог | `get__main()` | `Apps/IRabi/Dashboard/Controllers/DashboardActionLogController.php` |
