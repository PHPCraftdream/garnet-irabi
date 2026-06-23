/**
 * Centralised DB connection config for Playwright specs.
 *
 * Source of truth: `<app>/WorkDir/ConfigDev/db.ini` — the same file the
 * running PHP app reads. Specs that hard-coded credentials drifted
 * whenever the app config changed; reading the ini here keeps them in
 * lockstep.
 *
 * App-dir resolution (in order):
 *   1. `PW_APP_DIR` — explicit Playwright-side override.
 *   2. `GARNET_APP_DIR` — set by every `garnet` CLI wrapper and respected
 *      by the framework throughout. The same source of truth.
 *   3. Monorepo fallback: the first directory under `<repo>/Apps/` that
 *      contains a `WorkDir/ConfigDev/db.ini`. Only fires while the apps
 *      and the framework still live side by side.
 *
 * Per-field overrides: `PW_DB_HOST`, `PW_DB_PORT`, `PW_DB_NAME`,
 * `PW_DB_USER`, `PW_DB_PASSWORD`.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import mysql, { Connection } from 'mysql2/promise';

function resolveAppDir(): string {
    const explicit = process.env.PW_APP_DIR ?? process.env.GARNET_APP_DIR;
    if (explicit && explicit !== '') return explicit;

    // Monorepo fallback: scan Apps/ for the first app that has a
    // dev-config db.ini. Keeps things working while Framework/ and Apps/
    // are siblings; after the split this never fires (PW_APP_DIR / the
    // app's own playwright invocation supplies the path).
    const repoRoot = path.resolve(__dirname, '..', '..', '..');
    const appsDir = path.join(repoRoot, 'Apps');
    if (!fs.existsSync(appsDir)) return '';
    for (const entry of fs.readdirSync(appsDir)) {
        const candidate = path.join(appsDir, entry, 'WorkDir', 'ConfigDev', 'db.ini');
        if (fs.existsSync(candidate)) return path.join(appsDir, entry);
    }
    return '';
}

const APP_DIR = resolveAppDir();
const DEFAULT_INI = APP_DIR
    ? path.resolve(APP_DIR, 'WorkDir', 'ConfigDev', 'db.ini')
    : '';

/** Minimal INI parser — supports `key = "value"` and `key = value`. */
function readIni(file: string): Record<string, string> {
    const text = fs.readFileSync(file, 'utf-8');
    const out: Record<string, string> = {};
    for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim();
        if (!line || line.startsWith(';') || line.startsWith('#') || line.startsWith('[')) continue;
        const eq = line.indexOf('=');
        if (eq < 0) continue;
        const key = line.slice(0, eq).trim();
        let val = line.slice(eq + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
        }
        out[key] = val;
    }
    return out;
}

function resolveConfig() {
    const iniPath = process.env.PW_DB_INI ?? DEFAULT_INI;
    const ini = fs.existsSync(iniPath) ? readIni(iniPath) : {};
    return {
        host:     process.env.PW_DB_HOST     ?? ini.dbhost   ?? '127.0.0.1',
        port:     Number(process.env.PW_DB_PORT ?? ini.dbport ?? 3306),
        database: process.env.PW_DB_NAME     ?? ini.dbname   ?? 'app_db',
        user:     process.env.PW_DB_USER     ?? ini.user     ?? 'app_db',
        password: process.env.PW_DB_PASSWORD ?? ini.password ?? 'app_db',
    };
}

export const DB = resolveConfig();

/**
 * Live (non-isolated) table prefix from db.ini, e.g. `db_ir`.
 *
 * Most specs use the worker-scoped prefix via `tn()` / `workerPrefix`, but
 * a handful of CLI-driven tests (`php garnet cron`, `php garnet deploy:diff`)
 * boot from `consoleInit()` — no HTTP request, so the X-Test-Worker header
 * can't swap the prefix. They need to read/write the live tables directly.
 */
export function liveDbPrefix(): string {
    const iniPath = process.env.PW_DB_INI ?? DEFAULT_INI;
    const ini = fs.existsSync(iniPath) ? readIni(iniPath) : {};
    return ini.prefix ?? 'db_ir';
}

/**
 * Open a connection, run `fn`, and always close — replaces the
 * `try { ... } finally { await conn.end(); }` boilerplate that
 * cluttered every spec.
 *
 * ```ts
 * const tickets = await withConnection(conn =>
 *     conn.execute(`SELECT * FROM ${tn('support_tickets')}`)
 * );
 * ```
 */
export async function withConnection<T>(fn: (conn: Connection) => Promise<T>): Promise<T> {
    const conn = await mysql.createConnection(DB);
    try {
        return await fn(conn);
    } finally {
        await conn.end();
    }
}
