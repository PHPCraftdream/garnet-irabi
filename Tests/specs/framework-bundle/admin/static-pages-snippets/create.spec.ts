/**
 * Создание сниппетов шапки и подвала через интерфейс.
 *
 * Часть разобранного static-pages-snippets.spec.ts (был один файл на
 * 913 строк).
 */

import { test, expect, tn } from '../../../../helpers/scoped-test';
import { DB } from '../../../../helpers/db/db';
import mysql from 'mysql2/promise';
import {
    TS,
    openStaticPages,
    switchToSnippetsTab,
    createSnippetViaUI,
    openSnippetEditor,
} from './helpers';

test.describe.configure({ mode: 'serial' });

test.describe('Admin -- Create header/footer snippets', () => {
	test.describe.configure({ mode: 'serial' });

	const HDR_SLUG = `e2e-hdr-create-${TS}`;
	const FTR_SLUG = `e2e-ftr-create-${TS}`;

	test.afterAll(async () => {
		const conn = await mysql.createConnection(DB);
		try {
			await conn.execute(`DELETE FROM ${tn('static_snippets')} WHERE slug IN (?, ?)`, [HDR_SLUG, FTR_SLUG]);
		} finally {
			await conn.end();
		}
	});

	test('create header-type snippet: opens editor, type stored correctly', async ({ page }) => {
		await openStaticPages(page);
		await switchToSnippetsTab(page);
		await createSnippetViaUI(page, HDR_SLUG, 'E2E Header', 'header');

		// Editor tab should open
		const editorSection = page.locator('section.section-soft');
		await expect(editorSection).toBeVisible({ timeout: 8000 });
		const editorText = await editorSection.textContent();
		expect(editorText).toContain(HDR_SLUG);

		// Verify type in DB
		const conn = await mysql.createConnection(DB);
		try {
			const [rows] = await conn.execute<any[]>(
				`SELECT snippet_type FROM ${tn('static_snippets')} WHERE slug = ?`, [HDR_SLUG]
			);
			expect(rows.length).toBe(1);
			expect(rows[0].snippet_type).toBe('header');
		} finally {
			await conn.end();
		}
	});

	test('create footer-type snippet: opens editor, type stored correctly', async ({ page }) => {
		await openStaticPages(page);
		await switchToSnippetsTab(page);
		await createSnippetViaUI(page, FTR_SLUG, 'E2E Footer', 'footer');

		const editorSection = page.locator('section.section-soft');
		await expect(editorSection).toBeVisible({ timeout: 8000 });
		const editorText = await editorSection.textContent();
		expect(editorText).toContain(FTR_SLUG);

		const conn = await mysql.createConnection(DB);
		try {
			const [rows] = await conn.execute<any[]>(
				`SELECT snippet_type FROM ${tn('static_snippets')} WHERE slug = ?`, [FTR_SLUG]
			);
			expect(rows.length).toBe(1);
			expect(rows[0].snippet_type).toBe('footer');
		} finally {
			await conn.end();
		}
	});

	test('header snippet type shows correctly in snippet type select', async ({ page }) => {
		const editorSection = await openSnippetEditor(page, HDR_SLUG);

		// Find the type select within the editor
		const selects = editorSection.locator('select.form-control');
		const count = await selects.count();
		let foundHeader = false;
		for (let i = 0; i < count; i++) {
			const val = await selects.nth(i).inputValue();
			if (val === 'header') {
				foundHeader = true;
				break;
			}
		}
		expect(foundHeader).toBe(true);
	});

	test('footer snippet type shows correctly in snippet type select', async ({ page }) => {
		const editorSection = await openSnippetEditor(page, FTR_SLUG);

		const selects = editorSection.locator('select.form-control');
		const count = await selects.count();
		let foundFooter = false;
		for (let i = 0; i < count; i++) {
			const val = await selects.nth(i).inputValue();
			if (val === 'footer') {
				foundFooter = true;
				break;
			}
		}
		expect(foundFooter).toBe(true);
	});

	test('snippet filter buttons include header and footer types', async ({ page }) => {
		await openStaticPages(page);
		await switchToSnippetsTab(page);

		// Filter buttons: "All", "header", "footer", "variable", "block"
		const filterButtons = page.locator('[data-test-id="admin-static-pages"] button.status-muted, [data-test-id="admin-static-pages"] button.status-active');
		const count = await filterButtons.count();
		expect(count).toBeGreaterThanOrEqual(5);

		// Click "header" filter -- text may be in Russian or English
		const allText = await page.locator('[data-test-id="admin-static-pages"]').textContent();
		const hasHeaderFilter = allText?.includes('Header') || allText?.includes('Шапка');
		const hasFooterFilter = allText?.includes('Footer') || allText?.includes('Подвал');
		expect(hasHeaderFilter).toBe(true);
		expect(hasFooterFilter).toBe(true);
	});

	test('delete header and footer snippets with confirmation', async ({ page }) => {
		await openStaticPages(page);
		await switchToSnippetsTab(page);

		for (const slug of [HDR_SLUG, FTR_SLUG]) {
			const row = page.locator(`tr:has(td:has-text("${slug}"))`);
			if (await row.isVisible({ timeout: 3000 }).catch(() => false)) {
				await row.locator('button.text-danger').first().click();
				await expect(page.locator('[data-test-id="modal-confirm-btn"]')).toBeVisible({ timeout: 5000 });
				await page.locator('[data-test-id="modal-confirm-btn"]').click();
				await expect(row).not.toBeVisible({ timeout: 5000 });
			}
		}
	});
});
