/**
 * Разговор с хостом — только через настроенные `php garnet ssh` и
 * `php garnet sql --json`.
 *
 * Своего SSH- и DB-слоя нет намеренно: доступы уже описаны в ssh.ini, и
 * второй путь на хост означал бы второе место, где их надо держать в
 * согласии.
 */

import { spawnSync } from 'node:child_process';
import { APP_DIR } from './roster.mjs';
import { die } from './cli.mjs';

// ------------------------------------------------------------- transport

/** POSIX-квотирование для удалённого шелла (локального шелла нет — spawn без shell). */
export function shq(value) {
    return `'${String(value).replaceAll("'", `'\\''`)}'`;
}

// --------------------------------------------------------------- helpers

export function shqSql(value) {
    return `'${String(value).replaceAll("'", "''")}'`;
}

export function remoteSql(roster, sql) {
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

export function rows(roster, sql) {
    return remoteSql(roster, sql).rows ?? [];
}
