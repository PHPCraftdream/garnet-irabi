/**
 * Превращение письма в то, что можно передать человеку: текст без
 * разметки, вытащенные ссылки и коды входа.
 *
 * Курьер отдаёт персоне готовое, а не сырой HTML — иначе персона тратит
 * ход на разбор письма вместо дела.
 */

import { flags } from './cli.mjs';

// -------------------------------------------------------------- extract

/** HTML письма → читаемый текст без разметки. */
export function htmlToText(html) {
    return String(html ?? '')
        .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|tr|h[1-6])>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/** Ссылки — то, ради чего персона и просит письмо. */
export function extractLinks(html) {
    const found = new Set();
    for (const m of String(html ?? '').matchAll(/https?:\/\/[^\s"'<>)]+/gi)) {
        found.add(m[0].replace(/[.,;]+$/, ''));
    }
    return [...found];
}

/** Отдельно стоящие цифровые коды подтверждения. */
/**
 * Код из письма — то, ради чего курьер и нужен: персона его набирает руками.
 *
 * Основной источник — структурный: шаблон писем выделяет код жирным
 * (`<b style="font-size: 20px">REVequAi</b>`), и это надёжнее любой догадки
 * по тексту. Код авторизации буквенно-цифровой и разнорегистровый, поэтому
 * прежний поиск одних лишь цифр его не видел вовсе.
 *
 * Обычные слова в <b> (заголовок «Slotbook») отсеиваем требованием, чтобы в
 * токене была цифра либо больше одной заглавной не в начале.
 */
export const looksLikeCode = (token) => /\d/.test(token) || (token.slice(1).match(/[A-ZА-Я]/g) ?? []).length >= 2;

export function extractCodes(html, text = htmlToText(html)) {
    const found = new Set();

    for (const m of html.matchAll(/<(?:b|strong)\b[^>]*>\s*([\p{L}\d]{4,16})\s*<\/(?:b|strong)>/giu)) {
        if (looksLikeCode(m[1])) found.add(m[1]);
    }
    for (const m of text.matchAll(/(?<!\d)(\d{4,8})(?!\d)/g)) found.add(m[1]);

    return [...found];
}

export function clip(text, limit = 600) {
    if (flags.has('--raw') || text.length <= limit) return text;
    return text.slice(0, limit) + `\n… (+${text.length - limit} символов, --raw чтобы увидеть целиком)`;
}

export function indent(text) {
    return text.split('\n').map((l) => '   ' + l).join('\n');
}

export function printTable(list) {
    if (!list.length) return console.log('(0 rows)');
    const cols = Object.keys(list[0]);
    console.log(cols.join('\t'));
    for (const row of list) console.log(cols.map((c) => row[c] ?? 'NULL').join('\t'));
    console.log(`-- ${list.length} row(s)`);
}
