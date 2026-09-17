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

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { command } from './lib/cli.mjs';
import { commands } from './lib/commands.mjs';

// Справка печатается из докблока ЭТОГО файла — он и есть текст
// справки, поэтому остаётся здесь, а не уезжает в модуль.
if (!command || !commands[command]) {
    console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^.*?\/\*\*/s, ''));
    process.exit(command ? 1 : 0);
}

commands[command]();
