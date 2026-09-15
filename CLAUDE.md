# Проектные инструкции — IRabi

- Перед КАЖДЫМ пушем в этот репозиторий сам прогоняешь локальные проверки качества (`npm run check` — oxlint + tsgo, `composer ci` — cs-fixer + phpstan + build) и пушишь только при их зелёном результате. Не полагайся на удалённый CI как на первую линию проверки — GitHub Actions обрезает список аннотаций/warning'ов (видно не более ~10 на джоб) и может создать ложное ощущение, что всё чисто.

- После `composer update phpcraftdream/garnet-framework` сразу выполняй
  `npm install` в `vendor/phpcraftdream/garnet-framework/FrontBuilder`.
  Composer переустанавливает пакет целиком и удаляет установленные внутри
  него `node_modules`, после чего `composer ci` падает на
  `Cannot find module '@rspack/core'`, а `npm run check` — на импортах
  фронтовых зависимостей фреймворка (`cropperjs`, `lucide` и других).
  Выглядит как поломка от нового релиза, хотя код ни при чём.
