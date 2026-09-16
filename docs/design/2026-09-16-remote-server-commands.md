# Тесты на удалённом: серверные команды вместо локального spawnSync (#396)

## Что сделано

Новый `Tests/helpers/server-command.ts` — единственная точка запуска
`php run_cmd.php <args>` из спеков: локально (`spawnSync`) когда `PW_PROD`
не установлен, по SSH (`php garnet ssh "... php run_cmd.php ..." --cwd=<remote_runtime_dir> --no-tty`,
транспорт как у `helpers/ssh-bridge.ts::runRemoteSql`) когда `PW_PROD=1`.
`remoteRuntimeDir()` вынесен из `ssh-bridge.ts` (`export`) и переиспользуется,
чтобы не дублировать разбор `deploy.ini`.

Переведены на `runServerCommand()` все места, где спек реально дёргает
`run_cmd.php` cron/migration/finance-audit/time-shift против данных
воркера (10 файлов, ~15 вызовов): `expert/slot-vanishes-on-failed-booking.spec.ts`,
`user/booking-time-guards.spec.ts` (×3), `time-shift.spec.ts`,
`specs/framework-bundle/{email-queue-cron-lock,email-watchdog,
finance-reconciliation(×2),migration-idempotency,db-backup-cron,
log-rotation-cron,session-retention-cron}.spec.ts`.

**Не тронуто намеренно**: сырые `php -r <code>` вызовы в
`db-backup-cron.spec.ts`, `log-rotation-cron.spec.ts`,
`session-retention-cron.spec.ts`, `process-static-cache-reset.spec.ts` —
это изолированные юнит-тесты чистых PHP-классов (`DbBackupRetentionService`,
`LogRotationService`) против одноразового локального временного каталога,
без обращения к данным воркера. У них нет «удалённого» смысла: ни при
локальном, ни при боевом прогоне переносить их некуда — переносить
логику на сервер означало бы гонять юнит-тест самого класса по SSH без
всякой пользы.

Локальное поведение проверено прогоном всех 10 изменённых файлов
(`PW_WORKERS=1`) — 87/87 passed, без регрессий.

## Решение по честности проверки (cron_log)

Задача явно ставит вопрос: `reconcile-slot-seats`/`complete-expired` в
изолированных `test_worker_N` падают на `INSERT INTO cron_log` (таблица
не мигрируется в тестовый scope), хотя сама бизнес-логика крона уже
отработала к этому моменту. Тесты сейчас проверяют это по тексту stdout
(`toContain('Reconciled:')` / `'Completed:'`), а не по exit-коду.

**Решение: оставить как есть.** `cron_log` — таблица фреймворка
(vendor), а не приложения; включать её в набор таблиц, которые
`isolation-setup.ts`/`CMDTestProvision` мигрируют для тестового scope —
значит либо патчить фреймворк ради теста, либо мигрировать её
ИЗБИРАТЕЛЬНО только для тестов, что добавляет отдельный особый путь
именно там, где хочется меньше особых путей. Альтернатива (заставить
крон-таск глотать ошибку INSERT в cron_log) меняет поведение
продакшен-кода ради тестовой инфраструктуры — обратное тому, что должно
происходить.

Текстовая проверка stdout уже задокументирована в обоих местах
(`booking-time-guards.spec.ts` — комментарий на 15 строк, объясняющий
именно этот механизм) и не является случайной — это осознанный,
объяснённый компромисс. #396 меняет ТРАНСПОРТ запуска команды (важно
для удалённого прогона), а не порождает и не решает этот отдельный
вопрос надёжности ассерта — он был и остаётся тем же при любом
транспорте.
