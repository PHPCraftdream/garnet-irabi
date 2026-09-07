#!/usr/bin/env node
/**
 * Браузер персоны UAT-команды.
 *
 * Персона ходит по slotbook.ru как живой человек: свой профиль браузера
 * (куки и localStorage переживают вызовы, вход не теряется), своя ширина
 * окна, скриншот после каждого действия — чтобы персона своими глазами
 * видела вёрстку, а не догадывалась по HTML.
 *
 * Каждый вызов — отдельный процесс: открывает persistent-контекст,
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
 *   wait [мс]             подождать ответа (по умолчанию 2000)
 *   upload <селектор> <файл…>  приложить файлы из набора uat-files
 *   text [селектор]       видимый текст страницы (по умолчанию body)
 *   html <селектор>       разметка фрагмента — когда нужен точный DOM
 *   value <селектор>      текущее значение поля (то, что реально в DOM)
 *   links                 видимые ссылки и кнопки: что вообще можно нажать
 *   shot                  только скриншот
 *   where                 текущий URL и заголовок
 *   do <действие> -- <действие> -- …   цепочка на ОДНОЙ загрузке страницы
 *   export-state          выгрузить куки персоны для MCP-браузера (лид)
 *
 * Про `do` — это не украшение, а единственный способ заполнить форму.
 * Процесс новый на каждый вызов, поэтому одиночная команда начинается с
 * перехода на последний URL, то есть с перезагрузки страницы. Введённый
 * текст и состояние компонентов (галочки, шаги визарда, открытые модалки)
 * живут в самой странице и перезагрузку не переживают — как и у живого
 * человека, нажавшего F5 посреди формы. Всё, что должно произойти без
 * перезагрузки между шагами, идёт одной цепочкой:
 *
 *   browse.mjs owner-1 do fill "input[name=email]" a@b.test \
 *       -- click "[data-test-id=auth-consent-pd]" \
 *       -- click "[data-test-id=auth-submit-btn]"
 *
 * Скриншот снимается после каждого шага цепочки (step-1.png, step-2.png…),
 * так что видно, на каком именно шаге всё пошло не так.
 *
 * После каждой команды печатается путь к скриншоту — его нужно ОТКРЫТЬ и
 * посмотреть: половина дефектов (съехавшая вёрстка, обрезанный текст,
 * налезающие элементы) в тексте страницы не видна.
 */

// @playwright/test — CommonJS, поэтому только через default-импорт.
import playwright from '../../Tests/node_modules/@playwright/test/index.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ROSTER_PATH = resolve(APP_DIR, 'WorkDir', 'uat-roster.json');
const BROWSERS_DIR = resolve(APP_DIR, 'WorkDir', 'uat-browsers');
const FILES_DIR = resolve(APP_DIR, 'WorkDir', 'uat-files');

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
const storagePath = resolve(profileDir, 'storage.json');
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

/*
 * Вход персоны держится на storageState, а НЕ на профиле Chromium.
 *
 * `launchPersistentContext` сохраняет на диск только куки со сроком жизни:
 * сессионные (а PHPSESSID именно такой) браузер выбрасывает при закрытии —
 * а закрывается он у нас после каждой команды. Персона входила по коду,
 * сервер вход засчитывал (`last_auth_time`, письмо «успешная авторизация»),
 * а следующая её команда приходила уже без сессии — и сайт показывал форму
 * входа. Со стороны это выглядит как «код не сработал».
 *
 * storageState сериализует куки вместе с сессионными и localStorage, и
 * восстанавливает их в новом контексте — штатный рецепт Playwright для
 * переиспользования логина.
 */
const browser = await playwright.chromium.launch({ headless: true });
const context = await browser.newContext({
    viewport: { width, height },
    locale: 'ru-RU',
    ...(existsSync(storagePath) ? { storageState: storagePath } : {}),
});

const page = context.pages()[0] ?? (await context.newPage());
let failure = null;

/**
 * Одно действие над уже открытой страницей.
 *
 * Ничего не перезагружает: переход делает только `open`/`back`/`reload` и
 * та навигация, которую вызвал сам сайт в ответ на клик. Всё остальное
 * работает поверх текущего состояния страницы — на этом и держится `do`.
 */
async function act(name, args) {
    switch (name) {
        case 'open':
            await page.goto(absolute(args[0] ?? '/'), { waitUntil: 'domcontentloaded', timeout: 30000 });
            return;

        case 'back':
            await page.goBack({ waitUntil: 'domcontentloaded' });
            return;

        case 'reload':
            await page.reload({ waitUntil: 'domcontentloaded' });
            return;

        case 'click':
            await page.click(args[0], { timeout: 15000 });
            await page.waitForLoadState('domcontentloaded').catch(() => {});
            return;

        case 'fill':
            await page.fill(args[0], args.slice(1).join(' '), { timeout: 15000 });
            return;

        // Поле выбора файла обычно спрятано за красивой кнопкой, поэтому
        // именно setInputFiles, а не клик: он работает и по скрытому input.
        // Имена файлов — из набора `node tooling/uat/fixtures.mjs`.
        case 'upload': {
            const files = args.slice(1).map((file) => (
                /[\\/]/.test(file) ? file : resolve(FILES_DIR, file)
            ));
            for (const file of files) {
                if (!existsSync(file)) throw new Error(`Нет файла: ${file} (создать: node tooling/uat/fixtures.mjs)`);
            }
            await page.setInputFiles(args[0], files, { timeout: 15000 });
            return;
        }

        case 'press':
            await page.keyboard.press(args[0]);
            await page.waitForLoadState('domcontentloaded').catch(() => {});
            return;

        // Живой человек после отправки формы ждёт ответа и смотрит на итог,
        // а не на спиннер. Без паузы `text` читает страницу, которая ещё в
        // полёте, — и отчёт получается про промежуточное состояние.
        case 'wait':
            await page.waitForTimeout(Number(args[0] ?? 2000));
            return;

        case 'text': {
            const target = args[0] ?? 'body';
            const value = await page.locator(target).first().innerText({ timeout: 15000 });
            console.log(value.replace(/\n{3,}/g, '\n\n').trim());
            return;
        }

        case 'html':
            console.log(await page.locator(args[0] ?? 'body').first().innerHTML({ timeout: 15000 }));
            return;

        case 'value': {
            const locator = page.locator(args[0]).first();
            const checkbox = await locator.evaluate((n) => n.type === 'checkbox' || n.type === 'radio');
            console.log(checkbox ? String(await locator.isChecked()) : await locator.inputValue({ timeout: 15000 }));
            return;
        }

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
            return;
        }

        case 'shot':
        case 'where':
            return;

        // Мост к MCP-браузеру фреймворка (`garnet-browser`). Персона ходит в
        // своём профиле на диске, а разбирать её репорт удобнее там, где есть
        // php_errors/timeline/react_tree — но тот держит контекст в памяти и
        // сам логиниться не умеет. Выгружаем куки в AUTH_DIR под именем роли:
        // session_create role="uat-<персона>" подхватит файл без параметров.
        case 'export-state': {
            const target = resolve(APP_DIR, 'Tests', '.auth', `uat-${persona.id}.json`);
            mkdirSync(dirname(target), { recursive: true });
            await context.storageState({ path: target });
            console.log(`состояние выгружено: ${target}`);
            console.log(`в MCP: session_create role="uat-${persona.id}" baseUrl="${baseUrl}"`);
            return;
        }

        default:
            throw new Error(`Неизвестная команда: ${name}`);
    }
}

/** `do a b -- c d -- e` → [['a','b'], ['c','d'], ['e']] */
function splitSteps(args) {
    return args
        .reduce((steps, arg) => (arg === '--' ? [...steps, []] : [...steps.slice(0, -1), [...steps.at(-1), arg]]), [[]])
        .filter((step) => step.length > 0);
}

try {
    const steps = command === 'do' || command === 'seq' ? splitSteps(rest) : [[command, ...rest]];

    if (steps.length === 0) {
        throw new Error('Цепочка пустая: do <действие> -- <действие> …');
    }

    // Снимки прошлой цепочки — чтобы step-4.png от позапрошлого запуска не
    // выдал себя за шаг, которого в этой цепочке не было.
    readdirSync(profileDir)
        .filter((file) => /^step-\d+\.png$/.test(file))
        .forEach((file) => rmSync(resolve(profileDir, file), { force: true }));

    // Восстанавливаем последнюю страницу — процесс новый, вкладка пустая,
    // но куки в профиле остались, поэтому сессия не теряется. Внутри
    // цепочки этого больше не происходит: шаги идут по живой странице.
    if (steps[0][0] !== 'open' && lastUrl) {
        await page.goto(lastUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    }

    /* eslint-disable no-await-in-loop -- в том и смысл цепочки, что шаги
       строго последовательны: каждый следующий работает со страницей,
       которую изменил предыдущий. Promise.all их бы просто перемешал. */
    for (const [index, [name, ...args]] of steps.entries()) {
        if (steps.length > 1) {
            // Для open печатаем уже развёрнутый адрес: Git Bash успел
            // подменить `/system/` на `C:/Program Files/Git/system/`, и в
            // логе это выглядит как ошибка, хотя absolute() её и чинит.
            const shown = name === 'open' ? absolute(args[0] ?? '/') : args.join(' ');
            console.log(`\n— шаг ${index + 1}/${steps.length}: ${name} ${shown}`.trimEnd());
        }

        await act(name, args);

        if (steps.length > 1) {
            await page.waitForTimeout(400);
            const stepShot = resolve(profileDir, `step-${index + 1}.png`);
            await page.screenshot({ path: stepShot, fullPage: false });
            console.log(`скриншот шага: ${stepShot}`);
        }
    }
    /* eslint-enable no-await-in-loop */

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
    // Сохраняем ДО закрытия и в том числе после ошибки: упавшая команда всё
    // равно могла войти в систему, и терять из-за неё сессию незачем.
    await context.storageState({ path: storagePath }).catch(() => {});
    await context.close();
    await browser.close();
}

process.exit(failure ? 1 : 0);
