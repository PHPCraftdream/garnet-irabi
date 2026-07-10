import * as fs from 'node:fs';
import * as path from 'node:path';
import mysql from 'mysql2/promise';
import { clearTestData } from './helpers/auth';
import { ADMIN_LOGIN, EXPERT_LOGIN, USER_LOGIN, MODERATOR_LOGIN, OWNER_LOGIN } from './helpers/logins';
import { isolationTeardown } from './helpers/isolation-setup';
import { CTX_STATS_DIR } from './helpers/scoped-test';
import { DB as DB_CONFIG } from './helpers/db';
import { collectServerErrors, formatServerErrors } from './helpers/server-error-logs';

/**
 * Read every worker's `.ctx-stats/worker-*.jsonl` file and print a
 * single aggregate table to stdout. Each BrowserContext creation
 * costs ~150-250ms; the count is the most actionable number for
 * "where are we still overpaying on setup overhead".
 *
 * No-op when telemetry was disabled or the dir doesn't exist.
 */
function printCtxTelemetry(): void {
	let files: string[] = [];
	try { files = fs.readdirSync(CTX_STATS_DIR).filter((f) => f.endsWith('.jsonl')); } catch { return; }
	if (!files.length) return;

	type Ev = { kind: string; project: string | null; ts: number };
	const events: Array<Ev & { worker: number }> = [];
	for (const f of files) {
		const m = f.match(/^worker-(\d+)\.jsonl$/);
		const worker = m ? Number(m[1]) : 0;
		const lines = fs.readFileSync(path.join(CTX_STATS_DIR, f), 'utf-8').split('\n').filter(Boolean);
		for (const l of lines) {
			try { events.push({ ...JSON.parse(l), worker }); } catch {}
		}
	}
	if (!events.length) return;

	const byKind: Record<string, number> = {};
	const byProject: Record<string, number> = {};
	const byWorker: Record<number, number> = {};
	for (const e of events) {
		byKind[e.kind] = (byKind[e.kind] ?? 0) + 1;
		if (e.project) byProject[e.project] = (byProject[e.project] ?? 0) + 1;
		byWorker[e.worker] = (byWorker[e.worker] ?? 0) + 1;
	}

	const total = events.length;
	const PER_CTX_MS = 200;
	const totalMs = total * PER_CTX_MS;

	console.log('');
	console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
	console.log(`BrowserContext telemetry  —  ${total} contexts created (~${(totalMs / 1000).toFixed(1)}s worker-time at ~${PER_CTX_MS}ms each)`);
	console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
	console.log('  by kind:');
	for (const [k, v] of Object.entries(byKind).sort((a, b) => b[1] - a[1])) {
		console.log(`    ${k.padEnd(20)} ${String(v).padStart(4)}`);
	}
	console.log('  by project (only _sharedContext records project):');
	for (const [p, v] of Object.entries(byProject).sort((a, b) => b[1] - a[1])) {
		console.log(`    ${p.padEnd(36)} ${String(v).padStart(4)}`);
	}
	console.log('  by worker:');
	for (const [w, v] of Object.entries(byWorker).sort((a, b) => Number(a[0]) - Number(b[0]))) {
		console.log(`    worker ${w.padEnd(2)}                        ${String(v).padStart(4)}`);
	}
	console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

/**
 * Server-side guard: scan every worker prefix's *_js_errors table
 * (FwJsErrors base, ir_js_errors in this app) for rows that landed
 * during the run. JsErrorReporter on the client batches errors and
 * POSTs them to /fw-js-error-log, where they hit the worker-scoped
 * prefix via WorkerScopeMiddleware. Anything here at teardown means a
 * real frontend error escaped the per-test console gate (or fired
 * after the page closed and the gate stopped watching). Same posture:
 * fail the run.
 *
 * Match `%_js_errors` so renaming the concrete table in app code
 * doesn't require touching this guard.
 */
async function checkServerJsErrors(): Promise<void> {
	const conn = await mysql.createConnection(DB_CONFIG);
	try {
		const [tableRows] = await conn.execute<any[]>(
			`SELECT TABLE_NAME FROM information_schema.tables
			 WHERE TABLE_SCHEMA = ? AND TABLE_NAME LIKE 'test_worker_%_js_errors'`,
			[DB_CONFIG.database]
		);
		if (!tableRows.length) return;

		const offenders: Array<{ table: string; row: any }> = [];
		for (const t of tableRows) {
			const table = t.TABLE_NAME as string;
			const [rows] = await conn.execute<any[]>(
				`SELECT id, message, file, line, col, url, count, last_seen_at FROM \`${table}\``
			);
			for (const r of rows) offenders.push({ table, row: r });
		}

		if (offenders.length > 0) {
			const lines = offenders.map((o, i) =>
				`  ${i + 1}. [${o.table}] ${o.row.message} ` +
				`(× ${o.row.count}) at ${o.row.file ?? '<unknown>'}:${o.row.line}:${o.row.col} ` +
				`url=${o.row.url ?? '<unknown>'}`
			).join('\n');
			console.error(
				'\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
				`Server-side fw_js_errors recorded ${offenders.length} unique error(s) during the run:\n` +
				lines +
				'\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'
			);
			// Make the run fail non-zero — teardown errors do propagate.
			process.exitCode = 1;
		}
	} finally {
		await conn.end();
	}
}

/**
 * Server-side guard: scan disk-based PHP error logs (LogJournal/Errors/*,
 * public/IRabi/errors.log, Framework/errors.log). global-setup wiped
 * them at the start of the run; anything here is a real PHP error or
 * exception raised during the suite — fail the run with a summary.
 */
function checkServerPhpErrors(): void {
	const errors = collectServerErrors();
	if (errors.length === 0) return;
	console.error(
		'\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
		`Server-side PHP error logs captured ${errors.length} entrie(s) during the run:\n\n` +
		formatServerErrors(errors) +
		'\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'
	);
	process.exitCode = 1;
}

export default async function globalTeardown() {
	printCtxTelemetry();

	if (process.env.PW_WORKER_ISOLATION !== '0') {
		// Check BEFORE dropping the worker tables.
		await checkServerJsErrors();
		checkServerPhpErrors();
		await isolationTeardown();
		return;
	}

	await clearTestData(ADMIN_LOGIN);
	await clearTestData(EXPERT_LOGIN);
	await clearTestData(USER_LOGIN);
	await clearTestData(MODERATOR_LOGIN);
	await clearTestData(OWNER_LOGIN);
	console.log('Setup users cleaned up');
}
