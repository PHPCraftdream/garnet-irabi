# Аудит общих логических ошибок и edge cases — IRabi

Дата аудита: 2026-07-16/18
Область: `D:\dev\garnet\Apps\IRabi` целиком (Common, Dashboard, Foreground, Front, Migrations), исключая `vendor/` и `node_modules/` (сторонний код), за исключением случаев, когда app-код напрямую зависит от конкретного поведения framework-класса — такие места указаны явно.

Фокус аудита: даты/время, null/empty handling, off-by-one, строковое сравнение чисел (loose comparison), дублирование email при регистрации, i18n-интерполяция, enum/статусы как строки, пагинация/сортировка в admin-гридах, copy-paste баги. Вне области: безопасность (инъекции/XSS/auth), бизнес-логика бронирования как таковая, финансовая точность (эти темы покрыты отдельными аудитами — см. `01-legal-compliance.md`, `03-financial-integrity-balance-ledger.md`, `06-performance-scalability.md`, `14-data-integrity-migrations.md`).

---

## Резюме

Кодовая база в целом аккуратна: работа с датами централизована в `Common/System/DateUtils.php` и корректно учитывает часовые пояса пользователей и DST; пагинация и `PageData` во framework-слое защищены от деления на ноль и пустых выборок; PHP loose comparison (`==`) для ID/сумм/секретов в прикладном коде практически не встречается (проект на PHP 8.3, сравнения ID идут через явный `(int)`-каст и `===`); i18n-интерполяция проверена по всем найденным вызовам — расхождений числа плейсхолдеров не найдено; регистрация полагается на `UNIQUE`-индекс с `utf8mb4_unicode_ci` collation в БД, что закрывает как case-insensitive дубли, так и гонку при параллельной регистрации.

Главная находка — **рассинхрон ENUM статусов тикетов поддержки между схемой БД/фронтендом и backend-гейтом валидации** (found in `FwSupportAdminController::VALID_STATUSES` и `DashboardSupportController::getStatusLabels()`): два статуса (`deferred`, `low_priority`) присутствуют в ENUM и полностью реализованы на фронтенде (typescript-типы, рендер, кнопки выбора), но backend отклоняет попытку установить их — то есть в интерфейсе модератора есть нерабочие кнопки. Это единственная находка severity medium; остальные — low, либо стилистические несоответствия без реального пользовательского вреда.

Критических (critical/high) находок не обнаружено.

---

## Находки по severity

### Medium

**M1. Support-тикеты: ENUM-статусы `deferred`/`low_priority` не проходят backend-валидацию, хотя фронтенд их предлагает**

- Файлы:
  - `Common/Tables/SupportTickets.php:19` — ENUM в БД: `'open','investigation','in_progress','waiting_user','waiting_support','escalated','on_hold','deferred','low_priority','resolved','rejected'`
  - `vendor/phpcraftdream/garnet-framework/Bundle/Modules/Support/Controllers/FwSupportAdminController.php:18-21` — `VALID_STATUSES` содержит только 9 из 11 значений (нет `deferred`, `low_priority`)
  - `vendor/phpcraftdream/garnet-framework/Bundle/Modules/Support/Controllers/FwSupportAdminController.php:421` — гейт `if (!$ticketId || !in_array($newStatus, static::VALID_STATUSES, true)) { ... }` реально отклоняет запрос
  - `Dashboard/Controllers/DashboardSupportController.php:100-113` — `getStatusLabels()` тоже не содержит маппинг для этих двух статусов
  - `Front/Islands/Support/supportRenders.tsx:14-15,30-31,45-48`, `Front/Islands/Support/supportTypes.ts:1`, `Front/Islands/AdminPanel/UserDetailPanel.tsx:145-146,160-161` — фронтенд полностью поддерживает оба статуса: TypeScript-тип, CSS-класс, i18n-рендер, и, что важно, список статусов, предлагаемых модератору в выпадающем меню смены статуса тикета (`supportRenders.tsx:45-48`)
- Сценарий воспроизведения: модератор открывает тикет поддержки в админ-панели, в выпадающем списке смены статуса выбирает "Отложено" (`deferred`) или "Низкий приоритет" (`low_priority`) — оба варианта присутствуют в UI и снабжены переводом. Запрос на смену статуса уходит на backend и отклоняется гейтом `VALID_STATUSES` (framework-уровень), так как приложение (IRabi) расширило ENUM в своей миграции, но не синхронизировало framework-константу. Даже если бы гейт этого не делал, `getStatusLabels()` в `DashboardSupportController` не знает про эти статусы и показал бы сырой slug вместо перевода в истории смены статуса.
- Severity: **medium** — не ломает данные и не приводит к падению приложения, но это видимый функциональный баг в интерфейсе, который заказчик почти наверняка обнаружит на приёмке ("кнопка в админке не работает").
- Рекомендация: либо добавить `deferred`/`low_priority` в `VALID_STATUSES` и `getStatusLabels()` (если это платформенная надстройка IRabi, требуется override константы в дочернем классе — на момент аудита `DashboardSupportController` не переопределяет `VALID_STATUSES`), либо убрать эти два статуса из ENUM/UI, если они не должны были попасть в этот релиз.

### Low

**L1. Несогласованная граница "слот уже начался" (`<` vs `<=`) между операциями бронирования и операциями отмены/редактирования**

- Файлы/строки:
  - `<=` (строже, "начинающийся прямо сейчас слот — уже прошлое"): `Foreground/Controllers/ExpertPanel/ExpertBookingsService.php:104` (confirmBooking), `Foreground/Controllers/BookingsController.php:310,499`, `Foreground/Controllers/SlotsController.php:194`
  - `<` (мягче, "начинающийся прямо сейчас слот — ещё будущее"): `Foreground/Controllers/ExpertPanel/ExpertBookingsService.php:163,253,321` (cancelBooking/cancelBookedSlot/cancelSlot), `Foreground/Controllers/ExpertPanel/ExpertSlotsService.php:481,588` (editSlot/deleteSlot), `Foreground/Controllers/ExpertPanel/ExpertHelpers.php:161` (futureOnly)
- Сценарий: если `start_at === time()` (окно в одну секунду), бронирование/подтверждение слота в этот момент уже отклоняется как "прошедшее" (`<=`), но отмена или редактирование того же слота в ту же секунду ещё разрешены (`<`). Реального вреда почти нет (окно в 1 секунду, крайне маловероятно попасть точно в него), но семантика "что считать прошедшим" не унифицирована по кодовой базе — риск при будущем рефакторинге/копировании кода.
- Severity: low.
- Рекомендация: вынести в `DateUtils::isPast(int $ts): bool` единую семантику и использовать её везде, чтобы устранить дрейф между копиями похожего кода.

**L2. Отсутствие нормализации email (trim / невидимые unicode-символы) перед регистрацией**

- Файл: `vendor/phpcraftdream/garnet-framework/Bundle/Modules/Auth/Middlewares/EmailAuthMiddleware.php:327-330` (используется из `Foreground/Middlewares/IrabiAuthMiddleware.php` и косвенно `Foreground/Controllers/RegisterController.php`)
- Сценарий: `$authEmailStr = $authEmail . ''` не делает `trim()` и не фильтрует zero-width/invisible unicode-символы. `' test@mail.com'` (с ведущим пробелом) или `'te​st@mail.com'` (с zero-width space внутри) создаёт отдельный, отличный от `test@mail.com`, аккаунт, поскольку `UNIQUE`-индекс с collation `utf8mb4_unicode_ci` нормализует только регистр букв, но не пробелы и не невидимые символы.
- Важно: сам механизм защиты от race condition при параллельной регистрации и от простого case-insensitive дубля (`Test@mail.com` vs `test@mail.com`) — работает корректно за счёт `UNIQUE`-индекса и `INSERT IGNORE` в БД. Проблема касается только "визуально идентичных, но байтово разных" email.
- Severity: low — редкий и скорее теоретический вектор (обычно требует умышленных действий пользователя), но может привести к недоставке писем на "заляпанный" адрес и путанице в поддержке ("у меня два аккаунта с одинаковым email").
- Рекомендация: добавить `trim()` и фильтрацию непечатаемых/zero-width unicode-символов на входе email до сравнения/вставки.

**L3. `CMDLogTail.php`: определение "сегодня"/"вчера" через implicit server timezone**

- Файл: `Common/Commands/CMDLogTail.php:39-40`
- Сценарий: `date('Y-m-d')` и `date('Y-m-d', time() - 86400)` используют PHP default timezone сервера (не `DateUtils`). Само по себе согласовано с тем, как пишутся имена лог-директорий (тем же способом), поэтому реального рассинхрона нет — но в ночь перевода часов (если серверная TZ поддерживает DST) возможен пограничный сдвиг на ±1 час от истинной календарной границы суток.
- Severity: low — это CLI-инструмент для разработчиков/DevOps, не влияет на пользователей и на бизнес-данные.

**L4. Смешение источников "текущего времени" — `UNIX_TIMESTAMP()` (SQL) и `time()` (PHP) в одном контроллере**

- Файл: `Foreground/Controllers/MainController.php:150` (фильтр `start_at > UNIX_TIMESTAMP()`) vs `MainController.php:78` (`$now = time()`)
- Сценарий: при минимальном рассинхроне часов между app-сервером и db-сервером (даже несколько секунд) один и тот же экран может показать пограничную несогласованность между тем, что уже "прошло", и что ещё "предстоит". Практический риск крайне низкий (обычно NTP держит часы синхронными), но паттерн не документирован как намеренный.
- Severity: low.

**L5. Хардкод английского сокращения `'%d min'` в письмах независимо от языка получателя**

- Файл: `Common/Services/EmailNotifications.php:169,244,264,288,316`
- Сценарий: пользователь с русской локалью получает письмо о бронировании, где все подписи локализованы, а длительность слота отображается как `"45 min"` вместо `"45 мин"`.
- Severity: low — косметический огрех локализации, не логическая ошибка.

**L6. Пагинация: нет server-side clamp запрошенной страницы к фактическому количеству страниц**

- Файл: `vendor/phpcraftdream/garnet-framework/Bundle/Utils/PaginationHelper.php:64-80`, `Kernel/Db/Tables/PageData.php:26`
- Сценарий: если между запросом списка и повторным открытием той же страницы данные изменились (удаление строк, смена фильтра), а клиент всё ещё передаёт устаревший `page=5` — offset считается от исходного номера страницы без клэмпа к последней валидной странице; в ответ приходит пустой список при формально валидном (уже меньшем) `totalPages`. UI обычно сам корректируется, но гарантии на сервере нет.
- Severity: low — не приводит к падению, только к пустому экрану до ручной/клиентской коррекции номера страницы.

---

## Проверено — без находок

### Даты и время
- `Common/System/DateUtils.php` — реализация корректна: использует `DateTime`+`DateTimeZone` с явным резолвом таймзоны пользователя и fallback на UTC; `startOfDayAfterTomorrowForUser` специально документирован и реализован через относительные модификаторы DateTime (`tomorrow +1 day`), а не через `+86400`, что корректно на DST-переходах.
- Все точки использования `DateUtils::` (Common/Services, Foreground/Controllers, Dashboard/Controllers) — таймзона пользователя передаётся явно, прямой арифметики поверх результата не найдено.
- `Common/Services/AppCronService.php` — дедупликация cron-логов по UTC-полуночи (`$now - ($now % 86400)`), UTC не имеет DST — корректно.
- `Common/Services/EmailNotifications.php` — throttle-окна на константах (3600/86400 сек), рендер времени слота — через `DateUtils::formatForUser`.
- `Common/Services/BookingChatNotifier.php`, `Common/Services/CronCompletionService.php` — таймстампы сравниваются как int, границы завершения слотов/броней последовательны.
- `Common/Services/NewsService.php` — TTL ленты через простой `time() - const`, не привязан к календарным границам — DST не влияет.
- `Dashboard/Controllers/DashboardInviteTokensController.php` — проверки TTL токена (`expires_at > :now` активен / `expires_at <= :now` истёк) взаимно дополняют друг друга без зазора и без пересечения на границе.
- `Dashboard/Controllers/DashboardMainController.php`, `Foreground/Controllers/ExpertPanel/ExpertDashboardService.php` — границы месяца/дня построены через цепочку `DateUtils::startOf*ForUser`, без сложения секунд.
- `mktime()` — не используется нигде в прикладном коде проекта. `strtotime()` — единственное использование в dev-only `DevSeedService.php` (не прод-путь).
- Строковое сравнение дат в формате, зависящем от локали/паддинга (`'2026-1-5' < '2026-1-10'`) — паттерн не встречается: все даты либо unix-timestamp (int), либо парсятся через `DateUtils`/`DateTime::createFromFormat` с фиксированным форматом.

### Null/empty handling и off-by-one
- Поиск `codeInputTries` — термин из ТЗ в проекте не встречается; механизма счётчика попыток ввода OTP/verification-кода в IRabi нет (таблица `EmailAttempts` — framework-механизм ретраев доставки email, не связана со счётчиком попыток пользователя).
- Nullable FK-колонки (`assignee_id`, `actor_id` и т.п.) — везде используется `?? default` либо гарантированное заполнение при INSERT; случаев, где `(int)null === 0` тихо подменяет валидный ID, не найдено.
- `Common/PaginationHelper.php` (app-обёртка) — тонкая прокладка над framework-классом, `PaginationHelper::readPageParams()` во framework-слое клэмпит `page < 1` → 1, `perPage` в допустимый диапазон — деления на ноль или отрицательного offset не происходит.
- `PageData` (framework) — при `pageSize > 0 ? ceil(...) : 1` гарантирует `pagesCount >= 1` даже для пустой выборки.
- `DashboardEntityHistoryController.php` — `limit`/`offset` клэмпятся (`max(1, min(500, ...))`, `max(0, ...)`).

### Loose comparison / сравнение секретов
- PHP-версия проекта — 8.3 (см. CI-конфиг), актуальное поведение числовых/строковых сравнений.
- Реальных `==`/`!=` (не `===`/`!==`) для ID, сумм, хэшей или кодов в прикладном коде не найдено — все найденные по grep совпадения оказались либо строгими сравнениями, либо SQL-литералами (`WHERE status != 'cancelled'`).
- Отдельного механизма email/phone OTP с сравнением секретного кода в IRabi нет; ближайший аналог (invite-токены) обрабатывается во framework-слое, вне периметра аудита.

### Enum/статусы
- `bookings.status` (`pending/confirmed/cancelled/completed`) и `time_slots.status` (`free/booked/completed/cancelled`) — все точки использования в контроллерах и сервисах точно соответствуют ENUM в миграциях, опечаток не найдено.
- `CronCompletionService.php:50` использует устойчивый паттерн `NOT IN (известные статусы)` вместо перечисления допустимых — не ломается при добавлении новых статусов.
- Все найденные `switch`/`match` по статусам, кроме описанного в M1 случая, содержат `default`/fallback.

### Дублирование email/регистрация
- `Foreground/Controllers/RegisterController.php`, `UsersController.php`, `UserProfileController.php`, `Common/Entity/Account/Account.php` не содержат собственной логики создания аккаунта — делегировано framework middleware.
- `login` (email) — read-only после регистрации, других write-путей на изменение нет.
- `UNIQUE`-индекс на `accounts.login` с collation `utf8mb4_unicode_ci` — реально защищает от case-insensitive дублей и от гонки при параллельной регистрации (через `INSERT IGNORE`).

### i18n-интерполяция
- Все найденные вызовы `t->Key(args)` / `FwI18n::t()` / `ForegroundI18n::t()` в PHP-коде — число плейсхолдеров в RU/EN переводах совпадает с числом переданных аргументов.
- `GarnetI18n::tr()` вызывает `sprintf` только при непустом `$args`, что предотвращает случайный `ValueError` при отсутствии аргументов; отсутствие ключа перевода деградирует мягко (лог + fallback на сам id ключа), не крашит.
- Динамически формируемых ключей перевода (`$t->{$var}()`) в PHP-коде не обнаружено.

### Admin-гриды: пагинация/сортировка
- Все проверенные `ORDER BY` в Dashboard-контроллерах используют хардкод имён колонок — клиентский параметр сортировки нигде не подставляется напрямую в SQL, поэтому "несуществующая колонка ломает сортировку" структурно невозможна в текущей реализации; `sortFields` в `GridConfig` — чисто фронтендовая метаинформация.
- `DashboardLogsController.php`, `DashboardMailLogController.php`, `DashboardRequestLogController.php` — реальная выборка идёт через framework viewer с фиксированным `LIMIT` без клиентского OFFSET.

### Copy-paste баги между похожими контроллерами
- `UserCancellations` / `ExpertCancellations` обрабатываются единой параметризованной функцией `buildCancellationsPayload($kind, ...)` (`DashboardBookingsController.php:513-528`) — дублирования нет по построению.
- `BookingsController::post__cancel` (пользователь) vs `ExpertBookingsService::cancelBooking/cancelBookedSlot/cancelSlot` (эксперт) — построчно сверено; асимметрия в расчёте возврата средств (штраф для пользователя при отмене подтверждённой брони, 100% возврат при отмене экспертом) — задокументированное бизнес-решение, не баг.
- `ImController.php` vs `SupportController.php`/`DashboardSupportController.php` — не classic copy-paste пара: оба переопределяют абстрактные методы разных framework-контроллеров, собственного дублирующегося кода между ними мало.
- `DashboardUsersController.php:339-461` (расчёт контрагента в ledger для user/expert) — логика `$userId === $accountId` применяется консистентно во всех трёх циклах обработки.
- Условие `booked_count >= max_users` в `BookingsController.php:432` и `SlotsController.php:410` — идентично в обоих местах и корректно (порог заполнения слота).

---

## Итоговая рекомендация перед поставкой

Единственная находка, которую стоит исправить до передачи заказчику — **M1** (нерабочие статусы `deferred`/`low_priority` в админке поддержки): это видимый функциональный дефект, который легко всплывёт на приёмочном тестировании. Остальные находки (L1–L6) — низкий приоритет, можно включить в backlog пост-релизных доработок.
