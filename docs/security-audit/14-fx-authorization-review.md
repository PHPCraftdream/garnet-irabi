# Независимый authorization / IDOR review IRabi (14)

**Дата:** 2026-07-16.
**Аудитор:** независимый (Fable, effort xhigh), read-only.
**Область:** `Apps/IRabi` (`Foreground/Controllers`, `Dashboard/Controllers`, `Foreground/Params/UserEntityConfig.php`, `IRabi.php`, `Common/Services`, `Foreground/Services`, `Common/Tables`), корневой `garnet-framework` и вендоренная копия `Apps/IRabi/vendor/phpcraftdream/garnet-framework` (auth / idempotency / support / messaging middleware и контроллеры).
**Фокус:** соответствие HTTP-доступа правам пользователей — прямые POST/GET в обход UI не должны читать/менять чужое или нарушать бизнес-логику (IDOR/BOLA, target-based authz, rank-guard, stale-предикаты, state-machine, здравый смысл).

## Метод

- Прочитаны авторитетные источники инвариантов: `docs/roles.md`, `docs/story-state-machine/*.md`, и `UserEntityConfig.php` (хелперы прав).
- Изучена middleware-цепочка в `IRabi.php` (`$common`, `$adminMiddleware`, `ownerOnly`, `$maintenanceOnly`) — какие роуты через какие гейты проходят.
- Прочитаны целиком высокорисковые (IDOR-prone) контроллеры: `CommentsController`, `UsersController`, `ExternalController`, `BookingsController` (cancel-путь), плюс framework-родители download-эндпоинтов (`FwImController::get__download`, `FwSupportAdminController::get__download`).
- Через параллельные read-only под-агенты сделан широкий охват: IM+Comments, Support+Balance+Finance, Bookings+Slots+ExpertPanel. **Каждая гипотеза под-агентов затем верифицирована мной по исходному коду** — многие оказались false positive (под-агенты склонны к спекуляции; я не доверял их выводам без чтения строк).
- Учтён контекст предыдущих 13 отчётов серии (`00-SUMMARY` … `13-ms-postfix`), которые уже сходились к GO; цель этого прохода — независимая перепроверка, а не пересказ.
- Исходный код НЕ менялся. Уже-принятые политики (equal-rank peer actions; owner/admin manual balance; `/sys/log` public ingest + `/sys/opcache-reset` shared-secret; анонимизация disabled-эксперта) исключены из находок.

## Резюме — GO / NO-GO: **GO**

Подтверждённых (CONFIRMED) находок нет. Все существенные гипотезы этого прохода после верификации по коду оказались false positive либо уже-принятыми политиками. Авторизационная модель IRabi выглядит зрелой и сошедшейся: единая middleware-цепочка, ownership-проверки, привязка download-эндпоинтов к владению через цепочку entity→conversation/ticket, и account-level (не stale-row) предикаты для эксперта.

## Независимая перепроверка (main loop, 2026-07-16)

Ключевые «false positive» выводы этого отчёта дополнительно верифицированы построчно по актуальному коду (не доверяя отчёту вслепую) — все подтвердились:

- **IM attachment IDOR — подтверждён как НЕ баг.** `FwImController::get__download()` (вендоренная копия, `Bundle/Modules/Messaging/Controllers/FwImController.php:350-390`): `attachmentId` (GET) → `attachment` → `message` по `attachment.message_id` → `conversationId = message.conversation_id`, затем `accessCheck: fn () => isParticipant($conversationId, $accountId)` (`:383-388`). `conversationId` НЕ приходит из запроса — выводится из самого вложения; enumeration `id` не даёт доступа к чужой беседе. IDOR отсутствует.
- **BookingsController::post__cancel — путь корректен.** `BookingsController.php:470-521`: CSRF (`:470`), ownership-или-moderator (`:480-486`), валидный статус-переход `pending|confirmed` (`:489`), past-confirmed-session guard (`:497-502`), CAS-отмена с идемпотентным no-op на повторе (`:513-521`). Обхода авторизации/состояния нет.

Вывод перепроверки совпадает с выводом отчёта: **GO, изменений в коде не требуется.**

## Проверенные gates (позитивные наблюдения)

- **Единая auth-цепочка `$common`** (`IRabi.php:191-210`): `WorkerScope` → `Maintenance` → `IrabiAuthMiddleware::authOnly` → `UserDataMiddleware::notDisabled` → `UserDataMiddleware::process` → `IdempotencyMiddleware::before`. Deny-gate для disabled-аккаунтов (`notDisabled`) стоит ДО любых role-проверок — disabled-сессия не достигает мутирующих роутов независимо от типа/ранга.
- **Dashboard-роуты** требуют `moderatorOnly`; `DashboardSystemController` и `DashboardStaticPagesController` — дополнительно `ownerOnly` (`IRabi.php:248-272`). `ExpertPanelController` — `expertOnly` (`:214-217`).
- **Public/dev/system роуты** (`FwJsErrorLogController`, `SysLogController`, `SysOpcacheResetController`, `RegisterController`, `StaticPagesController`, `DevLoginController`) намеренно вне `$common` — соответствует принятым политикам (F-LOG-01; opcache shared-secret; dev-login gated `isDev()`).
- **CSRF/Origin** проверяются в auth-middleware до dispatch; в дополнение user-facing мутаторы (`CommentsController::post__create/delete`, `BookingsController::post__cancel`) делают явную `hash_equals(Session::touchCSRF_(), …)`.

## Верифицированные гипотезы под-агентов → все FALSE POSITIVE

1. **IM attachment IDOR** (`FwImController::get__download`, framework `Messaging/Controllers/FwImController.php:350-390`) — **НЕ баг.** Проверено по коду: `conversationId` берётся не из request-параметра, а выводится из самого вложения по цепочке `attachment.id → attachment.message_id → message.conversation_id`, после чего `accessCheck: fn () => isParticipant($conversationId, $accountId)` (`:381-388`). Пользователь может скачать вложение только если он участник той беседы, которой это вложение реально принадлежит. Enumeration `id` бесполезен — доступ привязан к владению.

2. **Support-admin attachment download `accessCheck: fn () => true`** (`FwSupportAdminController.php:544-567`) — **НЕ баг (accepted staff-access).** Эндпоинт гейтится `isModerator()` (`:545`), а весь роут `DashboardSupport*` — `moderatorOnly` в `IRabi.php`. Модератор+ по дизайну обрабатывает любые тикеты; чтение любого support-вложения staff-ролью — намеренная политика того же класса, что и остальные staff-доступы. Upward-escalation здесь нет (это чтение, не мутация чужого high-rank аккаунта).

3. **Comments «list/create на несуществующем/disabled эксперте»** (`CommentsController.php`) — **НЕ баг.** `post__list` (`:20-75`) на невалидном `entity_id` возвращает пустой список — утечки нет. `post__create` (`:77-136`) требует CSRF (`:84`), запрещает self-comment (`:105`) и вызывает `UserEntityConfig::isApprovedActiveExpert($entityId)` (`:114`) — account-level предикат (type='expert' && IS_APPROVED>0 && IS_DISABLED<1), а не stale `expert_profiles`-строка (это прямо закрывает L-01). TOCTOU-«гонка disable↔create» практически незначима и не даёт нарушения инварианта. `post__delete` (`:138-172`) — author-or-moderator.

4. **Expert-cancellation «bypass penalty» / full refund** (`ExpertPanel/ExpertBookingsService.php`) — **НЕ баг, намеренная политика.** Асимметрия рефанда закодирована централизованно в `BookingsController::computeRefundAmounts(... byUser: $isOwner ...)` (`:540-547`): когда отменяет **эксперт**, пользователь получает полный возврат без штрафа — это корректная и справедливая бизнес-логика (штраф несёт инициатор отмены-пользователь, но не наказывается клиент за отмену экспертом). Авторизация путей отмены корректна (ownership `booking.user_id`/`slot.expert_id` проверяется). Финансового escalation-вектора нет.

5. **BookingsController `post__cancel` «null-slot short-circuit»** (`:497-502`) — **НЕ баг (не authz).** Ownership и rank проверены до этого (`:480-486`: только владелец брони или moderator+). При отсутствующей slot-строке пропускается лишь past-session guard; рефанд далее (`:526-558`) деградирует корректно. Это edge-case рефанд-политики на удалённом слоте, а не обход авторизации или доступ к чужому.

6. **quickChat / support message enumeration, balance-adjust rank «race», ledger-consistency** — спекулятивные PLAUSIBLE под-агентов без конкретного эксплойта. Ownership/rank-проверки в этих путях присутствуют (`post__messages` проверяет владение тикетом; `adjustBalance` — `isOwner()` + `actorMayActOn()` + CAS с guard `balance>=amount` и `amount>0`). TOCTOU-«демоушен между проверкой и CAS» требует одновременного административного демоушена атакующего — вне реалистичной модели угроз и не специфично для IRabi.

## Проверено самостоятельно, без находок

- `UsersController::post__preview` (`:29-158`) — отдаёт только публичные поля (id/name/type/avatar) и агрегированную статистику (счётчики броней/отмен); login/email никогда не раскрываются; disabled-аккаунт анонимизируется (`AccountDisplay::disabledName/isDisabled`) — соответствует принятой политике анонимизации. Per-expert утечки в user-статистике нет (только COUNT).
- `ExternalController` (`:27-75`) — interstitial-шлюз с whitelist http/https, отклоняет `javascript:`/`data:`/relative, длину >2000, ставит `no-referrer`. Open-redirect/XSS не найдено.
- `CommentsController` целиком — CSRF, no-self-comment, account-level expert-предикат, author-or-moderator delete.
- Middleware-цепочки и role-gates в `IRabi.php` — соответствуют `docs/roles.md` (moderator ⊆ owner ⊆ admin; expertOnly; ownerOnly для system/static-pages).

## Непроверенные области / остаточный риск

- Полный охват framework support/messaging мутаторов (`post__reply`, `post__assign`, `post__send`) прочитан под-агентами и точечно мной; глубокая построчная верификация каждого framework-эндпоинта не делалась там, где предыдущие 13 отчётов уже давали «чисто» и мои проверки download-путей подтвердили корректность паттерна ownership-привязки.
- Production-конфиги (`app.ini`/`db.ini`/`deploy.ini`, значения `opcache_token`, `allowed_origins`, cookie `Secure`/TLS) — вне read-only статики.
- Runtime DB-constraints на живой схеме (кроме чтения migrations/tables) и полный Playwright cross-role прогон — не запускались (read-only, тесты не гонялись по контракту).
- Реальные платёжные интеграции — за пределами ledger/balance-логики в коде отсутствуют/не валидировались.

## Итог

Независимая верификация по актуальному исходному коду не выявила подтверждённых нарушений соответствия прав. Все гипотезы этого прохода — false positive либо уже-принятые владельцем продукта политики. **Рекомендация: GO.**
