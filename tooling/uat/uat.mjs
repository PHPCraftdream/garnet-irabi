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
 *   roster                 состав команды и состояние
 *   watch                  у кого есть новое (одна строка на персону)
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
 * Описание канала: где таблица, по какому полю адресат, что показывать.
 * Схема очереди писем известна из Bundle/Modules/Email/Tables/FwEmailQueue.php.
 * Для IM и поддержки имена таблиц/колонок берутся из реестра (roster.tables) —
 * угадывать их нельзя, узнаются один раз через `uat tables` / `uat cols`.
 */
function channelConfig(roster, channel) {
    const table = roster.tables?.[channel];
    if (!table || !table.name) {
        die(
            `Канал "${channel}" не настроен в реестре (tables.${channel}.name пуст).\n` +
            `Найдите таблицу: node tooling/uat/uat.mjs tables ${channel === 'email_queue' ? 'email' : channel}\n` +
            `Колонки:        node tooling/uat/uat.mjs cols <таблица>`
        );
    }
    return table;
}

function fetchMail(roster, persona) {
    const t = channelConfig(roster, 'email_queue');
    const since = flags.has('--all') ? 0 : persona.last_seen.email_id ?? 0;
    const list = rows(
        roster,
        `SELECT id, subject, body_html, status, created_at FROM ${t.name} ` +
        `WHERE recipient_email = ${shqSql(persona.email)} AND id > ${Number(since)} ORDER BY id`
    );

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

function fetchGeneric(roster, persona, channel, label) {
    const t = channelConfig(roster, channel);
    const seenKey = channel === 'im_messages' ? 'im_id' : 'support_id';
    const since = flags.has('--all') ? 0 : persona.last_seen[seenKey] ?? 0;

    const who = t.recipient_is_account_id
        ? `${t.recipient} = ${Number(persona.account_id)}`
        : `${t.recipient} = ${shqSql(persona.email)}`;

    const list = rows(
        roster,
        `SELECT ${t.id} AS id, ${t.body} AS body${t.extra ? `, ${t.extra}` : ''} ` +
        `FROM ${t.name} WHERE ${who} AND ${t.id} > ${Number(since)} ORDER BY ${t.id}`
    );

    for (const row of list) {
        console.log(`\n── ${label} #${row.id}`);
        console.log(indent(clip(htmlToText(row.body))));
    }

    if (!list.length) console.log(`  ${label}: пусто`);
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

const commands = {
    roster() {
        const roster = loadRoster();
        console.log('id\tроль\tсостояние\temail\tagent');
        for (const p of roster.personas) {
            console.log([p.id, p.role, p.state, p.email, p.agent ?? '—'].join('\t'));
        }
    },

    watch() {
        const roster = loadRoster();
        const t = roster.tables?.email_queue;
        if (!t?.name) die('tables.email_queue.name не настроен — сначала `uat tables email`');

        for (const p of roster.personas) {
            const [{ n = 0 } = {}] = rows(
                roster,
                `SELECT COUNT(*) AS n FROM ${t.name} WHERE recipient_email = ${shqSql(p.email)} ` +
                `AND id > ${Number(p.last_seen?.email_id ?? 0)}`
            );
            const mark = Number(n) > 0 ? `${n} новых писем` : 'тихо';
            console.log(`${p.id.padEnd(12)} ${p.role.padEnd(10)} ${mark}`);
        }
    },

    mail() {
        const roster = loadRoster();
        const persona = findPersona(roster, rest[0] ?? die('нужен id персоны'));
        console.log(`# ${persona.id} <${persona.email}>`);
        advance(persona, 'email_id', fetchMail(roster, persona));
        saveRoster(roster);
    },

    im() {
        const roster = loadRoster();
        const persona = findPersona(roster, rest[0] ?? die('нужен id персоны'));
        console.log(`# ${persona.id} — личные сообщения`);
        advance(persona, 'im_id', fetchGeneric(roster, persona, 'im_messages', 'сообщение'));
        saveRoster(roster);
    },

    support() {
        const roster = loadRoster();
        const persona = findPersona(roster, rest[0] ?? die('нужен id персоны'));
        console.log(`# ${persona.id} — поддержка`);
        advance(persona, 'support_id', fetchGeneric(roster, persona, 'support_messages', 'тикет'));
        saveRoster(roster);
    },

    inbox() {
        const roster = loadRoster();
        const persona = findPersona(roster, rest[0] ?? die('нужен id персоны'));
        console.log(`# ${persona.id} <${persona.email}>`);
        advance(persona, 'email_id', fetchMail(roster, persona));
        if (roster.tables?.im_messages?.name) {
            advance(persona, 'im_id', fetchGeneric(roster, persona, 'im_messages', 'сообщение'));
        }
        if (roster.tables?.support_messages?.name) {
            advance(persona, 'support_id', fetchGeneric(roster, persona, 'support_messages', 'тикет'));
        }
        saveRoster(roster);
    },

    ack() {
        const roster = loadRoster();
        const persona = findPersona(roster, rest[0] ?? die('нужен id персоны'));
        const what = rest[1] ?? 'all';

        const bump = (channel, key) => {
            const t = roster.tables?.[channel];
            if (!t?.name) return;
            const col = channel === 'email_queue' ? 'recipient_email' : t.recipient;
            const value = channel === 'email_queue' || !t.recipient_is_account_id
                ? shqSql(persona.email)
                : Number(persona.account_id);
            const [{ max_id = 0 } = {}] = rows(
                roster,
                `SELECT MAX(${t.id ?? 'id'}) AS max_id FROM ${t.name} WHERE ${col} = ${value}`
            );
            persona.last_seen[key] = Number(max_id ?? 0);
        };

        if (what === 'all' || what === 'mail') bump('email_queue', 'email_id');
        if (what === 'all' || what === 'im') bump('im_messages', 'im_id');
        if (what === 'all' || what === 'support') bump('support_messages', 'support_id');

        saveRoster(roster);
        console.log(`${persona.id}: отметки прочтения обновлены — ${JSON.stringify(persona.last_seen)}`);
    },

    /** Подтянуть из БД account_id, тип и штатные флаги для всех персон. */
    sync() {
        const roster = loadRoster();
        const accounts = roster.tables?.accounts?.name;
        const data = roster.tables?.accounts_data?.name;
        if (!accounts || !data) die('tables.accounts.name / tables.accounts_data.name не настроены — `uat tables account`');

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
        const accounts = roster.tables?.accounts?.name ?? die('tables.accounts.name не настроен');
        const data = roster.tables?.accounts_data?.name ?? die('tables.accounts_data.name не настроен');

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
