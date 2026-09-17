/**
 * Общее для проверок статических страниц: имена тестовых сущностей и
 * навигация по экрану.
 *
 * Имена содержат номер воркера: файлы делят одну боевую базу, и
 * одинаковый slug у двух воркеров означал бы драку за одну запись.
 */

import { test, expect, tn } from '../../../../helpers/scoped-test';
import { withConnection, DB } from '../../../../helpers/db';
import mysql from 'mysql2/promise';

export const WORKER_TAG = process.env.TEST_PARALLEL_INDEX ?? '0';
export const TEST_SLUG = `e2e-test-page-w${WORKER_TAG}`;
export const TEST_TITLE = 'E2E Test Page';
export const TEST_SNIPPET_SLUG = `e2e-test-snippet-w${WORKER_TAG}`;
export const TEST_SNIPPET_NAME = 'E2E Test Snippet';

// Helper: navigate to admin static pages, wait for island to render
export async function openStaticPages(page: any) {
	await page.goto('/admin/pages/', { waitUntil: 'domcontentloaded' });
	// Wait for the React island to hydrate; the inner row-wait was a
	// blanket `.first().waitFor()` with a 15s budget that catch-swallowed
	// the timeout on empty tables — burning the full budget for every
	// caller that didn't care about rows. Each caller now decides:
	// tests that read a specific slug use `waitForPageRow(slug)` (which
	// has its own poll), tests that just check the toolbar / tabs don't
	// pay for row-fetch settling at all.
	//
	// Under full-suite 6-worker load this island's hydration can queue
	// behind other workers' php-cgi requests — 20s wasn't always enough
	// margin even though the file passes reliably standalone.
	await expect(page.locator('[data-test-id="admin-static-pages"]')).toBeVisible({ timeout: 30000 });
}

// Helper: open pages list and wait for a specific row to appear in the table
export async function waitForPageRow(page: any, slug: string) {
	const row = page.locator(`tr:has(td:has-text("${slug}"))`);
	await expect(row).toBeVisible({ timeout: 10000 });
	return row;
}

// Helper: open page editor tab from pages list
export async function openPageEditor(page: any, slug: string) {
	await openStaticPages(page);
	const row = await waitForPageRow(page, slug);
	await row.locator('button.text-accent').first().click();
	const editorSection = page.locator('section.section-soft');
	await expect(editorSection).toBeVisible({ timeout: 8000 });
	return editorSection;
}

// ── Cleanup: remove any leftover test pages/snippets ─────────────────────────

test.afterAll(async () => {
	const conn = await mysql.createConnection(DB);
	try {
		const [pages] = await conn.execute<any[]>(
			`SELECT id FROM ${tn('static_pages')} WHERE slug LIKE 'e2e-test-page-%'`
		);
		for (const p of pages) {
			await conn.execute(`DELETE FROM ${tn('static_page_blocks')} WHERE page_id = ?`, [p.id]);
		}
		await conn.execute(`DELETE FROM ${tn('static_pages')} WHERE slug LIKE 'e2e-test-page-%'`);
		await conn.execute(`DELETE FROM ${tn('static_snippets')} WHERE slug LIKE 'e2e-test-snippet-%'`);
	} finally {
		await conn.end();
	}
});

// ── Page CRUD chain (create → public rendering → markdown → delete) ──────────
// These four describes share TEST_SLUG state and must run on the same worker
// in file order. Wrapped in a serial group so the file-level parallel only
// forks this group and Snippets onto separate workers.
