/**
 * Команды курьера. Точка входа только выбирает нужную по имени.
 */

import { spawnSync } from 'node:child_process';
import { flags, args, rest, die } from './cli.mjs';
import { APP_DIR, loadRoster, saveRoster, findPersona, tn, requireAccountId } from './roster.mjs';
import { shq, shqSql, remoteSql, rows } from './remote.mjs';
import { htmlToText, extractLinks, extractCodes, clip, indent, printTable } from './text.mjs';
import { collectMail, fetchMail, fetchIm, fetchSupport, advance, advanceMail, pollAll, printInbox, ackInbox } from './inbox.mjs';

export const commands = {
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
        const name = (rest[0] ?? die('нужно имя таблицы')).replace(/[^A-Za-z0-9_]/g, '');
        // Имя даётся коротким (`mail_log`) — префикс навешиваем сами, как и
        // везде. Уже префиксованное имя пропускаем: иначе `db_ir_mail_log`
        // превратится в `db_ir_db_ir_mail_log`.
        const table = name.startsWith(`${roster.env?.db_prefix}_`) ? name : tn(roster, name);
        printTable(rows(roster, `SHOW COLUMNS FROM ${table}`));
    },
};
