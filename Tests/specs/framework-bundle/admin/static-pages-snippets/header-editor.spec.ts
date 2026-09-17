/**
 * Структурный редактор шапки: пункты меню, логотип, порядок.
 *
 * Часть разобранного static-pages-snippets.spec.ts (был один файл на
 * 913 строк).
 */

import { test, expect, tn } from '../../../../helpers/scoped-test';
import { DB } from '../../../../helpers/db';
import mysql from 'mysql2/promise';
import type { Page } from '@playwright/test';
import {
    TS,
    openSnippetEditor,
} from './helpers';

test.describe.configure({ mode: 'serial' });

test.describe('Admin -- Structured header editor', () => {
	test.describe.configure({ mode: 'serial' });

	const HDR_SLUG = `e2e-hdr-editor-${TS}`;
	let snippetId = 0;

	test.beforeAll(async () => {
		const conn = await mysql.createConnection(DB);
		try {
			const now = Math.floor(Date.now() / 1000);
			// Seed with a logo URL so the alt/link/height inputs render — the editor
			// hides those fields behind the upload area until a logo is set.
			const seedContent = JSON.stringify({
				logo: { url: '/upload/seed-logo.png', alt: '', link: '/', height: 40 },
				items: [],
				layout: 'left',
				sticky: false,
			});
			const [result] = await conn.execute<any>(
				`INSERT INTO ${tn('static_snippets')} (slug, name, snippet_type, content, is_active, sort_order, updated_at, created_at) VALUES (?, 'E2E Hdr Editor', 'header', ?, 1, 0, ?, ?)`,
				[HDR_SLUG, seedContent, now, now]
			);
			snippetId = result.insertId;
		} finally {
			await conn.end();
		}
	});

	test.afterAll(async () => {
		const conn = await mysql.createConnection(DB);
		try {
			await conn.execute(`DELETE FROM ${tn('static_snippets')} WHERE slug = ?`, [HDR_SLUG]);
		} finally {
			await conn.end();
		}
	});

	test('header editor shows logo section', async ({ page }) => {
		const editorSection = await openSnippetEditor(page, HDR_SLUG);

		// The structured editor should show a logo section
		const logoSection = editorSection.locator('[data-test-id="header-logo-section"]');
		await expect(logoSection).toBeVisible({ timeout: 5000 });
	});

	test('logo section has alt, link, and height inputs', async ({ page }) => {
		const editorSection = await openSnippetEditor(page, HDR_SLUG);

		const logoSection = editorSection.locator('[data-test-id="header-logo-section"]');
		await Promise.all([
			expect(logoSection).toBeVisible({ timeout: 5000 }),

		// Alt input
			expect(logoSection.locator('[data-test-id="header-logo-alt"]')).toBeVisible({ timeout: 3000 }),
		// Link input
			expect(logoSection.locator('[data-test-id="header-logo-link"]')).toBeVisible({ timeout: 3000 }),
		// Height input
			expect(logoSection.locator('[data-test-id="header-logo-height"]')).toBeVisible({ timeout: 3000 }),
		]);
	});

	test('menu section has "Add item" button', async ({ page }) => {
		const editorSection = await openSnippetEditor(page, HDR_SLUG);

		const menuSection = editorSection.locator('[data-test-id="header-menu-section"]');
		await expect(menuSection).toBeVisible({ timeout: 5000 });

		const addBtn = editorSection.locator('[data-test-id="header-add-item"]');
		await expect(addBtn).toBeVisible({ timeout: 3000 });
	});

	test('add link-type menu item with label and URL', async ({ page }) => {
		const editorSection = await openSnippetEditor(page, HDR_SLUG);

		// Add an item
		await editorSection.locator('[data-test-id="header-add-item"]').click();

		const items = editorSection.locator('[data-test-id="header-menu-item"]');
		await expect(items.first()).toBeVisible({ timeout: 3000 });

		// Set type to link (may be default)
		const typeSelect = items.first().locator('select').first();
		if (await typeSelect.isVisible()) {
			await typeSelect.selectOption('link');
		}

		// Fill label and URL
		const labelInput = items.first().locator('input').first();
		await labelInput.fill('Home');
		const urlInput = items.first().locator('input').nth(1);
		await urlInput.fill('https://example.com');

		// Save and wait for the save POST to land before reading DB.
		await Promise.all([
			page.waitForResponse(r => r.request().method() === 'POST' && r.url().includes('~snippetUpdate') && r.status() < 500, { timeout: 10000 }),
			editorSection.locator('button.btn-primary.btn-lg').click(),
		]);

		// Verify JSON in DB
		const conn = await mysql.createConnection(DB);
		try {
			const [rows] = await conn.execute<any[]>(
				`SELECT content FROM ${tn('static_snippets')} WHERE slug = ?`, [HDR_SLUG]
			);
			const parsed = JSON.parse(rows[0].content);
			expect(parsed.items).toBeDefined();
			expect(parsed.items.length).toBeGreaterThanOrEqual(1);
			expect(parsed.items[0].type).toBe('link');
			expect(parsed.items[0].label).toBe('Home');
			expect(parsed.items[0].url).toBe('https://example.com');
		} finally {
			await conn.end();
		}
	});

	test('add page-type menu item shows page dropdown', async ({ page }) => {
		const editorSection = await openSnippetEditor(page, HDR_SLUG);

		await editorSection.locator('[data-test-id="header-add-item"]').click();

		const items = editorSection.locator('[data-test-id="header-menu-item"]');
		const lastItem = items.last();

		const typeSelect = lastItem.locator('select').first();
		await typeSelect.selectOption('page');

		// Page selector should appear
		const pageSelect = lastItem.locator('select').last();
		await expect(pageSelect).toBeVisible({ timeout: 3000 });
	});

	test('add divider-type menu item', async ({ page }) => {
		const editorSection = await openSnippetEditor(page, HDR_SLUG);

		await editorSection.locator('[data-test-id="header-add-item"]').click();

		const items = editorSection.locator('[data-test-id="header-menu-item"]');
		const lastItem = items.last();

		const typeSelect = lastItem.locator('select').first();
		await typeSelect.selectOption('divider');

		// Divider should have minimal fields (no label/url inputs)
		const visibleInputs = lastItem.locator('input:visible');
		const inputCount = await visibleInputs.count();
		expect(inputCount).toBeLessThanOrEqual(1);
	});

	test('reorder items with up/down buttons', async ({ page }) => {
		const editorSection = await openSnippetEditor(page, HDR_SLUG);

		// Ensure at least 2 items are in the editor — earlier sibling tests
		// may save 0 or 1 items, so we add what we need explicitly.
		const items = editorSection.locator('[data-test-id="header-menu-item"]');
		while (await items.count() < 2) {
			await editorSection.locator('[data-test-id="header-add-item"]').click();
		}

		const count = await items.count();
		expect(count).toBeGreaterThanOrEqual(2);

		// Make sure the second item has a distinct label so the reorder
		// assertion has something to compare against.
		const secondLabelInput = items.nth(1).locator('input').first();
		await secondLabelInput.fill('Distinct-2');
		const secondLabel = await secondLabelInput.inputValue();

		// Move second item up
		const upBtn = items.nth(1).locator('[data-test-id="move-up"], button:has-text("\\u2191")');
		await upBtn.click();

		const newFirstLabel = await items.first().locator('input').first().inputValue();
		expect(newFirstLabel).toBe(secondLabel);
	});

	test('delete menu item', async ({ page }) => {
		const editorSection = await openSnippetEditor(page, HDR_SLUG);

		const items = editorSection.locator('[data-test-id="header-menu-item"]');
		const before = await items.count();

		const deleteBtn = items.last().locator('[data-test-id="delete-item"], button.text-danger');
		await deleteBtn.click();

		const after = await items.count();
		expect(after).toBe(before - 1);
	});

	test('layout select has left/center/minimal options', async ({ page }) => {
		const editorSection = await openSnippetEditor(page, HDR_SLUG);

		const layoutSelect = editorSection.locator('[data-test-id="header-layout"]');
		await expect(layoutSelect).toBeVisible({ timeout: 5000 });

		const options = layoutSelect.locator('option');
		const count = await options.count();
		expect(count).toBeGreaterThanOrEqual(3);
	});

	test('sticky checkbox is present and toggleable', async ({ page }) => {
		const editorSection = await openSnippetEditor(page, HDR_SLUG);

		const sticky = editorSection.locator('[data-test-id="header-sticky"]');
		await expect(sticky).toBeVisible({ timeout: 5000 });

		const wasChecked = await sticky.isChecked();
		await sticky.click();
		const isNowChecked = await sticky.isChecked();
		expect(isNowChecked).toBe(!wasChecked);
	});

	test('save stores complete header JSON with layout and sticky', async ({ page }) => {
		const editorSection = await openSnippetEditor(page, HDR_SLUG);

		const layoutSelect = editorSection.locator('[data-test-id="header-layout"]');
		if (await layoutSelect.isVisible()) {
			await layoutSelect.selectOption('center');
		}

		const sticky = editorSection.locator('[data-test-id="header-sticky"]');
		if (await sticky.isVisible()) {
			if (!(await sticky.isChecked())) await sticky.check();
		}

		await Promise.all([
			page.waitForResponse(r => r.request().method() === 'POST' && r.url().includes('~snippetUpdate') && r.status() < 500, { timeout: 10000 }),
			editorSection.locator('button.btn-primary.btn-lg').click(),
		]);

		const conn = await mysql.createConnection(DB);
		try {
			const [rows] = await conn.execute<any[]>(
				`SELECT content FROM ${tn('static_snippets')} WHERE slug = ?`, [HDR_SLUG]
			);
			const parsed = JSON.parse(rows[0].content);
			expect(parsed).toHaveProperty('items');
			expect(parsed).toHaveProperty('layout', 'center');
			expect(parsed).toHaveProperty('sticky', true);
		} finally {
			await conn.end();
		}
	});
});
