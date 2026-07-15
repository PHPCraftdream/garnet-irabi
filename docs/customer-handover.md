# IRabi — пакет передачи заказчику

Дата ревью: 2026-07-15.

## Итоговый verdict

**NO-GO для безусловной передачи в production.** Приложение технически собирается и проходит статические quality gates, но перед передачей нужно закрыть security blockers и устранить неполноту английского i18n-каталога.

## Что входит в коробочное решение

- исходники приложения `Apps/IRabi`;
- Composer-зависимость `phpcraftdream/garnet-framework`;
- React-islands frontend и production asset build;
- MySQL migrations и seed pages;
- роли user, expert, moderator, owner и admin;
- dashboard, бронирования, слоты, баланс, сообщения, support, comments;
- Playwright E2E-набор;
- `WorkDir/ConfigExample` без секретов;
- deployment bundle с отдельными public/framework/app/runtime каталогами;
- документация этого каталога и [инструкция для агентов](../AGENTS.md).

Framework repository: <https://github.com/PHPCraftdream/garnet-framework>.

## Требования хостинга

Минимум:

- PHP 8.1+;
- `ext-mysqli`, `ext-pdo`, `ext-fileinfo`, `ext-json`, `ext-mbstring`;
- MySQL/MariaDB с InnoDB и `utf8mb4`;
- Composer нужен для сборки, а PHP CLI — для миграций и обслуживания;
- writable только для runtime: `WorkDir/Config`, `LogJournal`, `TwigCache`, `FileCache`, uploads;
- document root должен указывать на public-каталог;
- SSH нужен только для автоматизированного deploy, если его предоставляет хостинг;
- cron рекомендуется для регулярных queue/maintenance задач.

IRabi сейчас MySQL-specific: наличие PDO само по себе не делает приложение совместимым с PostgreSQL.

## Быстрый запуск разработчика

```bash
cd Apps/IRabi
composer install
php garnet setup --skip-composer
php garnet config:init --dev
# заполнить WorkDir/ConfigDev/{app,db,email}.ini
php garnet migration
php garnet build
php garnet serve
```

Проверки:

```bash
composer check
npm run check
php garnet build:check
composer test:e2e
```

Полный onboarding для агентов: [`AGENTS.md`](../AGENTS.md). Бизнес-контекст: [`README.md`](README.md).

## Production deployment

1. Заполнить runtime config и безопасно передать секреты вне git.
2. Проверить `php garnet ssh:test`.
3. Собрать `php garnet bundle --no-phar --keep-dir`.
4. Передать четыре каталога из `dist/IRabi/` на host.
5. Выполнить миграции в maintenance mode.
6. Проверить `/`, login, public profile, booking, dashboard и uploads.
7. Сохранить deploy SHA, backup и rollback point.

Routine releases используют dry-run:

```bash
php garnet deploy:diff
php garnet deploy:diff --apply
```

Полная процедура: [`deploy.md`](deploy.md) и [framework deploy guide](../../../garnet-framework/docs/deploy.md).

## Архитектурные обещания и их точная формулировка

- **Async DB:** Garnet умеет параллельно запускать независимые MySQL-запросы через `mysqli_poll()` в одном PHP request. Это совместимо с обычным PHP-FPM-хостингом, но требует `ext-mysqli`, дополнительных DB connections и не превращает приложение в event-loop server.
- **O(1) routing:** `Router::dispatch()` использует ассоциативный lookup нормализованного route key. O(1) относится к lookup таблицы маршрутов в среднем, не ко всей обработке запроса.
- **Middleware:** IRabi применяет WorkerScope, maintenance, auth, user-data и idempotency middleware до controller; dashboard дополнительно ограничен moderator/owner gates.
- **i18n:** источник PHP генерирует frontend TypeScript API. Полнота сейчас не достигнута: 11 EN keys отсутствуют, см. [`i18n.md`](i18n.md).

Обоснование выбора Garnet: [`framework-selection.md`](framework-selection.md).

## Security gate

В репозитории уже есть зональный аудит Fable 5: [`security-audit/00-SUMMARY.md`](security-audit/00-SUMMARY.md). Дополнительная проверка текущего состояния зафиксирована в [`security-audit/07-codex-review.md`](security-audit/07-codex-review.md).

Перед production нужно обязательно закрыть:

1. `/dev-login`: второй позитивный production flag и исключение IDE-маркеров из deploy artifact;
2. ограничение moderator для balance adjustment;
3. запрет moderator менять flags/roles аккаунтов более высокого ранга;
4. проверку approved/disabled эксперта непосредственно в booking transaction;
5. транзакционную/идемпотентную защиту balance ledger.

Нельзя рекламировать поставку как security-cleared, пока эти пункты не исправлены и не выполнен повторный аудит. Текущий environment подтверждает Fable 5 audit и ревью Codex; отдельный запуск модели с названием “ChatGPT 5.6” здесь не подтверждён и не должен указываться как факт.

## Acceptance checklist

- [x] `composer check` — PHPStan и CS проходят.
- [x] `npm run check` — lint/typecheck проходят; есть non-blocking warnings.
- [x] `php garnet build:check` проходит.
- [ ] EN/RU i18n parity = 100%.
- [ ] P0/High security findings closed.
- [ ] Clean-host install выполнен по инструкции.
- [ ] Production-like E2E прогнан на отдельной тестовой БД.
- [ ] Backup и restore проверены.
- [ ] Secrets не находятся в git и не попадают в public/app artifact.
- [ ] Cron, mail, uploads, logs, cache clear и rollback проверены на целевом хостинге.
- [ ] Заказчику переданы URL framework repo, release SHA, конфигурационный список и support/runbook.

## Что ещё должно быть передано заказчику

- контакт для incident escalation и сроки реакции;
- список cron jobs и расписание;
- схема backup retention и ручная процедура restore;
- матрица ролей и процедура отзыва admin/owner доступа;
- список персональных данных, сроки хранения и legal sign-off;
- политика обновления framework и зависимостей;
- release notes с текущим commit SHA и известными ограничениями;
- тестовые сценарии приёмки по ролям.
