/**
 * End-to-end pipeline test: an uncaught client-side error must reach
 * the backend (POST /js-error/~report) and surface in the admin grid
 * at /admin/logs/?tab=js-errors.
 *
 * Approach: trigger the throw inside `setTimeout` so it escapes
 * Playwright's evaluate() error trap and is delivered as a real
 * uncaught error — exactly what JsErrorReporter listens for via
 * window.addEventListener('error'). The throw message carries an
 * e2e-jserror-marker prefix, which the console guard allowlist
 * already recognises, so the throw does NOT fail this test.
 *
 * After verifying the row in DB + grid the test deletes its own row
 * so the server-side teardown guard (checkServerJsErrors) stays
 * green for the rest of the suite.
 */
import { test, expect, tn } from '../../../helpers/scoped-test';
import mysql from 'mysql2/promise';
import { DB } from '../../../helpers/db';

const MARKER = `e2e-jserror-marker-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

test.describe.configure({ mode: 'serial' });

test.describe('JS error pipeline — frontend throw → backend log → admin grid', () => {
	test('uncaught client error reaches DB and admin grid, then cleans up', async ({ page }) => {
		await page.goto('/system/');

		// Async throw — escapes evaluate()'s try/catch, delivered to
		// window.addEventListener('error'), which JsErrorReporter
		// uses to POST /js-error/~report.
		await page.evaluate((marker) => {
			setTimeout(() => { throw new Error(marker); }, 0);
		}, MARKER);

		// JsErrorReporter throttles same fingerprint for 1s and fires
		// fetch asynchronously; poll the DB instead of guessing.
		const conn = await mysql.createConnection(DB);
		try {
			let row: { id: number; message: string } | null = null;
			for (let i = 0; i < 30; i++) {
				const [rows] = await conn.execute<any[]>(
					`SELECT id, message FROM ${tn('js_errors')} WHERE message LIKE ?`,
					[`%${MARKER}%`]
				);
				if (rows.length > 0) { row = rows[0]; break; }
				await new Promise((r) => setTimeout(r, 200));
			}
			expect(row, `expected one ir_js_errors row carrying "${MARKER}"`).not.toBeNull();

			// Now check that the admin grid surfaces it. Open the logs
			// viewer first (no query string — that path is well-trodden
			// by other admin specs), then click into the js-errors tab.
			await page.goto('/admin/logs/');
			await page.waitForSelector('[data-test-id="admin-logs-viewer"]', { timeout: 15000 });
			await page.locator('[data-test-id="tabnav-btn-js-errors"]').click();
			await expect(page.locator('[data-test-id="tabnav-btn-js-errors"]')).toHaveAttribute('aria-selected', 'true', { timeout: 5000 });
			await expect(page.locator(`[data-test-id="js-errors-row-${row!.id}"]`)).toBeVisible({ timeout: 10000 });

			// Clean up — leaving the row in place would fail the
			// server-side guard in global-teardown.
			await conn.execute(`DELETE FROM ${tn('js_errors')} WHERE id = ?`, [row!.id]);
		} finally {
			await conn.end();
		}
	});
});
