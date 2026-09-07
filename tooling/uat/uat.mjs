#!/usr/bin/env node
/**
 * UAT-team courier CLI.
 *
 * Персоны-агенты ходят по slotbook.ru только браузером; почта у них на
 * `.test` и физически не доставляется. Этот инструмент — курьер: достаёт
 * из боевой БД то, что персона не может получить сама, и печатает уже
 * готовое к передаче (ссылка/код/текст), а не сырой HTML.
 *
 * Всё общение с хостом идёт через уже настроенный `php garnet ssh`
 * (ssh.ini) + `php garnet sql --json`, никакого своего SSH/DB-слоя.
 *
 *   node tooling/uat/uat.mjs <команда> [аргументы]
 *
 *   poll                   ОСНОВНОЙ ЦИКЛ: что пришло всей команде за один
 *                          проход (--ack двигает отметки ПОСЛЕ рассылки)
 *   prefix                 прочитать префикс таблиц из db.ini хоста
 *   roster                 состав команды и состояние
 *   mail <persona>         новые письма + вытащенные ссылки/коды
 *   im <persona>           новые личные сообщения
 *   support <persona>      новые сообщения поддержки
 *   inbox <persona>        всё сразу
 *   ack <persona> [what]   отметить прочитанным (mail|im|support|all)
 *   sync                   подтянуть account_id/тип/флаги всех персон в реестр
 *   account <persona>      аккаунт персоны и её флаги
 *   errors [N]             хвост боевого журнала ошибок за сегодня
 *   sql "<SQL>"            произвольный запрос (без возни с кавычками ssh)
 *   tables [шаблон]        поиск таблиц по имени
 *   cols <table>           колонки таблицы
 *
 * Флаги: --all (не только новое), --keep (не двигать отметку прочтения),
 *        --raw (не подрезать длинный текст).
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ROSTER_PATH = resolve(APP_DIR, 'WorkDir', 'uat-roster.json');

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith('--')));
const args = argv.filter((a) => !a.startsWith('--'));
const [command, ...rest] = args;

// ---------------------------------------------------------------- roster

function loadRoster() {
    if (!existsSync(ROSTER_PATH)) {
        die(`Реестр не найден: ${ROSTER_PATH}\nСоздайте его по схеме из .claude/skills/uat-team/SKILL.md`);
    }
    return JSON.parse(readFileSync(ROSTER_PATH, 'utf8'));
}

function saveRoster(roster) {
    writeFileSync(ROSTER_PATH, JSON.stringify(roster, null, 2) + '\n');
}

function findPersona(roster, id) {
    const persona = roster.personas.find((p) => p.id === id || p.email === id);
    if (!persona) {
        die(`Персона "${id}" не найдена. Есть: ${roster.personas.map((p) => p.id).join(', ')}`);
    }
    persona.last_seen ??= { email_id: 0, im_id: 0, support_id: 0 };
    return persona;
}

// ------------------------------------------------------------- transport

/** POSIX-квотирование для удалённого шелла (локального шелла нет — spawn без shell). */
function shq(value) {
    return `'${String(value).replaceAll("'", `'\\''`)}'`;
}

function remoteSql(roster, sql) {
    const runtime = roster.env?.runtime_dir;
    if (!runtime) die('В реестре не задан env.runtime_dir');

    const remote = `cd ${shq(runtime)} && php garnet sql --json ${shq(sql)}`;
    const res = spawnSync('php', ['garnet', 'ssh', remote, '--cd-remote'], {
        cwd: APP_DIR,
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024,
    });

    if (res.error) die(`Не удалось запустить php garnet ssh: ${res.error.message}`);

    // В stdout может быть посторонний шум от бутстрапа — берём последнюю
    // строку, похожую на JSON-объект.
    const line = (res.stdout || '')
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.startsWith('{'))
        .pop();

    if (!line) {
        die(`Пустой ответ от sql.\nstdout: ${res.stdout}\nstderr: ${res.stderr}`);
    }

    const payload = JSON.parse(line);
    if (payload.error) die(`MySQL: ${payload.error}`);
    return payload;
}

function rows(roster, sql) {
    return remoteSql(roster, sql).rows ?? [];
}

// -------------------------------------------------------------- extract

/** HTML письма → читаемый текст без разметки. */
function htmlToText(html) {
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
function extractLinks(html) {
    const found = new Set();
    for (const m of String(html ?? '').matchAll(/https?:\/\/[^\s"'<>)]+/gi)) {
        found.add(m[0].replace(/[.,;]+$/, ''));
    }
    return [...found];
}

/** Отдельно стоящие цифровые коды подтверждения. */
function extractCodes(text) {
    const found = new Set();
    for (const m of text.matchAll(/(?<!\d)(\d{4,8})(?!\d)/g)) found.add(m[1]);
    return [...found];
}

function clip(text, limit = 600) {
    if (flags.has('--raw') || text.length <= limit) return text;
    return text.slice(0, limit) + `\n… (+${text.length - limit} символов, --raw чтобы увидеть целиком)`;
}

// ------------------------------------------------------------- channels

/**
 * Полное имя таблицы: префикс установки + логическое имя.
 *
 * Та же формула, что у канонического хелпера тестов —
 * `Tests/helpers/scoped-test.ts::tn()` (`${getDbPrefix()}_${name}`).
 * Имена таблиц не хардкодятся и не угадываются перебором `SHOW TABLES`:
 * префикс задаётся в `db.ini` конкретной установки и читается с самого
 * хоста (`uat prefix`), логические имена задаёт приложение.
 */
function tn(roster, name) {
    const prefix = roster.env?.db_prefix;
    if (!prefix) die('env.db_prefix не заполнен — выполните: node tooling/uat/uat.mjs prefix');

    return `${prefix}_${name}`;
}

function requireAccountId(persona) {
    if (!persona.account_id) {
        die(`У персоны ${persona.id} нет account_id — сначала \`uat sync\` (и она должна быть зарегистрирована).`);
    }
    return Number(persona.account_id);
}

/**
 * Письма команды одним запросом на источник.
 *
 * На проде почта идёт через `mail_log` (прямая отправка), а `email_queue`
 * пустая — но очередь обрабатывается кроном и может использоваться, поэтому
 * читаем оба источника и держим для них отдельные отметки прочтения:
 * id-пространства у таблиц разные.
 *
 * Фильтр по тестовому домену, а не по списку адресов: письма реальных
 * клиентов не должны попадать в выборку вообще.
 *
 * @returns Map<personaId, row[]> — row.src = 'log' | 'queue'
 */
function collectMail(roster, personas, sinceOf) {
    const out = new Map(personas.map((p) => [p.id, []]));
    if (!personas.length) return out;

    const domain = roster.config?.email_domain ?? die('config.email_domain не задан');
    const like = shqSql('%@' + domain);
    const byEmail = new Map(personas.map((p) => [p.email.toLowerCase(), p.id]));

    const push = (row, src) => {
        const targets = new Set([String(row.recipient_email ?? '').toLowerCase()]);
        for (const extra of String(row.extra ?? '').split(',')) {
            if (extra.trim()) targets.add(extra.trim().toLowerCase());
        }
        for (const address of targets) {
            const id = byEmail.get(address);
            if (!id) continue;
            const persona = personas.find((p) => p.id === id);
            if (Number(row.id) > sinceOf(persona, src === 'log' ? 'mail_log_id' : 'email_id')) {
                out.get(id).push({ ...row, src });
            }
        }
    };

    const minSince = (key) => Math.min(...personas.map((p) => sinceOf(p, key)));
    const recipients = tn(roster, 'mail_log_recipients');

    for (const row of rows(
        roster,
        `SELECT l.id, l.recipient_email, l.subject, l.body_html, l.status, l.mail_type` +
        (recipients
            ? `, (SELECT GROUP_CONCAT(r.recipient_email) FROM ${recipients} r WHERE r.mail_log_id = l.id) AS extra`
            : ', NULL AS extra') +
        ` FROM ${tn(roster, 'mail_log')} l WHERE l.id > ${minSince('mail_log_id')} AND (` +
        `l.recipient_email LIKE ${like}` +
        (recipients
            ? ` OR EXISTS (SELECT 1 FROM ${recipients} r2 WHERE r2.mail_log_id = l.id AND r2.recipient_email LIKE ${like})`
            : '') +
        `) ORDER BY l.id`
    )) push(row, 'log');

    for (const row of rows(
        roster,
        `SELECT id, recipient_email, subject, body_html, status, NULL AS mail_type, NULL AS extra ` +
        `FROM ${tn(roster, 'email_queue')} ` +
        `WHERE id > ${minSince('email_id')} AND recipient_email LIKE ${like} ORDER BY id`
    )) push(row, 'queue');

    return out;
}

/** Максимальный id по источнику — для сдвига отметок прочтения. */
function maxBySrc(list, src) {
    const ids = list.filter((r) => r.src === src).map((r) => Number(r.id));
    return ids.length ? Math.max(...ids) : null;
}

function advanceMail(persona, list) {
    if (flags.has('--keep')) return;
    const log = maxBySrc(list, 'log');
    const queue = maxBySrc(list, 'queue');
    if (log !== null) persona.last_seen.mail_log_id = log;
    if (queue !== null) persona.last_seen.email_id = queue;
}

function fetchMail(roster, persona, opts = {}) {
    const all = opts.all || flags.has('--all');
    const sinceOf = (p, key) => (all ? 0 : Number(p.last_seen?.[key] ?? 0));
    const list = collectMail(roster, [persona], sinceOf).get(persona.id) ?? [];

    if (opts.silent) return list;

    for (const row of list) {
        const text = htmlToText(row.body_html);
        const links = extractLinks(row.body_html);
        const codes = extractCodes(text);

        console.log(`\n── письмо #${row.id} [${row.status}] ${row.subject ?? ''}`);
        if (links.length) console.log(`   ссылки: ${links.join('\n           ')}`);
        if (codes.length) console.log(`   коды:   ${codes.join(', ')}`);
        console.log(indent(clip(text)));
    }

    if (!list.length) console.log('  писем нет');
    return list;
}

/**
 * Личные сообщения. У `im_messages` нет колонки получателя — адресат
 * выводится через беседу: персона участник, а автор — не она.
 */
function fetchIm(roster, persona, opts = {}) {
    const me = requireAccountId(persona);
    const since = opts.all || flags.has('--all') ? 0 : persona.last_seen.im_id ?? 0;

    const list = rows(
        roster,
        `SELECT m.id AS id, m.body AS body, m.sender_id AS sender_id, a.name AS sender_name ` +
        `FROM ${tn(roster, 'im_messages')} m ` +
        `JOIN ${tn(roster, 'im_conversations')} c ON c.id = m.conversation_id ` +
        `LEFT JOIN ${tn(roster, 'accounts')} a ON a.id = m.sender_id ` +
        `WHERE (c.participant_a = ${me} OR c.participant_b = ${me}) ` +
        `AND m.sender_id <> ${me} AND m.id > ${Number(since)} ORDER BY m.id`
    );

    for (const row of list) {
        console.log(`\n── сообщение #${row.id} от ${row.sender_name ?? row.sender_id}`);
        console.log(indent(clip(htmlToText(row.body))));
    }

    if (!list.length) console.log('  личных сообщений нет');
    return list;
}

/**
 * Поддержка. Для клиента — сообщения в его тикетах, кроме внутренних заметок
 * персонала. Для сотрудника (модератор/владелец) — тикеты, назначенные на
 * него, плюс ещё не назначенные: внутренние заметки ему видны.
 */
function fetchSupport(roster, persona, opts = {}) {
    const me = requireAccountId(persona);
    const since = opts.all || flags.has('--all') ? 0 : persona.last_seen.support_id ?? 0;
    const staff = persona.role === 'moderator' || persona.role === 'owner';

    const scope = staff
        ? `(t.assignee_id = ${me} OR t.assignee_id IS NULL)`
        : `t.account_id = ${me} AND m.is_internal = 0`;

    const list = rows(
        roster,
        `SELECT m.id AS id, m.body AS body, m.msg_type AS msg_type, m.is_internal AS is_internal, ` +
        `t.id AS ticket_id, t.subject AS subject, t.status AS status ` +
        `FROM ${tn(roster, 'support_messages')} m ` +
        `JOIN ${tn(roster, 'support_tickets')} t ON t.id = m.ticket_id ` +
        `WHERE ${scope} AND m.author_id <> ${me} AND m.id > ${Number(since)} ORDER BY m.id`
    );

    if (opts.silent) return list;

    for (const row of list) {
        const mark = Number(row.is_internal) ? ' [внутренняя заметка]' : '';
        console.log(`\n── тикет #${row.ticket_id} «${row.subject}» [${row.status}] · ${row.msg_type}${mark}`);
        console.log(indent(clip(htmlToText(row.body))));
    }

    if (!list.length) console.log('  сообщений поддержки нет');
    return list;
}

function advance(persona, key, list) {
    if (flags.has('--keep') || !list.length) return;
    persona.last_seen[key] = Math.max(...list.map((r) => Number(r.id)));
}

// --------------------------------------------------------------- helpers

function shqSql(value) {
    return `'${String(value).replaceAll("'", "''")}'`;
}

function indent(text) {
    return text.split('\n').map((l) => '   ' + l).join('\n');
}

function die(message) {
    console.error(message);
    process.exit(1);
}

function printTable(list) {
    if (!list.length) return console.log('(0 rows)');
    const cols = Object.keys(list[0]);
    console.log(cols.join('\t'));
    for (const row of list) console.log(cols.map((c) => row[c] ?? 'NULL').join('\t'));
    console.log(`-- ${list.length} row(s)`);
}

// -------------------------------------------------------------- commands

/**
 * Опрос всех персон разом: три запроса на всю команду вместо трёх на
 * каждую. Отметки прочтения НЕ двигает — сначала разослать уведомления,
 * потом `poll --ack`, иначе потерянная рассылка означает потерянное
 * сообщение.
 */
function pollAll(roster) {
    const personas = roster.personas;
    const inbox = new Map(personas.map((p) => [p.id, { mail: [], im: [], support: [] }]));
    if (!personas.length) return inbox;

    const seen = (p, key) => Number(p.last_seen?.[key] ?? 0);
    const staffed = personas.filter((p) => p.account_id);

    // 1. Почта — оба источника (mail_log и очередь), см. collectMail()
    for (const [personaId, list] of collectMail(roster, personas, seen)) {
        inbox.get(personaId).mail.push(...list);
    }

    if (!staffed.length) return inbox;

    // 2. Личные сообщения
    const imWhere = staffed
        .map((p) => {
            const me = Number(p.account_id);
            return `((c.participant_a = ${me} OR c.participant_b = ${me}) AND m.sender_id <> ${me} AND m.id > ${seen(p, 'im_id')})`;
        })
        .join(' OR ');
    const imRows = rows(
        roster,
        `SELECT m.id AS id, m.body AS body, m.sender_id AS sender_id, ` +
        `c.participant_a AS pa, c.participant_b AS pb, a.name AS sender_name ` +
        `FROM ${tn(roster, 'im_messages')} m ` +
        `JOIN ${tn(roster, 'im_conversations')} c ON c.id = m.conversation_id ` +
        `LEFT JOIN ${tn(roster, 'accounts')} a ON a.id = m.sender_id ` +
        `WHERE ${imWhere} ORDER BY m.id`
    );
    for (const p of staffed) {
        const me = Number(p.account_id);
        for (const row of imRows) {
            const mine = Number(row.pa) === me || Number(row.pb) === me;
            if (mine && Number(row.sender_id) !== me && Number(row.id) > seen(p, 'im_id')) {
                inbox.get(p.id).im.push(row);
            }
        }
    }

    // 3. Поддержка (роль решает, что персоне видно)
    const supWhere = staffed
        .map((p) => {
            const me = Number(p.account_id);
            const scope = p.role === 'moderator' || p.role === 'owner'
                ? `(t.assignee_id = ${me} OR t.assignee_id IS NULL)`
                : `(t.account_id = ${me} AND m.is_internal = 0)`;
            return `(${scope} AND m.author_id <> ${me} AND m.id > ${seen(p, 'support_id')})`;
        })
        .join(' OR ');
    const supRows = rows(
        roster,
        `SELECT m.id AS id, m.body AS body, m.author_id AS author_id, m.is_internal AS is_internal, ` +
        `m.msg_type AS msg_type, t.id AS ticket_id, t.subject AS subject, t.status AS status, ` +
        `t.account_id AS owner_id, t.assignee_id AS assignee_id ` +
        `FROM ${tn(roster, 'support_messages')} m ` +
        `JOIN ${tn(roster, 'support_tickets')} t ON t.id = m.ticket_id ` +
        `WHERE ${supWhere} ORDER BY m.id`
    );
    for (const p of staffed) {
        const me = Number(p.account_id);
        const staff = p.role === 'moderator' || p.role === 'owner';
        for (const row of supRows) {
            if (Number(row.author_id) === me || Number(row.id) <= seen(p, 'support_id')) continue;
            const mine = staff
                ? Number(row.assignee_id) === me || row.assignee_id === null
                : Number(row.owner_id) === me && !Number(row.is_internal);
            if (mine) inbox.get(p.id).support.push(row);
        }
    }

    return inbox;
}

/** Печать сводки по всей команде. Возвращает, сколько всего пришло. */
function printInbox(inbox, roster) {
    let total = 0;

    for (const persona of roster.personas) {
        const box = inbox.get(persona.id);
        const n = box.mail.length + box.im.length + box.support.length;
        if (!n) continue;
        total += n;

        console.log(`\n### ${persona.id} (${persona.role}) <${persona.email}>`);

        for (const row of box.mail) {
            const text = htmlToText(row.body_html);
            const links = extractLinks(row.body_html);
            const codes = extractCodes(text);
            console.log(`- письмо #${row.id} [${row.status}]: ${row.subject ?? ''}`);
            if (links.length) console.log(`  ссылка: ${links[0]}`);
            if (codes.length) console.log(`  код: ${codes.join(', ')}`);
        }
        for (const row of box.im) {
            console.log(`- личное #${row.id} от ${row.sender_name ?? row.sender_id}: ${clip(htmlToText(row.body), 160)}`);
        }
        for (const row of box.support) {
            const mark = Number(row.is_internal) ? ' [внутренняя]' : '';
            console.log(`- поддержка #${row.id}, тикет #${row.ticket_id} «${row.subject}» [${row.status}]${mark}: ${clip(htmlToText(row.body), 160)}`);
        }
    }

    return total;
}

/** Сдвинуть отметки прочтения по тому, что реально показали. */
function ackInbox(inbox, roster) {
    for (const persona of roster.personas) {
        const box = inbox.get(persona.id);
        const max = (list) => (list.length ? Math.max(...list.map((r) => Number(r.id))) : null);

        advanceMail(persona, box.mail);
        const im = max(box.im);
        if (im !== null) persona.last_seen.im_id = im;
        const support = max(box.support);
        if (support !== null) persona.last_seen.support_id = support;
    }
    saveRoster(roster);
}

const commands = {
    roster() {
        const roster = loadRoster();
        console.log('id\tроль\tсостояние\temail\tagent');
        for (const p of roster.personas) {
            console.log([p.id, p.role, p.state, p.email, p.agent ?? '—'].join('\t'));
        }
    },

    /** Префикс таблиц берём с самого хоста — он задан в его db.ini. */
    prefix() {
        const roster = loadRoster();
        const runtime = roster.env?.runtime_dir ?? die('env.runtime_dir не задан');
        const res = spawnSync(
            'php',
            ['garnet', 'ssh', `grep -E '^[[:space:]]*prefix' ${shq(runtime)}/WorkDir/Config/db.ini`, '--cd-remote'],
            { cwd: APP_DIR, encoding: 'utf8' }
        );
        if (res.error) die(`ssh: ${res.error.message}`);

        const found = /prefix\s*=\s*"?([A-Za-z0-9_]+)"?/.exec(res.stdout || '');
        if (!found) die(`Не удалось прочитать prefix из db.ini хоста:\n${res.stdout}${res.stderr}`);

        roster.env.db_prefix = found[1];
        saveRoster(roster);
        console.log(`db_prefix = ${found[1]} (из db.ini хоста; имена таблиц собираются как <prefix>_<имя>)`);
    },

    /**
     * Один проход по всей команде: что кому пришло, готовым к рассылке
     * текстом. `--ack` двигает отметки — вызывать ПОСЛЕ рассылки.
     */
    poll() {
        const roster = loadRoster();
        const inbox = pollAll(roster);
        const total = printInbox(inbox, roster);

        if (!total) {
            console.log('тихо: новых писем, сообщений и тикетов нет');

            return;
        }

        if (flags.has('--ack')) {
            ackInbox(inbox, roster);
            console.log(`\n(отметки прочтения сдвинуты: ${total} шт.)`);
        } else {
            console.log(`\nвсего нового: ${total}. Разослать агентам, затем: poll --ack`);
        }
    },

    /**
     * Блокирующий вотчер: ждёт, пока команде что-нибудь придёт, печатает
     * пришедшее и выходит. Запускать фоном — сам выход и есть уведомление.
     *
     * Выданное сразу отмечается прочитанным: иначе перезапуск немедленно
     * сработал бы на тех же сообщениях и закрутил холостой цикл. Содержимое
     * уже отдано в выводе, так что потерять его нельзя; при необходимости
     * перечитывается через `mail <persona> --all`. `--keep` отключает.
     *
     * Коды выхода: 0 — что-то пришло, 3 — вышел таймаут (тишина).
     *
     *   node tooling/uat/uat.mjs wait [интервал_сек] [таймаут_сек]
     */
    async wait() {
        const intervalSec = Number(rest[0] ?? 20);
        const timeoutSec = Number(rest[1] ?? 1500);
        const deadline = Date.now() + timeoutSec * 1000;

        for (;;) {
            // Реестр перечитывается каждую итерацию: отметки могли сдвинуться
            // другой командой, пока вотчер висел.
            const roster = loadRoster();
            const inbox = pollAll(roster);
            const total = [...inbox.values()].reduce(
                (n, box) => n + box.mail.length + box.im.length + box.support.length,
                0
            );

            if (total) {
                printInbox(inbox, roster);
                if (!flags.has('--keep')) ackInbox(inbox, roster);
                console.log(`\nвсего нового: ${total}. Перезапустить wait, затем разослать агентам.`);
                process.exit(0);
            }

            if (Date.now() >= deadline) {
                console.log(`тишина ${timeoutSec}s — вотчер вышел по таймауту, перезапустите`);
                process.exit(3);
            }

            await new Promise((resolve) => setTimeout(resolve, intervalSec * 1000));
        }
    },

    mail() {
        const roster = loadRoster();
        const persona = findPersona(roster, rest[0] ?? die('нужен id персоны'));
        console.log(`# ${persona.id} <${persona.email}>`);
        advanceMail(persona, fetchMail(roster, persona));
        saveRoster(roster);
    },

    im() {
        const roster = loadRoster();
        const persona = findPersona(roster, rest[0] ?? die('нужен id персоны'));
        console.log(`# ${persona.id} — личные сообщения`);
        advance(persona, 'im_id', fetchIm(roster, persona));
        saveRoster(roster);
    },

    support() {
        const roster = loadRoster();
        const persona = findPersona(roster, rest[0] ?? die('нужен id персоны'));
        console.log(`# ${persona.id} — поддержка`);
        advance(persona, 'support_id', fetchSupport(roster, persona));
        saveRoster(roster);
    },

    inbox() {
        const roster = loadRoster();
        const persona = findPersona(roster, rest[0] ?? die('нужен id персоны'));
        console.log(`# ${persona.id} <${persona.email}>`);
        advanceMail(persona, fetchMail(roster, persona));
        if (persona.account_id) {
            advance(persona, 'im_id', fetchIm(roster, persona));
            advance(persona, 'support_id', fetchSupport(roster, persona));
        } else {
            console.log('  IM и поддержка пропущены: нет account_id (нужен `uat sync`)');
        }
        saveRoster(roster);
    },

    /**
     * Отметить прочитанным без вывода: те же выборки, что и у чтения,
     * но молча — берём максимальный id, до которого «всё видено».
     */
    ack() {
        const roster = loadRoster();
        const persona = findPersona(roster, rest[0] ?? die('нужен id персоны'));
        const what = rest[1] ?? 'all';
        const opts = { silent: true, all: true };

        const bump = (key, list) => {
            if (list.length) persona.last_seen[key] = Math.max(...list.map((r) => Number(r.id)));
        };

        if (what === 'all' || what === 'mail') bump('email_id', fetchMail(roster, persona, opts));
        if (persona.account_id) {
            if (what === 'all' || what === 'im') bump('im_id', fetchIm(roster, persona, opts));
            if (what === 'all' || what === 'support') bump('support_id', fetchSupport(roster, persona, opts));
        }

        saveRoster(roster);
        console.log(`${persona.id}: отметки прочтения обновлены — ${JSON.stringify(persona.last_seen)}`);
    },

    /** Подтянуть из БД account_id, тип и штатные флаги для всех персон. */
    sync() {
        const roster = loadRoster();
        const accounts = tn(roster, 'accounts');
        const data = tn(roster, 'accounts_data');

        const logins = roster.personas.map((p) => shqSql(p.email)).join(', ');
        const found = rows(roster, `SELECT id, login, type FROM ${accounts} WHERE login IN (${logins})`);
        const byLogin = new Map(found.map((r) => [String(r.login).toLowerCase(), r]));

        const ids = found.map((r) => shqSql(r.id)).join(', ') || "''";
        const flagRows = rows(
            roster,
            `SELECT account_id, param, value FROM ${data} WHERE account_id IN (${ids}) ` +
            `AND param IN ('IS_ADMIN','IS_OWNER','IS_MODERATOR','IS_APPROVED','IS_DISABLED')`
        );
        const flagsById = new Map();
        for (const r of flagRows) {
            const bag = flagsById.get(String(r.account_id)) ?? {};
            bag[r.param] = r.value;
            flagsById.set(String(r.account_id), bag);
        }

        for (const p of roster.personas) {
            const row = byLogin.get(p.email.toLowerCase());
            if (!row) {
                console.log(`${p.id.padEnd(12)} — аккаунта нет (ещё не зарегистрирован)`);
                continue;
            }
            p.account_id = Number(row.id);
            p.account_type = row.type;
            p.flags = flagsById.get(String(row.id)) ?? {};
            if (p.state === 'not-registered') p.state = 'registered';

            const on = Object.entries(p.flags).filter(([, v]) => Number(v) > 0).map(([k]) => k);
            console.log(`${p.id.padEnd(12)} id=${p.account_id} type=${row.type} ${on.join(' ') || '—'}`);
        }
        saveRoster(roster);
    },

    account() {
        const roster = loadRoster();
        const persona = findPersona(roster, rest[0] ?? die('нужен id персоны'));
        const accounts = tn(roster, 'accounts');
        const data = tn(roster, 'accounts_data');

        printTable(rows(roster, `SELECT * FROM ${accounts} WHERE login = ${shqSql(persona.email)}`));
        if (persona.account_id) {
            printTable(rows(roster, `SELECT param, value FROM ${data} WHERE account_id = ${shqSql(persona.account_id)}`));
        }
    },

    /** Хвост боевого журнала ошибок — чтобы не выпрашивать детали у персоны. */
    errors() {
        const roster = loadRoster();
        const runtime = roster.env?.runtime_dir ?? die('env.runtime_dir не задан');
        const n = Number(rest[0] ?? 60);
        const remote =
            `f=${shq(runtime)}/WorkDir/LogJournal/Errors/$(date +%Y-%m-%d).log; ` +
            `test -f "$f" && tail -n ${n} "$f" || echo "журнал за сегодня пуст"`;
        const res = spawnSync('php', ['garnet', 'ssh', remote, '--cd-remote'], {
            cwd: APP_DIR,
            encoding: 'utf8',
            maxBuffer: 16 * 1024 * 1024,
        });
        if (res.error) die(`ssh: ${res.error.message}`);
        console.log(res.stdout || res.stderr);
    },

    sql() {
        const roster = loadRoster();
        const statement = rest[0] ?? die('нужен SQL');
        const payload = remoteSql(roster, statement);
        if (payload.rows) printTable(payload.rows);
        else console.log(JSON.stringify(payload));
    },

    tables() {
        const roster = loadRoster();
        const pattern = rest[0] ?? '';
        printTable(rows(roster, `SHOW TABLES LIKE '%${pattern.replaceAll("'", '')}%'`));
    },

    cols() {
        const roster = loadRoster();
        const table = rest[0] ?? die('нужно имя таблицы');
        printTable(rows(roster, `SHOW COLUMNS FROM ${table.replace(/[^A-Za-z0-9_]/g, '')}`));
    },
};

if (!command || !commands[command]) {
    console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^.*?\/\*\*/s, ''));
    process.exit(command ? 1 : 0);
}

commands[command]();
