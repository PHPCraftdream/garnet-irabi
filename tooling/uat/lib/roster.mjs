/**
 * Реестр персон: чтение, запись, поиск и имена таблиц.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { die } from './cli.mjs';

// На уровень глубже, чем был uat.mjs, поэтому на один '..' больше.
export const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const ROSTER_PATH = resolve(APP_DIR, 'WorkDir', 'uat-roster.json');

// ---------------------------------------------------------------- roster

export function loadRoster() {
    if (!existsSync(ROSTER_PATH)) {
        die(`Реестр не найден: ${ROSTER_PATH}\nСоздайте его по схеме из .claude/skills/uat-team/SKILL.md`);
    }
    return JSON.parse(readFileSync(ROSTER_PATH, 'utf8'));
}

export function saveRoster(roster) {
    writeFileSync(ROSTER_PATH, JSON.stringify(roster, null, 2) + '\n');
}

export function findPersona(roster, id) {
    const persona = roster.personas.find((p) => p.id === id || p.email === id);
    if (!persona) {
        die(`Персона "${id}" не найдена. Есть: ${roster.personas.map((p) => p.id).join(', ')}`);
    }
    persona.last_seen ??= { mail_log_id: 0, email_id: 0, im_id: 0, support_id: 0 };
    return persona;
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
export function tn(roster, name) {
    const prefix = roster.env?.db_prefix;
    if (!prefix) die('env.db_prefix не заполнен — выполните: node tooling/uat/uat.mjs prefix');

    return `${prefix}_${name}`;
}

export function requireAccountId(persona) {
    if (!persona.account_id) {
        die(`У персоны ${persona.id} нет account_id — сначала \`uat sync\` (и она должна быть зарегистрирована).`);
    }
    return Number(persona.account_id);
}
