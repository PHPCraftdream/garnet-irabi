# Независимый security-аудит IRabi (раунд 15)

**Дата:** 2026-07-18.
**Аудитор:** независимый (Sonnet 5, effort high), read-only, без вызова под-агентов (по прямому запрету глобальной инструкции пользователя на вызов под-агентов без явного согласования).
**Область:** `Apps/IRabi` (`Foreground/Controllers`, `Dashboard/Controllers`, `Foreground/Params/UserEntityConfig.php`, `IRabi.php`, `Common/Services`, `Common/Tables`), корневой `garnet-framework` и вендоренная копия `Apps/IRabi/vendor/phpcraftdream/garnet-framework`.

## Метод

Проведены 14 раундов до этого (см. `00-SUMMARY.md`…`14-*.md`) уже закрыли основной пласт IDOR/BOLA/rank-guard/CSRF/idempotency-находок. Этот раунд намеренно НЕ повторяет authorization-аудит, а целится в категории, явно вынесенные в задание и ранее не покрытые системно:

- mass-assignment через JSON-биндинг тела запроса;
- SSRF в исходящих запросах (email-рендеринг, вебхуки, аватары/картинки по URL);
- XXE в XML-парсерах;
- небезопасная десериализация (`unserialize`), `eval`/`extract`;
- path traversal в upload/download;
- ReDoS в пользовательских regex;
- timing-атаки на секретные сравнения (за пределами уже проверенных `hash_equals`-мест);
- default-права на upload-директории/файлы;
- CORS-конфигурация;
- security-заголовки (CSP/X-Frame-Options/HSTS/nosniff);
- cookie-флаги (Secure/HttpOnly/SameSite);
- rate-limiting на login/code-verify;
- enumeration через различающиеся error-сообщения;
- клиентские XSS/race-condition паттерны, похожие на найденный ранее в этой сессии баг с magic-link в `Auth2.tsx` (файл на самом деле лежит в `garnet-framework/Bundle/Front/auth/Auth2.tsx`, вендорится в IRabi);
- upload-пайплайн (аватары, вложения IM/support): MIME-sniffing, magic-bytes, лимиты, физическое хранение и раздача.

Прочитан код целиком построчно в затронутых файлах (не выборочно), проверены реальные вызовы конечных функций (`SecureFileServing::serve`, `FileUploadManager::validateFile`, `ImageUpload::saveImage`, `RateLimit::hit`, `AuthConfig::isOriginAllowed`, Twig-шаблоны с `|raw`, CommonMark-конфигурация), а не только сигнатуры. Изменения в код не вносились.

## Резюме — GO / NO-GO: **GO с одним MEDIUM для устранения перед финальной поставкой**

Критических/высоких находок с прямым эксплойтом не обнаружено. Основные защитные механизмы (CSRF `hash_equals`, session/CSRF-cookie флаги, upload MIME+extension whitelisting, path traversal containment, markdown-рендеринг статических страниц через захардненный CommonMark) в реальности работают так, как заявлено в комментариях кода — что не всегда тривиально при чтении «по диагонали». Найдена одна новая MEDIUM-находка (account enumeration через различающиеся auth-ответы в режиме «регистрации отключены») и несколько LOW/hardening-замечаний, которые дополняют (но не дублируют) уже задокументированные F-05-01/F-05-02 из раунда 5.

---

## Находки

### M-15-1 (MEDIUM, CONFIRMED) — Account enumeration через `/auth` при отключённых регистрациях

**Файл:** `garnet-framework/Bundle/Modules/Auth/Middlewares/EmailAuthMiddleware.php:326-378` (вендоренная копия: `Apps/IRabi/vendor/phpcraftdream/garnet-framework/Bundle/Modules/Auth/Middlewares/EmailAuthMiddleware.php`), активируется через `Dashboard/Controllers/DashboardSystemController.php:174,272` (переключатель `registrations_enabled` в `/dashboard/system`).

**Механика.** `IrabiAuthMiddleware extends EmailAuthMiddleware` (`Foreground/Middlewares/IrabiAuthMiddleware.php:15`), поэтому вся логика `processPhaseNullPost` активна в проде без переопределения этого блока. Когда owner в дашборде выключает `registrations_enabled` (легитимный «invite-only» режим — платформа явно поддерживает его: есть отдельный `RegisterController` с инвайт-токенами именно для закрытой регистрации), эндпоинт `POST /auth` (action = отправка `auth_email`) начинает возвращать РАЗНЫЕ ответы в зависимости от того, существует ли аккаунт:

```php
if (!FwAppSettings::registrationsEnabled()) {
    $isExisting = Account::get($authEmailStr)->id() > 0;
    ...
    if (!$isExisting && !$isOwnDomain && !$isTestScope) {
        return ControllerTools::JSON([
            'message' => FwI18n::t('Auth_RegistrationsDisabled', [$contact]),
        ], status: 403);
    }
    ...
}
...
static::sendCode($globals, $authEmailStr);   // код реально отправляется
return ControllerTools::JSON(['message' => ... 'Auth_CodeSent'], status: 200);
```

- email, привязанный к существующему аккаунту → HTTP 200, `{message: "Код отправлен"}` (код реально уходит на почту).
- email, не привязанный ни к какому аккаунту (и не на домене сайта) → HTTP 403, `{message: "Регистрации закрыты, обратитесь в поддержку"}`.

Разница в HTTP-статусе и тексте ответа — прямой, дешёвый, неаутентифицированный оракул существования аккаунта по email. Единственная защита от перебора — `RateLimit::hit('email_auth:'.$email, 5, 600)` (5 попыток/10 минут **на конкретный email**, не глобально по IP) — это ограничивает скорость перебора одного адреса, но НЕ мешает проверять список из тясяч разных email-адресов (утечка базы, таргетированный фишинг/OSINT на конкретных экспертов/клиентов) — по 5 запросов на каждый адрес разрешено сразу, лимит per-key, а не per-IP-aggregate.

**Кому это вредно.** Именно в «invite-only»-режиме операторы обычно наиболее заинтересованы скрыть, кто зарегистрирован (например, конфиденциальный список клиентов эксперта). Данная утечка компрометирует именно этот сценарий.

**Exploit path.** Атакующий, зная, что сайт в режиме "registrations disabled" (сообщение видно прямо в UI формы логина неавторизованному пользователю), скриптует перебор кандидатных email по списку (утечки, whois, LinkedIn и т.п.) через `POST /auth {action: 'start-session', ...}` → `POST /auth {auth_email: candidate}` и читает HTTP-статус ответа.

**Remediation.**
1. Возвращать одинаковый HTTP-статус (200) и одинаковый нейтральный текст независимо от `$isExisting`, различая поведение только сервер-сайд (реально слать код только существующим/own-domain, но всегда отвечать "если этот адрес зарегистрирован — мы отправили код").
2. Добавить per-IP агрегированный rate-limit (не только per-email) на этот эндпоинт, чтобы массовый перебор разных адресов с одного источника тоже гасился.

---

### L-15-1 (LOW, CONFIRMED, hardening) — Отсутствуют базовые security-заголовки ответа (nosniff/HSTS/Referrer-Policy) на всех маршрутах

**Файлы:** `garnet-framework/Kernel/Io/Router/ControllerTools.php` (методы `ok`, `JSON`, `okFile`, `okFilePath`, `redirect`), `garnet-framework/Kernel/Io/Emitter/Emitter.php` (весь класс, единственные добавляемые заголовки — `X-Powered-By`, `Content-Length`, `Content-Encoding`).

Ни в одном из общих response-хелперов и ни в `Emitter` (финальная точка отправки всех HTTP-заголовков в проде) не выставляются:
- `X-Content-Type-Options: nosniff`,
- `Strict-Transport-Security` (HSTS),
- `Referrer-Policy`,
- `X-Frame-Options` (единственная защита от clickjacking — `Content-Security-Policy: frame-ancestors 'self'`, но только в `ControllerTools::ok()`, то есть только на HTML-страницах; JSON/файловые ответы её не получают).

Это ортогонально уже задокументированной находке F-05-01 (раунд 5): отсутствие `nosniff` конкретно усиливает риск inline-раздачи `text/plain`/`text/log`-вложений через `SecureFileServing::serve()` (см. ниже), но само по себе является отдельным, более широким hardening-пробелом на уровне всего приложения, а не только upload-модуля.

**Remediation.** Добавить `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Strict-Transport-Security: max-age=31536000; includeSubDomains` (только когда `isSecureRequest()`) глобально — либо в `Emitter::emit()`, либо через выделенный middleware в общей цепочке `$common` в `IRabi.php`.

---

### L-15-2 (LOW, CONFIRMED, edge-case) — «Молчаливый обход» MIME-whitelisting при неопределяемом `finfo`-типе

**Файл:** `garnet-framework/Kernel/Io/FileUpload/FileUploadManager.php:163-181` (`validateFile`).

```php
$finfo = new finfo(FILEINFO_MIME_TYPE);
$realMime = $finfo->file($file['tmp_name']);

if ($realMime !== false && !empty($rules->allowedTypes)) {
    // ... MIME whitelist проверка ...
}
```

Если `finfo->file()` возвращает `false` (реалистично для нестандартных/повреждённых/редких файлов, где magic-bytes не распознаются), проверка MIME **полностью пропускается** — файл проходит только по whitelist расширения (`jpg/jpeg/png/gif/webp/pdf/txt/log` для IM/support-вложений). Расширение — заголовок, полностью подконтрольный клиенту (`$file['name']`), поэтому в этом edge-case файл с произвольным содержимым, но именем `x.txt`, проходит валидацию без реальной проверки содержимого.

**Почему не выше severity.** Разрешённые расширения не включают исполняемые/интерпретируемые на стороне сервера типы (`.php` и т.п. запрещены отдельным давно проверенным механизмом — расширение не входит в whitelist ни при каком raw-контенте), а раздача — через `SecureFileServing::serve()`, который сам вычисляет `Content-Type` по РАСШИРЕНИЮ display-имени через `Mime::getFileMime()` (не через реальный, а не переданный сюда `$realMime`), так что итоговый эффект этого edge-case — вложение с несоответствующим содержимым будет отдано с Content-Type, соответствующим его расширению (напр. `.txt` → `text/plain` inline). Прямого RCE/XSS-эксплойта не найдено, потому что раздача inline ограничена `isInlineSafe()` до `image/*`, `application/pdf`, `text/*`, а SVG (классический вектор `image/svg+xml` + `<script>`) не входит в allowed-extensions ни для support/IM (`documentsAndImages()` → нет `svg`), ни для аватаров (`imagesOnly()` → нет `svg`).

**Remediation.** Трактовать `$realMime === false` как отказ валидации (`return 'Unable to determine file type'`), а не как «пропустить проверку».

---

### L-15-3 (LOW, PLAUSIBLE, defense-in-depth) — Клиентский markdown-рендерер без HTML-экранирования используется в admin self-preview

**Файлы:** `garnet-framework/Bundle/Front/Common/Utils/markdownToHtml.ts` (весь файл), используется в `garnet-framework/Bundle/Front/Common/Components/StaticPages/StaticPagesAdminIsland.tsx:1499,2445` (`dangerouslySetInnerHTML={{__html: markdownToHtml(localContent)}}`, переключатель "Preview" в редакторе блоков/сниппетов статических страниц).

В отличие от серверной версии (`FwStaticPagesService::markdownToHtml`, PHP, см. «Проверено без находок» ниже), клиентская TS-реализация НЕ экранирует HTML в исходном тексте и НЕ фильтрует `javascript:`-ссылки:

```ts
.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
```

`href` подставляется в атрибут без какой-либо санитизации схемы — `[x](javascript:alert(1))` даёт кликабельную XSS-ссылку в preview; сырой HTML в тексте (`<img src=x onerror=alert(1)>`) тоже проходит без экранирования, так как функция не эскейпит вообще ничего перед применением regex-замен.

**Почему LOW, а не выше.** Маршрут — `DashboardStaticPagesController`, гейтится `ownerOnly` (`IRabi.php:267-271`). Контент, который видит владелец в Preview — это контент, который он сам только что напечатал в том же браузере/сессии (self-XSS: `localContent` — локальный React-state textarea, не сохранённые чужие данные). Класс риска ниже, чем stored-XSS от чужого пользователя, но:
- если когда-либо появится совместное редактирование (несколько owner-аккаунтов правят один и тот же черновик, один видит Preview содержимого, введённого другим) — риск становится межпользовательским;
- сама рассинхронизация «сервер безопасен, клиент — нет» для одной и той же функции с одинаковым именем (`markdownToHtml`) — источник будущих ошибок сопровождения (кто-то может по аналогии скопировать клиентскую версию в новое место, посчитав её эквивалентно безопасной).

**Remediation.** Либо экранировать HTML-спецсимволы перед применением replace-цепочки и блокировать `javascript:`/`data:` в `href` (зеркалируя `allow_unsafe_links=false` серверной версии), либо (предпочтительно) не дублировать логику — гонять preview через тот же серверный CommonMark-эндпоинт при показе.

---

## Проверено — БЕЗ находок (новые за этот раунд, не дублируют 00–14)

- **Mass assignment через JSON-биндинг тела запроса.** `GlobalReqParams::currentPost()` (`Kernel/Core/GlobalReqParams/GlobalReqParams.php:38-61`) действительно мёржит `php://input` как JSON поверх `$_POST` (`$post = [...$post, ...$postData]`), так что произвольные JSON-ключи в теле запроса физически достижимы контроллером. Но путь сохранения профиля (`RegMiddleware::processPost` → `IEntityConfig::saveOne($globals->readPostAll(), $config->editFields(), ...)`, `BaseEntity.php:73-97`) вызывает `filterKeys($postData, $fields)` (`:79`) — жёсткий allow-list по `editFields()` (`id, login, name, time_zone, about, photo, photo_crop, crop_info`), который явно НЕ включает `type`/`IS_ADMIN`/`IS_MODERATOR`/`IS_APPROVED`/`IS_DISABLED` (см. `UserEntityConfig::editFields()` vs `dataFields()`, `Foreground/Params/UserEntityConfig.php:53-76`). Инъекция `{"IS_ADMIN": 1}` в теле POST `/~profile_edit` физически парсится, но отбрасывается на этапе `filterKeys` до попадания в SQL. Эскалации привилегий через это не найдено.
- **SSRF.** Полнотекстовый поиск `GuzzleHttp\Client`/`curl_init`/`file_get_contents(<url>)` по `Foreground`, `Common`, `Dashboard`, `garnet-framework/Kernel`, `garnet-framework/Bundle` — исходящих HTTP-запросов на пользовательский URL нет нигде (email-рендеринг — чистый Twig на серверных данных; `ExternalController` — клиентский redirect-interstitial без серверного fetch; вебхуков во внешние системы в кодовой базе не обнаружено). Подтверждает вывод раунда 1.
- **XXE.** Поиск `simplexml_load*`, `DOMDocument`, `SimpleXMLElement`, `loadXML`, `XMLReader` по всему `Apps/IRabi` и `garnet-framework` (кроме vendor) — ни одного XML-парсера в прикладном коде нет.
- **Небезопасная десериализация / eval / extract.** Поиск `unserialize(`, `eval(`, `extract(`, `create_function(` по `Foreground`, `Common`, `Dashboard`, `IRabi.php`, `garnet-framework/Kernel`, `garnet-framework/Bundle` — ни одного вхождения.
- **ReDoS.** Просмотрены все `preg_match`/`preg_replace`/`preg_match_all` вызовы в `garnet-framework/Kernel` и прикладном коде IRabi (полный список см. текст исследования) — везде ограниченные символьные классы или простые альтернации без вложенных квантификаторов (`(a+)+`-паттернов нет). Катастрофического backtracking не найдено ни в одном regex, включая клиентский `markdownToHtml.ts` (используются non-greedy `.+?` без вложенности) и серверный `Updater::simpleText`/`nameSymbols`.
- **Timing-атаки вне уже проверенных `hash_equals`-мест.** CSRF-сравнение фактически используемого в проде класса — `EmailAuthMiddleware::checkCSRF()` (базовый класс `IrabiAuthMiddleware`) — использует `hash_equals()` (`:205` файла `EmailAuthMiddleware.php`). Обнаружен НЕ constant-time `$postToken === $sessionToken` в СЕСТРИНСКОМ классе `garnet-framework/Bundle/Modules/Auth/Middlewares/AuthMiddleware.php:197` — но этот класс НЕ используется приложением IRabi (`IrabiAuthMiddleware extends EmailAuthMiddleware`, не `AuthMiddleware`; `grep` по всему `Apps/IRabi` не находит `AuthMiddleware::class` вне вендоренной копии самого фреймворка) — мёртвый для IRabi код, не эксплуатируемая находка в контексте этого приложения (но потенциальный риск для ДРУГИХ приложений на том же фреймворке, если они используют `AuthMiddleware` напрямую — вне зоны этого аудита). Код OTP-подтверждения (`processPhaseSentCodePost`) сравнивает `$postCodeStr === $sessionCode` без `hash_equals`, но это не эксплуатируемо: лимит 3 попытки на сессию + TTL 300 сек делает и timing-атаку, и brute-force на 8-символьный код (буквенно-цифровой) практически невозможными вне зависимости от constant-time сравнения.
- **Rate-limiting на login/code-verify.** `RateLimit::hit()` (`Kernel/Io/RateLimit/RateLimit.php`) — файловый sliding-window лимитер с `flock`-блокировкой, честно реализован (fail-open только при недоступности storage, что приемлемо). На запрос кода — 5 запросов/600 сек на email; на ввод кода — 3 попытки на сессию + 300-сек TTL. Оба предела активны в реально используемом классе (`EmailAuthMiddleware`/`IrabiAuthMiddleware`).
- **CORS.** Ни `Access-Control-Allow-Origin`, ни другие CORS-заголовки нигде не выставляются — приложение не предоставляет кросс-доменного API, поэтому same-origin policy браузера полностью блокирует чтение ответов с чужих источников. Наличие `isOriginAllowed()`(`AuthConfig.php:62-82`) используется исключительно для anti-CSRF Origin/Referer сверки на state-changing POST, не для CORS; сравнение — строгое (`in_array($origin, $allowed, true)` / `$origin === $baseOrigin`), без wildcard/поддоменных бэкдоров.
- **Cookie-флаги.** Сессионная и CSRF-cookie (`Kernel/Db/Entity/Session/Session.php:107-112,219-223`) явно ставят `setSecure($this->isSecureRequest())` и `setHttpOnly(true)`; `SameSite` — `Lax` для CSRF-cookie (осознанное решение для сохранения magic-link кросс-сайт навигации, задокументировано инлайн-комментарием) и `Strict` по умолчанию для остальных (`Cookie.php:17`). `isSecureRequest()` (`Session.php:66-82`) корректно проверяет `$_SERVER['HTTPS']`/порт 443, локальный dev — не спуфится клиентским заголовком.
- **Path traversal в upload/download.** `SecureFileServing::serve()` (`Kernel/Io/FileUpload/SecureFileServing.php:38-95`) применяет `basename($storedName)` ДО построения пути (обрезает любые `../`-компоненты до того, как путь вообще собирается), затем дополнительно валидирует `realpath()`-containment (`str_starts_with($realPath, $realBase)`) — двойная защита. `FileUploadManager::delete/getPath/exists` — та же схема `basename()`-first. Traversal не эксплуатируем.
- **Default-права на upload-директории.** Создаются с `0o755`/`0o775` (`PublicImageUploadTrait.php:33`, `ImageUpload.php:51`, `FileUploadManager.php:33`) — не мировая запись, не `0777`. Файлы получают server-generated случайные имена (`bin2hex(random_bytes(16))`), исполняемые расширения никогда не входят в allow-list ни для одного upload-пути в кодовой базе.
- **Аватары — MIME-sniffing и переэнкодинг.** Путь `UserEntityConfig::editFields()` → `Updater::processUploadPhoto()` → `ImageUpload::saveImage()` (`Kernel/Io/Forms/ImageUpload.php`) реально пропускает загруженный файл через `Gumlet\ImageResize` (обёртка над GD), пересохраняя пиксельные данные в фиксированный формат (`IMAGETYPE_PNG` по умолчанию) под server-generated именем — это уничтожает любые полиглот-пейлоады (GIFAR-класс атак, встроенный HTML/JS в EXIF и т.п.), независимо от исходных magic bytes. Контрастирует (уже задокументированным в раунде 5, F-05-02) upload CMS/OG-картинок через `PublicImageUploadTrait`, который НЕ переэнкодит — это разные пути с разным уровнем защиты, аватарный путь чист.
- **Stored/reflected XSS через Twig `|raw`.** В отличие от вывода раунда 1 («`|raw` не используется» — неточно), `|raw` в реальности используется широко (Email-шаблоны, `HtmlLayout.*.twig` для JSON-пропсов React-островов, `StaticPages/Blocks.*.twig` для `block.html`). Проверено предметно: (a) JSON-пропсы (`user_payload_json`, `props_json` и т.п.) формируются `json_encode()` на сервере и не содержат произвольного пользовательского HTML — корректное использование `|raw` для валидного JSON внутри `data-props='...'`; (b) `block.html` в `StaticPages/Blocks.*.twig:43` — это ВЫВОД `FwStaticPagesService::markdownToHtml()` (`Bundle/Modules/StaticPages/FwStaticPagesService.php:838-853`), который использует `league/commonmark` (пакет присутствует в `vendor/league/commonmark`) с явной конфигурацией `html_input: 'escape'` (сырой HTML в исходном markdown конвертируется в текстовые сущности, а не рендерится), `allow_unsafe_links: false` (дропает `javascript:`/`data:`-ссылки) и дополнительно `DisallowedRawHtmlExtension` (второй уровень защиты) — это надёжная, "belt-and-braces" конфигурация, безопасная даже для потенциально злонамеренного admin-контента. `|raw` здесь корректен: повторное экранирование сломало бы уже просанитизированный HTML. Confirmed-безопасно, не находка.
- **XSS через `dangerouslySetInnerHTML` в auth/регистрации.** `Auth2.tsx:199` и `RegistrationForm.tsx:152` рендерят `renderMarkdownLinks(I18n.Consent_PD())` — вход берётся из статичной i18n-строки (серверный/сборочный артефакт, не пользовательский ввод), а `renderMarkdownLinks` (`Common/Utils/staticPageUrl.ts:15-19`) применяется только к этой строке. Пользовательских данных в этом пайплайне нет — не эксплуатируемо.
- **Race conditions по образцу magic-link бага.** Просмотрены основные React Islands (`Front/Islands/**`) на предмет похожих паттернов «состояние не переинициализируется при same-document навигации / повторном монтировании». Специфичного для этого класса бага (использование `useState(() => initFromUrl())` без `useEffect`-слушателя на последующие изменения того же источника) в других местах не найдено — паттерн magic-link в `Auth2.tsx` был единичным и уже исправлен (см. комментарий в коде `:46-52`, `:53-65`).

## Проверено (частично, только целостность вывода) — без новых находок, дублирует/подтверждает предыдущие раунды

- IM/support attachment IDOR (`FwImController::get__download`, `FwSupportAdminController`) — подтверждено раундом 14, не перепроверялось заново построчно в этом раунде (не входит в фокус данного захода).
- `/dev-login`, `post__adjustBalance`, `post__setUserFlag` rank-guard — не перепроверялись, приняты как resolved/tracked по раундам 1-2 и последующим постфиксам (8-14).
- SQL-инъекции — не искались заново предметно (раунды 1-14 единогласно подтвердили отсутствие, весь доступ — через bind-параметры).

## Непроверенные области

- Production-значения `app.ini`/`db.ini`/`deploy.ini` (реальные `allowed_origins`, `opcache_token`, TLS-терминация, `registrations_enabled` на текущий момент) — вне статического ревью, зависят от деплоя.
- Реальное поведение `finfo`-false edge-case (L-15-2) не воспроизведено динамически (нет запущенного окружения для тестового аплоада с намеренно "неопознаваемым" файлом) — вывод сделан по чтению кода, помечено CONFIRMED на уровне логики, но не подтверждено live-запросом.
- HTTP-заголовки в реальном ответе прод-сервера (L-15-1) не проверялись через живой curl/browser devtools — вывод сделан по полному прочтению всех response-построителей и `Emitter`, что даёт высокую, но не 100% уверенность (возможен reverse-proxy/nginx уровень, добавляющий заголовки вне кода приложения — это за пределами репозитория).
- Клиентский `markdownToHtml.ts` (L-15-3) не проверялся через живой браузерный PoC — вывод по чтению кода и логике regex-замен.
- Полный проход по `Dashboard/Controllers` на новые (после раунда 14) mass-assignment/target-authz векторы не делался — фокус этого раунда был по явно заданным категориям, не общий authz-повтор.

## Итог

**Рекомендация: GO**, при условии закрытия M-15-1 (account enumeration через `/auth` при отключённых регистрациях) до передачи заказчику — это единственная находка данного раунда с прямым, недорогим, неаутентифицированным эксплойтом, причём именно в бизнес-режиме («invite-only»), который платформа explicitly поддерживает и в котором заказчик, скорее всего, будет заинтересован скрыть базу зарегистрированных пользователей. L-15-1..L-15-3 — hardening-задачи, не блокирующие поставку, но рекомендованные к включению в бэклог первого пост-релизного спринта.
