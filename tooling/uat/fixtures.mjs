#!/usr/bin/env node
/**
 * Набор файлов для персон UAT-команды.
 *
 * Персона прикладывает файлы к тикету поддержки, к личному сообщению и
 * ставит фото профиля — значит ей нужны настоящие файлы, а не пустышки с
 * правильным расширением: сервер проверяет и расширение, и реальный MIME
 * через finfo, а аватар вдобавок переупаковывается через GD. Пустышка
 * отвалится не потому, что нашла дефект, а потому что она пустышка.
 *
 *   node tooling/uat/fixtures.mjs
 *
 * Изображения и PDF рисует сам Chromium (он уже стоит для браузера персон),
 * поэтому файлы валидны по-настоящему и без единой зависимости.
 *
 * Что получается — в WorkDir/uat-files/:
 *
 *   ГОДНЫЕ (должны приниматься везде, где разрешён тип)
 *     avatar.jpg          1200×1200, обычное фото профиля
 *     photo-big.jpg       4000×3000 — снимок с телефона, аватар обязан его
 *                         пережать, а не подавиться
 *     screenshot.png      1440×900 — как скриншот к тикету
 *     picture.webp        современный формат из белого списка
 *     animation.gif       gif из белого списка
 *     notes.txt           текстовое вложение
 *     lesson-plan.pdf     документ
 *     «отчёт по занятию (1).txt»  кириллица, пробелы и скобки в имени
 *
 *   ГРАНИЧНЫЕ (ожидается внятный отказ, а не молчание или 500)
 *     oversize.jpg        > 5 МБ при лимите 5 МБ
 *     oversize.pdf        > 5 МБ
 *     empty.txt           0 байт
 *
 *   ЧУЖИЕ ТИПЫ (обычные ошибки живого человека, не атаки)
 *     drawing.svg         тип вне белого списка
 *     archive.zip         прислали архив вместо файла
 *     renamed.jpg         текст, переименованный в .jpg — расширение врёт,
 *                         finfo это ловит
 *
 * Набор нарочно без эксплойт-полезной нагрузки (веб-шелл, .htaccess,
 * полиглоты): команда проверяет продукт глазами пользователя на боевом
 * сайте, а не проводит пентест. Проверка тех сценариев — отдельное решение
 * владельца, а не побочный эффект UAT-прогона.
 */

import playwright from '../../Tests/node_modules/@playwright/test/index.js';
import { writeFileSync, readFileSync, mkdirSync, statSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FILES_DIR = resolve(APP_DIR, 'WorkDir', 'uat-files');

mkdirSync(FILES_DIR, { recursive: true });

const browser = await playwright.chromium.launch({ headless: true });
const page = await browser.newPage();

/**
 * Картинка нужного размера и формата, нарисованная в canvas.
 *
 * Рисуем не однотонную заливку, а градиент с фигурами: JPEG сжимает
 * плоский цвет почти в ноль, и «фото на 2 мегабайта» получилось бы
 * восьмикилобайтным — граничные проверки на таком не проверить.
 */
async function drawImage(width, height, type, quality) {
    return page.evaluate(async ({ width, height, type, quality }) => {
        const canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext('2d');

        const gradient = ctx.createLinearGradient(0, 0, width, height);
        gradient.addColorStop(0, '#4BB780');
        gradient.addColorStop(0.5, '#003366');
        gradient.addColorStop(1, '#F3F3F5');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);

        for (let i = 0; i < 400; i++) {
            ctx.fillStyle = `hsl(${(i * 37) % 360} 80% ${30 + (i % 50)}%)`;
            ctx.beginPath();
            ctx.arc((i * 97) % width, (i * 61) % height, 5 + (i % 40), 0, Math.PI * 2);
            ctx.fill();
        }

        const blob = await canvas.convertToBlob({ type, quality });
        const buffer = await blob.arrayBuffer();

        return [...new Uint8Array(buffer)];
    }, { width, height, type, quality });
}

async function writeImage(name, width, height, type, quality = 0.92) {
    const bytes = await drawImage(width, height, type, quality);
    writeFileSync(resolve(FILES_DIR, name), Buffer.from(bytes));
}

/**
 * Раздуваем файл до нужного размера, дописывая байты в хвост.
 *
 * И JPEG, и PDF спокойно переживают мусор после конца данных: заголовок на
 * месте, finfo определяет тип верно — отказать сервер должен именно по
 * размеру, а не потому, что файл побился. Иначе проверка лимита доказывала
 * бы не то.
 */
function padTo(name, bytes) {
    const path = resolve(FILES_DIR, name);
    const current = statSync(path).size;
    if (current >= bytes) return;

    writeFileSync(path, Buffer.concat([readFileSync(path), Buffer.alloc(bytes - current, 0x20)]));
}


// ── годные ──────────────────────────────────────────────────────────────
await writeImage('avatar.jpg', 1200, 1200, 'image/jpeg');
await writeImage('photo-big.jpg', 4000, 3000, 'image/jpeg');
await writeImage('screenshot.png', 1440, 900, 'image/png');
await writeImage('picture.webp', 800, 600, 'image/webp');

// GIF в canvas не кодируется — берём минимальный валидный (1×1, прозрачный).
writeFileSync(
    resolve(FILES_DIR, 'animation.gif'),
    Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'),
);

writeFileSync(resolve(FILES_DIR, 'notes.txt'), 'Заметки к занятию.\nВторая строка.\n');
writeFileSync(resolve(FILES_DIR, 'отчёт по занятию (1).txt'), 'Имя файла с кириллицей, пробелами и скобками.\n');

await page.setContent(
    '<h1 style="font-family:sans-serif">План занятия</h1>' +
    '<p style="font-family:sans-serif">Тестовый документ UAT-команды.</p>',
);
await page.pdf({ path: resolve(FILES_DIR, 'lesson-plan.pdf'), format: 'A4' });

// ── граничные ───────────────────────────────────────────────────────────
await writeImage('oversize.jpg', 3000, 2000, 'image/jpeg');
padTo('oversize.jpg', 6 * 1024 * 1024);

await page.pdf({ path: resolve(FILES_DIR, 'oversize.pdf'), format: 'A4' });
padTo('oversize.pdf', 6 * 1024 * 1024);

writeFileSync(resolve(FILES_DIR, 'empty.txt'), '');

// ── чужие типы ──────────────────────────────────────────────────────────
writeFileSync(
    resolve(FILES_DIR, 'drawing.svg'),
    '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="40" fill="#4BB780"/></svg>\n',
);

// Валидный пустой ZIP — 22 байта End-Of-Central-Directory и ничего больше.
writeFileSync(
    resolve(FILES_DIR, 'archive.zip'),
    Buffer.from('UEsFBgAAAAAAAAAAAAAAAAAAAAAAAA==', 'base64'),
);

writeFileSync(resolve(FILES_DIR, 'renamed.jpg'), 'Это обычный текст, которому поменяли расширение на .jpg\n');

await browser.close();

console.log(`Набор готов: ${FILES_DIR}\n`);
for (const name of readdirSync(FILES_DIR).sort()) {
    const size = statSync(resolve(FILES_DIR, name)).size;
    console.log(`  ${name.padEnd(30)} ${(size / 1024).toFixed(1).padStart(9)} КБ`);
}
