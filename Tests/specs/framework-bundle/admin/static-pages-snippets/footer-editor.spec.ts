/**
 * Структурный редактор подвала.
 *
 * Часть разобранного static-pages-snippets.spec.ts (был один файл на
 * 913 строк).
 */

import { test, expect, tn } from '../../../../helpers/scoped-test';
import { DB } from '../../../../helpers/db/db';
import mysql from 'mysql2/promise';
import {
    TS,
    openSnippetEditor,
} from './helpers';

test.describe.configure({ mode: 'serial' });

test.describe('Admin -- Structured footer editor', () => {
	test.describe.configure({ mode: 'serial' });

	const FTR_SLUG = `e2e-ftr-editor-${TS}`;
	let snippetId = 0;

	test.beforeAll(async () => {
		const conn = await mysql.createConnection(DB);
		try {
			const now = Math.floor(Date.now() / 1000);
			const [result] = await conn.execute<any>(
				`INSERT INTO ${tn('static_snippets')} (slug, name, snippet_type, content, is_active, sort_order, updated_at, created_at) VALUES (?, 'E2E Ftr Editor', 'footer', '', 1, 0, ?, ?)`,
				[FTR_SLUG, now, now]
			);
			snippetId = result.insertId;
		} finally {
			await conn.end();
		}
	});

	test.afterAll(async () => {
		const conn = await mysql.createConnection(DB);
		try {
			await conn.execute(`DELETE FROM ${tn('static_snippets')} WHERE slug = ?`, [FTR_SLUG]);
		} finally {
			await conn.end();
		}
	});

	test('footer editor shows columns section with "Add column" button', async ({ page }) => {
		const editorSection = await openSnippetEditor(page, FTR_SLUG);

		const columnsSection = editorSection.locator('[data-test-id="footer-columns-section"]');
		await expect(columnsSection).toBeVisible({ timeout: 5000 });

		const addBtn = editorSection.locator('[data-test-id="footer-add-column"]');
		await expect(addBtn).toBeVisible({ timeout: 3000 });
	});

	test('add column with title and link items', async ({ page }) => {
		const editorSection = await openSnippetEditor(page, FTR_SLUG);

		await editorSection.locator('[data-test-id="footer-add-column"]').click();

		const columns = editorSection.locator('[data-test-id="footer-column"]');
		await expect(columns.first()).toBeVisible({ timeout: 3000 });

		// Fill column title
		const titleInput = columns.first().locator('input').first();
		await titleInput.fill('Quick Links');

		// Add an item
		const addItemBtn = columns.first().locator('[data-test-id="footer-col-add-item"]');
		await addItemBtn.click();

		const itemRow = columns.first().locator('[data-test-id="footer-col-item"]').first();
		await itemRow.locator('input').first().fill('About Us');
		await itemRow.locator('input').nth(1).fill('/about');

		// Save and wait for the save POST to land before reading DB.
		await Promise.all([
			page.waitForResponse(r => r.request().method() === 'POST' && r.url().includes('~snippetUpdate') && r.status() < 500, { timeout: 10000 }),
			editorSection.locator('button.btn-primary.btn-lg').click(),
		]);

		// Verify JSON
		const conn = await mysql.createConnection(DB);
		try {
			const [rows] = await conn.execute<any[]>(
				`SELECT content FROM ${tn('static_snippets')} WHERE slug = ?`, [FTR_SLUG]
			);
			const parsed = JSON.parse(rows[0].content);
			expect(parsed.columns).toBeDefined();
			expect(parsed.columns.length).toBeGreaterThanOrEqual(1);
			expect(parsed.columns[0].title).toBe('Quick Links');
			expect(parsed.columns[0].items.length).toBeGreaterThanOrEqual(1);
			expect(parsed.columns[0].items[0].label).toBe('About Us');
			expect(parsed.columns[0].items[0].url).toBe('/about');
		} finally {
			await conn.end();
		}
	});

	test('copyright input is present', async ({ page }) => {
		const editorSection = await openSnippetEditor(page, FTR_SLUG);

		const copyrightInput = editorSection.locator('[data-test-id="footer-copyright"]');
		await expect(copyrightInput).toBeVisible({ timeout: 5000 });
	});

	test('save with copyright produces valid JSON', async ({ page }) => {
		const editorSection = await openSnippetEditor(page, FTR_SLUG);

		const copyrightInput = editorSection.locator('[data-test-id="footer-copyright"]');
		if (await copyrightInput.isVisible()) {
			await copyrightInput.fill('{year} E2E Corp');
		}

		await Promise.all([
			page.waitForResponse(r => r.request().method() === 'POST' && r.url().includes('~snippetUpdate') && r.status() < 500, { timeout: 10000 }),
			editorSection.locator('button.btn-primary.btn-lg').click(),
		]);

		const conn = await mysql.createConnection(DB);
		try {
			const [rows] = await conn.execute<any[]>(
				`SELECT content FROM ${tn('static_snippets')} WHERE slug = ?`, [FTR_SLUG]
			);
			const parsed = JSON.parse(rows[0].content);
			expect(parsed).toHaveProperty('columns');
			expect(parsed).toHaveProperty('copyright');
			expect(parsed.copyright).toContain('{year}');
		} finally {
			await conn.end();
		}
	});
});
