# Проектные инструкции — IRabi

- Перед КАЖДЫМ пушем в этот репозиторий сам прогоняешь локальные проверки качества (`npm run check` — oxlint + tsgo, `composer ci` — cs-fixer + phpstan + build) и пушишь только при их зелёном результате. Не полагайся на удалённый CI как на первую линию проверки — GitHub Actions обрезает список аннотаций/warning'ов (видно не более ~10 на джоб) и может создать ложное ощущение, что всё чисто.

- После `composer update phpcraftdream/garnet-framework` сразу выполняй
  `npm install` в ТРЁХ каталогах внутри `vendor/phpcraftdream/garnet-framework`:
  `FrontBuilder`, `tooling/mcp/browser`, `tooling/mcp/mysql`.
  Composer переустанавливает пакет целиком и удаляет все установленные внутри
  него `node_modules`. Ломается сразу три вещи, и все — с симптомами, которые
  выглядят как что угодно, только не как последствие обновления:
  `composer ci` падает на `Cannot find module '@rspack/core'`,
  `npm run check` — на импортах фронтовых зависимостей фреймворка
  (`cropperjs`, `lucide` и других), а персоны-агенты перестают открывать
  браузер с «garnet-browser не подключается / Connection closed» и уходят
  чинить несуществующие проблемы окружения.
