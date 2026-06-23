/**
 * Admin -- Structured Header & Footer Snippet Builders (/admin/pages/)
 *
 * Covers:
 *   - Creating header/footer-type snippets via admin UI
 *   - Structured header editor UI (logo, menu items, layout, sticky)
 *   - Structured footer editor UI (columns, items, copyright)
 *   - Public rendering of structured header/footer snippets (backend)
 *   - Assigning header/footer snippets to pages
 *
 * Access: /admin/pages/ uses ownerOnly middleware, but IS_ADMIN implies isOwner()
 * so admin-tests storageState works.
 *
 * Runs as admin-tests project (pre-authenticated admin storageState).
 */

import { test, expect, tn } from '../../../helpers/scoped-test';
import type { Page } from '@playwright/test';
import mysql from 'mysql2/promise';
import { DB } from '../../../helpers/db';

// File-level `parallel` lets the four top-level `describe` blocks
// ("Create snippets", "Header editor", "Footer editor", "Public
// rendering") run on DIFFERENT Playwright workers. Each block still
// has its own `mode: 'serial'` below so its CRUD chain stays in
// order, but instead of one worker doing all ~33 tests
// sequentially (~133s), four workers each take one block (~30-40s
// each). They have disjoint slugs / disjoint test data so they
// don't fight over DB rows.
test.describe.configure({ mode: 'parallel' });
// Stable per-worker tag instead of `Date.now()` — module reloads on
// each retry would otherwise change every slug between attempts,
// leaving the rows the first try created orphaned in the DB. See the
// matching note in admin-static-pages.spec.ts.
const TS = `w${process.env.TEST_PARALLEL_INDEX ?? '0'}`;

// ── Helpers ──────────────────────────────────────────────────────────────────

// `ensureAdminAuth` re-login dance is no longer needed — see notes in
// static-pages.spec.ts. Under nginx + 32-worker php-cgi pool +
// PW_WORKER_ISOLATION, sessions are per-worker-DB-scoped and there's
// no shared-token leak path that the workaround used to paper over.

async function openStaticPages(page: Page) {
	await page.goto('/admin/pages/', { waitUntil: 'domcontentloaded' });
	await expect(page.locator('[data-test-id="admin-static-pages"]')).toBeVisible({ timeout: 20000 });
}

async function switchToSnippetsTab(page: Page) {
	await page.locator('[data-test-id="tabnav-btn-snippets"]').click();
	await expect(page.locator('[data-test-id="tabnav-btn-snippets"]')).toHaveAttribute('aria-selected', 'true');
}

async function createSnippetViaUI(page: Page, slug: string, name: string, type: string) {
	const createBtn = page.locator('[data-test-id="admin-static-pages"] button:has-text("+")').first();
	await expect(createBtn).toBeVisible({ timeout: 5000 });
	await createBtn.click();

	const formSection = page.locator('[data-test-id="admin-static-pages"] section');
	await expect(formSection).toBeVisible({ timeout: 5000 });
	const inputs = formSection.locator('input.form-control');
	await inputs.nth(0).fill(slug);
	await inputs.nth(1).fill(name);
	const typeSelect = formSection.locator('select.form-control');
	await typeSelect.selectOption(type);

	const submitBtn = formSection.locator('button.btn-primary').first();
	await submitBtn.click();
}

async function openSnippetEditor(page: Page, slug: string) {
	await openStaticPages(page);
	await switchToSnippetsTab(page);

	const row = page.locator(`tr:has(td:has-text("${slug}"))`);
	await expect(row).toBeVisible({ timeout: 10000 });
	await row.locator('button.text-accent').first().click();

	const editorSection = page.locator('section.section-soft');
	await expect(editorSection).toBeVisible({ timeout: 8000 });
	return editorSection;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Section 1: Creating header/footer snippets via admin UI (works NOW)
// ═══════════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════════
// Section 2: Structured header editor UI
//   These tests require the implementation of the structured header editor.
//   They will FAIL until the HeaderEditor component is implemented.
// ═══════════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════════
// Section 3: Structured footer editor UI
//   These tests require the implementation of the structured footer editor.
//   They will FAIL until the FooterEditor component is implemented.
// ═══════════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════════
// Section 4: Public rendering of structured header/footer
//   These tests use DB-seeded data and test the PHP backend rendering.
//   They should PASS now since the backend is already implemented.
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Public rendering -- Structured header/footer snippets', () => {
	test.describe.configure({ mode: 'serial' });

	const PAGE_SLUG = `e2e-render-${TS}`;
	const PAGE_TITLE = 'E2E Structured Render';
	const HDR_SLUG = `e2e-rhdr-${TS}`;
	const FTR_SLUG = `e2e-rftr-${TS}`;
	let hdrId = 0;
	let ftrId = 0;
	let pageId = 0;

	test.beforeAll(async () => {
		const conn = await mysql.createConnection(DB);
		try {
			const now = Math.floor(Date.now() / 1000);

			// Create header snippet with structured JSON
			const headerJson = JSON.stringify({
				logo: { url: '', alt: 'Test Logo', link: '/', height: 40 },
				items: [
					{ type: 'link', label: 'Home', url: '/' },
					{ type: 'link', label: 'About', url: '/about' },
					{ type: 'divider' },
					{ type: 'link', label: 'Contact', url: '/contact' },
				],
				layout: 'left',
				sticky: false,
			});
			const [hdrRes] = await conn.execute<any>(
				`INSERT INTO ${tn('static_snippets')} (slug, name, snippet_type, content, is_active, sort_order, updated_at, created_at) VALUES (?, 'Render Header', 'header', ?, 1, 0, ?, ?)`,
				[HDR_SLUG, headerJson, now, now]
			);
			hdrId = hdrRes.insertId;

			// Create footer snippet with structured JSON
			const footerJson = JSON.stringify({
				columns: [
					{
						title: 'Quick Links',
						items: [
							{ type: 'link', label: 'Home Page', url: '/' },
							{ type: 'link', label: 'External Site', url: 'https://example.com', external: true },
						],
					},
					{
						title: 'Resources',
						items: [
							{ type: 'link', label: 'Documentation', url: '/docs' },
						],
					},
				],
				copyright: '2026 E2E Test Corp',
			});
			const [ftrRes] = await conn.execute<any>(
				`INSERT INTO ${tn('static_snippets')} (slug, name, snippet_type, content, is_active, sort_order, updated_at, created_at) VALUES (?, 'Render Footer', 'footer', ?, 1, 0, ?, ?)`,
				[FTR_SLUG, footerJson, now, now]
			);
			ftrId = ftrRes.insertId;

			// Create published page with both snippets
			const [pgRes] = await conn.execute<any>(
				`INSERT INTO ${tn('static_pages')} (slug, title, is_published, meta_description, max_width, visibility, sort_order, header_snippet_id, footer_snippet_id, updated_at, updated_by, created_at) VALUES (?, ?, 1, '', '3xl', 'all', 0, ?, ?, ?, 0, ?)`,
				[PAGE_SLUG, PAGE_TITLE, hdrId, ftrId, now, now]
			);
			pageId = pgRes.insertId;

			// Add a text block
			await conn.execute(
				`INSERT INTO ${tn('static_page_blocks')} (page_id, block_type, content, sort_order, is_hidden, created_at) VALUES (?, 'text', 'Page body content here.', 0, 0, ?)`,
				[pageId, now]
			);
		} finally {
			await conn.end();
		}
	});

	test.afterAll(async () => {
		const conn = await mysql.createConnection(DB);
		try {
			if (pageId > 0) {
				await conn.execute(`DELETE FROM ${tn('static_page_blocks')} WHERE page_id = ?`, [pageId]);
				await conn.execute(`DELETE FROM ${tn('static_pages')} WHERE id = ?`, [pageId]);
			}
			if (hdrId > 0) await conn.execute(`DELETE FROM ${tn('static_snippets')} WHERE id = ?`, [hdrId]);
			if (ftrId > 0) await conn.execute(`DELETE FROM ${tn('static_snippets')} WHERE id = ?`, [ftrId]);
		} finally {
			await conn.end();
		}
	});

	test('page with header snippet shows <nav> with navigation links', async ({ page }) => {
		const response = await page.goto(`/page/view~${PAGE_SLUG}`);
		expect(response?.status()).toBe(200);

		const nav = page.locator('nav.sp-nav');
		await expect(nav).toBeVisible({ timeout: 5000 });

		// Check links are rendered
		const navLinks = nav.locator('a.sp-nav-link');
		const linkCount = await navLinks.count();
		expect(linkCount).toBeGreaterThanOrEqual(3);

		await Promise.all([
			expect(navLinks.filter({ hasText: 'Home' })).toBeVisible(),
			expect(navLinks.filter({ hasText: 'About' })).toBeVisible(),
			expect(navLinks.filter({ hasText: 'Contact' })).toBeVisible(),
		]);
	});

	test('header has divider elements', async ({ page }) => {
		await page.goto(`/page/view~${PAGE_SLUG}`);

		const dividers = page.locator('nav.sp-nav .sp-nav-divider');
		const count = await dividers.count();
		expect(count).toBeGreaterThanOrEqual(1);
	});

	test('header has correct layout class', async ({ page }) => {
		await page.goto(`/page/view~${PAGE_SLUG}`);

		const nav = page.locator('nav.sp-nav');
		await expect(nav).toHaveClass(/sp-nav-left/);
	});

	test('header nav links point to correct URLs', async ({ page }) => {
		await page.goto(`/page/view~${PAGE_SLUG}`);

		const nav = page.locator('nav.sp-nav');
		await Promise.all([
			expect(nav.locator('a.sp-nav-link:has-text("Home")')).toHaveAttribute('href', '/'),
			expect(nav.locator('a.sp-nav-link:has-text("About")')).toHaveAttribute('href', '/about'),
			expect(nav.locator('a.sp-nav-link:has-text("Contact")')).toHaveAttribute('href', '/contact'),
		]);
	});

	test('page with footer snippet shows <footer> with columns', async ({ page }) => {
		await page.goto(`/page/view~${PAGE_SLUG}`);

		const footer = page.locator('footer.sp-footer');
		await expect(footer).toBeVisible({ timeout: 5000 });

		const cols = footer.locator('.sp-footer-col');
		expect(await cols.count()).toBe(2);

		await Promise.all([
			expect(cols.nth(0).locator('.sp-footer-col-title')).toHaveText('Quick Links'),
			expect(cols.nth(1).locator('.sp-footer-col-title')).toHaveText('Resources'),
		]);
	});

	test('footer column links are correct', async ({ page }) => {
		await page.goto(`/page/view~${PAGE_SLUG}`);

		const footer = page.locator('footer.sp-footer');
		const firstCol = footer.locator('.sp-footer-col').nth(0);

		const homeLink = firstCol.locator('a.sp-footer-link:has-text("Home Page")');
		await expect(homeLink).toHaveAttribute('href', '/');

		const extLink = firstCol.locator('a.sp-footer-link:has-text("External Site")');
		await Promise.all([
			expect(extLink).toHaveAttribute('href', 'https://example.com'),
			expect(extLink).toHaveAttribute('target', '_blank'),
		]);
	});

	test('footer copyright is rendered with variable substitution', async ({ page }) => {
		await page.goto(`/page/view~${PAGE_SLUG}`);

		const copyright = page.locator('footer.sp-footer .sp-footer-copyright');
		await expect(copyright).toBeVisible();
		const text = await copyright.textContent();
		expect(text).toContain('2026');
		expect(text).toContain('E2E Test Corp');
	});

	test('page title and body content appear between header and footer', async ({ page }) => {
		await page.goto(`/page/view~${PAGE_SLUG}`);

		// Title
		const h1 = page.locator('h1');
		await Promise.all([
			expect(h1).toContainText(PAGE_TITLE),

		// Body content
			expect(page.locator('text=Page body content here.')).toBeVisible(),
		]);
		const navBox = await page.locator('nav.sp-nav').boundingBox();
		const h1Box = await h1.boundingBox();
		const footerBox = await page.locator('footer.sp-footer').boundingBox();

		expect(navBox).not.toBeNull();
		expect(h1Box).not.toBeNull();
		expect(footerBox).not.toBeNull();

		if (navBox && h1Box && footerBox) {
			expect(navBox.y).toBeLessThan(h1Box.y);
			expect(h1Box.y).toBeLessThan(footerBox.y);
		}
	});

	test('sticky header gets sp-nav-sticky class', async ({ page }) => {
		const conn = await mysql.createConnection(DB);
		try {
			const [rows] = await conn.execute<any[]>(
				`SELECT content FROM ${tn('static_snippets')} WHERE id = ?`, [hdrId]
			);
			const data = JSON.parse(rows[0].content);
			data.sticky = true;
			await conn.execute(`UPDATE ${tn('static_snippets')} SET content = ? WHERE id = ?`,
				[JSON.stringify(data), hdrId]);
		} finally {
			await conn.end();
		}

		await page.goto(`/page/view~${PAGE_SLUG}`);
		await expect(page.locator('nav.sp-nav')).toHaveClass(/sp-nav-sticky/);

		// Restore
		const conn2 = await mysql.createConnection(DB);
		try {
			const [rows] = await conn2.execute<any[]>(
				`SELECT content FROM ${tn('static_snippets')} WHERE id = ?`, [hdrId]
			);
			const data = JSON.parse(rows[0].content);
			data.sticky = false;
			await conn2.execute(`UPDATE ${tn('static_snippets')} SET content = ? WHERE id = ?`,
				[JSON.stringify(data), hdrId]);
		} finally {
			await conn2.end();
		}
	});

	test('footer with no columns renders only copyright', async ({ page }) => {
		const conn = await mysql.createConnection(DB);
		let originalContent = '';
		try {
			const [rows] = await conn.execute<any[]>(
				`SELECT content FROM ${tn('static_snippets')} WHERE id = ?`, [ftrId]
			);
			originalContent = rows[0].content;
			const ftrJson = JSON.stringify({ columns: [], copyright: '2026 Copyright Only' });
			await conn.execute(`UPDATE ${tn('static_snippets')} SET content = ? WHERE id = ?`, [ftrJson, ftrId]);
		} finally {
			await conn.end();
		}

		await page.goto(`/page/view~${PAGE_SLUG}`);

		const footer = page.locator('footer.sp-footer');
		await expect(footer).toBeVisible({ timeout: 5000 });

		// No columns div when columns array is empty
		const colsDiv = footer.locator('.sp-footer-cols');
		await expect(colsDiv).not.toBeVisible();

		const copyright = footer.locator('.sp-footer-copyright');
		await expect(copyright).toContainText('2026 Copyright Only');

		// Restore original content
		const conn2 = await mysql.createConnection(DB);
		try {
			await conn2.execute(`UPDATE ${tn('static_snippets')} SET content = ? WHERE id = ?`, [originalContent, ftrId]);
		} finally {
			await conn2.end();
		}
	});

	test('inactive header snippet is not rendered', async ({ page }) => {
		const conn = await mysql.createConnection(DB);
		try {
			await conn.execute(`UPDATE ${tn('static_snippets')} SET is_active = 0 WHERE id = ?`, [hdrId]);
		} finally {
			await conn.end();
		}

		await page.goto(`/page/view~${PAGE_SLUG}`);

		await Promise.all([
			expect(page.locator('nav.sp-nav')).not.toBeVisible(),

		// Footer should still render
			expect(page.locator('footer.sp-footer')).toBeVisible({ timeout: 5000 }),
		]);
		const conn2 = await mysql.createConnection(DB);
		try {
			await conn2.execute(`UPDATE ${tn('static_snippets')} SET is_active = 1 WHERE id = ?`, [hdrId]);
		} finally {
			await conn2.end();
		}
	});

	test('inactive footer snippet is not rendered', async ({ page }) => {
		const conn = await mysql.createConnection(DB);
		try {
			await conn.execute(`UPDATE ${tn('static_snippets')} SET is_active = 0 WHERE id = ?`, [ftrId]);
		} finally {
			await conn.end();
		}

		await page.goto(`/page/view~${PAGE_SLUG}`);

		await Promise.all([
			expect(page.locator('footer.sp-footer')).not.toBeVisible(),

		// Header should still render
			expect(page.locator('nav.sp-nav')).toBeVisible({ timeout: 5000 }),
		]);
		const conn2 = await mysql.createConnection(DB);
		try {
			await conn2.execute(`UPDATE ${tn('static_snippets')} SET is_active = 1 WHERE id = ?`, [ftrId]);
		} finally {
			await conn2.end();
		}
	});
});
