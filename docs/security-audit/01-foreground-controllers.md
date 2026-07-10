# Security Audit — Foreground Controllers (IRabi)

Область: `Foreground/Controllers/` (включая подпапку `ExpertPanel/`) и вспомогательная маршрутно/меню-логика `Foreground/Params/`.
Цель: defensive-аудит публичных HTTP-эндпоинтов (`get__xxx` / `post__xxx`) на предмет реальных, достижимых через HTTP-запрос уязвимостей.

Контекст модели авторизации (использован как вводная, сам middleware отдельно не аудируется):
- Все «приложенческие» роуты навешаны на цепочку `$common` в `IRabi.php` (строки 192–225), которая включает `IrabiAuthMiddleware::authOnly`.
- `authOnly` (`EmailAuthMiddleware::authOnly`, строки 123–151) для **любого POST** (кроме `action=start-session`) глобально выполняет `processOrigin()` (проверка Origin/Referer) и `processCSRF()` (проверка токена, 403 при несовпадении). То есть **CSRF и Origin защищены на уровне middleware для всех POST-эндпоинтов** — контроллерные `hash_equals()`-проверки являются дополнительной (избыточной) защитой.
- `ExpertPanelController` дополнительно навешан на `UserDataMiddleware::expertOnly` (`IRabi.php:209–212`), который пропускает только аккаунты с `type === 'expert'` (`UserEntityConfig::isExpert()`), **без учёта одобрения** (`is_approved`).
- Dashboard-роуты (`/admin/*`) закрыты `moderatorOnly` / `ownerOnly` и в этот аудит не входят.

## Summary

Всего находок: 5.

| Severity | Кол-во |
|----------|--------|
| Critical | 0 |
| High     | 0 |
| Medium   | 2 |
| Low      | 3 |

Критических и high-уязвимостей (RCE, SQLi, полноценный IDOR с чужими данными/деньгами, mass-assignment роли, path traversal, open redirect) не обнаружено. Найдены логические/авторизационные недочёты средней и низкой серьёзности, связанные с бронированием слотов неодобренных/отключённых экспертов и разграничением бизнес-ролей. Ряд подозрительных мест проверен и признан защищённым (см. раздел «Проверено — не уязвимости»).

---

## Находки (по убыванию severity)

### 1. Бронирование слота неодобренного/отключённого эксперта в обход публичного фильтра одобрения
- **Файл:** `Foreground/Controllers/SlotsController.php`
- **Строка:** 235–313 (`post__book`), 171–230 (`post__bookData`); ср. `Foreground/Controllers/BookingsController.php:287–439` (`post__book`)
- **Severity:** Medium
- **Описание:** Публичный список слотов (`SlotsController::get__main`) и рекомендации (`MainController::get__main`) показывают только слоты одобренных, не отключённых экспертов (`UserEntityConfig::getApprovedExpertIds()`, фильтр `is_approved = 1`, `SlotsController.php:120`). Однако сами мутационные эндпоинты бронирования (`SlotsController::post__book`, `SlotsController::post__bookData`, `BookingsController::post__book`) при поиске слота проверяют только `status = 'free'` / не в прошлом / не свой слот, но **не проверяют, что владелец слота (`expert_id`) — одобренный (`is_approved = 1`) и не отключённый (`IS_DISABLED`) эксперт**. Проверка одобрения существует только в отображающем запросе, а не в бизнес-транзакции.
- **Сценарий эксплуатации:** Аккаунт с `type='expert'`, ещё НЕ одобренный админом (или уже отключённый — `IS_DISABLED`), создаёт слот через `POST /expert/~slots` (это разрешено, см. находку №2). Слот получает `id`/`uid`. Эксперт передаёт жертве прямую ссылку/`slot_id` (в публичном календаре слот не виден). Жертва (или сам эксперт со второго аккаунта) вызывает `POST /slots/~book` с `slot_ids[]=<id>` и валидным CSRF — бронирование создаётся, с баланса пользователя списывается `cost`, а в `BalanceLedger` эксперту зачисляется `booking_payment` на ту же сумму (`SlotsController.php:364–381`). Таким образом неодобренный/отключённый эксперт получает денежное зачисление, минуя гейт одобрения, который бизнес-логика рассчитывает применять до приёма платежей. Для disabled-эксперта это ещё и зачисление средств на аккаунт, который платформа считает заблокированным.
- **Рекомендация:** В `post__book` / `post__bookData` (обоих контроллеров) после загрузки слота проверять, что `expert_id` принадлежит одобренному и не отключённому эксперту (например, `in_array($slot['expert_id'], UserEntityConfig::getApprovedExpertIds(), true)` или прямой запрос `is_approved = 1 AND IS_DISABLED < 1`), и при провале возвращать 404/409. Это переносит гейт одобрения из UI в транзакцию.

### 2. Управление слотами и приём платежей доступны неодобренному эксперту (`expertOnly` не учитывает `is_approved`)
- **Файл:** `Foreground/Middlewares/…` → гейт в `IRabi.php:209–212`; реализация в `Foreground/Controllers/ExpertPanel/ExpertSlotsService.php:192` (`createSlot`), `:331` (`batchSlots`), `:456` (`editSlot`); ср. `Foreground/Params/UserEntityConfig.php:154–156` (`isExpert`)
- **Строка:** `UserEntityConfig.php:154`, `ExpertSlotsService.php:192`
- **Severity:** Medium
- **Описание:** Гейт `ExpertPanelController` — `expertOnly` → `UserEntityConfig::isExpert()`, который проверяет только `type === 'expert'`, но не `is_approved`. Все эндпоинты создания/редактирования слотов (`createSlot`, `batchSlots`, `editSlot`) не содержат отдельной проверки одобрения. `createSlot` даже само-создаёт запись `ExpertProfiles` с `is_approved = 0`, если её нет (`ExpertSlotsService.php:235–243`), то есть штатно рассчитан на неодобренного эксперта. Публикация в новостную ленту при этом действительно гейтится (`if ($account->isApproved())`, `:262`), но сами слоты создаются и становятся бронируемыми по прямой ссылке (см. находку №1).
- **Сценарий эксплуатации:** Пользователь, которому по инвайту присвоен `type='expert'` (`RegisterController::post__main` пишет тип из токена), но который ещё не прошёл ручное одобрение модератором, получает полный доступ к личному кабинету эксперта: создаёт слоты (в т.ч. пакетно) с произвольной ценой и, в связке с находкой №1, принимает бронирования и денежные зачисления до одобрения. Ожидаемая бизнес-инвариантой «эксперт зарабатывает только после одобрения» обходится.
- **Рекомендация:** Решить продуктово, должны ли неодобренные эксперты вообще создавать слоты. Если нет — добавить проверку `$account->isApproved()` (или `IS_DISABLED < 1`) в начало `createSlot` / `batchSlots` / `editSlot` (либо ввести middleware `approvedExpertOnly`). Как минимум — устранить возможность приёма платежей неодобренным экспертом (находка №1). Проверка `IS_DISABLED` должна блокировать управление слотами и для ранее одобренного, затем отключённого эксперта.

### 3. Раскрытие имени отключённого (IS_DISABLED) пользователя через preview-эндпоинты
- **Файл:** `Foreground/Controllers/UsersController.php:28–147` (`post__preview`); `Foreground/Controllers/UserProfileController.php:38–97` (`get__main`); `Foreground/Controllers/ExpertPanel/ExpertSlotsService.php:117–187` (`userPreview`)
- **Строка:** `UsersController.php:44`, `UserProfileController.php:85`, `ExpertSlotsService.php:181`
- **Severity:** Low
- **Описание:** В большинстве мест приложения имена отключённых аккаунтов анонимизируются через `AccountDisplay::isDisabled()/disabledName()` (например, `MainController::get__profile`, `ExpertController::get__main`, `BookingsController::buildAuxMaps`). Но три preview/профиль-эндпоинта возвращают `name` напрямую из `db_accounts`, не применяя эту анонимизацию: `UsersController::post__preview` (`$acc['name']`), `UserProfileController::get__main` (`$row['name']`), `ExpertSlotsService::userPreview` (`$userAcc['name'] ?: $userAcc['login']` — причём для отключённого пользователя может вернуться и `login`, т.е. email). Login в `userPreview` подставляется как fallback только когда `name` пуст, но это всё равно потенциальная утечка email отключённого/любого пользователя без имени.
- **Сценарий эксплуатации:** Любой залогиненный пользователь вызывает `POST /users/~preview` (или эксперт — `POST /expert/~userPreview`) с `user_id` отключённого аккаунта и получает его реальное имя (а в `userPreview` при пустом `name` — и login/email), тогда как публичный профиль того же аккаунта показывает анонимизированную заглушку. Несогласованность приводит к деанонимизации заблокированных пользователей и (в `userPreview`) к раскрытию email.
- **Рекомендация:** Применять `AccountDisplay::isDisabled()` / `disabledName()` во всех трёх эндпоинтах перед возвратом `name`, как это уже сделано в остальных контроллерах. В `ExpertSlotsService::userPreview` убрать fallback на `login` (никогда не отдавать email наружу — это прямо противоречит комментарию-инварианте в `UsersController` «Email/login никогда не отдаётся»).

### 4. Рассылка сообщений любому аккаунту в обход бизнес-границы получателей
- **Файл:** `Foreground/Controllers/ImController.php:97–120` (`post__send`, IRabi-обёртка) и базовый `Bundle/Modules/Messaging/Controllers/FwImController.php:276–346`
- **Строка:** `FwImController.php:290` (чтение `recipient_id` без проверки допустимости)
- **Severity:** Low
- **Описание:** `ImController::searchRecipients` реализует «бизнес-границу» (обычный пользователь видит только экспертов/модераторов/владельцев; эксперт — своих учеников + модераторов). Однако `post__send` (базовый `FwImController`) принимает произвольный `recipient_id` и проверяет лишь, что получатель существует и это не сам отправитель (`FwImController.php:293–312`), но **не проверяет, что получатель входит в множество разрешённых для отправителя**. Таким образом ограничение из `searchRecipients` — только UI-фильтр, не enforced на отправке. (CSRF/Origin здесь защищены глобальным middleware.)
- **Сценарий эксплуатации:** Обычный пользователь напрямую отправляет `POST /im/~send` с `recipient_id` любого другого обычного пользователя (которого он не должен видеть/писать по бизнес-правилам) и валидным CSRF — сообщение создаётся, диалог заводится, получателю уходит email/новость. Позволяет использовать платформу для спама/произвольной переписки между пользователями в обход задуманной границы «пользователь ↔ эксперт/персонал».
- **Рекомендация:** Валидировать `recipient_id` на стороне `post__send` против тех же правил, что и `searchRecipients` (например, вынести проверку допустимости пары отправитель→получатель в общий метод и вызывать её как в поиске, так и при отправке). Замечание относится к базовому `FwImController`, но проявляется в IRabi через переопределённую бизнес-границу — стоит закрыть на уровне приложения (переопределить `post__send` с проверкой) либо во фреймворке.

### 5. Публичный лог-эндпоинт `/sys/log` без аутентификации — управляемая запись в лог-файлы (log injection / рост объёма)
- **Файл:** `Foreground/Controllers/SysLogController.php:37–84` (`post__log`)
- **Строка:** `SysLogController.php:44` (`cat`), `:77` (`append('fe-' . $cat, …)`)
- **Severity:** Low
- **Описание:** `SysLogController` навешан на цепочку `$maintenanceOnly` (`IRabi.php:229–235`), то есть **без аутентификации и без CSRF/Origin-проверки**. Эндпоинт принимает `cat`, `msg`, `meta` и пишет JSON-строку в файл `LogJournal/System/<date>/APP_LOGGER-fe-<cat>.log`. `cat` жёстко ограничен (`^[A-Za-z0-9_\-]+$`, ≤32) — path traversal невозможен (проверено). `msg`/`meta` обрезаны до 1 КБ. Тем не менее любой анонимный клиент может создавать произвольные файлы `fe-<cat>.log` (до 2^n имён категорий) и дописывать в них произвольный (пусть и ограниченный по длине, JSON-экранированный) контент от лица произвольного IP/UA.
- **Сценарий эксплуатации:** Анонимный злоумышленник в цикле шлёт `POST /sys/log` с различными `cat` и заполненными `msg`/`meta` — это (а) раздувает журнал/инодовое пространство (мягкий DoS на диск), (б) засоряет операционные логи ложными «хлебными крошками» с подставными `uid`/`ip`, затрудняя разбор инцидентов, (в) потенциально подставляет данные в инструменты, парсящие эти логи. Прямой RCE/traversal отсутствует (имя категории и путь санитизированы, значения JSON-экранированы).
- **Рекомендация:** Ограничить эндпоинт (rate-limit по IP, требование валидной сессии либо хотя бы Origin-проверка как у остальных POST), либо явно принять риск как осознанный (endpoint задокументирован как публичный breadcrumb-логгер). Как минимум — добавить троттлинг и жёсткий whitelist допустимых значений `cat` вместо открытого шаблона, чтобы исключить создание произвольного числа файлов.

---

## Проверено — не уязвимости

- **Mass assignment при редактировании профиля** (`MainController::post__profile_edit` → `UserDataMiddleware::processPost` → `RegMiddleware::processPost`): сохранение идёт через `$config->saveOne($globals->readPostAll(), $config->editFields(), …)` (`RegMiddleware.php:104–112`), где второй аргумент — **белый список** `editFields()`. В `UserEntityConfig::editFields()` (строки 69–76) поле `type` и все служебные флаги (`IS_ADMIN`, `IS_MODERATOR`, `IS_APPROVED`, `IS_DISABLED`) **исключены**. Промоут до `admin`/`moderator` выполняется только по серверному allowlist `admin_emails`/`moderator_emails` из `app.ini` (`RegMiddleware.php:120–134`), а не из пользовательского ввода. Подмена роли/одобрения/типа через self-service невозможна. Не уязвимость.

- **CSRF на state-changing POST-эндпоинтах** (expert-panel `confirm/cancel/create/edit/deleteSlot`, `MainController::post__saveNotifPrefs`, профиль): несмотря на отсутствие `hash_equals` в части контроллеров, `authOnly` в `$common` глобально вызывает `processCSRF()` + `processOrigin()` для всех POST (`EmailAuthMiddleware.php:127–144`). CSRF/Origin защищены централизованно. Не уязвимость.

- **IDOR в expert-panel** (`ExpertBookingsService::confirmBooking/cancelBooking/cancelBookedSlot/cancelSlot`, `ExpertSlotsService::editSlot/deleteSlot`): все грузят слот по id и явно проверяют владение — `(int)$slot['expert_id'] !== $account->id()` → 403 (`ExpertBookingsService.php:96, 145, 233, 304`; `ExpertSlotsService.php:460, 567`). Чужими слотами управлять нельзя. Не уязвимость.

- **IDOR в `BookingsController::post__cancel`**: отмена разрешена только владельцу брони (`(int)$booking['user_id'] === $account->id()`) или модератору+ (`BookingsController.php:459–465`); плюс проверки статуса/времени. Не уязвимость.

- **IDOR в `CommentsController::post__delete`**: удаление только автором или модератором (`CommentsController.php:160–165`). `post__create` валидирует `entity_type` по `Comments::VALID_ENTITY_TYPES` и существование эксперта, запрещает комментарий на свой профиль. `post__list` не показывает скрытые комментарии не-модераторам. Не уязвимость.

- **SQL-инъекции**: пользовательский ввод везде идёт через параметризацию Aura (`:named` / `?` плейсхолдеры). Интерполяции в сырой SQL присутствуют, но только для **имён таблиц** из `getTableName()`/`getRoutePrefix()` (напр. `BookingsController.php:65-66,355,412`; `SlotsController.php:307`; `ExpertSlotsService.php:549`) и для списка ID, предварительно прогнанного через `array_map('intval', …)` (`SlotsController.php:100-102`). Пользовательские значения в сырой SQL не конкатенируются. Не уязвимость. `DevLoginController::post__resetDb` конкатенирует имена таблиц, но: (а) эндпоинт закрыт `Env::isDevDir()` (403 в prod, `DevLoginController.php:151`), (б) имена берутся из захардкоженного массива + серверный префикс, не из запроса. Не уязвимость в prod.

- **Open redirect / SSRF в `ExternalController`**: `sanitizeUrl()` (строки 61–75) разрешает только `http`/`https` схемы с непустым host, отклоняет `javascript:`/`data:`/относительные/битые URL, ограничивает длину 2000. Плюс это интерстициальная страница (не серверный `Location`-редирект, не серверный fetch) с `referrer: no-referrer`. Серверных запросов к URL нет — SSRF отсутствует. Не уязвимость.

- **`SysOpcacheResetController`**: закрыт shared-secret токеном из `app.ini` со сравнением `hash_equals`; при пустом токене — отказ всем (503). Не уязвимость.

- **`DevLoginController`** (`post__main`, `post__resetDb`): оба закрыты `Env::isDevDir()` → 403 в prod. Fast-lane по `login` требует суффикса `.test`. В prod недостижимо. Не уязвимость (в prod-конфигурации).

- **Path traversal при загрузках** (`ImController`/`SupportController` → `getUploadDir()` фреймворка): контроллеры лишь передают базовый upload-каталог; обработка вложений и скачивание (`FwImController::get__download`) проверяют принадлежность вложения диалогу участника (`FwImController.php:226` → 403). Логики построения пути из пользовательского ввода в аудируемых контроллерах нет. В границах этого аудита — не уязвимость (детальный разбор загрузчика фреймворка вне области).

- **`RegisterController` (инвайт-флоу)**: `type` устанавливается из `account_type` инвайт-токена, ограниченного значениями `user`/`expert` (`RegisterController.php:91–95`) и только когда текущий `type` пуст. Пользователь не управляет типом напрямую. Токен валидируется и потребляется через `FwInviteTokenService`. Не уязвимость.
