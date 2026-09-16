/**
 * Run a server command against the DB scope a test worker actually owns —
 * locally as `php run_cmd.php <args>` when PW_PROD is off, over SSH as
 * `php garnet <args>` on the deployed box when PW_PROD=1 (#396). A local
 * spawnSync against run_cmd.php on a remote run would drive the
 * ORCHESTRATOR machine's own checkout/DB, not the server the seeded data
 * lives on — meaningless at best, wrong-environment at worst.
 *
 * #397: on the deployed box `run_cmd.php` is NOT the real entrypoint for
 * this — the production crontab (`new_crontab.txt`) runs every task as
 * `cd <runtime_dir> && php garnet cron <task>`, never `run_cmd.php`
 * directly. `run_cmd.php`'s own bootstrap (`autoload.php`) expects
 * GARNET_FRAMEWORK_DIR to point at the sibling framework checkout — that
 * env var is normally supplied by `_shared_index.php`/the web/cron
 * wrappers, not present when SSH-invoking run_cmd.php bare. `garnet` (the
 * framework CLI binary, deployed in runtime_dir) delegates unrecognised
 * subcommands straight to the active app's own command registry — the
 * SAME registry run_cmd.php's IoRunConsole::run() dispatches into — so
 * `php garnet cron X` and `php run_cmd.php cron X` run identical code,
 * just via a bootstrap that already resolves the framework location.
 */
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import { isProd, remoteRuntimeDir } from './ssh-bridge';

const APP_ROOT = path.resolve(__dirname, '..', '..');

export interface ServerCommandResult {
    stdout: string;
    stderr: string;
    exitCode: number | null;
}

/**
 * @param args argv passed to the app's command dispatch (e.g. `['cron', 'email-queue']`)
 * @param prefix `DB_PREFIX_OVERRIDE` value; omit to run without one (a
 *   handful of callers intentionally don't scope by worker — preserved as-is)
 * @param timeoutMs forwarded to `spawnSync`'s `timeout`; defaults to 30s on
 *   the remote branch (a wedged SSH round-trip must not hang the run forever)
 */
export function runServerCommand(args: string[], prefix?: string, timeoutMs?: number): ServerCommandResult {
    if (!isProd()) {
        const res = spawnSync('php', ['run_cmd.php', ...args], {
            cwd: APP_ROOT,
            env: prefix === undefined ? process.env : { ...process.env, DB_PREFIX_OVERRIDE: prefix },
            encoding: 'utf8',
            ...(timeoutMs !== undefined ? { timeout: timeoutMs } : {}),
        });

        return { stdout: res.stdout ?? '', stderr: res.stderr ?? '', exitCode: res.status };
    }

    // Remote: `php garnet <args>` from the runtime dir — see module docblock
    // for why this, and not run_cmd.php, is the real entrypoint on prod.
    //
    // run_cmd.php/garnet only honour DB_PREFIX_OVERRIDE when
    // TestScope::isActive() — which on a CLI path requires GARNET_TEST_TOKEN
    // in the env, matching the on-disk .allow_tests secret. Without it the
    // override is silently ignored and the command runs against whatever
    // prefix is DEFAULT on a live box — exactly the isolation failure #394
    // exists to prevent. RUN_TEST_TOKEN is the same secret test:remote
    // minted and Playwright is already running under.
    const token = process.env.RUN_TEST_TOKEN ?? '';

    if (prefix !== undefined && !token) {
        throw new Error('[server-command] PW_PROD=1 but RUN_TEST_TOKEN is unset — refusing to run '
            + 'a server command without it (DB_PREFIX_OVERRIDE would silently be ignored server-side).');
    }
    const quote = (s: string): string => `'${s.replace(/'/g, "'\\''")}'`;
    const envPrefix = [
        prefix !== undefined ? `DB_PREFIX_OVERRIDE=${quote(prefix)}` : null,
        token ? `GARNET_TEST_TOKEN=${quote(token)}` : null,
    ].filter((v): v is string => v !== null).map((kv) => `${kv} `).join('');
    const remoteCmd = `${envPrefix}php garnet ${args.map(quote).join(' ')}`;

    // spawnSync, not execFileSync: a REFUSAL from the remote tool (e.g.
    // time-shift's participant guard) prints to stderr but exits 0 — an
    // intentional, handled outcome, not a process failure. execFileSync only
    // returns stdout on that happy path; stderr would just flow through to
    // this process's own stderr, unreachable to the caller. spawnSync
    // captures both regardless of exit code, matching the local branch.
    const res = spawnSync(
        'php',
        ['garnet', 'ssh', remoteCmd, `--cwd=${remoteRuntimeDir()}`, '--no-tty'],
        { cwd: APP_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: timeoutMs ?? 30000 },
    );

    return { stdout: res.stdout ?? '', stderr: res.stderr ?? '', exitCode: res.status };
}
