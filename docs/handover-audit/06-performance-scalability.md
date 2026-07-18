# Аудит производительности и масштабируемости IRabi

Дата: 2026-07-17.
Область: `D:\dev\garnet\Apps\IRabi` целиком (контроллеры, сервисы, таблицы, миграции, cron, фронтенд-сборка) + используемые приложением участки фреймворка `D:\dev\garnet\garnet-framework` (они исполняются в каждом запросе IRabi, поэтому включены в оценку).
Метод: чтение реального кода и SQL, без запуска и без изменений.

---

## Резюме

Приложение корректно устроено на малых объёмах: почти все таблицы имеют индексы под свои запросы, письма уходят через очередь с батчем и ретраями, гриды админки в основном пагинированы, тяжёлые островки (админ-панель) вынесены в отдельные lazy-чанки. Однако есть **три системные проблемы, которые сработают первыми при росте**:

1. **`Account::getAccounts(accountDataFields: ...)` делает полный скан всей EAV-таблицы `accounts_data` при каждом вызове** — даже когда запрашивается один аккаунт. Этот вызов зашит в горячие пути: листинг слотов, бронирование (внутри цикла по слотам!), проверки прав в чате, дашборды. Это главная бомба масштабирования.
2. **Счётчик непрочитанных сообщений (`ImReadStatus::getUnreadCountForUser`) — N+1 по диалогам и выполняется дважды на каждый рендер каждой HTML-страницы** (utility-блок + support-виджет в layout), плюс поллинг `/~counts` каждые ~20 сек из каждой вкладки.
3. **Паттерн «загрузить ВСЕ слоты эксперта целиком, чтобы получить их id»** повторён минимум в 8 местах (меню, дашборд эксперта, превью профиля, чат) — при эксперте с тысячами слотов каждый рендер страницы гоняет мегабайты из БД.

Счётчики профилей действительно считаются агрегатами «на лету» при каждом просмотре (пункт 3 задания подтверждён), но под ними есть индексы — до ~100k броней это терпимо; критичнее пункты выше.

Ретеншена данных нет вообще: логи (файловые и табличные), `mail_log` с LONGTEXT-телами писем, `news_events`, `im_messages`, `entity_history` растут бесконечно; `clear-logs` доступен только в тест-режиме.

---

## Находки по приоритету

### P0 — чинить до передачи заказчику

#### P0-1. Полный скан EAV-таблицы `accounts_data` при каждом вызове `Account::getAccounts(accountDataFields:)`

- Файл (фреймворк, исполняется приложением): `D:\dev\garnet\garnet-framework\Kernel\Db\Entity\Account\DbAccountData.php`, строки 31–33 — `getAllUsersData()` начинается с `DbAccountData::get()->selectAll();` **без WHERE вообще**: вся таблица EAV читается в PHP-память, фильтрация по `param` и склейка делаются в цикле.
- `Account::getAccounts()` (`Account.php:522–548`) вызывает это всякий раз, когда передан `accountDataFields` — даже если в `selectCallback` стоит `WHERE id = ?` на один аккаунт.

Точки вызова в IRabi (все — горячие):

| Место | Файл/строка | Когда исполняется |
|---|---|---|
| `UserEntityConfig::getApprovedExpertIds()` | `Foreground\Params\UserEntityConfig.php:141` | каждый показ `/slots` и главной (`MainController`) |
| `UserEntityConfig::isApprovedActiveExpert()` | там же, :279 | **внутри цикла по слотам** в `SlotsController::post__book` (:283), в `post__bookData`, `BookingsController::post__book:341`, `ImController::canMessage` (2 раза за отправку сообщения) |
| `UserEntityConfig::accountRankLevel()` / `actorMayActOn()` | там же, :233 | каждая админ-операция над пользователем |
| `MainController::get__main` (модераторская ветка) | :312, :327 | каждый показ главной модератору |
| `ImController::searchRecipients` | :241 | каждый поиск получателя в чате |
| `DashboardMainController::fetchPendingApprovals` | :71 | каждый показ админ-дашборда |
| `DashboardUsersController::fetchUsers` | :41 | каждый показ грида пользователей |
| `DashboardFinanceController::fetchBalances` | :240 | каждый показ балансов |

Оценка: при 1 000 аккаунтов × ~4–6 EAV-строк = 4–6 тыс. строк на вызов; при 10 000 аккаунтов — 40–60 тыс. строк **на каждый вызов**. Бронирование 10 слотов = 10 вызовов `isApprovedActiveExpert` = до 600 тыс. строк, перекачанных из MySQL в PHP за один POST. На главной модератора — два таких вызова подряд. Время ответа деградирует линейно с числом пользователей, память PHP-процесса — тоже.

Рекомендация:
- В `getAllUsersData()` добавить `WHERE param IN (...)` и, для одиночных аккаунтов, `WHERE account_id IN (...)` (индекс `login (account_id, param)` уже есть; для выборки по param добавить индекс `param` или `(param, value)`).
- Для `isApprovedActiveExpert` сделать точечный запрос: `SELECT ... FROM accounts_data WHERE account_id = ? AND param IN ('IS_APPROVED','IS_DISABLED')` — 1 запрос на 2 строки вместо полного скана.
- `getApprovedExpertIds()` — заменить на один JOIN-запрос и/или кэшировать результат в per-request static (в одном запросе он нужен и `SlotsController::get__main`, и меню).

#### P0-2. N+1 в счётчике непрочитанных IM + двойной пересчёт на каждый рендер страницы

- Фреймворк: `D:\dev\garnet\garnet-framework\Bundle\Modules\Messaging\Tables\FwImReadStatus.php:63–88` — `getUnreadCountForUser()`: выбирает ВСЕ диалоги пользователя, затем **в цикле по каждому диалогу делает 2 запроса** (read-status + `COUNT(*)` непрочитанных). Итого `1 + 2N` запросов, где N — число диалогов.
- Приложение вызывает его на **каждый** рендер HTML-страницы дважды: `D:\dev\garnet\Apps\IRabi\IRabi.php:437` (`buildUtilityData`) и `:462` (`buildSupportWidget`) — оба входят в `DEF_LAYOUT_PARAMS` (:560–628), т.е. в layout любой страницы. Плюс `MainController::get__main:83` и поллинг `MainController::get__counts` (каждые ~20 сек из каждой открытой вкладки).

Оценка: пользователь со 100 диалогами → ~201 запрос × 2 = **~400 SQL-запросов на каждый просмотр любой страницы** и ещё ~200 каждые 20 секунд на вкладку. При 200 онлайн-пользователях поллинг один даёт тысячи запросов в секунду.

Рекомендация: один агрегатный запрос —
```sql
SELECT COUNT(*) FROM im_messages m
JOIN im_conversations c ON c.id = m.conversation_id
LEFT JOIN im_read_status rs ON rs.conversation_id = c.id AND rs.account_id = :uid
WHERE (c.participant_a = :uid OR c.participant_b = :uid)
  AND m.sender_id != :uid
  AND m.id > COALESCE(rs.last_read_message_id, 0)
```
(индексы `conv_created` и `conv_account` уже есть). Дополнительно: считать один раз за запрос и переиспользовать между utility-блоком и support-виджетом (сейчас — два независимых пересчёта одного и того же).

#### P0-3. «Все слоты эксперта целиком ради списка id» — на каждый рендер страницы

Паттерн `TimeSlots::get()->selectByField('expert_id', $id)` без LIMIT и без проекции колонок (тянутся все поля, включая `location` VARCHAR(255)), только чтобы собрать `array_column(..., 'id')` и подставить в `bookable_id IN (...)`:

- `Foreground\Params\Menu.php:118` — `expertPendingBookingsCount()`: вызывается из `Menu::main()`, т.е. **на каждом рендере каждой страницы у эксперта**, и из поллинга `/~counts` каждые 20 сек.
- `Foreground\Controllers\MainController.php:230` — pending-счётчик главной.
- `Foreground\Controllers\ExpertPanel\ExpertDashboardService.php:53`.
- `Foreground\Controllers\ExpertPanel\ExpertHelpers.php:64` и `:93` — `buildPendingBookingsList` и `buildConfirmedBookingsList` каждый сам заново выбирает все слоты (на дашборде эксперта суммарно 3 полных выборки слотов за запрос).
- `Foreground\Controllers\ExpertPanel\ExpertBookingsService.php:36` — страница бронирований эксперта (здесь дополнительно тянутся ВСЕ брони по всем слотам за всю историю, без пагинации, и полный набор слотов уходит в JSON пропсов островка).
- `Foreground\Controllers\UsersController.php:87–90` — `post__preview`: все слоты эксперта ради двух COUNT.
- `Foreground\Controllers\ImController.php:163` и `:260` — проверка «мой студент» и поиск получателей.

Оценка: эксперт, работающий год с ~30 слотами в неделю → ~1 500 слотов; каждый его page view = выборка 1 500 полных строк + `IN (1500 id)`; при 10 000 слотов — заметные десятки миллисекунд на запрос и рост трафика к БД, умноженные на поллинг. Кроме того `IN` со списком в тысячи id раздувает SQL-текст и план.

Рекомендация: заменить на JOIN (как уже сделано в `ExpertController::get__main:99–116` — там счётчики считаются одним `INNER JOIN`-COUNT, это правильный образец), либо подзапрос `bookable_id IN (SELECT id FROM time_slots WHERE expert_id = ?)` (как в `BookingsController::bookingsWhereCallback:63–68`). Для меню-badge — кэшировать значение в сессии на 20–60 сек.

### P1 — исправить в первую волну после (или вместе с) P0

#### P1-1. N+1 в цикле валидации бронирования нескольких слотов

`Foreground\Controllers\SlotsController.php:269–296` (`post__book`): `foreach ($slotIds as $slotId)` и внутри тела цикла — `TimeSlots::selectOneByField('id', $slotId)` (:270), затем `Bookings::selectAll(...)` «уже забронировано?» (:298–305), затем `isApprovedActiveExpert()` (:283, см. P0-1). Итого ≥3 запроса на слот, один из которых — полный скан EAV.

Оценка: бронирование 10 слотов = 30+ запросов + 10 EAV-сканов; при 20 слотах вдвое больше. Функционально дубли всё равно ловятся UNIQUE `active_dup_key`, так что pre-flight можно сделать батчем без потери корректности.

Рекомендация: одна выборка `TimeSlots::selectByIds($slotIds)`, одна выборка активных броней `WHERE user_id=? AND bookable_id IN (...) AND status IN ('pending','confirmed')`, одна батч-проверка одобренности экспертов по уникальным `expert_id`.

#### P1-2. `/slots` (календарь): неограниченные выборки и неограниченный JSON-пейлоад

`Foreground\Controllers\SlotsController.php:66–116` (`get__main`):
- вся история броней пользователя за всё время (все статусы, без LIMIT) — :67;
- все его отмены (без LIMIT) — :85;
- все свободные слоты всех одобренных экспертов на 4 недели **плюс** все когда-либо забронированные им слоты (`OR id IN (...)` — прошлые и отменённые тоже), без LIMIT — :95;
- всё это сериализуется в пропсы островка `slots-calendar` (server-rendered JSON в HTML).

Оценка: 100 экспертов × 50 будущих слотов = 5 000 строк + история пользователя; HTML-страница раздувается до мегабайт, время рендера и трафик растут линейно с числом экспертов. При 10 000 слотов в окне страница станет практически неоткрываемой.

Рекомендация: отдавать календарь постранично/понедельно через AJAX; историю пользователя ограничить окном календаря; `bookedSlotIds` в `WHERE ... OR id IN (…)` строится строковой конкатенацией — при большой истории ломает и план, и размер SQL.

#### P1-3. Агрегаты профилей считаются на каждый просмотр, кэша/денормализации нет

- `Foreground\Controllers\UserProfileController.php:70–90` — 4 × `COUNT(*)` (+2 выборки аккаунта/профиля) на каждый просмотр профиля пользователя.
- `Foreground\Controllers\MainController.php` `get__profile:409–424` — те же 4 COUNT.
- `Foreground\Controllers\UsersController.php` `post__preview:93–160` — 5–6 COUNT + полная выборка слотов (см. P0-3); эндпоинт дергается из всплывающих превью, т.е. частота выше, чем у страницы профиля.
- `Foreground\Controllers\ExpertController.php:80–116` — 2 COUNT по `expert_cancellations` + 2 COUNT c JOIN по всем броням эксперта.

Смягчает: под всеми COUNT есть индексы (`bookings.user_status`, `user_cancellations.user_kind`, `expert_cancellations.expert_kind` из M_0007, `bookings.bookable`), поэтому каждый COUNT — index range scan. До ~100k броней это единицы миллисекунд.

Оценка: при 10 000 броней у эксперта JOIN-COUNT'ы становятся ощутимыми (десятки мс), а превью — 6 запросов на каждое наведение. Совокупно с P0-2/P0-3 профильные страницы — самые «дорогие» GET'ы приложения.

Рекомендация: либо денормализованные счётчики на аккаунте (инкремент в местах записи `user_cancellations` / `expert_cancellations` / смены статуса брони), либо кэш на 1–5 минут (счётчики некритичны к свежести). `WorkDir/FileCache` существует и пуст — механизм есть, не используется.

#### P1-4. Чат: N+1 при обогащении списка диалогов и полный скан при поиске получателей

- `Foreground\Controllers\ImController.php:72–93` — `enrichConversation()` вызывается фреймворком для каждого диалога списка: 4+ запроса на диалог (expert_profile, `resolveDisplayNames` = 2–3 запроса, аккаунт, `disabledIds`). 50 диалогов ≈ 200+ запросов на открытие `/im/`.
- `:235–338` — `searchRecipients()`: ВСЕ аккаунты с EAV (P0-1), ВСЕ expert_profiles, все слоты и брони эксперта; фильтрация и поиск по имени — в PHP. Выполняется на каждый ввод в поиске получателя.

Рекомендация: батч-обогащение (собрать `partner_id` всех диалогов и сделать по одной выборке на таблицу — так уже сделано в `CommentsController:54` и `BookingsController::buildAuxMaps`); поиск получателей — `WHERE name LIKE ? LIMIT 20` + точечные проверки ролей.

#### P1-5. Отсутствующие индексы (по фактическим WHERE в коде)

Проверены все `Migrations/Items/*.php` и `init()` всех таблиц (включая Fw-родителей). Существенные пробелы:

| Таблица | Запрос в коде | Чего не хватает |
|---|---|---|
| `bookings` | `WHERE created_at >= ?` — `DashboardMainController:108`, `MainController:341` («брони за месяц») | индекса `created_at` → сейчас full scan `bookings` на каждый показ админ-дашборда и главной модератора. При 100k броней — сотни мс |
| `balance_ledger` | `WHERE entry_type = 'booking_payment' AND created_at >= ?` — `DashboardMainController:113` («выручка за месяц») | индекса `created_at` (или `(entry_type, created_at)`) → full scan леджера на каждый показ админ-дашборда |
| `accounts_data` (фреймворк) | `WHERE param IN ('IS_ADMIN','IS_OWNER','IS_MODERATOR') AND value='1'` — `EmailNotifications::getModeratorRecipients:224`; `WHERE param='IS_DISABLED' AND account_id IN (...)` — `AccountDisplay:31` | индекса с ведущим `param` (например `(param, value)`); существующий UNIQUE `(account_id, param)` подзапрос по param не покрывает |
| `news_events` | лента: `(audience_type, audience_id)` + `created_at > ?` + `NOT IN (news_reads)` — `FwNewsService::getFeed/getUnreadCount` | композита `(audience_type, audience_id, created_at)`; сейчас отдельные индексы, при сотнях тысяч событий MySQL будет выбирать один и до-фильтровывать |
| `cron_log` | `WHERE task_name=? AND status=? AND created_at>=?` — `AppCronService::hasSuccessLogToday` | композит `(task_name, status, created_at)` желателен, но частота — раз в минуту, некритично |

Без находок (индексы на месте): `bookings.user_id/user_status/bookable` + UNIQUE `active_dup_key` (M_0002); `time_slots.expert_status/status_start`; `user_cancellations.user_kind` и `expert_cancellations.expert_kind` (M_0007); `im_messages.conv_created`; `im_conversations.pair`; `im_read_status.conv_account`; `email_queue.status/next_attempt_at`; `mail_log.*`; `entity_history.entity/created_at`; `admin_action_log.*`; `news_reads/news_archived UNIQUE(account_id,event_id)`; `balance_ledger.uq_idempotent` (M_0010) и `uq_ledger_ref`; `email_throttle UNIQUE(account_id,category)` (M_0008); `sys_log_throttle UNIQUE(ip)` (M_0011); `support_tickets.status_assignee/updated_at`; `comments.entity_created`.

#### P1-6. Админ-панель: неограниченные выборки «всего» (full table scans)

- `DashboardUsersController::fetchUsers` (:38–55) — ВСЕ аккаунты со всеми полями + полный EAV (P0-1), без пагинации; весь массив уходит в JSON-пропсы грида. При 10 000 пользователей — мегабайты HTML/JSON и секунды рендера на каждое открытие `/admin/`.
- `DashboardFinanceController::fetchBalances` (:237–241) — все строки `account_balance` без LIMIT + аккаунты + EAV.
- `DashboardInviteTokensController::post__list` (:35–53) — все токены без LIMIT (`LIKE '%...%'` — скан, приемлемо для токенов, но список не ограничен).
- `DashboardMainController::fetchPendingApprovals` (:71–90) — все аккаунты-эксперты + EAV, фильтрация в PHP.

Рекомендация: серверная пагинация через уже существующий `PaginationHelper::fetchPage` (используется же в bookings/comments/entity-history) и SQL-фильтр `IS_APPROVED` вместо PHP-фильтрации.

### P2 — эксплуатационные риски (диск/деградация со временем)

#### P2-1. Нет ротации и ретеншена — логи и почта растут бесконечно

- **Файловые логи**: `WorkDir/LogJournal/{Errors,System,Routes}/<дата>/...` — новая директория на каждый день (в рабочей копии уже директории с 2026-05-12). Записываются на каждый запрос: `IRabi.php:288–358` (`logRouteRequest`, JSON-строка на любой не-статический запрос) + публичный `/sys/log` (`SysLogController`, до 60 записей/мин с IP). Единственный механизм очистки — `CMDClearLogs`, который **работает только в TEST MODE** (`CMDClearLogs.php:35–39`), т.е. в проде недоступен. Диск заполнится — вопрос времени.
- **Табличные логи без чистки**: `mail_log` (+`body_html LONGTEXT` каждого письма!), `email_queue` (тоже LONGTEXT, отправленные строки не удаляются), `email_attempts`, `entity_history`, `admin_action_log`, `cron_log`, `js_errors`, `im_messages`, `news_events`/`news_reads`/`news_archived` (лента фильтруется TTL 90 дней — `FwNewsService::FEED_TTL_SEC`, но строки старше TTL **никогда не удаляются**), `idempotency_keys`, `sys_log_throttle`.

Оценка: 1 000 писем/день × ~30–60 КБ HTML = 30–60 МБ/день только в `mail_log` + столько же в `email_queue`. За год — десятки ГБ, бэкапы и `SELECT *` админки деградируют.

Рекомендация: cron-задача ретеншена (по образцу уже имеющихся задач в `AppCronService::registerTasks`): удалять `email_queue.status='sent'` старше N дней, чистить `body_html` в `mail_log` старше N дней, удалять `news_events` старше `FEED_TTL_SEC`, `cron_log`/`js_errors`/`request`-журналы старше 30–90 дней; для файловых журналов — удаление датированных директорий старше N дней (структура «директория = день» делает это тривиальным).

Смягчения, которые уже есть (без находок): `AppCronService::runWithLogging` подавляет no-op-heartbeat'ы cron_log до 1 записи в сутки (:120–134); request-лог пропускает `/assets/`, `/upload/`, `/~counts` и Playwright-трафик; `/sys/log` ограничен 60 зап/мин с IP и 1 КБ на запись.

#### P2-2. `/sys/log` — 2 SQL-запроса на каждый вызов публичного эндпоинта

`SysLogController::isRateLimited` (:118–137): upsert + select на каждый breadcrumb, эндпоинт без аутентификации. Троттлинг защищает диск, но не БД: 60 зап/мин × M IP-адресов всё равно бьют в MySQL. Приемлемо сейчас; при абьюзе перенести окно в APCu/локальный файл или возвращать `cnt` из самого upsert (`... cnt = LAST_INSERT_ID(cnt+1)`), сэкономив второй запрос.

#### P2-3. Мелкие N+1 и лишние запросы

- `CronCompletionService::completeExpired` (:20–33) — UPDATE по одному слоту в цикле (до 500 UPDATE за прогон) вместо одного `UPDATE ... WHERE id IN (...)`; брони при этом обновляются батчем — образец рядом.
- `FwNewsService::markRead` (:206–214, фреймворк) — INSERT на каждый event id в цикле; `markReadAll` при этом сделан правильно одним `INSERT ... SELECT`.
- `MainController::get__main:203–224` — COUNT броней на каждый из 3 ближайших слотов эксперта (3 лишних запроса; есть готовое поле `booked_count` в слоте после M_0012 — можно читать его).
- `ExpertDashboardService:100–110` — то же для 5 слотов.
- `EmailNotifications::gate()` — 2 запроса (prefs + throttle) на каждого получателя рассылки модераторам; при нынешнем числе модераторов неважно.
- `BookingsController::computeCounts` (:100–120) — 7 COUNT-запросов (каждый с подзапросом по слотам) на каждую страницу/перелистывание списка броней. Индексы есть; можно свернуть в один `GROUP BY status`.
- `IRabi.php` layout: `buildUtilityData` + `buildSupportWidget` + `Menu::main` вместе дают на каждый HTML-рендер ~8–12 фоновых запросов ещё до контроллера (балансы, unread×2, badge эксперта) — кандидаты на объединение/кэш в рамках P0-2/P0-3.

### P3 — фронтенд-сборка

Факт: реально подключаемая сборка — `Public/assets/irabi/` (пути захардкожены в `Foreground/ForegroundJsGen.php`: `/assets/IRabi/gen/js/...`), суммарно **~1,73 МБ JS (несжатых) в 49 файлах** + `framework.css` 236 КБ + `gridtable` 190 КБ и vendor-react 141 КБ из `assets/framework/`.

- **P3-1. Мёртвая сборка `Public/assets/app-irabi/` (~3 МБ, 56 файлов)** — на неё нет ни одной ссылки в PHP (единственное упоминание `app-irabi` — имя директории кода в `docs/deploy.md:31`); это артефакт старого `public_name`. Лежит в docroot, попадает в деплой и бэкапы. Удалить из поставки.
- **P3-2. Все 48 async-чанков префетчатся в `<head>` каждой страницы** — `ForegroundJsGen::commonChunks()` (полный список из 48 URL) подключается как `prefetch_js_assets` в `IRabi.php:619`. Это ~1,6 МБ префетча на первый визит любой страницы, включая мобильные. Prefetch низкоприоритетен, но трафик ест. Рекомендация: префетчить только 3–5 чанков, общих для реальных навигаций, остальное оставить on-demand.
- **P3-3. Чанк `1493.*.gen.js` — 360 КБ**: содержит полную сборку Zod (все `ZodISODate`, `ZodTemplateLiteral` и т.д.) + иконки lucide. Zod целиком — тяжёлая цена за клиентскую валидацию; рассмотреть `zod/mini` или точечные схемы. Чанк `6656.*.gen.js` — 221 КБ: **весь i18n-каталог всех островов одним чанком**, грузится везде; при росте переводов растёт линейно — стоит разрезать по островам.
- **P3-4. Дублирование между `assets/irabi` и `assets/framework`** — vendor-react/vendor-other вынесены отдельно (хорошо), но `gridtable` (190 КБ) грузится и в админ-гридах, и в пользовательских страницах через общий layout `js_assets` — проверить, нужен ли он вне админки.
- Без находок: острова админки (`user-detail` и др.) — отдельные lazy-чанки, в общий бандл не входят; entry `foreground.foreground` скромные 93 КБ; хэшированные имена → долгий кэш браузера; `build_id` корректно инвалидирует SPA-навигацию после деплоя.

### Кэширование (пункт 6 задания) — сводка

- `WorkDir/TwigCache` — используется (152 КБ скомпилированных шаблонов). ОК.
- `WorkDir/FileCache` — **пуст, не используется ни одним кодом приложения**. Готовое место для кэшей из P0-3/P1-3.
- Повторяемые тяжёлые вычисления без кэша: `getApprovedExpertIds()` (P0-1), unread-счётчики (P0-2), badge эксперта (P0-3), счётчики профилей (P1-3), `getModeratorRecipients()` (скан EAV при каждом тикете/ответе). Статические страницы (`getPublishedPageBySlug`) — 2 лёгких индексных запроса на рендер лендинга, кэш не обязателен.

### Email/cron (пункт 7 задания) — сводка

Без критических находок: отправка **не** синхронная в HTTP-запросе — все нотификации идут через `FwEmailQueueService::enqueue/enqueueToMany` в таблицу `email_queue`, реальная отправка — cron-задача `email-queue` с батчем `processQueue(50)` и ретраями (`attempts/max_attempts/next_attempt_at`, индексы есть). Массовые адресаты сейчас только модераторы (мало). Замечания: (а) 50 писем/прогон — при минутном cron максимум ~72k писем/сутки, для текущих объёмов достаточно, лимит конфигурируем вызовом; (б) внутри `processQueue` SMTP-отправка последовательная без паузы — при переходе на массовые рассылки добавить троттлинг на провайдера; (в) отправленные строки из очереди не удаляются (см. P2-1).

---

## Проверено — без находок

- **Атомарность бронирования не куплена ценой блокировок**: `TimeSlots::reserveSeat/releaseSeat` — одиночные CAS-UPDATE, UNIQUE `active_dup_key` (генерируемая колонка, M_0002) и `uq_ledger_ref`/`uq_idempotent` (M_0010) — корректный и дешёвый для БД дизайн.
- **Пагинация**: списки броней (`BookingsController`, 20/стр), админ-гриды bookings/slots/cancellations/comments/finance-ledger (limit 300)/entity-history/mail-log, лента новостей (`FwNewsService::getFeed` — count+page), баланс-история юзера (лимиты `DEFAULT_PER_PAGE`), user-search в админ-бронях (limit 500) — на месте.
- **Батчинг вместо N+1 в большинстве списков**: `CommentsController:54`, `BookingsController::buildAuxMaps`, `MainController` (upcoming/recommended), `SlotsController::get__main` (эксперты одной выборкой), `NewsService::resolveDisplayNames`, `ExpertHelpers::hydrateBookingsList`, `DashboardMainController::fetchRecentActivity`, `DashboardInviteTokensController` (создатели одной выборкой) — сделаны правильно, по 1 запросу на таблицу.
- **Индексное покрытие** основных таблиц (см. таблицу в P1-5, колонка «без находок»).
- **`AccountBalance`**: чтение баланса — одна строка по UNIQUE `account_id`; `recalculate` — один `INSERT ... ON DUPLICATE` с SUM по индексу `account_id`. Масштабируется до сотен тысяч строк леджера на аккаунт.
- **Cron-задачи** ограничены лимитами (`processQueue(50)`, `completeExpired(500)`, `disableStale(500)`) — прогоны не разрастаются с объёмом данных; `hasSuccessLogToday` предотвращает флуд cron_log.
- **Request-лог** — асинхронного вида append в файл (не в БД), со скипами статики/поллинга; `/js-error` дедуплицируется по сигнатуре; `/sys/log` рейт-лимитирован.
- **Фронтенд**: lazy-загрузка островов админки, контент-хэши в именах файлов, разделение vendor-react/vendor-other, `build_id`-инвалидация.
- Файловая структура `WorkDir` (Upload/Backups/Snapshots) — вне горячего пути, объёмы малые.

## Приоритетный план (что чинить в первую очередь)

1. **P0-1** — WHERE в `getAllUsersData` + точечный `isApprovedActiveExpert` (убирает EAV-сканы из бронирования и листингов).
2. **P0-2** — один агрегатный запрос unread IM + один расчёт на запрос (убирает сотни запросов с каждой страницы и поллинга).
3. **P0-3** — JOIN/подзапрос вместо «все слоты ради id» в `Menu`, `ExpertHelpers`, `ExpertDashboardService`, `UsersController::post__preview`.
4. **P1-5** — добавить индексы `bookings.created_at`, `balance_ledger.created_at`, `accounts_data(param, value)` (дешёвая миграция M_0013).
5. **P2-1** — cron-ретеншен логов/почты/новостей + чистка файловых журналов (до передачи в прод, иначе диск — бомба замедленного действия).
6. **P1-1/P1-2** — батч-валидация в `post__book`, оконная подгрузка календаря `/slots`.
7. **P1-6** — пагинация админ-гридов users/balances/tokens.
8. **P1-3** — кэш или денормализация счётчиков профилей.
9. **P3-1/P3-2** — удалить `Public/assets/app-irabi/`, сократить список префетч-чанков; затем Zod/i18n-чанки.
