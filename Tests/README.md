# Playwright Tests

E2E тесты для Garnet Framework.

## Установка

```bash
cd tests
npm install
npx playwright install
```

## Запуск

### Для разработки (run_dev.bat)

Запускает PHP сервер + frontend watch:

```bash
# В корне проекта
run_dev.bat
```

Затем запуск тестов:

```bash
cd tests
npm test              # Все тесты
npm run test:ui       # UI режим
npm run test:headed   # В браузере
```

### Для CI (run_e2e.bat)

Автоматически: билдит фронт → запускает сервер → запускает тесты → убивает сервер:

```bash
# В корне проекта
run_e2e.bat
```

## Скрипты

| Скрипт | Описание |
|--------|----------|
| `npm test` | Запуск всех тестов |
| `npm run test:ui` | Playwright UI |
| `npm run test:headed` | Запуск в браузере |
| `npm run test:debug` | Debug режим |
| `npm run report` | Показать HTML отчёт |
| `npm run codegen` | Генератор тестов |

## Структура

```
tests/
├── package.json
├── playwright.config.ts
├── specs/                  # Тесты
│   └── example.spec.ts
└── helpers/                # Утилиты
    ├── spa.ts              # SPA-хелперы
    └── fixtures.ts         # Кастомные fixtures
```

## Конфигурация

Переменные окружения (устанавливаются в run_e2e.bat):

| Variable | Default | Description |
|----------|---------|-------------|
| `BASE_URL` | `http://localhost:8001` | URL приложения |
| `APP_NAME` | `IRabi` | Имя приложения |
| `APP_PORT` | `8001` | Порт сервера |

## Написание тестов

### Базовый тест

```typescript
import { test, expect } from '@playwright/test';

test('homepage loads', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/.*/);
});
```

### Использование хелперов

```typescript
import { test, expect } from '../helpers/fixtures';
import { navigateWithHotClick, waitForSPA } from '../helpers/spa';

test('SPA navigation', async ({ page }) => {
    await page.goto('/');
    await navigateWithHotClick(page, 'a.hot-click[href="/dashboard"]');
    await expect(page).toHaveURL(/dashboard/);
});
```

### Тест форм

```typescript
import { fillForm, submitFormAndWait, getFormErrors } from '../helpers/spa';

test('form submission', async ({ page }) => {
    await page.goto('/login');
    await fillForm(page, {
        '#email': 'test@example.com',
        '#password': 'password123',
    });
    await submitFormAndWait(page, 'button[type="submit"]');

    const errors = await getFormErrors(page);
    expect(errors).toHaveLength(0);
});
```

## Workflow

```
┌─────────────────────────────────────────────────────────────┐
│                    Development Workflow                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. run_dev.bat                                             │
│     ├── PHP Server (localhost:8001)                         │
│     └── Frontend Watch (rspack)                             │
│                                                              │
│  2. Пишем тесты в tests/specs/                   │
│                                                              │
│  3. npm run test:ui                                         │
│     └── Интерактивный запуск тестов                         │
│                                                              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                       CI Workflow                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  run_e2e.bat                                                │
│     ├── [1] Kill existing servers                           │
│     ├── [2] Build frontend (production)                     │
│     ├── [3] Start PHP server                                │
│     ├── [4] Run Playwright tests                            │
│     └── [5] Cleanup (kill server)                           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```
