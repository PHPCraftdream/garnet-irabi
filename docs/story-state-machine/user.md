# Пользователь — система стейт-машин

## Роль в иерархии

Пользователь — **потребитель** платформы. Его действия инициируют переходы в соседних машинах (`BookingSM`, `BalanceSM`), но он не управляет чужими машинами — только своими бронированиями и балансом.

```
ModerationSM (одобряет экспертов, от которых зависит доступность слотов)
     │
     ▼
ExpertSM ──► TimeSlotSM ──► BookingSM ◄── UserSM
                                 │
                                 ▼
                             BalanceSM ◄──► LedgerSM
```

---

## 1. AccountSM (пользователь)

Собственная стейт-машина аккаунта пользователя.

```
[не существует]
      │ регистрация (POST /reg)
      ▼
  registered
      │ заполняет профиль, выбирает тип "user"
      ▼
  active ◄──────────────────────────────────────────┐
      │                                              │
      │ IS_DISABLED = 1 (модератором)                │ IS_DISABLED = 0 (модератором)
      ▼                                              │
  disabled ─────────────────────────────────────────┘
```

**Состояния:**

| Состояние | Описание | Ограничения |
|-----------|----------|-------------|
| `registered` | Аккаунт создан, профиль не заполнен | Нет доступа к бронированиям |
| `active` | Полностью активный пользователь | Может бронировать слоты |
| `disabled` | Заблокирован модератором | Нет доступа к API |

**Таблица/поле:** `db_accounts_data.IS_DISABLED`

**Переходы:**

| Из | В | Кто | Событие |
|----|---|-----|---------|
| `registered` | `active` | Пользователь | Заполняет профиль (`/reg` + выбор type=user) |
| `active` | `disabled` | Модератор | `POST /admin/~setUserFlag {flag: IS_DISABLED, value: 1}` |
| `disabled` | `active` | Модератор | `POST /admin/~setUserFlag {flag: IS_DISABLED, value: 0}` |

---

## 2. BalanceSM

Стейт-машина баланса пользователя. **Состояние** — это текущее числовое значение баланса.

```
balance: 0
    │ пополнение (top_up)
    ▼
balance: N
    │ бронирование слота (booking_invoice)
    ▼
balance: N - cost
    │ отмена бронирования (booking_refund)
    ▼
balance: N (восстановлен)
```

**Таблица:** `ir_account_balance` (денормализованный кэш)
**Источник истины:** `ir_balance_ledger` (иммутабельный)

**Инварианты:**
- Баланс **никогда не уходит в минус** — бронирование блокируется если `balance < cost`
- Баланс = `SUM(amount WHERE is_credit=1) - SUM(amount WHERE is_credit=0)` по всем записям пользователя в ledger
- После каждой операции вызывается `AccountBalance::recalculate($userId)`

---

## 3. LedgerSM

Иммутабельная машина записей. Записи **только добавляются**, никогда не изменяются и не удаляются.

```
(пусто)
  │ top_up
  ▼
[top_up, credit=1, amount=X]
  │ booking_invoice
  ▼
[top_up, credit=1, amount=X]
[booking_invoice, credit=0, amount=cost, ref=booking_id]
  │ отмена → booking_refund
  ▼
[top_up, credit=1, amount=X]
[booking_invoice, credit=0, amount=cost, ref=booking_id]
[booking_refund, credit=1, amount=cost, ref=booking_id]
```

**Таблица:** `ir_balance_ledger`

**Типы записей для пользователя:**

| entry_type | is_credit | Когда | Описание |
|-----------|-----------|-------|----------|
| `top_up` | 1 | Пополнение баланса | Пользователь или admin пополняет счёт |
| `booking_invoice` | 0 | Бронирование | Списание стоимости слота |
| `booking_refund` | 1 | Отмена бронирования | Возврат списанной суммы |
| `manual` | 0 или 1 | Ручная корректировка | Только admin |

---

## 4. BookingSM

Центральная стейт-машина для пользователя. Каждое бронирование — отдельный экземпляр машины.

```
[не существует]
      │ POST /bookings/id~{slotId}/~book
      │ Условие: balance >= cost, slot.status = 'free', нет активных броней
      ▼
   pending ◄──────────────────────────────────────────────────────┐
      │                                                            │
      │ автоматически (будущая логика)                             │
      ▼                                                            │
  confirmed                                                        │
      │                                                            │
      │ POST /bookings/id~{bookingId}/~cancel                      │
      │ (из любого активного состояния)                            │
      ▼                                                            │
  cancelled ──── BalanceSM: booking_refund ─────────────────────  │

  [completed] ← в будущем: автоматически после прошедшего слота
```

**Таблица:** `ir_bookings`
**Поле:** `status` ENUM('pending', 'confirmed', 'completed', 'cancelled')
**Поле:** `bookable_type` ENUM('time_slot')

**Переходы:**

| Из | В | Кто | Условие | Побочный эффект |
|----|---|-----|---------|----------------|
| `(new)` | `pending` | Пользователь | `slot.status='free'`, `balance >= cost` | LedgerSM: booking_invoice (пользователь −cost), booking_payment (эксперт +cost) |
| `pending` | `cancelled` | Пользователь | Бронирование активно | LedgerSM: booking_refund (пользователь +cost, эксперт −cost) |
| `confirmed` | `cancelled` | Пользователь | Бронирование активно | LedgerSM: booking_refund |
| `pending/confirmed` | `cancelled` | Модератор | Любое | LedgerSM: booking_refund |

**Связанные переходы в TimeSlotSM:**

При бронировании: если количество активных броней для слота достигает `max_users` → `TimeSlotSM: free → booked`

При отмене: если количество броней опускается ниже `max_users` → `TimeSlotSM: booked → free`

---

## 5. Полная история пользователя

```
ЭТАП 1: Регистрация
AccountSM: unregistered → registered → active

ЭТАП 2: Пополнение баланса
BalanceSM: 0 → N
LedgerSM: +[top_up, credit=1, amount=N]

ЭТАП 3: Выбор слота
UserSM читает: TimeSlotSM.status = 'free'
UserSM читает: ExpertProfileSM.is_approved = 1
UserSM читает: BalanceSM.balance >= TimeSlot.cost

ЭТАП 4: Бронирование
BookingSM: (new) → pending
LedgerSM (пользователь): +[booking_invoice, credit=0, amount=cost]
LedgerSM (эксперт): +[booking_payment, credit=1, amount=cost]
BalanceSM (пользователь): recalculate → balance − cost
BalanceSM (эксперт): recalculate → balance + cost
TimeSlotSM: free → booked (если занято последнее место)

ЭТАП 5a: Консультация состоялась
BookingSM: pending → completed (в будущем, автоматически)

ЭТАП 5b: Отмена
BookingSM: pending/confirmed → cancelled
LedgerSM (пользователь): +[booking_refund, credit=1, amount=cost]
LedgerSM (эксперт): +[booking_refund, credit=0, amount=cost]
BalanceSM (пользователь): recalculate → balance + cost
BalanceSM (эксперт): recalculate → balance − cost
TimeSlotSM: booked → free (если место освободилось)
```

---

## 6. Ограничения (guards)

Переход `(new) → pending` в BookingSM заблокирован если:
- `AccountSM.state = disabled`
- `BalanceSM.balance < TimeSlot.cost`
- `TimeSlotSM.status != 'free'`
- `TimeSlotSM.start_at <= now()` (прошедший слот)
- `ExpertProfileSM.is_approved = 0`
- Уже существует активная бронь (pending/confirmed) на этот слот от этого пользователя

---

## Код

| Операция | Метод | Файл |
|----------|-------|------|
| Бронирование | `post__book()` | `Apps/IRabi/Foreground/Controllers/BookingsController.php` |
| Отмена | `post__cancel()` | `Apps/IRabi/Foreground/Controllers/BookingsController.php` |
| Список броней | `get__main()` | `Apps/IRabi/Foreground/Controllers/BookingsController.php` |
| Пополнение баланса | `post__topup()` | `Apps/IRabi/Foreground/Controllers/BalanceController.php` |
| Форма бронирования | `BookingForm.tsx` | `Front/Islands/Bookings/BookingForm.tsx` |
