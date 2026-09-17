# Security и authorization review IRabi после последних правок

Дата: 2026-07-16.

Область: `D:\dev\garnet\Apps\IRabi`, `D:\dev\garnet\garnet-framework`, `D:\dev\garnet\Apps\IRabi\vendor\phpcraftdream\garnet-framework`.

Метод: независимый статический review текущего кода и текущего git diff без использования предыдущих отчётов как источника истинности. Код не изменялся.

## Git diff

`git status --short`, `git diff --stat`, `git diff --name-only` в `Apps\IRabi`, `garnet-framework` и `Apps\IRabi\vendor\phpcraftdream\garnet-framework` не показали локальных изменений. Значит, "последние правки" уже находятся в рабочем дереве без текущего unstaged diff, либо репозитории чистые.

## Проверенная карта authorization gates

- Общие защищённые foreground routes подключены через `IrabiAuthMiddleware::authOnly`, `UserDataMiddleware::notDisabled`, `UserDataMiddleware::process`, `IdempotencyMiddleware::before`: `IRabi.php:196-209`.
- `authOnly` на каждый POST защищённого route проверяет Origin/Referer и CSRF до контроллера: `vendor/phpcraftdream/garnet-framework/Bundle/Modules/Auth/Middlewares/EmailAuthMiddleware.php:123-143`, `:213-223`.
- Disabled-session deny стоит сразу после auth и до бизнес/ staff gates: `Foreground/Middlewares/UserDataMiddleware.php:78-86`.
- Expert panel дополнительно gated по business role `expertOnly`: `IRabi.php:214-218`; state-changing expert actions требуют `isApproved()` или moderator+: `Foreground/Controllers/ExpertPanelController.php:62-77`, `:108-207`.
- Admin dashboard gated по moderator+: `IRabi.php:248-264`; system/pages gated по owner+: `IRabi.php:265-272`.
- Staff hierarchy: admin >= owner >= moderator, business roles user/expert независимы: `Foreground/Params/UserEntityConfig.php:178-201`.
- Mutating account/balance actions используют `actorMayActOn` для запрета self-target и действий по target rank выше actor rank: `Foreground/Params/UserEntityConfig.php:273-284`, `Dashboard/Controllers/DashboardUsersController.php:88`, `:178`, `:236`, `Dashboard/Controllers/DashboardFinanceController.php:364`.
- Public/no-auth routes: JS errors, `/sys/log`, `/sys/opcache-reset`, invite registration, static pages, dev-login: `IRabi.php:235-245`. `/sys/opcache-reset` gated shared secret and closed when token absent: `Foreground/Controllers/SysOpcacheResetController.php:31-48`. `/dev-login` gated by both dev env and dev directory: `Foreground/Controllers/DevLoginController.php:35-42`, `:155-159`.

## Findings

### F-14-01, Medium: moderator может читать и менять support tickets владельцев owner/admin без rank boundary

- **Статус: ПРИНЯТО КАК ПОЛИТИКА (accepted staff-access), изменений нет.** Подтверждено по коду: все admin-support действия (`ticketDetail`/`reply`/`internalComment`/`changeStatus`/`assign`/`download`/`userTickets` в `FwSupportAdminController`) гейтятся `isModerator()` без rank-проверки владельца тикета. Это отличается от Finding 4 в report 13 (там модератор *создавал* тикет от имени вышестоящего аккаунта — impersonation, запрещено). Здесь речь о *ведении существующего* тикета: обработка любых обращений — это и есть функция support-деска; если бы модератор не мог вести тикет owner/admin, такой тикет мог бы обслуживать только другой owner/admin, что ломает workflow поддержки. Владелец продукта подтвердил: оставить как есть (тот же вывод независимо дал параллельный аудит `14-fx`). Финансового/rank escalation здесь нет — это чтение и staff-обработка, а не мутация staff-флагов чужого высокорангового аккаунта.

Severity: Medium.

Impact: BOLA/privilege boundary bypass внутри staff plane. Moderator получает доступ к содержимому обращений owner/admin, внутренним комментариям, вложениям, статусам и назначению тикета. Это не даёт прямого `IS_OWNER`/`IS_ADMIN`, но обходит уже введённый инвариант "moderator не действует на owner/admin".

Preconditions: атакующий уже authenticated moderator, owner/admin имеет support ticket или attachment id известен/перебирается.

Файл/строка:
- `vendor/phpcraftdream/garnet-framework/Bundle/Modules/Support/Controllers/FwSupportAdminController.php:214-226` (`post__ticketDetail`) читает ticket по id и не проверяет rank владельца.
- `.../FwSupportAdminController.php:318-331` (`post__reply`) отвечает в ticket по id без rank check.
- `.../FwSupportAdminController.php:373-386` (`post__internalComment`) пишет internal comment без rank check.
- `.../FwSupportAdminController.php:413-426` (`post__changeStatus`) меняет status без rank check.
- `.../FwSupportAdminController.php:458-488` (`post__assign`) меняет assignee без rank check.
- `.../FwSupportAdminController.php:548-563` (`get__download`) отдаёт attachment по id любому moderator+.
- `.../FwSupportAdminController.php:570-581` (`post__userTickets`) отдаёт список тикетов любого account_id.

Exploit scenario: moderator шлёт прямой POST `/admin/support/~ticketDetail` с `ticket_id` тикета owner, получает переписку и internal context. Затем POST `/admin/support/~assign` назначает тикет себе или `/admin/support/~reply` пишет видимое сообщение от staff. Для вложений достаточно `GET /admin/support/~download?id=<attachment_id>`.

Invariant: rank boundary должен быть консистентным для всех admin actions, которые читают или меняют данные конкретного staff account: actor may act only on target with rank <= actor and not self for destructive/self-affecting operations. Этот инвариант уже явно применён к `setUserFlag`, `setUserType`, `removeUserPhoto`, `adjustBalance` и частично к support `createForUser` (`Dashboard/Controllers/DashboardSupportController.php:168-179`), но не к остальным support admin actions.

Remediation:
- В IRabi subclass добавить support-owner policy hook или override для admin support actions: перед чтением/изменением ticket загрузить `account_id` владельца и применить `UserEntityConfig::actorMayActOn($ticket['account_id'])` для moderator/owner boundaries.
- Для read-only `ticketDetail`, `userTickets`, `download` явно решить, разрешён ли self и equal rank; текущий `actorMayActOn` запрещает self, что может быть слишком строго для "посмотреть свой тикет" в admin UI. Если self-read нужен, добавить отдельный helper `actorMayViewStaffTarget`.
- Для `download` связывать attachment -> message -> ticket -> account_id и проверять тот же boundary, а не только moderator+.
- Добавить Playwright/API tests: moderator не может `ticketDetail/reply/internalComment/changeStatus/assign/download/userTickets` для owner/admin; owner может для moderator/user; admin может для owner/moderator/user.

### F-14-02, Medium: `/users/~preview` раскрывает агрегированную статистику любого пользователя любому authenticated account

- **Статус: ПРИНЯТО КАК ПОЛИТИКА + УСТРАНЕНО ПРОТИВОРЕЧИЕ.** Находка верна фактически (`UsersController::post__preview` отдаёт `name`/`avatar`/`type` + агрегаты броней/отмен по любому `user_id`; email/login никогда не раскрываются, disabled анонимизируется). Владелец продукта принял решение: **агрегированные booking/cancellation-счётчики обычного пользователя публичны везде** — это по сути публичный просмотр профиля. Однако это вскрыло противоречие с ранее отгруженным M-03 (report 12), который ограничивал те же счётчики на `/user/id~N` до self/staff/counterparty — то есть M-03-гейт был обходим через `/users/~preview`. Для консистентности **M-03 откачен**: `UserProfileController::canViewProfile()` удалён, `/user/id~N` снова публичен для любого authenticated actor, оставлена только анонимизация disabled (`AccountDisplay`). Итог: обе поверхности профиля (`/user/id~N` и `/users/~preview`) теперь согласованы — публичны, без утечки email/login, с единой анонимизацией disabled. Тест `Tests/cross-role/user-profile-access-policy.spec.ts` переписан под новую политику.

Severity: Medium.

Impact: IDOR/privacy leak. Любой залогиненный пользователь может получить имя, avatar URL, тип и агрегаты бронирований/отмен для произвольного `user_id`, включая обычных пользователей, с которыми он не связан. Это частично обходит более строгую policy для full profile.

Preconditions: атакующий authenticated; знает или перебирает numeric `user_id`.

Файл/строка:
- `Foreground/Controllers/UsersController.php:29-44` принимает любой `user_id` и грузит account row.
- `Foreground/Controllers/UsersController.php:60-76` определяет type/profile без проверки counterparty/public visibility.
- `Foreground/Controllers/UsersController.php:116-151` считает expert/user booking and cancellation stats.
- `Foreground/Controllers/UsersController.php:157` возвращает payload.

Exploit scenario: обычный user шлёт POST `/users/~preview` с `user_id=123`, затем перебирает ids и собирает `name`, `avatar`, `type`, `totalBookings`, `completedBookings`, `cancellations`. Для non-public user-профилей это шире, чем `GET /user/id~N`, где уже есть policy "own profile, staff, or expert counterparty" (`Foreground/Controllers/UserProfileController.php:36-76`).

Invariant: чужие non-public user profiles не должны подтверждать существование и раскрывать booking/cancellation counters всем authenticated accounts. Public expert data можно отдавать только если эксперт approved and active; обычные users должны быть видны только self/staff/counterparty по той же модели, что `/user/id~N`.

Remediation:
- Перед формированием payload разделить policy:
  - approved active expert: можно вернуть public expert preview;
  - regular user: разрешить только self, moderator+, или expert counterparty с booking relation;
  - disabled account: либо 404 для не-staff, либо только anonymized stub без stats.
- Не использовать наличие `ExpertProfiles` как тип для authorization; сверять `db_accounts.type` и approved/disabled flags через `UserEntityConfig::isApprovedActiveExpert`.
- Добавить тесты на прямые POST `/users/~preview`: user A не видит user B; expert видит только booked users; moderator видит; disabled target anonymized/no stats для non-staff.

## Подтверждённые исправления/позитивные наблюдения

- CSRF/Origin: защищённые POST routes централизованно проверяются `authOnly` до контроллеров. Дополнительные controller-level CSRF checks в bookings/comments/support/IM не вредят.
- Disabled accounts: общий `notDisabled` gate закрывает authenticated protected routes для disabled sessions.
- Owner/admin-only зоны: system settings and CMS pages подключены через `ownerOnly`.
- Manual balance adjustment: owner/admin-only, max amount, note validation, overdraft CAS for debits, `actorMayActOn` target rank guard.
- User flag/type/photo admin actions: allowed flags зависят от rank; owner minting owner/admin запрещён; self/upward target guard присутствует.
- Booking creation: direct slot id проверяет slot status, future time, self-booking, approved active expert, atomic seat reservation, duplicate booking guard, CAS balance debit and compensation.
- Booking/user cancellation: ownership or moderator+ required, status transition via CAS, no retroactive confirmed past cancellation, idempotent duplicate handling.
- Expert slot and booking mutations: scoped to own slots/bookings, unapproved expert mutation blocked unless staff, booked/free state checks present.
- Public sys endpoints: `/sys/opcache-reset` requires configured secret; `/sys/log` has input caps and per-IP fixed-window throttle; `/dev-login` requires dev env and dev directory.

## Непроверенные или частично проверенные области

- Не проводился dynamic exploit run against live server/DB; review статический.
- Не проверялись реальные production `app.ini` values: `env`, `allowed_origins`, `opcache_token`, наличие `.allow_tests`.
- Не проверялись все frontend call sites на наличие `X-Idempotency-Key`; server accepts missing key for backwards compatibility, поэтому replay/double-submit protection relies on endpoint-specific CAS/unique constraints where present.
- Не проводился full dependency audit Composer/npm.
- Не проверялась фактическая nginx/static serving policy для `Public/upload` и private `WorkDir`.

## Выполненные команды

- `git status --short; git diff --stat; git diff --name-only` в `D:\dev\garnet\Apps\IRabi`.
- `git status --short; git diff --stat; git diff --name-only` в `D:\dev\garnet\garnet-framework`.
- `git status --short; git diff --stat; git diff --name-only` в `D:\dev\garnet\Apps\IRabi\vendor\phpcraftdream\garnet-framework`.
- `rg --files` в `D:\dev\garnet\Apps\IRabi`.
- `rg -n "public static function (get|post)__|function (get|post)__" Foreground Dashboard -g "*.php"`.
- Targeted `Get-Content`/`rg` review по `IRabi.php`, middlewares, account role config, foreground/admin controllers, support framework controllers, idempotency/auth/session/router framework code.

Тесты не запускались: задача была review-only без изменения кода; для найденных issues нужны новые негативные authorization tests.

## GO/NO-GO

**GO** — после product/security acceptance обоих findings:
- **F-14-01** — принято как политика (accepted staff-access): support-стафф (moderator+) ведёт любые тикеты; это функция support-деска, не rank-escalation. Изменений в коде нет.
- **F-14-02** — принято как политика: агрегированные booking/cancellation-счётчики пользователя публичны везде (email/login не раскрываются). Устранено вскрывшееся противоречие — откачен M-03-гейт на `/user/id~N`, обе поверхности профиля приведены к единой публичной политике с анонимизацией disabled. Тест переписан.

`composer check` (PHPStan + CS) — чисто.
