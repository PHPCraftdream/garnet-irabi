# Руководство разработчика

## Установка

### Требования
- PHP 8.1+
- MySQL 8.0+
- Node.js 18+
- Composer

### Настройка окружения

1. Клонировать репозиторий
2. Установить PHP-зависимости:
   ```bash
   cd Apps/IRabi
   composer install
   ```
3. Установить JS-зависимости приложения и тестов:
   ```bash
   npm install
   cd Tests
   npm install
   npx playwright install
   cd ..
   ```
4. Инициализировать конфигурацию разработчика:
   ```bash
   php garnet config:init --dev    # seeds ConfigDev/ с пустыми шаблонами
   # затем отредактируйте Apps/IRabi/WorkDir/ConfigDev/{app,db,email,ssh}.ini с реальными значениями
   ```
5. Настроить `WorkDir/ConfigDev/db.ini` и `app.ini`
6. Запустить миграции:
   ```bash
   php garnet migration
   ```

## Разработка

### Запуск локального сервера

```bash
php garnet serve
```

### Сборка frontend

```bash
npm run check      # lint + typecheck
php garnet build   # production сборка
php garnet build:watch
```

### Проверка TypeScript

```bash
tsgo --noEmit -p tsconfig.tsgo.json
```

### Генерация I18n

После изменения файлов `*I18nData*.php`:
```bash
php garnet prepare
```

## Структура кода

### Создание нового контроллера

1. Создать класс в `Foreground/Controllers/`:
   ```php
   <?php
   namespace PHPCraftdream\IRabi\Foreground\Controllers;

   use PHPCraftdream\Garnet\Bundle\Controllers\PageController;

   class MyController extends PageController {
       public const URL = '/my-path';

       public function GET__(): string {
           return $this->render('MyTemplate.twig');
       }
   }
   ```

2. Зарегистрировать маршрут в `IRabi.php`

### Создание новой таблицы

1. Создать класс в `Common/Tables/`:
   ```php
   <?php
   namespace PHPCraftdream\IRabi\Common\Tables;

   use PHPCraftdream\Garnet\Framework\Db\Tables\DbTable;

   class MyTable extends DbTable {
       protected string $tableName = 'ir_my_table';
       protected string $primaryKey = 'id';
   }
   ```

2. Создать миграцию в `Migrations/Items/`

### Добавление переводов

1. Добавить одинаковые ключи в соответствующие `*I18nDataEn.php` и `*I18nDataRu.php`
2. Запустить `php garnet prepare`
3. Использовать в PHP: `CommonI18n::MyKey()`
4. Использовать в JS: `I18nCommon.MyKey()`

## Тестирование

Тесты находятся в `Tests/`:

```bash
composer test:e2e
```

### Создание тестового пользователя

Тестовые пользователи должны иметь логин, начинающийся с `testuser_`:
```javascript
const TEST_USER = `testuser_${Date.now()}`;
```

Это позволяет автоматически очищать данные после тестов.

## Деплой

`php garnet bundle` собирает 4 папки-сиблинга: `<public-dir>/`, `<framework-dir>/`, `<app-dir>/`, `<runtime-dir>/`. Папки `app` и `framework` — неизменяемые артефакты; `runtime` содержит WorkDir, garnet CLI, `.env` и `_shared_index.php`. Локальная разработка (`Apps/IRabi/WorkDir/`, `garnet` и т. д.) не затронута — изменения касаются только структуры `dist/`. Подробнее: `docs/deploy.md`.
