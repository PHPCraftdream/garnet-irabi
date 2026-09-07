#!/usr/bin/env node
/**
 * Браузер персоны UAT-команды.
 *
 * Персона ходит по slotbook.ru как живой человек: свой профиль браузера
 * (куки и localStorage переживают вызовы, вход не теряется), своя ширина
 * окна, скриншот после каждого действия — чтобы персона своими глазами
 * видела вёрстку, а не догадывалась по HTML.
 *
 * Каждая команда — отдельный процесс: открывает persistent-контекст,
 * восстанавливает последний URL, делает действие, сохраняет состояние и
 * закрывается. Медленнее демона, зато не нужно держать живой процесс на
 * каждую из двенадцати персон.
 *
 *   node tooling/uat/browse.mjs <персона> <команда> [аргументы]
 *
 *   open <url>            перейти по адресу (можно относительный: /admin/)
 *   back                  назад
 *   reload                перезагрузить
 *   click <селектор>      кликнуть (CSS или text=…)
 *   fill <селектор> <зн>  заполнить поле
 *   press <клавиша>       нажать (Enter, Escape…)
 *   text [селектор]       видимый текст страницы (по умолчанию body)
 *   html <селектор>       разметка фрагмента — когда нужен точный DOM
 *   links                 видимые ссылки и кнопки: что вообще можно нажать
 *   shot                  только скриншот
 *   where                 текущий URL и заголовок
 *
 * После каждой команды печатается путь к скриншоту — его нужно ОТКРЫТЬ и
 * посмотреть: половина дефектов (съехавшая вёрстка, обрезанный текст,
 * налезающие элементы) в тексте страницы не видна.
 */

// @playwright/test — CommonJS, поэтому только через default-импорт.
import playwright from '../../Tests/node_modules/@playwright/test/index.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ROSTER_PATH = resolve(APP_DIR, 'WorkDir', 'uat-roster.json');
const BROWSERS_DIR = resolve(APP_DIR, 'WorkDir', 'uat-browsers');

const [personaId, command, ...rest] = process.argv.slice(2);

if (!personaId || !command) {
    console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^.*?\/\*\*/s, ''));
    process.exit(personaId ? 1 : 0);
}

const roster = JSON.parse(readFileSync(ROSTER_PATH, 'utf8'));
const persona = roster.personas.find((p) => p.id === personaId);

if (!persona) {
    console.error(`Персона "${personaId}" не найдена. Есть: ${roster.personas.map((p) => p.id).join(', ')}`);
    process.exit(1);
}

const baseUrl = `https://${roster.env?.host ?? 'slotbook.ru'}`;
const profileDir = resolve(BROWSERS_DIR, persona.id);
const statePath = resolve(profileDir, 'last-state.json');
const shotPath = resolve(profileDir, 'last.png');

mkdirSync(profileDir, { recursive: true });

const [width, height] = String(persona.viewport ?? '1440x900').split('x').map(Number);
const lastUrl = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')).url : null;

/**
 * `/admin/` → `https://host/admin/`; полный URL оставляем как есть.
 *
 * Git Bash по дороге превращает аргумент `/admin/` в `C:/Program Files/
 * Git/admin/` (MSYS path conversion) — это надо развернуть обратно, иначе
 * персона уедет на несуществующий адрес. Тот же класс проблемы фреймворк
 * гасит через MSYS_NO_PATHCONV в SshClient.
 */
function absolute(url) {
    const msys = /^[A-Za-z]:[\\/].*?[\\/]Git[\\/]?(.*)$/.exec(url ?? '');
    const path = msys ? '/' + msys[1] : (url ?? '/');

    return /^https?:\/\//i.test(path) ? path : baseUrl + (path.startsWith('/') ? path : '/' + path);
}

const context = await playwright.chromium.launchPersistentContext(profileDir, {
    headless: true,
    viewport: { width, height },
    locale: 'ru-RU',
});

const page = context.pages()[0] ?? (await context.newPage());
let failure = null;

try {
    // Восстанавливаем последнюю страницу — процесс новый, вкладка пустая,
    // но куки в профиле остались, поэтому сессия не теряется.
    if (command !== 'open' && lastUrl) {
        await page.goto(lastUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    }

    switch (command) {
        case 'open':
            await page.goto(absolute(rest[0] ?? '/'), { waitUntil: 'domcontentloaded', timeout: 30000 });
            break;

        case 'back':
            await page.goBack({ waitUntil: 'domcontentloaded' });
            break;

        case 'reload':
            await page.reload({ waitUntil: 'domcontentloaded' });
            break;

        case 'click':
            await page.click(rest[0], { timeout: 15000 });
            await page.waitForLoadState('domcontentloaded').catch(() => {});
            break;

        case 'fill':
            await page.fill(rest[0], rest.slice(1).join(' '), { timeout: 15000 });
            break;

        case 'press':
            await page.keyboard.press(rest[0]);
            await page.waitForLoadState('domcontentloaded').catch(() => {});
            break;

        case 'text': {
            const target = rest[0] ?? 'body';
            const value = await page.locator(target).first().innerText({ timeout: 15000 });
            console.log(value.replace(/\n{3,}/g, '\n\n').trim());
            break;
        }

        case 'html':
            console.log(await page.locator(rest[0] ?? 'body').first().innerHTML({ timeout: 15000 }));
            break;

        case 'links': {
            const items = await page.$$eval(
                'a, button, [role="button"], input[type="submit"]',
                (nodes) => nodes
                    .filter((n) => n.offsetParent !== null)
                    .map((n) => {
                        const label = (n.innerText || n.value || n.getAttribute('aria-label') || '').trim();
                        const href = n.getAttribute('href') ?? '';
                        return label || href ? `${label || '(без текста)'}${href ? ' → ' + href : ''}` : null;
                    })
                    .filter(Boolean)
                    .slice(0, 80)
            );
            console.log(items.join('\n'));
            break;
        }

        case 'shot':
        case 'where':
            break;

        default:
            failure = `Неизвестная команда: ${command}`;
    }

    await page.waitForTimeout(400);
    await page.screenshot({ path: shotPath, fullPage: false });
    writeFileSync(statePath, JSON.stringify({ url: page.url(), at: Date.now() }, null, 2));

    console.log(`\n[${persona.id} ${width}x${height}] ${page.url()}`);
    console.log(`заголовок: ${await page.title()}`);
    console.log(`скриншот: ${shotPath}  ← открой и посмотри глазами`);
} catch (error) {
    failure = error.message;
    await page.screenshot({ path: shotPath, fullPage: false }).catch(() => {});
    console.error(`\n[${persona.id}] ОШИБКА: ${error.message}`);
    console.error(`скриншот момента ошибки: ${shotPath}`);
} finally {
    await context.close();
}

process.exit(failure ? 1 : 0);
