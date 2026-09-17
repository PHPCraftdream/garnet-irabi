/**
 * Префикс таблиц воркера и имена таблиц.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Resolve the framework table prefix for the current worker.
 *
 * The base prefix is read from `db.ini` (the same file PHP reads), so
 * an app-specific suffix like `db_ir` keeps working without spec-level
 * `ir_` hard-coding. Tests reference tables as `tn('accounts')` only;
 * the bundle-specific segment is part of the prefix, not the name.
 *
 * Two modes (isolation is ON by default):
 *   - default (`PW_WORKER_ISOLATION` unset or = "1"): returns
 *     `'test_worker_${idx}${suffix}'` where `suffix` is everything in
 *     the base prefix after the leading `db` segment (e.g. `_ir`).
 *     Each worker gets its own table namespace, race-free.
 *   - `PW_WORKER_ISOLATION=0`: returns the base prefix verbatim (e.g.
 *     `'db_ir'`). Drops back to the legacy shared set — for debugging
 *     against live data only, do NOT combine with `PW_WORKERS>1`.
 *
 * Used by both the `dbPrefix` test fixture (for spec destructuring)
 * AND by the `tn()` helper (for non-fixture helper functions).
 */
const DB_INI_CANDIDATES = [
    // __dirname = <app>/Tests/helpers → ../.. = <app>
    path.resolve(__dirname, '..', '..', 'WorkDir', 'ConfigDev', 'db.ini'),
    path.resolve(__dirname, '..', '..', 'WorkDir', 'Config', 'db.ini'),
    // Legacy: if Tests/ lived at the repo root (monorepo layout)
    path.resolve(__dirname, '..', '..', 'Apps', 'IRabi', 'WorkDir', 'ConfigDev', 'db.ini'),
    path.resolve(__dirname, '..', '..', 'Apps', 'IRabi', 'WorkDir', 'Config', 'db.ini'),
];
function readBasePrefix(): string {
    const override = process.env.PW_DB_PREFIX_BASE;
    if (override && override.length > 0) return override;
    for (const file of DB_INI_CANDIDATES) {
        if (!fs.existsSync(file)) continue;
        const text = fs.readFileSync(file, 'utf-8');
        for (const raw of text.split(/\r?\n/)) {
            const line = raw.trim();
            if (!line || line.startsWith(';') || line.startsWith('#') || line.startsWith('[')) continue;
            const eq = line.indexOf('=');
            if (eq < 0) continue;
            const key = line.slice(0, eq).trim();
            if (key !== 'prefix') continue;
            let val = line.slice(eq + 1).trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                val = val.slice(1, -1);
            }
            if (val) return val;
        }
    }
    return 'db';
}

export function getDbPrefix(): string {
    const base = readBasePrefix();
    if (process.env.PW_WORKER_ISOLATION === '0') {
        return base;
    }
    const idx = process.env.TEST_PARALLEL_INDEX ?? '0';
    // The DB_PREFIX_OVERRIDE substitution in isolation-setup replaces
    // the entire base prefix (`db_ir`, `db`, …) with `test_worker_N`,
    // so no suffix from the original prefix should be preserved.
    return `test_worker_${idx}`;
}

/**
 * Compose a fully-qualified table name from the bundle-relative name.
 * Drop-in replacement for hardcoded `db_*` literals in raw SQL:
 *
 * ```ts
 *   `SELECT * FROM ${tn('bookings')} WHERE id = ?`
 *   `INSERT INTO ${tn('accounts_data')} VALUES (...)`
 * ```
 *
 * Resolves at call time, so isolation toggles via env var without
 * recompiling the spec.
 */
export function tn(name: string): string {
    return `${getDbPrefix()}_${name}`;
}
