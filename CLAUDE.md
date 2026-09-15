# Проектные инструкции — IRabi

- Перед КАЖДЫМ пушем в этот репозиторий сам прогоняешь локальные проверки качества (`npm run check` — oxlint + tsgo, `composer ci` — cs-fixer + phpstan + build) и пушишь только при их зелёном результате. Не полагайся на удалённый CI как на первую линию проверки — GitHub Actions обрезает список аннотаций/warning'ов (видно не более ~10 на джоб) и может создать ложное ощущение, что всё чисто.

- После `composer update phpcraftdream/garnet-framework` сразу выполняй
  `npm install` в ТРЁХ каталогах внутри `vendor/phpcraftdream/garnet-framework`:
  `FrontBuilder`, `tooling/mcp/browser`, `tooling/mcp/mysql`, **а затем
  `php garnet prepare`**. Одного `npm install` мало: зависимости фронта
  лежат в `FrontBuilder/node_modules`, а код бандла — в `Bundle/Front/`,
  и связывает их junction `vendor/phpcraftdream/garnet-framework/node_modules`,
  который composer сносит вместе с пакетом. Восстанавливает junction
  именно `prepare` (он же перегенерирует `Front/I18nGen/` — без этого
  новые ключи переводов не видны типизации). Без этого шага
  `npm run typecheck` падает на `cropperjs` и `lucide` из vendor-файлов,
  и выглядит это так, будто `npm install` не сработал.
  Composer переустанавливает пакет целиком и удаляет все установленные внутри
  него `node_modules`. Ломается сразу три вещи, и все — с симптомами, которые
  выглядят как что угодно, только не как последствие обновления:
  `composer ci` падает на `Cannot find module '@rspack/core'`,
  `npm run check` — на импортах фронтовых зависимостей фреймворка
  (`cropperjs`, `lucide` и других), а персоны-агенты перестают открывать
  браузер с «garnet-browser не подключается / Connection closed» и уходят
  чинить несуществующие проблемы окружения.
