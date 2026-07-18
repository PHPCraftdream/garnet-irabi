# Аудит 08 — Полнота интернационализации/локализации (i18n/l10n)

Дата: 2026-07-18
Область: `Foreground/I18n/*`, `Dashboard/*` (контроллеры), `garnet-framework/Bundle/Front/I18nGen/*`, `Front/I18nGen/*`, `Front/Islands/**`, `Foreground/Controllers/**`, `Dashboard/Controllers/**`, email-шаблоны `vendor/phpcraftdream/garnet-framework/Bundle/TwigTemplates/Email/*.twig`, `Common/Services/EmailNotifications.php`, `Common/System/AppSettings.php`, `IRabi.php`.

## Резюме

Словарь переводов (RU/EN) находится в образцовом состоянии: 898/898 ключей, полный паритет, отсутствуют рассинхронизации по `%s`/`%d`-плейсхолдерам, пустых значений нет. Механизм 3-формной русской плюрализации (`pluralize()` + `Slot_Plural_1/2/5`) реализован корректно там, где используется.

Однако сам факт паритета словаря **не означает** функциональную двуязычность продукта. Обнаружена системная проблема более высокого уровня: **приложение жёстко зафиксировано на русском языке на уровне бутстрапа** (`IRabi.php:519`, `$lang = 'RU'`), переключатель языка в UI отсутствует, `Accept-Language` не читается, у аккаунта нет поля языка/локали в БД — то есть весь английский словарь (898 ключей, включая generated TypeScript) в текущей поставке **недостижим ни одним путём в проде**: ни во фронтенде, ни в письмах, ни в SEO-тегах. Это уже зафиксировано как осознанное решение в более раннем аудите (`docs/handover-audit/15-content-copywriting-seo.md`, строка 96) — "не дефект, RU-only продукт для этой поставки" — но формулировка в `docs/customer-handover.md` ("EN/RU i18n parity = 100%", "GO по коду") создаёт риск неверных ожиданий у заказчика относительно реальной двуязычности продукта. Рекомендуется явно развести в документации понятия "паритет словаря" и "работающее переключение языка".

Отдельно, независимо от вопроса переключения языка, найдена системная и высокая по severity проблема: **backend возвращает сырые захардкоженные английские строки ошибок в JSON API**, которые фронтенд рендерит напрямую без прохода через i18n. Поскольку в проде UI всегда на русском (см. выше), это означает, что реальные пользователи **прямо сейчас** видят английские фрагменты текста ошибок в русскоязычном интерфейсе — это не гипотетическая проблема "для EN-локали", а видимый баг в текущей единственной работающей локали.

## Список отсутствующих/рассинхронизированных ключей

**Не найдено.** Программное сравнение (через собственный PHP-скрипт, загружающий оба класса `ForegroundI18nDataRu`/`ForegroundI18nDataEn` и сравнивающий `array_diff` по ключам) показало:

- `ForegroundI18nDataRu.php`: 898 ключей.
- `ForegroundI18nDataEn.php`: 898 ключей.
- Ключей, отсутствующих в EN: 0.
- Ключей, отсутствующих в RU: 0.
- Пустых значений (`''`) ни в одном языке: 0.
- `Front/I18nGen/I18nForeground.ts` (generated): 898 typed-методов, полностью соответствует PHP-источнику в обе стороны.

Ранее задокументированный в `docs/i18n.md` разрыв (11 ключей `Admin_Flag_*` + `Slot_Save`, отсутствовавших в EN на срез 2026-07-15) **уже устранён** коммитом `5076144` ("fix: i18n parity, booking approval GET-side gap, security docs", 2026-07-15) — проверено `git show` диффом, все 11 ключей присутствуют в текущем `ForegroundI18nDataEn.php`. `docs/i18n.md` не обновлён и по-прежнему описывает устаревшее состояние "887 ключей / 11 отсутствует" как текущее — документ-артефакт, вводящий в заблуждение (см. находки, Low).

### Плейсхолдеры (`%s`/`%d`)

Ключей с плейсхолдерами: 28 в RU, 28 в EN. Программное сравнение множества `%s`/`%d`-токенов по каждому парному ключу (regex `%[sd%]`, сравнение списка и порядка) — **расхождений не найдено**. Примеры проверенных пар: `Booking_PenaltyWarning` (`%d%% (%d ₽)` ↔ `%d%% (%s ₽)`... — фактически оба `%d%%` + `%d`, порядок идентичен), `Email_SupportUserReply_Body` (`%s`/`%s` в обоих), `cal_yom_tov_named`, `Dash_Welcome`, все `Email_*_Subject`. Расхождений по количеству, типу или порядку аргументов между RU и EN — нет.

## Находки по severity

### High

1. **Приложение фактически RU-only: язык захардкожен на бутстрапе, English недостижим.**
   `IRabi.php:519-521`:
   ```php
   $lang = 'RU';
   FwI18n::getInstance()->setLang($lang);
   ForegroundI18n::getInstance()->setLang($lang);
   ```
   Это единственное место в приложении (`grep -rn "setLang("` по всему репо, исключая `vendor/`), где вызывается `setLang()`. Нет чтения `Accept-Language`, cookie, query-параметра, поля аккаунта — ничего. Нет ни одного UI-переключателя языка (`grep` по `Front/**` на `LanguageSwitch|LangSwitch|switchLang|changeLang` — 0 совпадений). У сущности аккаунта (`garnet-framework/Kernel/Db/Entity/Account/DbAccount.php` + миграции) нет поля `lang`/`locale`/`ui_lang`. Следствие: весь EN-словарь (898 ключей, идеально синхронизированный) в проде **недостижим никаким путём** — ни во фронтенде (React), ни в письмах, ни в SEO/OG-тегах (`og_locale` вычисляется из того же зафиксированного `FwI18n::getLang()`, `IRabi.php:573,576`).
   Это уже помечено как осознанное решение в `docs/handover-audit/15-content-copywriting-seo.md:96` ("не является дефектом — RU-only продукт"). Проблема не в самом решении, а в том, что `docs/customer-handover.md:7,89,114` формулирует это как "EN/RU i18n parity достигнут (100%)" и "GO по коду" без явной оговорки, что реальное переключение языка в продукте отсутствует. Заказчику, ожидающему "минимум RU и EN" согласно ТЗ аудита, необходимо явно объяснить: словарь есть и синхронизирован, но фактическая двуязычность выключена и потребует (а) UI-переключателя, (б) чтения языка из запроса/аккаунта на бэкенде, (в) поля локали в схеме аккаунта.

2. **Захардкоженные английские строки ошибок в JSON API, минующие i18n — видимый баг прямо в текущей (RU) локали.**
   Десятки контроллеров возвращают литеральные английские строки через `ControllerTools::JSON(['error' => '...'])`, которые фронтенд рендерит без i18n-обёртки. Примеры (не исчерпывающий список):
   - `Foreground/Controllers/BookingsController.php:263,290` — `'Not authenticated'`
   - `Foreground/Controllers/BookingsController.php:295` — `'CSRF check failed'`
   - `Foreground/Controllers/BookingsController.php:307,342` — `'Slot not found or not available'`
   - `Foreground/Controllers/BookingsController.php:311` — `'Cannot book a past slot'`
   - `Foreground/Controllers/BookingsController.php:327,348` — `'Slot is full'`
   - `Foreground/Controllers/BookingsController.php:335` — `'Cannot book your own slot'`
   - `Foreground/Controllers/BookingsController.php:363` — `'Already booked'`
   - `Foreground/Controllers/BookingsController.php:386` — `'Insufficient balance'`
   - `Foreground/Controllers/SlotsController.php:290` — `'Slot has been rescheduled. Please refresh the page.'`
   - `Foreground/Controllers/SlotsController.php:304` — `"Slot #{$slotId} already booked"`
   - `Foreground/Controllers/ExpertPanel/ExpertBookingsService.php:119` — `'Booking is no longer pending (cancelled or already confirmed)'`
   
   а также аналогичный паттерн в `CommentsController.php`, `Dashboard/Controllers/*.php`, `BalanceAdjustModal`-related контроллерах.

   Фронтенд рендерит это напрямую без маппинга на i18n-ключ:
   - `Front/Islands/Bookings/BookingForm.tsx:60` — `setError(result.error || 'Unknown error')`, далее выводится как `{error}` в JSX.
   - `Front/Islands/SlotsCalendar/BookingModal.tsx:94` — `setError(r.error)`.
   - `Front/Islands/SlotsCalendar/SlotDetailModal.tsx:84` — `setCancelError(res.error)`.
   - `Front/Islands/AdminPanel/BalanceAdjustModal.tsx:59`, `Front/Islands/AdminPanel/UserDetailPanel.tsx:219,300` — тот же паттерн.
   - Также `Front/Islands/Bookings/SupportTicketTab.tsx`, `ExpertSlots/BatchSlotWizard.tsx`, `ExpertSlots/CreateSlotForm.tsx`.

   Контраст: `Foreground/Controllers/RegisterController.php:74,128` делает это правильно — `ForegroundI18n::t('Invite_Error_Title')` — то есть механизм в кодовой базе есть, но не используется системно для API-ошибок бронирований/слотов/баланса.

   Практическое следствие: поскольку UI сейчас всегда на русском (находка 1), реальный пользователь при неудачном бронировании, недостаточном балансе, попытке забронировать прошедший слот и т.д. **прямо сейчас** видит фрагмент английского текста посреди русского интерфейса. Это не теоретическая проблема EN-локали — это баг единственной работающей сегодня локали.

3. **Захардкоженные русские строки в примечаниях баланса — видны как есть при английской локали (если её когда-либо включат).**
   `Foreground/Controllers/BookingsController.php:397` — `'note' => 'Счёт #' . $bookingId`
   `Foreground/Controllers/BookingsController.php:415` — `'note' => 'Оплата #' . $bookingId`
   Значения сохраняются в `BalanceLedger` как есть (не через i18n-ключ) и рендерятся дословно в `Front/Islands/AdminPanel/LedgerSection.tsx:171` (`{entry.note ?? '—'}`) и в `Front/Islands/Bookings/BalanceIsland.tsx`. При гипотетическом включении EN-локали пользователь увидит русский текст "Счёт #123"/"Оплата #123" в истории транзакций.

4. **Письма всегда отправляются на русском независимо от намерения получателя — поля языка/локали в схеме аккаунта не существует.**
   `Common/Services/EmailNotifications.php` — каждый `build*()`-метод (строки 44, 114, 236, 258, 282, 309, 331, 352, 374, 395, 417, 440, 599) берёт `$t = ForegroundI18n::getInstance()`, то есть тот же процесс-синглтон, зафиксированный на `'RU'` в `IRabi.php:519-521`. В схеме `db_accounts`/`db_accounts_data` (EAV, framework `DbAccount`/`DbAccountData`) нет поля `lang`/`locale`/`ui_lang` — соответственно, даже если бы язык запроса варьировался, **сохранить и учесть язык конкретного получателя писем в принципе негде**. Это тот же корень, что и находка 1, но отдельно значим для email-канала: письмо о брони/платеже уходит на языке текущего HTTP-запроса (=всегда RU), а не на языке получателя, у которого этого языка вообще нет как атрибута.
   Twig-резолвер шаблонов (`Common/Services/EmailNotifications.php:102` → `$twig->render('Email/Email.twig', ...)`) технически способен выбрать `.ru.twig`/`.en.twig` вариант по активному `FwI18n`-языку (подтверждено случайной закэшированной компиляцией `Email.en.twig` в `WorkDir/TwigCache/`, оставшейся от иного запуска/теста) — то есть механизм работает, просто ему всегда подаётся `'RU'`.

### Medium

5. **Плюрализация: единственная точка с полной 3-формной русской плюрализацией используется только в одном месте UI.**
   `garnet-framework/Bundle/Front/Common/Utils/pluralize.ts` реализует корректную русскую формулу (1/2-4/5+, с учётом исключения `11-14`). Ключи `Slot_Plural_1/2/5` (`Foreground/I18n/ForegroundI18nDataRu.php:650-652`: `слот`/`слота`/`слотов`; EN: `slot`/`slots`/`slots`) существуют и корректно применены только в `Front/Islands/SlotsCalendar/SlotsCalendarIsland.tsx:217`. Остальные счётчики в приложении (брони, отмены, непрочитанные сообщения) не используют полную грамматическую плюрализацию — но при ближайшем рассмотрении это **не грамматическая ошибка**, а осознанный UI-паттерн "label: N" (не полное предложение с согласованием), см. п.6. Отмечено как Medium, а не High, потому что реальных "битых" грамматических предложений вида "у вас 2 бронь" не найдено — но сам факт, что механизм плюрализации не растиражирован на другие счётчики, стоит зафиксировать как технический долг для будущих строк, где потребуется полное предложение со счётчиком.

6. **`Booking_GroupCount` — label-паттерн "броней: %d" используется и при N=2..4, где родительный падеж множественного числа (5+) грамматически режет слух.**
   `Foreground/I18n/ForegroundI18nDataRu.php:599` — `'Booking_GroupCount' => 'броней: %d'`. Используется в `Front/Islands/Bookings/BookingsTab.tsx:285` только когда `group.bookings.length > 1` (строки 265-266: при `length === 1` рендерится одиночная карточка без этого счётчика) — то есть диапазон реального N здесь 2+. Для N=2,3,4 естественнее было бы "брони: 2", для N=5+ — "броней: 5". Поскольку это оформлено как ярлык-бейдж ("label: value"), а не полное предложение, критичным дефектом не является (частый и допустимый UI-паттерн), но при желании довести грамматику до идеала — кандидат на использование `pluralize()` с формами `бронь`/`брони`/`броней`.

7. **`Dashboard/Controllers/DashboardSystemController.php` — SEO/OPcache блок лейблов не проходит через i18n, хотя соседние лейблы в том же методе — проходят.**
   В `getLabels()` (район строк 104-128) большинство записей вызывают `$t->Admin_SystemSettings_*()`, но блок `seoTab/seoTitle/seoHint/seoDescription/seoDescriptionHint/seoOgImage*/seoTwitterSite*` и блок OPcache (`opcacheResetTitle/opcacheResetHint/opcacheResetBtn/opcacheResetSuccess/opcacheResetUnavailable`) — литеральные русские строки внутри того же массива. Непоследовательно с остальным файлом; при попытке когда-либо включить EN для админки эти лейблы останутся русскими.

8. **SEO/мета-теги — один язык на всё приложение по дизайну конфигурации, а не per-request.**
   `Common/System/AppSettings.php:57` (`seoDefaults()`) читает `description`/`ogImage`/`twitterSite` из единственного `app.ini` (`WorkDir/Config/app.ini:6-7`: `title = "Slotbook"`, `description = "Slotbook"`) без `.ru`/`.en`-вариантов — один текст на все локали. `og_locale` (`IRabi.php:573`) вычисляется из зафиксированного `FwI18n::getLang()`, то есть всегда `ru_RU`. Это прямое следствие находки 1, отдельно фиксируется здесь для SEO-контекста задания. Для текущего значения ("Slotbook" — название бренда) это не критично, поскольку бренд не переводится, но для per-page description статических страниц (`StaticPages`/`seo_description`) при появлении контента на разных языках потребуется расширение схемы — при этом эта конкретная тема (контент статических страниц) уже подробно разобрана в `docs/handover-audit/15-content-copywriting-seo.md`, дублировать не буду.

9. **Даты в письмах используют фиксированный ISO-подобный формат, не локале-зависимый (нейтрально, но не адаптирован).**
   `Common/Services/EmailNotifications.php:168` (`formatSlotInfo`) → `Common/System/DateUtils.php:26-38` (`formatForUser`) использует жёстко заданный `'Y-m-d H:i'`. Формат однозначен и не создаёт двусмысленности (не путает ДД/ММ), но и не переключается на "человеческий" en-US формат при иной локали — в отличие от фронтенда (см. находку "проверено-без-находок" ниже), где `Intl.DateTimeFormat` корректно ветвится по локали.

### Low

10. **`docs/i18n.md` описывает устаревший снимок как актуальное состояние.**
    Файл утверждает "897/887 ключей, 11 отсутствует в EN" на срез 2026-07-15 — фактически это уже исправлено тем же днём (коммит `5076144`). Документ не обновлён и по факту противоречит текущему состоянию репозитория и `docs/customer-handover.md`, который уже отражает исправление. Рекомендация: обновить `docs/i18n.md`, зафиксировав текущий паритет 898/898 и явно добавив раздел про находку 1 (язык захардкожен, переключателя нет).

11. **`Front/Islands/InviteError/InviteErrorIsland.tsx:33,49`** — лейблы `Email:` и `Telegram:` захардкожены как литералы (в отличие от соседнего `t.Invite_Contact_Phone()` на строке 41). Практическое влияние низкое: оба слова являются общеупотребимыми заимствованиями и в русском тексте выглядят органично, но формально это обход i18n-механизма и нарушение единообразия внутри одного компонента.

12. **`Front/Islands/Im/ImWidgetIsland.tsx:27`** — `title="Messages"` (HTML-tooltip) захардкожен на английском, не через `t.*()`. Низкая видимость (всплывающая подсказка), но не переключается при гипотетическом включении RU/EN-свитча.

13. **Валюта — символ `₽` захардкожен как литерал без `Intl.NumberFormat`/currency-абстракции.**
    Найдено в 5 местах: `Front/Islands/Bookings/BookingsTab.tsx:280`, `Front/Islands/Dashboard/NewsFeed.tsx:126`, `Front/Islands/ExpertSlots/components/ExpertCalendar.tsx:305`, `Front/Islands/SlotsCalendar/BookingModal.tsx:196`, `Front/Islands/SlotsCalendar/SlotCard.tsx:54`. Поскольку продукт работает с рублём как единственной валютой и адресован RU-рынку, риск низкий, но при гипотетическом мультивалютном/EN-расширении потребует рефакторинга через единую денежную-форматирующую функцию.

## Проверено — без находок

- **Паритет ключей RU/EN** (`Foreground/I18n/ForegroundI18nDataRu.php` ↔ `ForegroundI18nDataEn.php`): 898/898, полное совпадение множеств ключей в обе стороны. Дубликатов ключей внутри каждого файла — не найдено.
- **Паритет с generated TypeScript** (`Front/I18nGen/I18nForeground.ts`): 898 typed-методов, полностью соответствует PHP-источнику ключ-в-ключ.
- **Плейсхолдеры `%s`/`%d`**: 28 ключей с плейсхолдерами в каждом языке; программное сравнение количества/порядка токенов по каждой паре — расхождений не найдено.
- **Пустые значения переводов**: не найдено ни в RU, ни в EN.
- **Русская 3-форма плюрализации, где она реализована** (`Slot_Plural_1/2/5` + `pluralize()` в `garnet-framework/Bundle/Front/Common/Utils/pluralize.ts`): формула корректна (учитывает исключение `11-14`), единственное текущее место использования (`SlotsCalendarIsland.tsx:217`) работает правильно.
- **Форматирование дат/времени на фронтенде** (`garnet-framework/Bundle/Front/Common/Utils/DateUtils.ts`, `appLocale()`, `formatTs`/`formatTime`/`formatDateShort`/`formatDateLong`): корректно ветвится `ru-RU`/`en-US` через `Intl.DateTimeFormat` в зависимости от `window.__GARNET_UI_LANG__`. Сам код архитектурно готов к двуязычности — проблема исключительно в том, что `__GARNET_UI_LANG__` всегда получает константу `'RU'` от бэкенда (находка 1), а не в самом форматтере.
- **RTL/направление текста**: `dir="ltr"`/`dir="rtl"` — не найдено ни в одном Twig-шаблоне layout (`HtmlLayout.ru.twig`, полная проверка). Атрибут `dir` вообще не задаётся явно нигде, что нейтрально для текущих RU/EN (оба LTR) и не создаёт риска блокировки будущих языков — при добавлении RTL-языка потребуется добавить логику, но сейчас это не дефект.
- **SEO `og:*` теги — набор и генерация**: полный набор (`og:title`, `og:description`, `og:type`, `og:url`, `og:image`, `og:site_name`, `og:locale`) генерируется централизованно в layout-параметрах (`IRabi.php`); механически корректен и без хардкода конкретных URL/значений сверх уже описанного в находке 8 (единственный источник текста на все локали — по дизайну, не баг генерации).
- **`<html lang="...">`**: шаблон `HtmlLayout.ru.twig` templated корректно (`lang="{{ (lang|default('en'))|lower }}"`), не захардкожен литералом `lang="ru"` в разметке — просто параметр `lang` всегда приходит равным `'RU'` (находка 1).
