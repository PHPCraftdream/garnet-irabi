# Аудит конкурентности / race conditions — IRabi

Дата: 2026-07-18
Область: `Apps/IRabi` (Foreground/Controllers, Common/Services, Common/Tables) + `garnet-framework` (Kernel/Db, идемпотентность, сессии).
Финансовая часть (баланс/ledger) вне scope — ей занимается отдельный агент; здесь она упоминается только там, где пересекается с бронированием мест.

## Резюме

Ядро бронирования (`TimeSlots::reserveSeat/releaseSeat`, идемпотентность API через `IdempotencyMiddleware`, инвайт-токены через `FwInviteTokenService::consume`) уже прошло собственный security-аудит (метки H-01, H-02, M-01 в коде) и реализовано корректно: атомарные CAS-запросы (`UPDATE ... WHERE <условие>` + проверка `affected_rows`), UNIQUE-констрейнты на дублирующие брони, компенсирующие транзакции на откате. Два параллельных запроса на последнее место в мульти-слоте обрабатываются верно: один получает success, другой — явную ошибку "мест нет" (или "Slot is full").

**ИСПРАВЛЕНО ПОСЛЕ ПРОВЕРКИ НА РЕАЛЬНОМ ПРОДЕ (2026-07-18):** ниже этот отчёт изначально классифицировал C-1 как CONFIRMED CRITICAL, предположив, что боевой деплой использует classic nginx+php-fpm с долгоживущими воркер-процессами. Это предположение проверено эмпирически на реальном сервере slotbook.ru (`ps aux` по учётной записи хостинга) и **опровергнуто**: прод использует `php-cgi` через shared-hosting провайдера — классическую CGI-модель, где каждый HTTP-запрос порождает отдельный процесс. Владелец продукта подтвердил: упоминания "php-fpm"/"пул воркеров" в комментариях кодовой базы (`WorkerScopeMiddleware`, `IoRunWeb::run()` — "nginx → 32 php-cgi") описывают исключительно **dev-инструментарий проекта** (`php garnet serve`, который сам поднимает пул `php -S`/php-cgi процессов для локальной разработки), а не архитектуру реального прода. `Tests/docker/Dockerfile.php-fpm` — тестовая CI-фикстура, тоже не описывает боевой хостинг.

Механизм бага в коде (процессно-статичные `Session::$instance`/`Account::$sessionAccount`/`Account::$items`, никогда не сбрасываемые) описан ниже корректно и остаётся реальной архитектурной хрупкостью — она проявилась бы в полную силу, если бы боевое окружение когда-либо переключилось на php-fpm/persistent-worker модель. Но **на текущей реальной инфраструктуре (php-cgi, порождение процесса на каждый запрос) она не эксплуатируема**, поэтому находка понижена с CRITICAL до **LOW (архитектурный техдолг, environment-dependent)** — см. переклассификацию в конце раздела C-1.

Второстепенные, но реальные находки: cron-задачи (`AppCronService`, `FwEmailQueueService::processQueue`, `CronCompletionService::completeExpired`) не имеют блокировки от параллельного/повторного запуска — при пересечении двух cron-тиков это может привести к **дублирующей отправке одного и того же письма** одному получателю. Также найден один low-severity TOCTOU при возврате слота в статус `free` в `ExpertBookingsService`, но он безвреден (идемпотентная запись одного и того же значения).

---

## Находки по severity

### ~~CRITICAL~~ → ПЕРЕКЛАССИФИЦИРОВАНО В LOW (см. врезку выше)

#### C-1 → L-3. Процессно-статичные `Session`/`Account` кэши никогда не сбрасываются между HTTP-запросами — архитектурный техдолг, не эксплуатируемый на текущей инфраструктуре (php-cgi)

**Файлы:**
- `garnet-framework/Kernel/Db/Entity/Session/Session.php` (свойства `protected static ?ISession $instance = null` (строка 29), `protected bool $read = false` (33), `protected bool $readDataAsync = false` (248))
- `garnet-framework/Kernel/Db/Entity/Account/Account.php` (`protected static IAccount|null $sessionAccount = null` (55), `protected static array $items = []` (27))
- `garnet-framework/Kernel/Io/IoRun/IoRunWeb.php` (строки 170-179 — точка входа, где решается, читать ли сессию заново)
- `Apps/IRabi/run_web.php` — нет вызова, который бы сбрасывал эти статики в начале запроса.

**Механизм (буквально по коду):**

1. `IoRunWeb::run()`:
   ```php
   $session = static::getSession();               // Session::get() — переиспользует static $instance, если он уже создан
   if (!$session->isReadCookies()) {               // true только если $read === false
       $session->readFromServer($globals->readServerAll());
       $session->readDataAsync();
       $session->readDataAsyncPollFinishAll();
   }
   ```
2. `Session::readFromServer()` (строка 177-181) — единственное место, где `$this->cookies` (а значит и `$this->sessionValue`, распознанное значение cookie `session`) перечитывается из `$_SERVER`/`$_COOKIE` текущего запроса. Она же ставит `$this->read = true` — и это флаг **никогда не сбрасывается обратно в `false`** ни в одном файле фреймворка (проверено поиском по всему `garnet-framework`).
3. `Session::readDataAsync()` (строка 254): `if (!$this->readDataAsync && !empty($this->sessionValue)) { ... }` — тоже стик-флаг, тоже нигде не сбрасывается.
4. `Account::fromSession()` (строка 64-92 в `Account.php`):
   ```php
   if (!empty(static::$sessionAccount) && static::$sessionAccount->id() > 0) {
       return static::$sessionAccount;              // <-- полностью обходит Session::get()
   }
   $session = Session::get();
   $email = $session->getValue(Account::SESSION_AUTH_LOGIN);
   ...
   if ($account->id() > 0) {
       static::$sessionAccount = $account;           // кэш выставляется НАВСЕГДА для этого процесса
   }
   ```

**Итог:** в рамках одного php-fpm worker-процесса первый обработанный запрос "запечатывает" три уровня кэша (`Session::$instance->cookies/sessionValue`, `Session::$instance->sessionData`, `Account::$sessionAccount`) значениями ЭТОГО пользователя. Любой последующий запрос, обслуженный **тем же самым worker-процессом** (а не новым процессом на каждый HTTP-запрос — это ключевое отличие от CGI-модели), получит:
- `Account::fromSession()` вернёт объект первого пользователя без единого обращения к текущим `$_COOKIE`/БД — **даже если у второго запроса вообще нет cookie сессии или это другой залогиненный пользователь**.
- CSRF-токен (`Session::touchCSRF_()`), `account_id` в шаблонах, `IrabiAuthMiddleware`/`UserDataMiddleware` — все проверки авторизации, построенные поверх `Account::fromSession()`, отработают от имени "запечатанного" пользователя.

**Почему это не "dev-only":** предыдущий вывод в этой сессии полагал, что php-fpm гарантированно создаёт свежий рантайм на каждый запрос. Это неверно для *classic* php-fpm: FPM-воркер — это долгоживущий ОС-процесс, который обслуживает запросы **последовательно, один за другим**, и статические свойства PHP-классов **сохраняются в памяти этого процесса между запросами** (это ровно то, ради чего сделан `DbPool::$instance` — переиспользование соединений). Единственное, что гарантированно "свежее" на каждый запрос — суперглобалы (`$_SERVER`, `$_COOKIE`, `$_POST`) и НЕ-статические переменные/объекты, созданные заново в ходе выполнения скрипта. Процесс-воркер умирает и пересоздаётся только по `pm.max_requests` (по умолчанию `0` = не ограничено, если явно не выставлено на хостинге) или по рестарту FPM.

Прямое подтверждение того, что команда сама знает об этой модели — комментарий в `WorkerScopeMiddleware.php` (строки 38-42):
> "Lifecycle: IniConfig is a long-lived singleton in single-process servers (`php -S`, php-fpm worker), so the override map carries over between requests inside one process. Every call to process() either SETS a fresh override or CLEARS it — there is no path that leaves a stale value from a prior request."

`WorkerScopeMiddleware` **явно** решает эту же проблему для `IniConfig`-оверрайда (сбрасывает его на каждый вызов), но `Session`/`Account` не получили аналогичной защиты.

Дополнительное подтверждение из комментария в `IoRunWeb::run()` (строки 202-214) про "the worker pool is concurrent (nginx → 32 php-cgi)" — команда прямо описывает пул из ~32 воркеров, обрабатывающих запросы одного и того же приложения, что соответствует именно той модели, в которой процессно-статичный кэш течёт между разными посетителями сайта.

**Сценарий двух параллельных/последовательных запросов:**
1. Пользователь A логинится, его запрос обслуживает воркер #7. `Session::$instance` в процессе #7 теперь содержит cookie/данные A, `Account::$sessionAccount` — объект A.
2. Пользователь A закрывает вкладку (или воркер #7 просто становится свободным).
3. Пользователь B (без cookie сессии вообще, или с собственной, но не сразу разобранной, если бы код был другим) отправляет запрос, который FPM master маршрутизирует на **тот же воркер #7** (обычное дело — pool из N воркеров циклически берёт свободные).
4. `IoRunWeb::run()` видит `isReadCookies() === true` (выставлено на шаге 1) → НЕ вызывает `readFromServer()` → cookie пользователя B **не читается вообще**.
5. `Account::fromSession()` видит непустой `$sessionAccount` с `id() > 0` (это аккаунт A) → возвращает **аккаунт A** для запроса B.
6. Если у B открыт какой-то роут, требующий аутентификации — B видит интерфейс, привязанный к аккаунту A (список бронирований A, баланс A, возможность выполнить мутирующее действие "от лица" A — а значит и POST-запросы B физически будут закоммичены под `account_id = A`).

**Уверенность в механизме: CONFIRMED** на уровне чтения кода — сам паттерн (статик-флаги без сброса) неопровержим и будет реально течь между пользователями в ЛЮБОЙ persistent-worker модели исполнения (php-fpm, RoadRunner, Swoole и т.п.).

**Итоговая переклассификация после проверки реальной инфраструктуры (2026-07-18):** боевой прод slotbook.ru работает на `php-cgi` (подтверждено `ps aux` на реальном сервере — процесс порождается на запрос и не переиспользуется как persistent worker), поэтому статические свойства класса физически не могут пережить границу запроса в текущем окружении. Активной эксплуатируемой уязвимости на проде **нет**. Severity: **LOW** — это архитектурная хрупкость/техдолг, которая станет реальным CRITICAL-риском только если хостинг когда-либо сменится на persistent-worker модель (php-fpm с переиспользуемыми процессами, RoadRunner/Swoole и т.п.).

**Рекомендация (не реализована — только диагноз, изменения не вносились по условию задания):** несмотря на понижение severity, стоит сделать явный сброс `Session::$instance` и `Account::$sessionAccount`/`Account::$items` в начале каждого запроса (аналогично `WorkerScopeMiddleware::process()` для `IniConfig` — "always clear first") как **дешёвую превентивную меру** — это защитит от регрессии, если инфраструктура когда-либо изменится, и стоит одной строки кода. Не блокер для текущей поставки.

---

### HIGH

#### H-1. `FwEmailQueueService::processQueue()` — TOCTOU без блокировки, возможен двойной отправка одного письма при пересекающихся cron-запусках

**Файл:** `garnet-framework/Bundle/Modules/Email/FwEmailQueueService.php`, метод `processQueue()` (строки 95-158).

```php
$items = $queue->selectAll(function (SelectInterface $query) use ($limit): void {
    $query->where('status IN (?)', [['queued', 'error']]);
    $query->where('attempts < max_attempts');
    $query->where('(next_attempt_at IS NULL OR next_attempt_at <= ?)', [time()]);
    ...
});

foreach ($items as $item) {
    ...
    $queue->updateById(['status' => 'sending'], $item['id']);   // НЕ CAS — plain UPDATE by id, без условия на прежний статус
    try {
        Mailer::get()->sendHtmlMail(...);
        $queue->updateById(['status' => 'sent', ...], $item['id']);
        ...
```

`SELECT` (шаг 1) и последующая пометка `status = 'sending'` (шаг 2) — два отдельных запроса, не защищённых ни транзакцией, ни CAS-условием (`WHERE status IN ('queued','error')` в самом UPDATE отсутствует). Между ними нет атомарности.

**Сценарий:** cron-задача `email-queue` запускается по расписанию каждую минуту. Если предыдущий запуск завис (долгий SMTP-таймаут на одном письме) дольше минуты — следующий crontab-тик стартует НОВЫЙ процесс `php garnet cron email-queue`, который выполнит свой собственный `SELECT ... WHERE status IN ('queued','error')` **до того**, как первый процесс успеет проставить `status = 'sending'` на захваченные им строки. Оба процесса получат в выборку одни и те же `queued`-письма, оба вызовут `Mailer::get()->sendHtmlMail()` для одного и того же адресата с одним и тем же текстом — **получатель получит два одинаковых письма** (например, дубль уведомления "бронирование подтверждено").

**Уверенность: CONFIRMED.** Код читается однозначно — ни блокировки на уровне cron-обвязки (`CMDCron`/`FwCronService`/`AppCronService` — см. C-2 ниже), ни CAS-условия внутри `processQueue()` не существует.

**Смежная причина, повышающая вероятность:** сам класс `AppCronService::runWithLogging()` оборачивает задачу в try/catch и логирует длительность (`duration_ms`), но НИКАК не ограничивает и не сериализует параллельные вызовы — если оператор/systemd timer поставит cron чаще, чем реально успевает выполняться `email-queue` (например, при временной деградации SMTP), гонка воспроизведётся детерминированно.

---

### MEDIUM

#### M-1. Отсутствие мьютекса/advisory lock на уровне cron-раннера в целом (пункт 5 задания)

**Файлы:** `Apps/IRabi/Common/Services/AppCronService.php`, `garnet-framework/Kernel/Io/Cron/{CMDCron.php, FwCronService.php}`.

`CMDCron::run()` → `AppCronService::runAll()`/`runTask()` → просто перебирает зарегистрированные задачи (`email-queue`, `complete-expired`, `disable-stale-tokens`) и выполняет их callback'и последовательно, без:
- PID-файла/lock-файла,
- `GET_LOCK()`/advisory lock в MySQL,
- проверки "уже выполняется" через какую-либо служебную таблицу.

Это касается не только email-очереди (см. H-1 — там реальный ущерб дублирования письма), но и остальных двух задач:

- `disable-stale-tokens` → `FwInviteTokenService::disableStale()` — читает список токенов и по одному помечает `is_disabled = 1` через `updateById`. При двух параллельных запусках оба процесса просто продублируют одну и ту же идемпотентную запись (`is_disabled = 1` дважды на одну и ту же строку) — **безвредно**, лишний двойной UPDATE, не создаёт incorrect state.
- `complete-expired` → `CronCompletionService::completeExpired()` — тот же паттерн (SELECT, затем цикл `updateById(['status' => 'completed'], ...)`), тоже идемпотентно по конечному состоянию (перевод `booked`→`completed` дважды не меняет результат), но при пересечении с интенсивной обработкой бронирований теоретически может создать лишнюю нагрузку на БД и дублирующиеся `stats`-числа в `ir_cron_log` (не критично, влияет только на отчётность).

**Итог: единственная реально опасная операция без cron-мьютекса — это email-очередь (H-1); остальные две задачи идемпотентны по конечному состоянию строк, хоть формально и лишены блокировки.**

**Уверенность: CONFIRMED** (отсутствие блокировки — факт кода), severity дифференцирована по фактическому ущербу для каждой задачи.

#### M-2. `ExpertBookingsService::cancelBooking()` — возврат `status = 'free'` без CAS-условия (низкий ущерб, но не соответствует паттерну, принятому в остальном коде)

**Файл:** `Apps/IRabi/Foreground/Controllers/ExpertPanel/ExpertBookingsService.php`, строки 200-210.

```php
$activeBookings = Bookings::get()->selectAll(...); // COUNT активных броней на слот
$maxUsers = (int)$slot['max_users'];

if (count($activeBookings) < $maxUsers) {
    TimeSlots::get()->updateByField(['status' => 'free'], 'id', (int)$slot['id']);   // plain UPDATE, без CAS
}
```

Для сравнения — тот же переход в `BookingsController::post__book()` (строка 431-434) и `SlotsController::post__book()` (строка 409-412) сделан через `CasUpdate::exec("UPDATE ... WHERE id = ? AND status = 'free' AND booked_count >= max_users", ...)` — то есть CAS-условие на прежнее состояние. `ExpertBookingsService::cancelBooking()`/`cancelBookedSlot()`-соседние методы такой защиты не имеют.

**Сценарий:** два администратора/пользователя одновременно отменяют разные бронирования на одном мульти-слоте (`max_users = 3`, было 3 активных брони, обе отмены проходят почти одновременно). Оба потока делают свой `SELECT COUNT` ДО того, как оппонентная транзакция успела закоммититься, оба видят `count = 2 < 3` (устаревшее значение) и оба пишут `status = 'free'` — то есть **запись идемпотентна по итоговому значению** (оба ставят одно и то же значение `'free'`), поэтому фактического расхождения данных не возникает. Проблема сугубо стилистическая/потенциальная: если бы в будущем логика перехода зависела от РАЗНИЦЫ (например, декремент какого-то счётчика прямо здесь, а не через уже-CAS'нутый `releaseSeat()`), гонка стала бы реальной.

**Уверенность: PLAUSIBLE как источник несогласованности в будущем, но в текущем виде — не приводит к потере данных**, потому что `booked_count` (реальный источник истины для вместимости) уже корректно обновляется через `TimeSlots::releaseSeat()` CAS-декрементом чуть выше по коду (строка 176), а `status` — вторичное поле, вычисляемое заново при следующем бронировании (`WHERE status = 'free' AND booked_count >= max_users` в `post__book`). Рекомендуется для консистентности стиля привести к тому же CAS-паттерну, что и в `BookingsController`/`SlotsController`, но это не блокер для поставки.

---

## Проверено — без находок

1. **`TimeSlots::reserveSeat()`/`releaseSeat()` (Common/Tables/TimeSlots.php)** — атомарный CAS через `CasUpdate::exec("UPDATE time_slots SET booked_count = booked_count + 1 WHERE id = ? AND booked_count < max_users")`, каждый CAS-вызов использует выделенный DB-линк (`CasUpdate::getLink()`, отдельный от пула, чтобы `affected_rows` не путался между конкурентными асинхронными запросами) — подтверждено чтением `garnet-framework/Kernel/Db/Link/CasUpdate.php`. Проверены оба вызывающих контроллера — `BookingsController::post__book()` и `SlotsController::post__book()` (единичное и множественное бронирование): оба вызывают `reserveSeat()` СТРОГО до INSERT брони, оба откатывают через `releaseSeat()` на любой последующей ошибке (дубликат брони, недостаточный баланс, исключение БД). Два параллельных запроса на последнее место в мульти-слоте: первый CAS `UPDATE ... WHERE booked_count < max_users` увеличивает счётчик и получает `affected_rows = 1` → бронь создаётся; второй CAS на тот же `slotId` видит уже `booked_count = max_users` → `affected_rows = 0` → `reserveSeat()` возвращает `false` → контроллер немедленно отвечает `{"error": "Slot is full"}` (HTTP 400), не создавая брони. Ровно тот сценарий, который требовалось проверить в п.1 задания — работает верно.

2. **UNIQUE-констрейнт на повторную бронь того же слота тем же пользователем** — `Bookings::insert()` защищён уникальным индексом (`active_dup_key`, упомянут в комментариях `BookingsController.php:351` и `SlotsController.php:328`), обрабатывается через `CasUpdate::isDuplicateKeyError()` с явной компенсацией (`releaseSeat()` на откате).

3. **`IdempotencyMiddleware` — покрытие мутирующих эндпоинтов.** Проверена таблица маршрутов в `IRabi.php` (`runWebApp()`, строки 191-272): общий middleware-набор `$common` (включающий `[IdempotencyMiddleware::class, 'before']`) применён ко ВСЕМ бизнес-контроллерам — `MainController`, `ExpertPanelController` (включая `confirmBooking`/`cancelBooking`/`cancelBookedSlot`/`cancelSlot`), `SlotsController`, `UserProfileController`, `ExpertController`, `BookingsController`, `BalanceController`, `SupportController`, `CommentsController`, `ImController`, `NewsController`, `UsersController`, `ExternalController`, плюс `DashboardXXXController` через производный `$adminMiddleware` (тоже наследует `$common`). Единственные роуты БЕЗ идемпотентности — `$maintenanceOnly`-группа: `FwJsErrorLogController` (клиентское логирование ошибок, не бизнес-мутация), `SysLogController`/`SysOpcacheResetController` (служебные, не пользовательские), `RegisterController` (первичная регистрация — но фактическая мутация там уже атомарна на уровне `FwInviteTokenService::consume()`, CAS-декремент, поэтому дублирующий клик просто получит `409` от `consume()===false`), `StaticPagesController` (чтение), `DevLoginController` (dev-only, за токен-гейтом). Уязвимых "голых" мутирующих действий без idempotency-key и без внутренней атомарности не найдено.

4. **`IdempotencyMiddleware::before()`/`finalize()` внутренняя гонка на уровне двух одновременных identical-key запросов** — обработана через UNIQUE-индекс на тройке `(account_id, idem_key, route_path)` в `FwIdempotencyKeys`: проигравший `INSERT` ловит duplicate-key-исключение и либо возвращает закэшированный ответ (если победитель уже завершился), либо `409 "Operation in progress, retry shortly"` (если победитель ещё выполняется). Корректная race-free реализация.

5. **Инвайт-токены (`FwInviteTokenService::consume()`)** — атомарный CAS-декремент `UPDATE ... SET uses_left = uses_left - 1 WHERE id = ? AND uses_left > 0`, помечен в коде как исправление security-audit M-01 (потребление токена ДО сохранения профиля, раньше был race, где счётчик мог быть превышен). Токен `max_uses = 1` не может быть использован дважды одновременно — второй параллельный `consume()` получит `affected_rows = 0` → `false` → `RegisterController::post__main()` вернёт `409`.

6. **Email/notification race при двойном подтверждении брони экспертом почти одновременно (п.4 задания).** `ExpertBookingsService::confirmBooking()` гейтит фактическую отправку письма/новости строго за CAS-переходом статуса брони: `UPDATE bookings SET status='confirmed' ... WHERE status='pending'` → если `affected === 0` (второй параллельный клик), метод немедленно возвращает `409` и НЕ доходит до `NewsService::createPersonal()`/`EmailNotifications::bookingConfirmed()`/`BookingChatNotifier::confirmed()`. Аналогично для `post__book()` (создание брони), `post__cancel()`/`cancelBooking()`/`cancelSlot()` (отмена) — везде реальная нотификация выполняется только у "победителя" CAS-перехода. Двойных писем/дублей в ленте новостей по одному и тому же событию брони не найдено. (Единственный найденный источник дублирования писем — H-1, но это дублирование через cron email-очередь, а не через двойной клик по одному и тому же действию.)

7. **Счётчики (просмотры, непрочитанные, лайки).** `ImReadStatus::getUnreadCountForUser()`, `SupportTickets::getUnreadCountForUser()` — вычисляются через `SELECT COUNT(*)`-подобные агрегатные запросы "по требованию" (не хранимые денормализованные счётчики), поэтому классическая гонка "read-modify-write в PHP теряет инкременты" к ним неприменима — там нечего инкрементировать, значение каждый раз пересчитывается из первичных данных. `EmailThrottle`-гейт в `EmailNotifications::gate()` использует `INSERT ... ON DUPLICATE KEY UPDATE last_sent_at = VALUES(...)` — атомарный upsert, не read-modify-write. Комментарии (`CommentsController`) — обычный `INSERT`, нет счётчика комментариев на entity, который надо было бы инкрементировать.

8. **Балансовые CAS-операции, пересекающиеся с бронированием** (`AccountBalance`, `BalanceLedger`) — вне прямого scope этого аудита (ведёт отдельный агент по финансам), но по пути проверки `post__book()`/`post__cancel()` подтверждено, что списание/возврат баланса тоже идёт через `CasUpdate::exec("UPDATE ... SET balance = balance - ? WHERE balance >= ?")` с последующей компенсацией (откат брони при `affected === 0`) — согласовано с капасити-гейтом по времени выполнения (сначала `reserveSeat()`, затем баланс, откат в обратном порядке при неудаче).

---

## Итоговая таблица

| # | Находка | Severity | Уверенность |
|---|---|---|---|
| L-3 (было C-1) | `Session`/`Account` process-static кэш не сбрасывается между запросами | **LOW** (переклассифицировано после проверки прода — php-cgi, не php-fpm; см. врезку в начале раздела Critical) | CONFIRMED механизм, но не эксплуатируемо на текущей инфраструктуре |
| H-1 | `FwEmailQueueService::processQueue()` TOCTOU без CAS/lock → дублирующая отправка письма при пересекающихся cron-тиках | **HIGH** | CONFIRMED |
| M-1 | Нет мьютекса на уровне cron-раннера в целом (усугубляет H-1; для остальных двух задач — безвредно, т.к. идемпотентны) | **MEDIUM** | CONFIRMED |
| M-2 | `ExpertBookingsService::cancelBooking()` возврат `status='free'` без CAS (стилистическая непоследовательность, не приводит к потере данных сейчас) | **MEDIUM→LOW** | PLAUSIBLE (риск на будущее) |

**Рекомендованный приоритет исправления (для другого агента/итерации, не выполнялось в рамках этого аудита):** H-1 — исправить до продакшна, добавив CAS-условие в UPDATE `status='sending'` (`WHERE status IN ('queued','error')`) либо advisory lock на весь cron-тик; L-3 — дешёвая превентивная правка (явный сброс статиков в начале запроса), не блокирует поставку, но стоит сделать заодно; M-1/M-2 — по усмотрению, не блокируют поставку.
