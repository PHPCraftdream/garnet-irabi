/**
 * Prod DB bridge — routes the suite's direct MySQL access over SSH.
 *
 * On a shared host the prod MySQL isn't reachable from the local machine, so
 * specs can't `mysql.createConnection(DB)` against it. Instead we run their
 * SQL on the server via `php garnet sql --json` (executed through the local
 * `php garnet ssh`, which reads ssh.ini). The SQL already targets
 * `test_worker_0_*` tables (spec code interpolates `tn()`), so it only ever
 * touches the isolated scope `test:provision` built — never live data.
 *
 * `installProdDbBridge()` monkey-patches `mysql2/promise.createConnection` so
 * EVERY spec and helper that opens a connection transparently gets a bridge
 * connection instead — no per-spec edits, the whole suite is reused as-is.
 * It's wired from `helpers/scoped-test.ts` (imported by every spec) so it
 * runs once per worker process.
 *
 * ⚠️ Known limitations (documented, not silently broken):
 *   - One SSH round-trip per query → slow. Pair with PW_WORKERS=1 and a
 *     curated spec subset; not meant for the full 600-spec sweep at speed.
 *     (A future optimisation: an ssh ControlMaster persistent socket.)
 *   - No transactions across calls (each query is a fresh server process,
 *     so a BEGIN/COMMIT pair won't span statements). insertId IS returned
 *     (garnet sql reads it from the same connection as the INSERT).
 *
 * Only active when `PW_PROD=1`; otherwise this module is inert and specs use
 * a real local `mysql.createConnection`.
 */
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const mysqlBase = require('mysql2');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const mysqlPromise = require('mysql2/promise');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

export function isProd(): boolean {
    return process.env.PW_PROD === '1';
}

/**
 * Absolute remote dir where the deployed `garnet` lives:
 * `<remote_path>/<runtime_dir>` from deploy.ini. The bridge must `cd` here
 * before invoking `php garnet sql` — `--cd-remote` would land in remote_path
 * (the docroot parent), which has no `garnet` binary. Env overrides win for
 * non-standard layouts.
 */
const DEPLOY_INI_CANDIDATES = [
    path.resolve(REPO_ROOT, 'Apps', 'IRabi', 'WorkDir', 'ConfigDev', 'deploy.ini'),
    path.resolve(REPO_ROOT, 'Apps', 'IRabi', 'WorkDir', 'Config', 'deploy.ini'),
];
function readDeployIni(): Record<string, string> {
    for (const file of DEPLOY_INI_CANDIDATES) {
        if (!fs.existsSync(file)) continue;
        const out: Record<string, string> = {};
        for (const raw of fs.readFileSync(file, 'utf-8').split(/\r?\n/)) {
            const line = raw.trim();
            if (!line || line.startsWith(';') || line.startsWith('#') || line.startsWith('[')) continue;
            const eq = line.indexOf('=');
            if (eq < 0) continue;
            let val = line.slice(eq + 1).trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                val = val.slice(1, -1);
            }
            out[line.slice(0, eq).trim()] = val;
        }
        return out;
    }
    return {};
}

let cachedRemoteDir: string | null = null;
function remoteRuntimeDir(): string {
    if (cachedRemoteDir !== null) return cachedRemoteDir;
    const ini = readDeployIni();
    const remotePath = (process.env.PW_PROD_REMOTE_PATH ?? ini.remote_path ?? '').replace(/\/+$/, '');
    const runtimeDir = (process.env.PW_PROD_RUNTIME_DIR ?? ini.runtime_dir ?? '').replace(/^\/+|\/+$/g, '');
    if (!remotePath || !runtimeDir) {
        throw new Error('[ssh-bridge] deploy.ini must define remote_path and runtime_dir (or set PW_PROD_REMOTE_PATH / PW_PROD_RUNTIME_DIR)');
    }
    cachedRemoteDir = `${remotePath}/${runtimeDir}`;
    return cachedRemoteDir;
}

/**
 * Run one SQL statement on the remote box and return its JSON result.
 * The statement is base64-wrapped so neither the local nor the remote shell
 * has to quote arbitrary SQL — only `[A-Za-z0-9+/=]` crosses the wire.
 */
export function runRemoteSql(sql: string): { rows?: any[]; affected?: number } {
    const b64 = Buffer.from(sql, 'utf8').toString('base64');
    // Remote: decode the SQL and pipe it into `garnet sql --json` (which reads
    // its statement from stdin when none is given as an arg). `--cd-remote`
    // runs this inside remote_path, where the deployed `garnet` lives.
    const remoteCmd = `echo ${b64} | base64 -d | php garnet sql --json`;

    let out: string;
    try {
        out = execFileSync(
            'php',
            ['garnet', 'ssh', remoteCmd, `--cwd=${remoteRuntimeDir()}`, '--no-tty'],
            { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
        );
    } catch (e: any) {
        const stderr = e?.stderr ? `\n${e.stderr}` : '';
        throw new Error(`[ssh-bridge] remote SQL failed: ${e?.message ?? e}${stderr}\n  SQL: ${sql.slice(0, 200)}`);
    }

    // The remote prints exactly one JSON line; tolerate banner noise by
    // scanning for the last line that parses as JSON.
    const lines = out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
        try {
            const parsed = JSON.parse(lines[i]);
            if (parsed && typeof parsed === 'object') {
                if ('error' in parsed) {
                    throw new Error(`[ssh-bridge] remote MySQL error: ${parsed.error}\n  SQL: ${sql.slice(0, 200)}`);
                }
                return parsed;
            }
        } catch (err) {
            if (err instanceof Error && err.message.startsWith('[ssh-bridge]')) throw err;
            // not JSON — keep scanning upward
        }
    }
    throw new Error(`[ssh-bridge] no JSON in remote output:\n${out.slice(0, 500)}`);
}

/**
 * A drop-in replacement for a mysql2/promise Connection that routes every
 * query through `runRemoteSql`. Implements the slice of the API the suite
 * actually uses: execute / query / end (+ no-op transaction stubs).
 */
function makeBridgeConnection() {
    const exec = (sql: string, values?: any[]): [any, any] => {
        const finalSql = values && values.length
            ? mysqlBase.format(sql, values)
            : sql;
        const res = runRemoteSql(finalSql);
        if (Array.isArray(res.rows)) {
            // SELECT → [rows, fields]
            return [res.rows, undefined];
        }
        // DML → [ResultSetHeader-ish, undefined]. `garnet sql --json` returns
        // the INSERT auto-increment id from the same connection, so insertId
        // is real (0 for UPDATE/DELETE).
        return [{ affectedRows: res.affected ?? 0, insertId: (res as any).insertId ?? 0 }, undefined];
    };

    return {
        execute: async (sql: string, values?: any[]) => exec(sql, values),
        query: async (sql: string, values?: any[]) => exec(sql, values),
        end: async () => {},
        destroy: () => {},
        beginTransaction: async () => {},
        commit: async () => {},
        rollback: async () => {},
    };
}

let installed = false;

/**
 * Patch `mysql2/promise.createConnection` so the whole suite's DB access goes
 * over the SSH bridge. Idempotent; a no-op outside prod mode.
 */
export function installProdDbBridge(): void {
    if (installed || !isProd()) return;
    installed = true;
    const bridgeFactory = async () => makeBridgeConnection();

    // There can be MORE THAN ONE mysql2 install in the tree: the repo-root
    // node_modules/ (which specs under Apps/IRabi/Tests resolve) and
    // tests/node_modules/ (which helpers resolve). Each is a distinct module
    // instance, so patching only one leaves the other's `createConnection`
    // pointing at a REAL local connection — a spec's direct
    // `mysql.createConnection(DB)` would then silently hit the local DB while
    // helper calls go over the bridge. Patch every copy we can resolve.
    const targets = [
        'mysql2/promise',
        path.resolve(REPO_ROOT, 'node_modules', 'mysql2', 'promise.js'),
        path.resolve(REPO_ROOT, 'tests', 'node_modules', 'mysql2', 'promise.js'),
    ];
    const seen = new Set<unknown>();
    let patched = 0;
    for (const t of targets) {
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const mod = require(t);
            if (seen.has(mod)) continue;
            seen.add(mod);
            mod.createConnection = bridgeFactory;
            if (mod.default && typeof mod.default === 'object') {
                mod.default.createConnection = bridgeFactory;
            }
            patched++;
        } catch { /* not installed at this path — fine */ }
    }
    console.log(`[ssh-bridge] prod DB bridge installed — patched ${patched} mysql2 instance(s)`);
}
