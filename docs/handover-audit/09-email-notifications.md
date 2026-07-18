# Аудит 09: Email-рассылки и уведомления (handover)

Дата: 2026-07-17. Аудитор: независимая проверка перед поставкой «под ключ».
Область: `Common/Services/EmailNotifications.php`, `Common/Services/NewsService.php`,
`Common/Tables/{EmailQueue,EmailAttempts,EmailThrottle,MailLog}.php`,
framework `Bundle/Modules/Email/*`, `Bundle/Modules/Logging/Mail/*`, `Kernel/Io/Mailer/*`,
`Bundle/Modules/Auth/Middlewares/EmailAuthMiddleware.php`, все `Email/*.twig`, конфиги `WorkDir/Config*`, `docs/`.
Изменения в код не вносились — только исследование.

---

## Резюме

Транзакционный email-контур приложения в целом добротный: очередь с попытками и dead-letter,
журнал всех отправок (`mail_log`), настройки частоты per-user, CAS-guard'ы бизнес-переходов,
из-за которых повтор HTTP-запроса не порождает второго письма, отсутствие хардкода
localhost/dev-доменов в шаблонах (все ссылки строятся из `base_url` конфига).

Однако для поставки «под ключ» есть три существенных операционных риска в самом драйвере очереди
(H-1…H-3): **двойная отправка при перекрывающихся запусках cron**, **вечное зависание писем в
статусе `sending` при падении процесса** и **фактическое retry-окно ~15–25 секунд**, после
которого письмо становится dead-letter навсегда без какого-либо UI для повторной отправки.
Кроме того, режимы «Раз в час/день» — это молчаливое подавление, а не дайджест: письмо об
отклонении брони может быть потеряно (M-1), а фолбэк имени на логин утекает email-адрес одного
участника другому (M-3). Инфраструктура доставляемости (SPF/DKIM/DMARC, plain-text часть,
List-Unsubscribe) не описана и не реализована (M-5).

Всего: 3 находки High, 6 Medium, 7 Low. Ни одна не требует переработки архитектуры — все
локальные.

---

## Находки

### HIGH

#### H-1. processQueue не имеет ни claim'а строк, ни защиты от параллельного запуска → двойная отправка писем

- `vendor/phpcraftdream/garnet-framework/Bundle/Modules/Email/FwEmailQueueService.php:95-158` — выборка
  `SELECT ... WHERE status IN ('queued','error') ...` (строки 99–105) и последующий
  `updateById(['status' => 'sending'], ...)` (122–124) **не атомарны**: между SELECT и UPDATE
  второй воркер успевает выбрать те же строки. UPDATE не содержит условия
  `WHERE status='queued'` и не проверяет `affected rows` — оба воркера пройдут дальше и оба
  вызовут `Mailer::sendHtmlMail()`.
- Защиты от перекрывающихся запусков нет нигде выше по стеку:
  `Common/Services/AppCronService.php:17-19` (регистрация задачи `email-queue`),
  `vendor/.../Kernel/Io/Cron/FwCronService.php` и `CMDCron.php` — ни lock-файла, ни `flock`,
  ни advisory-lock в БД. В `docs/deploy.md`/`docs/development.md` требование
  «не запускать cron внахлёст» (например, `flock -n`) не сформулировано.
- Сценарий: минутный cron `php garnet cron`; тик N подвис на медленном SMTP (50 писем ×
  таймаут), тик N+1 стартует параллельно → пользователи получают одинаковые письма дважды.
  Это ровно кейс «race condition между двумя воркерами» из п.6 задания: idempotency-guard на
  уровне бизнес-транзакции есть (CAS), а на уровне email-отправки — нет.
- Рекомендация: атомарный claim (`UPDATE ... SET status='sending' WHERE id=? AND
  status IN ('queued','error')` + проверка affected=1), либо `flock` вокруг задачи cron,
  либо `SELECT ... FOR UPDATE SKIP LOCKED`.

#### H-2. Падение процесса между `sending` и финальным статусом навсегда «замораживает» письмо

- `FwEmailQueueService.php:122-131`: строка переводится в `sending`, затем синхронно вызывается
  SMTP. Если PHP-процесс умирает между этими точками (OOM, kill, fatal, ребут сервера,
  обрыв соединения с БД), строка остаётся в `sending` навсегда: выборка
  `processQueue` (строка 100) берёт только `('queued','error')`, реаниматора «протухших
  sending» нет, `retry()` (173–191) тоже никем не вызывается (grep по проекту — 0 вызовов).
- Итог: письмо молча теряется, при этом в `email_attempts` и `mail_log` следа нет (падение
  произошло до `logAttempt`), т.е. потерю невозможно заметить даже по журналам.
- Рекомендация: watchdog «`sending` старше N минут → вернуть в `error` с инкрементом
  attempts» в том же cron-тике.

#### H-3. Retry-окно ~15–25 секунд + отсутствие какого-либо UI/процедуры для dead-letter

- `FwEmailQueueService.php:149`: задержка повтора — `time() + (5 * min($newAttempts, 10))`,
  т.е. 5 с, 10 с, 15 с. Это линейный, а не экспоненциальный backoff, и при дефолтном
  `max_attempts = 3` (enqueue, строка 58) все три попытки исчерпываются примерно за
  15–30 секунд. Любой сбой SMTP длиннее полуминуты (перезапуск postfix, сетевой blip,
  rate-limit провайдера) → письмо уходит в терминальный `error`
  (`next_attempt_at = NULL`, комментарий в `FwEmailQueue.php:17-19`) **навсегда**.
- Механизм ручного восстановления существует только в коде (`retry()`), но: в Dashboard нет
  ни просмотра `email_queue`, ни кнопки повторной отправки (grep по `Dashboard/` —
  `EmailQueue|retry|email_queue` не встречается); админ видит лишь `mail_log` со статусом
  `failed` (только чтение). Нет и алертинга по количеству dead-letter строк.
- Плюс к делу: dead-letter не «бесконечный ретрай», это хорошо, но de facto письмо
  «теряется навсегда» при кратковременном сбое — худшая из двух опций формулировки п.2 задания.
- Рекомендация: экспоненциальный backoff с минутами/часами (например 1м → 10м → 1ч → 6ч,
  max_attempts 5–6) и/или страница «Очередь писем» в админке с кнопкой retry + счётчик
  ошибок на дашборде.

### MEDIUM

#### M-1. «Раз в час/день» — это молчаливый drop, а не дайджест: теряются критичные письма

- `Common/Services/EmailNotifications.php:188-217` (`gate()`): при `hourly`/`daily`, если по
  категории уже было письмо в текущем окне, новое событие просто не отправляется — и нигде
  не накапливается (никакого digest-механизма в кодовой базе нет).
- Сценарий: пользователь выбрал «Раз в час» для «Бронирования» (UI-строки
  `Foreground/I18n/ForegroundI18nDataRu.php:641-643`). В 12:00 приходит письмо
  «Бронь подтверждена», в 12:10 эксперт отклоняет вторую бронь → письмо
  `bookingRejected` **молча теряется навсегда** (в news-ленте событие есть, но на почту не
  придёт никогда, а не «через час»).
- Дополнительно: окно потребляется **до** фактической отправки — `gate()` пишет
  `last_sent_at` (строки 210–215) до `enqueue`, так что если письмо позже уйдёт в
  dead-letter (H-3), окно всё равно потрачено, и следующие события часа тоже подавлены.
- Рекомендация: минимум — не применять hourly/daily к критичным типам
  (rejected/cancelled), максимум — честный дайджест (копить события, слать сводку cron'ом).

#### M-2. Нет per-user rate-limit при дефолтном режиме `each` — флуд писем при массовых действиях

- Дефолт всех категорий — `each` (`frequencyFor()`, строки 172–186: при отсутствии/битых
  prefs возвращается `'each'`), и в этом режиме `gate()` возвращает `true` без каких-либо
  ограничений (строки 193–195). Никакого верхнего потолка «N писем в час на получателя»
  в системе нет.
- Сценарии:
  - `Foreground/Controllers/SlotsController.php:444-469` — мультислотовое бронирование:
    один запрос пользователя, забронировавшего N слотов одного эксперта, породит N писем
    `bookingCreated` эксперту подряд (по одному на слот).
  - `Foreground/Controllers/ImController.php:195-227` — **каждое** IM-сообщение → письмо
    получателю (`EmailNotifications::newMessage`, строка 222). Показательна асимметрия:
    news-событие о сообщении троттлится 1 час (`NewsService::createMessageEvent` →
    `FwNewsService::createThrottledEvent`, `MESSAGE_THROTTLE_SEC = 3600`), а email — нет.
    Диалог из 30 реплик = 30 писем; это прямой путь к жалобам на спам и порче репутации
    отправляющего домена.
- Рекомендация: применить к email тот же часовой троттл, что и к news-событию new_message
  (хотя бы для CAT_MESSAGES), и/или общий потолок писем per-recipient per-hour.

#### M-3. Утечка email-адреса участника через фолбэк имени на логин

- `Common/Services/EmailNotifications.php:142-145`:
  `getAccountName()` → `return $row ? ($row['name'] ?? $row['login']) : '';` — если у
  аккаунта `name IS NULL` (имя не заполнено), в письмо подставляется **логин, т.е.
  email-адрес**.
- Куда утекает: `bookingCreated()` (471) — email студента в письме эксперту («Пользователь:
  ivanov@mail.ru»); `newMessage()` (522) — email отправителя в письме получателю, причём и в
  **теме** письма (`Email_NewMessage_Subject` = «Новое сообщение от %s»); `bookingConfirmed/
  Rejected` (484, 497) — email эксперта студенту.
- Контраст: `NewsService::resolveDisplayNames()` (`Common/Services/NewsService.php:114-162`)
  с явным комментарием «Never falls back to login so e-mail addresses are not leaked» —
  т.е. проектное правило существует, но `EmailNotifications` его нарушает. Тот же паттерн
  `$a['name'] ?: $a['login']` есть в UI эксперта
  (`Foreground/Controllers/ExpertPanel/ExpertBookingsService.php:60`).
- Это ответ на п.7 задания: данные ДРУГОГО участника (его email) попадают в письмо без
  необходимости. Рекомендация: использовать `NewsService::resolveDisplayNames()` (или тот же
  фолбэк `'#'.$id`) в `getAccountName()`.

#### M-4. Auth-письма идут мимо очереди; сбой SMTP на success-login роняет логин 500-кой

- `vendor/.../Bundle/Modules/Auth/Middlewares/EmailAuthMiddleware.php:610-627` (`sendCode`) и
  `638-662` (`sendSuccessLogin`) вызывают `Mailer::get()->sendHtmlMail()` синхронно, без
  очереди/ретраев. Для кода авторизации это осознанный компромисс (код должен прийти сейчас),
  но:
- `sendSuccessLogin` вызывается на строке 575 **после** успешной верификации кода и
  материализации аккаунта, без try/catch. `FwAppMailer::sendHtmlMail` (Logging/Mail,
  строки 52–59) перебрасывает исключение → пользователь, верно введший код, получает 500,
  хотя фактически уже залогинен (сессия/аккаунт созданы). Уведомительное письмо «вы вошли»
  не должно уметь ломать сам вход.
- Рекомендация: обернуть `sendSuccessLogin` в try/catch (или отправлять через очередь).

#### M-5. Доставляемость: нет plain-text части, нет List-Unsubscribe, SPF/DKIM/DMARC нигде не описаны, From-домен ≠ домен площадки

- `vendor/.../Kernel/Io/Mailer/Mailer.php:58-72`: письмо строится только `->html($htmlMessage)`
  — **нет `->text()` альтернативы**. Клиенты без HTML-рендера покажут пустоту/сырой HTML,
  спам-фильтры повышают скор за html-only multipart.
- Заголовок `List-Unsubscribe` не выставляется нигде (grep «unsubscribe/отписаться» по
  проекту — 0 в коде писем). Для транзакционных писем это не обязательно, но Gmail/Yandex
  учитывают его для bulk-похожих потоков (см. M-2: письма о каждом IM-сообщении по
  характеру ближе к рассылке).
- SPF/DKIM/DMARC: grep по `docs/` — упоминаний **нет вообще** (`deploy.md`,
  `customer-handover.md` содержат лишь «cron/mail проверить на целевом хостинге»).
  При этом прод-конфиг `WorkDir/Config/email.ini` показывает `from = "Slotbook
  <system@names72.ru>"` при `base_url = "https://slotbook.ru"` (`WorkDir/Config/app.ini:5`)
  — From-домен не совпадает с доменом бренда; для DMARC-alignment и узнаваемости писем
  заказчику при приёмке нужно либо перевести From на slotbook.ru с настроенными SPF/DKIM,
  либо задокументировать текущую схему.
- Рекомендация: добавить `->text(strip_tags(...))` в Mailer, раздел «Почта: SPF/DKIM/DMARC,
  From-домен» в `docs/deploy.md`, и в идеале `List-Unsubscribe: <mailto:...>,<https://.../~profile>`.

#### M-6. `mail_log` хранит полные тела писем и одноразовые auth-коды в открытом виде, без ротации

- `vendor/.../Bundle/Modules/Logging/Mail/FwAppMailer.php:27-78`: каждое письмо целиком
  (`body_html`) пишется в `mail_log`; для писем авторизации дополнительно
  `meta = {"auth_code": "..."}` (`setNextMeta`, EmailAuthMiddleware:619). Тело письма
  авторизации само содержит код и magic-link `#token=<код>` (authEmailParams:689-697).
- Кто видит: админы через `DashboardMailLogController` / `DashboardLogsController`
  (колонка «Текст» — `Admin_MailLog_Body`). Риск ограничен: код короткоживущий
  (`codeSecondsTTL`) и проверяется против **сессии жертвы**, так что чужой браузер по
  magic-link не войдёт; но код, вставленный в открытую у жертвы форму, сработал бы, и
  политика «админ не видит секретов пользователей» нарушена. Плюс тела писем (превью
  личных сообщений из `newMessage`) хранятся бессрочно: очистка только ручная/тестовая
  (`ClearLogsService`, gated behind test mode) — авторотации `mail_log` нет.
- Рекомендация: маскировать auth_code в meta (или хранить хеш), не сохранять body для
  `mail_type = auth_code`, добавить cron-ротацию mail_log (например, 90 дней).

### LOW

#### L-1. Race в `gate()`: check-then-upsert неатомарен

- `EmailNotifications.php:200-215`: чтение `last_sent_at` и последующий
  `INSERT ... ON DUPLICATE KEY UPDATE` — два запроса; два одновременных триггера в
  hourly/daily-режиме оба увидят старый timestamp и оба отправят письмо. Уникальный индекс
  `account_category` (`EmailThrottle.php:21`) корректно предотвращает дубли строк, но не
  дубли решений. Малая вероятность, малый ущерб. Атомарный вариант:
  `UPDATE ... SET last_sent_at=? WHERE ... AND last_sent_at < ?` + проверка affected.

#### L-2. `absoluteUrl()` молча деградирует до относительной ссылки

- `EmailNotifications.php:125-135`: при недоступности конфига возвращается голый `$path` —
  в почтовом клиенте кнопка CTA получит `href="/bookings/"` и будет мёртвой. Лучше бросать
  исключение/логировать, чем отправлять письмо с неработающей ссылкой.

#### L-3. `post__sendTestEmail` разбирает синглтон Mailer и обходит mail_log

- `Dashboard/Controllers/DashboardSystemController.php:186-214`: `Mailer::reset()` +
  `Mailer::get()` создают «сырой» Mailer без `AppMailer`-обёртки (обёртка ставится один раз
  при boot: `IRabi.php:517`). Следствия: (а) тестовые письма не журналируются в `mail_log`;
  (б) после `finally { Mailer::reset(); }` любой последующий вызов `Mailer::get()` в этом же
  запросе также получил бы «сырой» Mailer — без журнала и без `.test`-заглушки. Сейчас в
  этом запросе других отправок нет, но это мина на будущее.

#### L-4. Пример конфига содержит синтаксически некорректный From

- `WorkDir/ConfigExample/email.ini:6`: `from = "<Helpful service> mail@localhost.local"` —
  угловые скобки вокруг display-name вместо адреса. Symfony `Address::create()` на такой
  строке падает/парсит неожиданно; заказчик, копирующий example при развёртывании, получит
  неочевидную ошибку. Корректно: `"Helpful service <mail@example.com>"`.

#### L-5. Письма продолжают уходить отключённым (blocked) аккаунтам, и имена disabled-акторов в письмах не анонимизируются

- `EmailNotifications::getAccountEmail()/getAccountName()` (137–145) не проверяют статус
  аккаунта. В news-ленте заблокированные анонимизируются
  (`NewsService.php:156-159` → `AccountDisplay::disabledName`), в письмах — нет: получатель
  письма увидит реальное имя заблокированного актора, а сам заблокированный продолжит
  получать уведомления о бронях/сообщениях.

#### L-6. Нет ретенции для `email_queue`/`email_attempts`; тела писем хранятся дважды

- Отправленные строки `email_queue` (c `LONGTEXT body_html`) никогда не удаляются; тело
  каждого письма дублируется в `mail_log.body_html`. `ClearLogsService::LOG_TABLES`
  (`Common/Services/ClearLogsService.php:25-32`) включает `mail_log`, но не включает
  `email_queue`/`email_attempts`. На длинной дистанции — раздувание БД.

#### L-7. Мелочи шаблонов

- `Bundle/TwigTemplates/Email/Email.en.twig` / `.ru.twig`: `<html lang="auto">` —
  невалидное значение атрибута `lang` (нужен BCP-47 код или отсутствие атрибута).
- `H2.en.twig` рендерит `<h1>` со стилями h2 (семантическая мелочь для скринридеров).
- `CodeHighlight.twig`: `{{ code }}` авто-экранируется Twig'ом — безопасно (отмечено для
  полноты).

---

## Проверено — без находок

1. **Хардкод ссылок на localhost/dev-домен** — не обнаружен. Все ссылки в письмах строятся
   через `absoluteUrl()` из `app.ini base_url` (`EmailNotifications.php:125-135`); magic-link
   авторизации собирается из `base_url` + текущий URI, сознательно НЕ из HTTP_REFERER
   (`EmailAuthMiddleware.php:681-689`, есть поясняющий комментарий). В самих Twig-шаблонах
   (`Bundle/TwigTemplates/Email/*.twig` — прочитаны все 15 пар en/ru) абсолютных URL нет
   вообще: href всегда приходит параметром. Прод `base_url = https://slotbook.ru` корректен;
   `localhost:8002` — только в `ConfigDev`.
2. **Идемпотентность бизнес-триггеров писем** (п.6). Все переходы, порождающие письма,
   защищены CAS-апдейтами со статусной проверкой, и письмо отправляется только при
   `affected === 1`: подтверждение (`ExpertBookingsService.php:113-137`), отмена экспертом
   (168–228), отмена пользователем (`BookingsController.php:513-521`, при affected=0 —
   идемпотентный success без письма). Мультислотовое бронирование шлёт письма только по
   фактически созданным броням (`SlotsController.php:447-450`, `createdSlotIds`,
   duplicate-key-skipped исключаются). Повтор HTTP-запроса/двойной клик второго письма не
   создаёт. (Ограничение — H-1: на уровне самой очереди idempotency-guard отсутствует.)
3. **Утечка секретов в теле писем** (п.3в). Код подтверждения в auth-письме — ожидаемо
   (magic-link сценарий); паролей в системе нет (passwordless), session-токены/куки в тела
   писем не попадают. Превью IM-сообщения обрезается до 100 символов
   (`ImController.php:222`) и экранируется (`LabelValueRow.twig`: `value | e | nl2br`).
   Header-injection невозможен: subject/адреса не собираются из сырого пользовательского
   ввода в заголовки (подтверждает и предыдущий аудит `docs/security-audit/04`).
4. **Приватность мульти-слота** (п.7, кроме M-3). В письмах о брони нет данных других
   участников слота: `bookingCreated` эксперту содержит только имя конкретного студента,
   `bookingConfirmed/Rejected/Cancelled` студенту — только имя эксперта/отменившего,
   дату/длительность/причину. Email/телефон второго участника мульти-слота не включаются
   ни в один шаблон (проверены все builder'ы, `EmailNotifications.php:235-457`).
5. **Спам-слова в темах** (п.4). Темы (`ForegroundI18nDataRu.php:785-812`) — нейтральные
   транзакционные («Новая бронь на %s», «Ответ на обращение #%d»); CAPS, «бесплатно»,
   «!!!», денежных приманок нет. Тестовые письма из админки помечаются префиксом.
6. **News: актуальность имени актора** (п.5 — класс бага, чинившийся ранее).
   `NewsService::decorateFeedItems()` (84–111) перерезолвивает имя по `actor_id` для КАЖДОГО
   элемента ленты при каждом чтении — переименование пользователя/эксперта (включая смену
   `display_name` в профиле эксперта) автоматически отражается и в СТАРЫХ событиях; сверено,
   что во всех типах (`new_slot`, `slot_booked`, `booking_confirmed/rejected/cancelled`,
   `new_message`) отображаемая персона (`payload.expert_id/user_id/sender_id` в
   `Front/Islands/Dashboard/NewsFeed.tsx:45-77`) совпадает с `actor_id` события — подмена имени
   консистентна. Аватары в ленте не отображаются вовсе → проблемы «устаревшего аватара в
   старых событиях» нет по построению. Disabled-аккаунты анонимизируются
   (`AccountDisplay.disabledIds/disabledName`), удалённые получают стабильный `#id`, фолбэка
   на логин в ленте нет.
7. **Rate-limit на отправку auth-кода** — есть: `RateLimit::hit('email_auth:'+email, 5, 600)`
   (`EmailAuthMiddleware.php:361-365`) — максимум 5 писем с кодом за 10 минут на адрес,
   плюс гейт регистраций. Флуд auth-писем на чужой ящик ограничен.
8. **Dev/test-защита от случайного SMTP-трафика** — двухуровневая: `.test`-адреса
   short-circuit'ятся и в очереди (`FwEmailQueueService:110-120`), и в
   `FwAppMailer` (dev/TestScope, 45–50); `enabled = 0` в dev-конфиге глушит отправку целиком
   (`Mailer.php:61-63`).
9. **Журналирование отправок** — каждая реальная попытка фиксируется дважды: попыткой в
   `email_attempts` (`logAttempt`) и записью в `mail_log` со статусом sent/failed + текстом
   ошибки; админ видит журнал в Dashboard (`DashboardMailLogController`,
   `DashboardLogsController:63-83`). Ошибки логирования сами не ломают отправку
   (try/catch в обоих местах).
10. **`enqueueToMany` модераторам** (`supportTicketCreated`, `supportUserReply`) — gate
    применяется индивидуально к каждому модератору, письма создаются отдельными строками
    очереди; падение одной отправки не блокирует остальных.

---

## Приложение: карта потока

```
бизнес-событие (CAS-guarded контроллер)
  → EmailNotifications::<type>()            [prefs-gate: off/each/hourly/daily]
  → FwEmailQueueService::enqueue()          [email_queue, status=queued]
  → cron: php garnet cron → email-queue     [AppCronService, лимит 50/тик, БЕЗ lock — H-1]
  → FwEmailQueueService::processQueue()     [sending → sent | error; backoff 5/10/15s — H-3]
  → Mailer::get() = AppMailer(Mailer)       [Symfony SMTP; html-only — M-5]
  → mail_log (+ email_attempts)             [полные тела, auth_code в meta — M-6]

вне очереди (синхронно): auth-код, success-login (M-4), тестовое письмо админки (L-3)
```
