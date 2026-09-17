# Аудит контента, копирайтинга и SEO-готовности — IRabi / Slotbook

Дата аудита: 2026-07-18
Аудитор: независимый агент качества контента
Область: `Migrations/SeedData/*.md`, `Foreground/Controllers/StaticPagesController.php`, `Foreground/I18n/*DataRu.php`/`*DataEn.php`, `Public/`, Twig-шаблоны (`HtmlLayout.*.twig`, `StaticPages/*.twig`), `IRabi.php`, `Common/System/AppSettings.php`, конфиги `WorkDir/Config/app.ini`

## Резюме

Технический каркас SEO (canonical, OG/Twitter-теги, per-page meta-description, favicon-фолбэк для og:image, брендированная 404-страница) реализован аккуратно и работает корректно на уровне кода. Однако найдено **два блокирующих дефекта для финальной поставки**:

1. **Битые внутренние ссылки** на страницах `/privacy` и `/cookies` — ведут на несуществующие маршруты (404 при клике).
2. **Пустые контактные данные в продакшн-конфиге** (`support_contact_email/phone/telegram` — все `""` в `WorkDir/Config/app.ini`), из-за чего весь блок контактов в подвале сайта не рендерится, хотя три юридические страницы (Terms, Privacy, Cookies) прямо ссылаются на «контакты в подвале сайта».

Дополнительно отсутствуют `robots.txt` и `sitemap.xml` — базовая SEO-гигиена не покрыта полностью. Отдельной seed-страницы `slug=404` нет — используется универсальный (но брендированный и приемлемый) фолбэк.

Placeholder-текста (Lorem ipsum, TODO, test test, example.com и т.п.) в пользовательском контенте **не обнаружено** — все найденные `example.com`/`example@example.com` строго изолированы в dev-only seed-сервисах (`DevSeedService.php`, `TestScopeSeedService.php`, требуют `Env::isDevDir()`) или являются легитимными UI-плейсхолдерами формы (`Admin_SystemSettings_TestEmail_Placeholder`). Брендинг "IRabi" не протекает в пользовательский UI — все совпадения ограничены namespace/комментариями в PHP и TS-коде.

---

## Находки по severity

### BLOCKER

**B-1. Битая внутренняя ссылка на странице Privacy → Cookies**
Файл: `Migrations/SeedData/page-privacy-block-1.md`, строка 72:
```
Подробнее — см. отдельное [Уведомление об использовании cookies](/cookies).
```
Реальный маршрут для этой страницы — `/page/view~cookies` (см. `Migrations/Helpers/StaticPagesSeed.php`, где нав/футер-сниппеты корректно генерируют `'url' => '/page/view~' . $slug`, и регистрацию роута в `IRabi.php`: `$router->add(StaticPagesController::URL . '/{view}', ...)` с `StaticPagesController::URL = '/page'`). Прямого маршрута `/cookies` не существует, редиректа/алиаса тоже нет (проверено — нет ни одного `redirect`-миддлварного правила для этого пути). **Клик по ссылке даёт 404.**

**B-2. Битая внутренняя ссылка на странице Cookies → Privacy**
Файл: `Migrations/SeedData/page-cookies-block-1.md`, строка 75:
```
Вопросы по обработке cookies и персональных данных направляйте на
адрес поддержки, указанный в [Политике обработки персональных данных](/privacy).
```
Аналогичная проблема — должно быть `/page/view~privacy`. **Клик по ссылке даёт 404.**

Обе находки — единственные markdown-ссылки во всём корпусе seed-контента (проверено через `grep -oE "\]\([^)]*\)"` по всем `.md`), и обе битые. Ирония в том, что в кодовой базе уже есть специально спроектированный механизм для этого класса ссылок — `{link:slug}` в `FwStaticPagesService::renderVariables()` (строки 441-457 `vendor/.../FwStaticPagesService.php`), который резолвит слаг в реальный `/page/view~slug` и безопасно деградирует, если страница не найдена. Seed-контент его не использовал, а захардкодил "красивый" короткий путь.

**Рекомендация:** заменить `(/cookies)` → `{link:cookies}` и `(/privacy)` → `{link:privacy}`, либо прямо на `(/page/view~cookies)` / `(/page/view~privacy)`.

---

**B-3. Контактные данные пустые в продакшн-конфиге — обещание на 3 юридических страницах не выполняется**
Файл: `WorkDir/Config/app.ini` (прод-конфиг, `env = "prod"`, `base_url = "https://slotbook.ru"`, `title = "Slotbook"`):
```ini
support_contact_email = ""
support_contact_phone = ""
support_contact_telegram = ""
```
Эти значения читаются `FwAppSettings::supportContacts()` и используются в двух местах:

1. **Подвал сайта целиком** — `IRabi.php` → `defineTwigParams()` передаёт `support_email` в layout-параметры; шаблон `HtmlLayout.ru.twig` (строки 135-140) рендерит весь `<footer class="app-footer">` **только если** `support_email` не пусто:
   ```twig
   {% if support_email %}
   <footer class="app-footer" data-test-id="app-footer">...
   ```
   При пустом email футер с контактами **не рендерится вовсе на всех страницах приложения** (не только на статических).

2. **Колонка «Контакты» в футере статических страниц** — сид-контент (`StaticPagesSeed::footerContent()`) использует плейсхолдеры `{support-email}`, `{support-phone}`, `{support-telegram}`, которые при пустом значении конфига дают пустые `mailto:`/`tel:`/`https://t.me/` ссылки; `FwStaticPagesService::renderFooterHtml()` (строки 774-786 framework) явно **дропает такие ссылки**, и вся колонка "Контакты" схлопывается, если все три пустые (комментарий в коде это прямо подтверждает: `// Empty {support-*} placeholders are dropped at render time... — the whole column collapses if nothing resolves`).

При этом три страницы прямо обещают контакты «в подвале сайта»:
- `Migrations/SeedData/page-terms-block-1.md`, §8: «По всем вопросам обращайтесь к администратору сервиса. Контактные данные опубликованы в подвале сайта.»
- `Migrations/SeedData/page-privacy-block-1.md`, §9: «...Контактные данные опубликованы в подвале сайта.»
- `Migrations/SeedData/page-cookies-block-1.md`, §7: «Вопросы... направляйте на адрес поддержки, указанный в [Политике...]» (ссылается на §9 Privacy, которая опять указывает на подвал).

**Итог:** прямо сейчас (с текущим прод-конфигом) сайт нигде не показывает ни одного реального контакта — ни email, ни телефон, ни телеграм — при этом три страницы явно обещают, что контакты есть в футере. Для заказчика это будет выглядеть как явный баг/недоделка при первом же клике на «Условия использования».

**Рекомендация:** до сдачи — заполнить `support_contact_email` (минимум) в `WorkDir/Config/app.ini`, либо через Dashboard → Системные настройки → Контакты (тот же файл на диске). Без этого фраза "контакты в подвале сайта" ложная.

---

### MAJOR

**M-1. Нет `robots.txt`**
Поиском по всему приложению (`Public/`, роуты в `IRabi.php`, framework bundle) не найдено ни файла `robots.txt`, ни маршрута, который бы его отдавал. Поисковые роботы получат 404 на `/robots.txt` (перехватится общим 404-хендлером, который в свою очередь красиво отрендерит фирменную 404-страницу как HTML — т.е. поисковики получат HTML вместо ожидаемого `robots.txt`, что не критично, но не соответствует базовой SEO-гигиене).

**M-2. Нет `sitemap.xml`**
Аналогично — карты сайта нет ни как статического файла, ни как генерируемого маршрута. Для сайта с всего 4 публичными страницами (`home`, `terms`, `privacy`, `cookies`) это не критично для индексации (Google найдёт их через внутренние ссылки/canonical), но является отсутствующим пунктом базовой SEO-чек-листа для "под ключ" поставки.

**M-3. Нет `manifest.json` / PWA-конфигурации**
Поиском (`find -iname "manifest*.json"`) ничего не найдено — нет Web App Manifest. `<html>`-шаблон (`HtmlLayout.ru.twig`) не содержит `<link rel="manifest">`. Сайт не устанавливается как PWA (нет "Добавить на главный экран" с иконкой/theme-color). Учитывая, что `theme_color` параметр в принципе поддержан шаблоном (строка 32 `HtmlLayout.ru.twig`: `{% if theme_color %}<meta name="theme-color"...`), но никогда не передаётся ни из `IRabi.php`, ни из static-page SEO — фактически не используется нигде.

---

### MINOR

**MI-1. `robots`-метатег никогда не заполняется**
Механизм есть (`HtmlLayout.php` строка 107, `<meta name="robots">` в твиге), но ни `IRabi.php`, ни `StaticPagesService::seoLayoutParams()` никогда не передают значение `robots`. Это не баг (по умолчанию отсутствие тега = `index, follow`, стандартное поведение), но при появлении черновых/непубличных статических страниц в будущем не будет автоматической защиты от индексации черновиков через `noindex` — придётся добавлять вручную.

**MI-2. `seo_og_image` / `seo_twitter_site` / `seo_description` не заданы в прод-конфиге**
`WorkDir/Config/app.ini` не содержит ключей `description` (есть, но равен `"Slotbook"` — минимальный, не информативный), а также нет отдельных `seo_description`/`seo_og_image`/`seo_twitter_site`. Это не ломает страницу (og:image надёжно фолбэкает на `/favicon.ico` через `HtmlLayout.php`, строки 101-103), но `og:description`/`twitter:description` на главной странице (`/`) — единственной странице без собственного `meta_description` через сид (главная имеет `meta_description` в БД через `StaticPagesSeed::seed()`, так что фактически на 4 публичных страницах meta-description присутствует; только сайт-вайд default в `app.ini` слабый). При расшаривании корневого `/` в соцсетях `og:description` возьмётся из `meta_description` домашней страницы (см. ниже — там всё в порядке), так что практического дефекта нет — это чисто гигиенический момент для `app.ini`.

**MI-3. Английские версии I18n-файлов (`ForegroundI18nDataEn.php`) не используются в проде**
`IRabi.php` → `defineTwigParams()` жёстко ставит `$lang = 'RU'` без переключателя языка. `ForegroundI18nDataEn.php` существует и поддерживается в актуальном состоянии (проверено выборочно — синхронизирован с RU-файлом), но в текущей поставке недостижим никаким UI-путём. Не является дефектом («под ключ» — RU-only продукт), но стоит зафиксировать как осознанное решение, а не забытую недоделку.

---

## Проверено — без находок

- **Placeholder/заглушки в пользовательском контенте.** Полнотекстовый поиск по `Lorem ipsum`, `TODO`, `FIXME`, `test test`, `example.com`, «заполнить позже», «заглушка», «плейсхолдер» по `Migrations/SeedData`, `Foreground/I18n`, `Foreground/Controllers`, `Common`, `Dashboard` — все найденные `example.com`-совпадения строго в dev-only seed-сервисах (`Common/Services/DevSeedService.php`, `Common/Services/TestScopeSeedService.php`, требуют `Env::isDevDir()`, недостижимы в проде) либо являются легитимными UI form-placeholder-строками (`Admin_SystemSettings_TestEmail_Placeholder => 'example@example.com'` — корректный паттерн для инпута email в дашборде).
- **Опечатки/грамматика в RU-контенте статических страниц.** Все 5 markdown-файлов (`page-home-block-1/2.md`, `page-terms-block-1.md`, `page-privacy-block-1.md`, `page-cookies-block-1.md`) прочитаны целиком построчно — грамматических ошибок, машинного перевода или явных опечаток не найдено. Текст написан носителем, стилистически ровный, юридически корректно оформлен (разделы, нумерация, таблица cookies).
- **`<title>`/`meta description` уникальность по страницам.** `Migrations/Helpers/StaticPagesSeed.php` задаёт каждой из 4 страниц (`home`, `terms`, `privacy`, `cookies`) собственные уникальные `title` и `meta_description` — совпадений нет, все информативны и релевантны содержанию страницы.
- **`canonical`-теги.** `IRabi.php` → `defineTwigParams()` генерирует `canonical` динамически из `base_url + REQUEST_URI` на каждой странице (строка 583); твиг-шаблон рендерит `<link rel="canonical">`, если значение не пусто — присутствует на 100% страниц.
- **`og:*` теги.** Полный набор (`og:title`, `og:description`, `og:type`, `og:url`, `og:image` [+width/height/alt при реальном изображении], `og:site_name`, `og:locale`) генерируется централизованно в `HtmlLayout.php`; `og:site_name` = `title` из `app.ini` = **"Slotbook"** (публичный бренд, не техническое имя) — проверено, брендинг корректный.
- **Favicon.** `Public/favicon.ico` — валидный ICO-файл (6 иконок, включая 256×256 PNG-слой), 116 КБ, подключается и как `<link>` (нет явного тега в твиге, но браузеры резолвят `/favicon.ico` по умолчанию), и как логотип-фолбэк в шапке статических страниц (`FwStaticPagesService::renderHeaderHtml()`, строка 704: `'url' => '/favicon.ico'`), и как OG-image-фолбэк.
- **404-страница.** Кастомный обработчик (`IRabi.php` → `defineTwigParams()` → `setCustom404Handler`) ищет CMS-страницу со slug `404` (её нет — не засеяна), после чего явно и намеренно фолбэкает на `StaticPagesService::renderNotFoundBody()` — брендированный, локализованный (`StaticPages_NotFound_Title` = «Страница не найдена», `_Text` = «Возможно, ссылка устарела или была введена с ошибкой.», `_Home` = «На главную») контент, **обёрнутый в полноценный сайтовый chrome (шапка + подвал home-страницы)**, а не голый framework-дефолт. Соответствует требованиям — «осмысленный, брендированный контент».
- **Согласованность брендинга "IRabi" vs "Slotbook".** Полнотекстовый поиск строки `IRabi` по `Foreground/I18n`, `Common/Mail`, всем `.twig`-файлам приложения и React-компонентам (`Front/**/*.tsx`, `*.ts`) — единственные совпадения (`AdminGrid.tsx`, `types.ts`) находятся исключительно в **PHP/TS doc-комментариях для разработчиков**, не в строках, видимых пользователю. `og:site_name`, `<title>`, email-заголовки (`$appConf->paramString('title')`) — везде берут значение `title` из `app.ini`, которое в проде равно `"Slotbook"`. Утечки технического кодового имени в пользовательский UI не найдено.
- **Cookies-политика / GDPR-подобный баннер.** Логика согласия (checkbox на форме логина/регистрации, cookies не устанавливаются до согласия) описана согласованно в `page-cookies-block-1.md` (§3, §6) и `page-privacy-block-1.md` (§7) — противоречий между двумя страницами нет.
- **Условия использования — пункт про отмену брони.** `page-terms-block-1.md` §4 содержит недавно обновлённое (см. `Migrations/Items/M_0006.php`) правило о запрете просить контрагента отменить бронь за вас — текст ясный, не содержит следов недоделанного редактирования.
- **Manifest/PWA иконки набора размеров** — не проверялось отдельно сверх находки M-3 (manifest.json отсутствует полностью, см. выше).

---

## Итоговый чек-лист для устранения перед сдачей

| # | Приоритет | Действие |
|---|---|---|
| B-1/B-2 | Blocker | Заменить `(/cookies)` и `(/privacy)` на `{link:cookies}` / `{link:privacy}` (или `/page/view~cookies` / `/page/view~privacy`) в `page-privacy-block-1.md` и `page-cookies-block-1.md` |
| B-3 | Blocker | Заполнить `support_contact_email` (и по возможности phone/telegram) в `WorkDir/Config/app.ini` до релиза — иначе футер сайта пуст, а 3 юр. страницы лгут |
| M-1 | Major | Добавить `robots.txt` (даже минимальный `User-agent: *\nAllow: /\nSitemap: https://slotbook.ru/sitemap.xml`) |
| M-2 | Major | Добавить `sitemap.xml` (статический, 4 URL достаточно) |
| M-3 | Major | При наличии времени — добавить `manifest.json` + `theme-color`, если PWA-режим в скоупе поставки |
