# Выбор фреймворка для IRabi

Дата проверки: 2026-07-15.

## Требования к платформе

IRabi должен устанавливаться на обычный PHP-хостинг без постоянно работающего Node.js-процесса, отдельного application server или обязательного контейнерного окружения. Нужны:

- PHP 8.1+ и MySQL/MariaDB;
- совместимость с PHP-FPM или Apache mod_php;
- конкурентное выполнение независимых MySQL-запросов внутри одного HTTP-запроса;
- предсказуемый роутинг и middleware pipeline;
- единый источник переводов для PHP/Twig и React/TypeScript;
- сборка в переносимый deploy bundle.

## Рассмотренные варианты

| Вариант | Сильная сторона | Ограничение для IRabi | Решение |
|---|---|---|---|
| Garnet | PHP-hosting, MySQL async через `mysqli_poll`, hash-route lookup, codegen i18n, собственный bundle/deploy | Меньше экосистема; приложение привязано к MySQL и Garnet API | **Выбран** |
| Laravel / Symfony | Большая экосистема и рынок специалистов | Async DB требует дополнительных решений и обычно не является базовым режимом обычного PHP-FPM-хостинга; больше runtime-слоёв для данного проекта | Не выбран |
| Slim / Laminas | Лёгкое ядро и гибкая композиция | Большую часть auth, i18n, deploy, async DB и административных модулей пришлось бы собирать отдельно | Не выбран |
| Node.js / NestJS | Асинхронность является естественной частью runtime | Для обычного shared hosting нужен постоянно работающий Node.js-процесс или внешний сервис | Не выбран |

## Почему выбран Garnet

1. **Хостинг-модель совпадает с продуктом.** Запрос обслуживается обычным PHP-процессом, а сборка разворачивается как четыре соседних каталога: public, framework, app и runtime.
2. **Async DB не требует event loop.** `DbPool` открывает несколько MySQLi-соединений, запускает независимые запросы и собирает их через `mysqli_poll()`. Это подходит PHP-FPM и обычному хостингу, если доступны `ext-mysqli` и MySQL.
3. **Роутинг имеет O(1) lookup.** После нормализации URI ключ ищется в ассоциативной таблице `Router::$routes`. O(1) относится к lookup зарегистрированного маршрута в среднем, а не ко всему HTTP-запросу: нормализация URI, regex-разбор параметров и middleware остаются отдельными затратами.
4. **i18n генерируется из PHP.** Backend и frontend используют ключи из одного PHP-источника конкретного bundle; `php garnet prepare` генерирует типизированный TypeScript API.
5. **Операционная модель встроена.** В framework есть migrations, cache, logs, bundle, `deploy:diff`, maintenance gate и проверка production assets.

## Важное ограничение async DB

Это не полноценный asynchronous server и не обещание, что каждый запрос автоматически станет быстрее. Выигрыш появляется только для независимых запросов, которые запущены до ожидания результата:

```php
Users::get()->selectAsync(['id' => $userId]);
News::get()->selectAsync(['status' => 'published']);
DbPool::get()->pollFinishAll();
```

На текущем снимке IRabi async pool корректно дренируется на границе web-request, но в прикладном коде IRabi не найдено систематического использования `selectAsync`/`insertAsync`. Поэтому это преимущество фреймворка, а не подтверждённая характеристика всех бизнес-сценариев приложения. Перед обещанием SLA нужно снять benchmark на целевом хостинге.

## Источники

- [Репозиторий Garnet Framework](https://github.com/PHPCraftdream/garnet-framework)
- [Архитектура Garnet](../../../garnet-framework/docs/architecture.md)
- [Database и `DbPool`](../../../garnet-framework/docs/database.md)
- [Параллельные MySQL-запросы](../../../garnet-framework/docs/cookbook/parallel-mysql-queries.md)
- [Deploy framework](../../../garnet-framework/docs/deploy.md)
