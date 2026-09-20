/**
 * Что пришло персонам: письма, личные сообщения, поддержка — и сдвиг
 * отметок прочтения.
 *
 * Отметки двигаются ОТДЕЛЬНЫМ шагом (--ack) и только после рассылки:
 * сдвинуть их раньше значит потерять письмо, которое до персоны не
 * дошло.
 */

import { flags } from './cli.mjs';
import { tn, requireAccountId, findPersona, saveRoster } from './roster.mjs';
import { rows, shqSql } from './remote.mjs';
import { htmlToText, extractLinks, extractCodes, clip, indent } from './text.mjs';

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
export function collectMail(roster, personas, sinceOf) {
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
export function maxBySrc(list, src) {
    const ids = list.filter((r) => r.src === src).map((r) => Number(r.id));
    return ids.length ? Math.max(...ids) : null;
}

export function advanceMail(persona, list) {
    if (flags.has('--keep')) return;
    const log = maxBySrc(list, 'log');
    const queue = maxBySrc(list, 'queue');
    if (log !== null) persona.last_seen.mail_log_id = log;
    if (queue !== null) persona.last_seen.email_id = queue;
}

export function fetchMail(roster, persona, opts = {}) {
    const all = opts.all || flags.has('--all');
    const sinceOf = (p, key) => (all ? 0 : Number(p.last_seen?.[key] ?? 0));
    const list = collectMail(roster, [persona], sinceOf).get(persona.id) ?? [];

    if (opts.silent) return list;

    for (const row of list) {
        const text = htmlToText(row.body_html);
        const links = extractLinks(row.body_html);
        const codes = extractCodes(row.body_html, text);

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
export function fetchIm(roster, persona, opts = {}) {
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
export function fetchSupport(roster, persona, opts = {}) {
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

export function advance(persona, key, list) {
    if (flags.has('--keep') || !list.length) return;
    persona.last_seen[key] = Math.max(...list.map((r) => Number(r.id)));
}

// -------------------------------------------------------------- commands

/**
 * Опрос всех персон разом: три запроса на всю команду вместо трёх на
 * каждую. Отметки прочтения НЕ двигает — сначала разослать уведомления,
 * потом `poll --ack`, иначе потерянная рассылка означает потерянное
 * сообщение.
 */
export function pollAll(roster) {
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
export function printInbox(inbox, roster) {
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
            const codes = extractCodes(row.body_html, text);
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
export function ackInbox(inbox, roster) {
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
