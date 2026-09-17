/**
 * Per-worker scoped test fixture.
 *
 * Every spec that talks to the DB-backed application MUST import `test`
 * from this file — NOT from `@playwright/test` directly. Doing so:
 *
 *   1. Guarantees the worker prefix is available as a fixture
 *      (`workerPrefix`) so direct DB queries target the right tables.
 *   2. Wires the `X-Test-Worker` header into every HTTP request the
 *      browser issues, so the server-side WorkerScopeMiddleware swaps
 *      the table prefix to `test_worker_N_*` for that request.
 *
 * The fixture is per-worker (not per-test), so the prefix is stable
 * across all tests inside one worker process.
 *
 * Usage (CMS spec):
 * ```ts
 * import { test, expect } from '../../helpers/scoped-test';
 * import mysql from 'mysql2/promise';
 *
 * test('booking lands in DB', async ({ page, workerPrefix }) => {
 *   await page.goto('/admin/');
 *   await page.click('[data-test-id="book"]');
 *
 *   // Direct DB assert — must use the per-worker prefix:
 *   const conn = await mysql.createConnection(DB);
 *   const [rows] = await conn.execute(
 *     `SELECT * FROM ${workerPrefix}_ir_bookings WHERE user_id = ?`,
 *     [userId]
 *   );
 * });
 * ```
 *
 * The HTTP path is automatic via `extraHTTPHeaders` in
 * `playwright.config.ts` — no per-test wiring needed.
 */

// Файл остался фасадом: его путь знают все спеки до единого
// (`import { test, expect, tn } from '.../helpers/scoped-test'`), и
// менять четыре сотни импортов ради раскладки по файлам — не та цена.
// Части лежат рядом, в каталоге scoped-test/.

import { installProdDbBridge } from './ssh-bridge';

// Прод-режим: направить прямые запросы к базе через SSH. Делается один
// раз на процесс воркера — этот модуль импортирует каждый спек.
installProdDbBridge();

export { scopeHeaders } from './scoped-test/scope-headers';
export { CTX_STATS_DIR } from './scoped-test/telemetry';
export { getDbPrefix, tn } from './scoped-test/db-prefix';
export { newScopedContext, newScopedPage } from './scoped-test/contexts';
export { resetContextToStorageState } from './scoped-test/storage-state';
export { test, expect } from './scoped-test/base-test';
