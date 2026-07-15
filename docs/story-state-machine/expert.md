# Эксперт — система стейт-машин

## Роль в иерархии

Эксперт — **поставщик услуг**. Он создаёт объекты (`TimeSlotSM`), которые затем становятся мишенями для пользователей. Сам эксперт управляется `ModerationSM` — пока не одобрен, его слоты недоступны пользователям.

```
ModerationSM
     │ одобряет/отзывает ExpertProfileSM
     ▼
ExpertProfileSM
     │
     ▼
TimeSlotSM ◄──── UserSM (бронирует)
     │
     ▼
BalanceSM (эксперт получает оплату)
```

---

## 1. AccountSM (эксперт)

```
[не существует]
      │ регистрация + выбор type=expert
      ▼
  registered
      │ заполняет профиль эксперта (имя, специализация, bio)
      ▼
  profile_created ── ExpertProfileSM создаётся параллельно
      │
      │ IS_APPROVED = 1 (модератором)
      ▼
  approved_expert
      │
      │ IS_DISABLED = 1 (модератором)
      ▼
  disabled
```

**Поля:** `db_accounts_data`: `IS_APPROVED`, `IS_DISABLED`, `type='expert'`

---

## 2. ExpertProfileSM

Отдельная машина профиля эксперта. Существует независимо от аккаунта — создаётся при первом обращении к экспертному разделу.

```
[не существует]
      │ эксперт создаёт первый слот / заполняет профиль
      │ POST /expert/~slots  или  POST /expert/~profileSave
      ▼
  not_approved (is_approved = 0)
      │                            ┌─────────────────────────────┐
      │ Модератор: IS_APPROVED=1   │  Модератор: IS_APPROVED=0   │
      ▼                            │                             │
  approved (is_approved = 1) ──────┘                             │
      │                                                           │
      │ IS_DISABLED = 1 (аккаунт заблокирован)                   │
      ▼                                                           │
  effectively_disabled ─────────────────────────────────────────-┘
```

**Таблица:** `ir_expert_profiles`
**Поле:** `is_approved` TINYINT(1)

**Состояние `approved` открывает:**
- Слоты эксперта отображаются пользователям в каталоге
- Профиль виден на платформе
- Пользователи могут бронировать слоты

---

## 3. TimeSlotSM

Каждый временной слот — отдельный экземпляр машины.

```
[не существует]
      │ POST /expert/~slots (одиночный или пакетный)
      ▼
   free ◄──────────────────────────────────────────────────────┐
      │                                                         │
      │ UserSM бронирует, кол-во броней = max_users            │
      ▼                                                         │
  booked                                                        │
      │                                                         │
      │ UserSM отменяет, кол-во броней < max_users ─────────────┘
      │
      │ время слота прошло (start_at < now)
      ▼
  completed (в будущем — автоматически)
      │
      │ эксперт/модератор отменяет
      ▼
  cancelled
```

**Таблица:** `ir_time_slots`
**Поле:** `status` ENUM('free', 'booked', 'completed', 'cancelled')

**Поля слота:**

| Поле | Тип | Описание |
|------|-----|----------|
| `expert_id` | INT | FK на аккаунт эксперта |
| `start_at` | INT (unix) | Начало |
| `end_at` | INT (unix) | Окончание |
| `duration_min` | INT | Длительность |
| `cost` | INT | Стоимость за место |
| `is_online` | TINYINT | 1=онлайн, 0=офлайн |
| `location` | VARCHAR | Адрес (если офлайн) или ссылка (если онлайн) |
| `max_users` | INT | Вместимость |

**Переходы `free → booked`:**
Автоматически при `BookingSM: (new) → pending`, когда:
```
COUNT(bookings WHERE bookable_id=slot_id AND status IN ('pending','confirmed')) >= max_users
```

**Переходы `booked → free`:**
Автоматически при `BookingSM: * → cancelled`, когда:
```
COUNT(bookings WHERE bookable_id=slot_id AND status IN ('pending','confirmed')) < max_users
```

---

## 4. BalanceSM (эксперт как получатель)

Эксперт **получает** оплату через тот же `BalanceSM` и `LedgerSM`.

```
BalanceSM эксперта: 0
  │ пользователь бронирует слот → booking_payment (credit=1)
  ▼
BalanceSM: + cost
  │ пользователь отменяет → booking_refund (credit=0)
  ▼
BalanceSM: − cost
  │ модератор выводит средства (manual, credit=0) [в будущем]
  ▼
BalanceSM: − withdrawal
```

**Типы ledger-записей для эксперта:**

| entry_type | is_credit | Источник |
|-----------|-----------|----------|
| `booking_payment` | 1 | Пользователь бронирует |
| `booking_refund` | 0 | Пользователь отменяет |
| `manual` | 0 или 1 | Ручная корректировка admin |

---

## 5. Полная история эксперта

```
ЭТАП 1: Регистрация и профиль
AccountSM: unregistered → registered (type=expert)
ExpertProfileSM: (new) → not_approved

ЭТАП 2: Ожидание одобрения
ExpertProfileSM.is_approved = 0
→ слоты создать CAN (но пользователи не видят)

ЭТАП 3: Одобрение модератором
ModerationSM: POST /admin/~setUserFlag {IS_APPROVED: 1}
ExpertProfileSM: not_approved → approved
→ слоты становятся видны пользователям

ЭТАП 4: Создание слотов
TimeSlotSM[1]: (new) → free
TimeSlotSM[2]: (new) → free
TimeSlotSM[3]: (new) → free

ЭТАП 5: Пользователь бронирует слот
BookingSM: (new) → pending
BalanceSM (эксперт): recalculate → + cost
LedgerSM (эксперт): +[booking_payment, credit=1]
TimeSlotSM: free → booked (если последнее место)

ЭТАП 6: Консультация состоялась
TimeSlotSM: booked → completed

ЭТАП 7: Отзыв одобрения (если нарушение)
ModerationSM: POST /admin/~setUserFlag {IS_APPROVED: 0}
ExpertProfileSM: approved → not_approved
→ новые бронирования невозможны
→ существующие бронирования — не затронуты
```

---

## Ограничения (guards)

Переход `TimeSlotSM: (new) → free` заблокирован если:
- `AccountSM.IS_DISABLED = 1`
- `start_at` в прошлом

---

## Код

| Операция | Метод | Файл |
|----------|-------|------|
| Создание слота | `post__slots()` | `Apps/IRabi/Foreground/Controllers/ExpertPanelController.php` |
| Пакетное создание | `post__batchSlots()` | `Apps/IRabi/Foreground/Controllers/ExpertPanelController.php` |
| Просмотр слотов | `get__slots()` | `Apps/IRabi/Foreground/Controllers/SlotsController.php` |
| Профиль эксперта | `get__main()` | `Apps/IRabi/Foreground/Controllers/ExpertController.php` |
