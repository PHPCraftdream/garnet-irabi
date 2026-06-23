import { FullConfig } from '@playwright/test';
import mysql from 'mysql2/promise';
import * as fs from 'node:fs';
import { clearTestData } from './helpers/auth';
import { ADMIN_LOGIN, EXPERT_LOGIN, USER_LOGIN, MODERATOR_LOGIN, OWNER_LOGIN } from './helpers/logins';
import { isolationSetup } from './helpers/isolation-setup';
import { CTX_STATS_DIR } from './helpers/scoped-test';
import { DB as DB_CONFIG } from './helpers/db';
import { clearServerErrorLogs } from './helpers/server-error-logs';

const BASE_URL = process.env.BASE_URL || 'http://localhost:8001';

/**
 * Pre-flight: fail fast with a useful hint if the dev stack isn't up.
 *
 * Without this the suite drops into isolationSetup, blasts through
 * `DROP TABLE test_worker_*`, then dies on the first HTTP call to
 * /dev-login with a fetch error that doesn't tell anyone what's
 * actually missing. Far better to spend 200ms confirming nginx +
 * php-cgi + mysql are reachable before touching state.
 */
async function preflight(): Promise<void> {
	const errors: string[] = [];

	// 1. HTTP: nginx + at least one php-cgi worker.
	try {
		const controller = new AbortController();
		const t = setTimeout(() => controller.abort(), 5000);
		const resp = await fetch(`${BASE_URL}/`, { signal: controller.signal });
		clearTimeout(t);
		if (resp.status >= 500) {
			errors.push(`HTTP ${BASE_URL}/ → ${resp.status} (nginx up, php-cgi pool likely down — run \`php garnet serve --workers=N\`)`);
		}
	} catch (e: any) {
		errors.push(`HTTP ${BASE_URL}/ unreachable: ${e?.message ?? e} (start dev stack via \`php garnet serve --workers=N\` + nginx)`);
	}

	// 2. MySQL: same connection params Playwright will use.
	try {
		const conn = await mysql.createConnection(DB_CONFIG);
		try {
			await conn.execute('SELECT 1');
		} finally {
			await conn.end();
		}
	} catch (e: any) {
		errors.push(`MySQL ${DB_CONFIG.host}:${DB_CONFIG.port}/${DB_CONFIG.database} unreachable: ${e?.message ?? e}`);
	}

	if (errors.length > 0) {
		const banner = '\n[preflight] dev stack is not ready — aborting before any DB writes:\n  - ' + errors.join('\n  - ') + '\n';
		throw new Error(banner);
	}
}

/**
 * Post-setup sanity check: every worker scope must have its `accounts`
 * table. Catches mismatches between `config.workers` and what
 * isolationSetup actually provisioned (silent off-by-one we already
 * hit once). Cheap: a single information_schema query.
 */
async function verifyWorkerTables(workers: number | undefined): Promise<void> {
	const n = typeof workers === 'number' && workers > 0 ? workers : 1;
	const conn = await mysql.createConnection(DB_CONFIG);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT TABLE_NAME FROM information_schema.tables
			 WHERE TABLE_SCHEMA = ? AND TABLE_NAME LIKE 'test_worker_%_accounts'`,
			[DB_CONFIG.database]
		);
		const have = new Set(rows.map((r) => r.TABLE_NAME as string));
		const missing: string[] = [];
		for (let i = 0; i < n; i++) {
			const t = `test_worker_${i}_accounts`;
			if (!have.has(t)) missing.push(t);
		}
		if (missing.length > 0) {
			throw new Error(
				`[preflight] isolationSetup reported success, but per-worker tables are missing: ${missing.join(', ')}. ` +
				`Check globalSetup logs for cloneTemplateTo failures.`
			);
		}
	} finally {
		await conn.end();
	}
}

export default async function globalSetup(config: FullConfig) {
	await preflight();

	// Wipe server-side PHP error logs so the post-run guard starts
	// from a clean slate. Anything that lands during the suite is a
	// real regression to investigate.
	clearServerErrorLogs();

	// Reset browser-context telemetry from previous runs. Each worker
	// appends to its own JSONL file during the run; global-teardown
	// reads all of them at the end and prints the aggregate table.
	try { fs.rmSync(CTX_STATS_DIR, { recursive: true, force: true }); } catch {}

	if (process.env.PW_WORKER_ISOLATION !== '0') {
		// Per-worker DB-prefix isolation (default ON): skip the legacy
		// clearTestData path (which targets `db_*` tables) and run the
		// template/clone pipeline that builds `test_worker_${i}_*`
		// tables for every worker.
		//
		// Pass the actual worker count from the resolved Playwright
		// config — `process.env.PW_WORKERS` is unset when the user
		// just runs `npm test` (the default lives in the config), so
		// reading the env var directly would give us 1 and provision
		// only worker 0's tables, leaving workers 1..N hitting "table
		// doesn't exist".
		await isolationSetup(config.workers);
		await verifyWorkerTables(config.workers);
		return;
	}

	// Legacy path — opt-out via PW_WORKER_ISOLATION=0. All workers
	// share the live `db_*` tables; only safe with PW_WORKERS=1.
	await clearTestData();
	await clearTestData(ADMIN_LOGIN);
	await clearTestData(EXPERT_LOGIN);
	await clearTestData(USER_LOGIN);
	await clearTestData(MODERATOR_LOGIN);
	await clearTestData(OWNER_LOGIN);
}
