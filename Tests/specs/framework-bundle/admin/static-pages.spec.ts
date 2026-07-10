/**
 * Admin -- Static Pages system (/admin/pages/)
 *
 * Covers:
 *   - Page list and TabNav rendering (pages + snippets tabs)
 *   - Full CRUD lifecycle for static pages (create, edit, save, publish, delete)
 *   - Block editor: add text block, add gallery block, save
 *   - Snippets CRUD: create, edit, active/inactive toggle, type filter, delete
 *   - Public rendering: published page at /page/view~{slug}, unpublished = 404
 *   - Markdown rendering on public page
 *
 * Access: /admin/pages/ uses ownerOnly middleware, but IS_ADMIN implies isOwner()
 * so admin-tests storageState works.
 *
 * Runs as admin-tests project (pre-authenticated admin storageState).
 */

import { test, expect, tn } from '../../../helpers/scoped-test';
import mysql from 'mysql2/promise';
import { DB } from '../../../helpers/db';
test.describe.configure({ mode: 'parallel' });

// Slugs must be STABLE across retries — Playwright reloads this module
// on every retry, so a `Date.now()` value here would change on the
// second attempt, leaving the slug created on the first attempt
// orphaned in the DB and the retry searching for a row that doesn't
// exist. Pin to the worker index instead (each worker has its own DB
// scope via PW_WORKER_ISOLATION, so collisions across workers are
// impossible). Outside isolation (legacy `db_*`), tests run with
// PW_WORKERS=1, so worker_0 is the only namespace anyway.
const WORKER_TAG = process.env.TEST_PARALLEL_INDEX ?? '0';
const TEST_SLUG = `e2e-test-page-w${WORKER_TAG}`;
const TEST_TITLE = 'E2E Test Page';
const TEST_SNIPPET_SLUG = `e2e-test-snippet-w${WORKER_TAG}`;
const TEST_SNIPPET_NAME = 'E2E Test Snippet';

// `ensureAdminAuth` (clearCookies + 2 goto + fetch /dev-login + 2
// networkidle) was the legacy workaround for the single-thread
// `php -S` mode where a sibling spec's devLoginAs(moderator) could
// overwrite our session cookie in the shared session-token namespace.
// Under nginx + per-process php-cgi pool (32 workers) +
// PW_WORKER_ISOLATION, sessions live in `test_worker_${i}_session*`
// tables that are scoped to one worker — no cross-spec leakage path
// exists. ~1.5s of re-auth per test × 22 tests = ~33s saved by
// trusting the admin-tests storageState that the project loads.

// Helper: navigate to admin static pages, wait for island to render
async function openStaticPages(page: any) {
	await page.goto('/admin/pages/', { waitUntil: 'domcontentloaded' });
	// Wait for the React island to hydrate; the inner row-wait was a
	// blanket `.first().waitFor()` with a 15s budget that catch-swallowed
	// the timeout on empty tables — burning the full budget for every
	// caller that didn't care about rows. Each caller now decides:
	// tests that read a specific slug use `waitForPageRow(slug)` (which
	// has its own poll), tests that just check the toolbar / tabs don't
	// pay for row-fetch settling at all.
	await expect(page.locator('[data-test-id="admin-static-pages"]')).toBeVisible({ timeout: 20000 });
}

// Helper: open pages list and wait for a specific row to appear in the table
async function waitForPageRow(page: any, slug: string) {
	const row = page.locator(`tr:has(td:has-text("${slug}"))`);
	await expect(row).toBeVisible({ timeout: 10000 });
	return row;
}

// Helper: open page editor tab from pages list
async function openPageEditor(page: any, slug: string) {
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

test.describe.serial('Static Pages -- CRUD chain', () => {

// ── Admin -- Static Pages (/admin/pages/) ────────────────────────────────────

test.describe('Admin -- Static Pages (/admin/pages/)', () => {
	test('page loads and shows TabNav with pages and snippets tabs', async ({ page }) => {
		await openStaticPages(page);
		await Promise.all([
			expect(page.locator('[data-test-id="tabnav-btn-pages"]')).toBeVisible({ timeout: 5000 }),
			expect(page.locator('[data-test-id="tabnav-btn-snippets"]')).toBeVisible({ timeout: 5000 }),
		]);
	});

	test('pages tab is active by default', async ({ page }) => {
		await openStaticPages(page);
		await expect(page.locator('[data-test-id="tabnav-btn-pages"]')).toHaveAttribute('aria-selected', 'true');
	});

	test('create page: fill slug + title, page appears in list', async ({ page }) => {
		await openStaticPages(page);

		// Click the create button (text contains "+")
		const createBtn = page.locator('[data-test-id="admin-static-pages"] button:has-text("+")').first();
		await expect(createBtn).toBeVisible({ timeout: 5000 });
		await createBtn.click();

		// Fill slug and title in the create form
		const formSection = page.locator('[data-test-id="admin-static-pages"] section');
		await expect(formSection).toBeVisible({ timeout: 5000 });
		const inputs = formSection.locator('input.form-control');
		await inputs.nth(0).fill(TEST_SLUG);
		await inputs.nth(1).fill(TEST_TITLE);

		// Click submit + wait for the create POST to finish so the new row
		// is in the DB before we navigate back to the list. Match the URL
		// suffix explicitly — the admin pages island also fires a list
		// re-fetch and other side-effect POSTs around create.
		const submitBtn = formSection.locator('button.btn-primary').first();
		await Promise.all([
			page.waitForResponse(
				r => r.request().method() === 'POST' && r.url().includes('~create') && r.status() < 500,
				{ timeout: 10000 }
			),
			submitBtn.click(),
		]);

		// After creation, the editor tab opens automatically.
		// Go back to pages list tab
		await page.locator('[data-test-id="tabnav-btn-pages"]').click();

		// Verify the page appears in the table — auto-retry while the React
		// island re-renders after navigation.
		await Promise.all([
			expect(page.locator('[data-test-id="admin-static-pages"]')).toContainText(TEST_SLUG, { timeout: 5000 }),
			expect(page.locator('[data-test-id="admin-static-pages"]')).toContainText(TEST_TITLE, { timeout: 5000 }),
		]);
	});

	test('page is draft by default', async ({ page }) => {
		await openStaticPages(page);
		const row = await waitForPageRow(page, TEST_SLUG);

		// The status badge should be draft (status-muted class)
		const draftBtn = row.locator('button.status-muted');
		await expect(draftBtn).toBeVisible({ timeout: 5000 });
	});

	test('edit page: clicking edit opens editor tab', async ({ page }) => {
		const editorSection = await openPageEditor(page, TEST_SLUG);

		// Editor should have title, slug fields
		const titleInput = editorSection.locator('input.form-control').first();
		await expect(titleInput).toBeVisible();

		// Verify the slug field has the correct value
		const slugInput = editorSection.locator('input.form-control').nth(1);
		const slugValue = await slugInput.inputValue();
		expect(slugValue).toBe(TEST_SLUG);
	});

	test('page editor has expected fields: title, slug, meta-description, max-width, snippets, save, publish', async ({ page }) => {
		const editorSection = await openPageEditor(page, TEST_SLUG);

		// All fields are siblings inside the freshly-opened editor — batch
		// their visibility polls so the wall = max() instead of Σ.
		await Promise.all([
			expect(editorSection.locator('input.form-control').first()).toBeVisible(),
			expect(editorSection.locator('input.form-control').nth(1)).toBeVisible(),
			expect(editorSection.locator('input.form-control').nth(2)).toBeVisible(),
			expect(editorSection.locator('select.form-control').first()).toBeVisible(),
			expect(editorSection.locator('select.form-control').nth(1)).toBeVisible(),
			expect(editorSection.locator('select.form-control').nth(2)).toBeVisible(),
			expect(editorSection.locator('button.btn-primary.btn-lg')).toBeVisible(),
			expect(page.getByRole('checkbox', { name: /Опубликовано|Published/i })).toBeVisible(),
		]);
	});

	test('add text block via "+" picker, type markdown and save', async ({ page }) => {
		const editorSection = await openPageEditor(page, TEST_SLUG);

		// Click the "+" separator button to add a block
		const addBtn = editorSection.locator('.blk-add-btn').first();
		await expect(addBtn).toBeVisible({ timeout: 5000 });
		await addBtn.click();

		// Type picker should appear -- click text block
		// Labels may be in Russian or English, match both
		const textBlockBtn = editorSection.locator('button.btn-secondary').filter({
			has: page.locator('text=/Text|Текст/i'),
		}).first();
		await expect(textBlockBtn).toBeVisible({ timeout: 5000 });
		await textBlockBtn.click();

		// A text block should now be present with a textarea
		const textarea = editorSection.locator('.blk-card textarea.form-control');
		await expect(textarea).toBeVisible({ timeout: 5000 });

		// Type markdown content into the text block
		await textarea.fill('**bold text** and *italic text* and [a link](https://example.com)\n\n- list item 1\n- list item 2');

		// Save the page (saves blocks too) + wait for BOTH save XHRs.
		// handleSave fires `~update` followed by `~saveBlocks`; the next
		// test reopens the editor and reads `.blk-card`, which depends on
		// `~saveBlocks` finishing — not the earlier `~update` ping.
		const saveBtn = editorSection.locator('button.btn-primary.btn-lg');
		await Promise.all([
			page.waitForResponse(
				(r) => r.request().method() === 'POST' && r.url().includes('~saveBlocks') && r.status() < 500,
				{ timeout: 15000 }
			),
			saveBtn.click(),
		]);

		// Verify no error -- editor still visible
		await expect(editorSection).toBeVisible();
	});

	test('add gallery block via "+" picker and verify upload area', async ({ page }) => {
		const editorSection = await openPageEditor(page, TEST_SLUG);

		// Should have the previously saved text block
		const existingBlock = editorSection.locator('.blk-card');
		await expect(existingBlock.first()).toBeVisible({ timeout: 10000 });

		// Click the last "+" separator button (after the existing text block)
		const addBtns = editorSection.locator('.blk-add-btn');
		const lastAddBtn = addBtns.last();
		await expect(lastAddBtn).toBeVisible({ timeout: 5000 });
		await lastAddBtn.click();

		// Type picker: click gallery
		const galleryBtn = editorSection.locator('button.btn-secondary').filter({
			has: page.locator('text=/Gallery|Галерея/i'),
		}).first();
		await expect(galleryBtn).toBeVisible({ timeout: 5000 });
		await galleryBtn.click();

		// A gallery block should appear with an upload area. The page editor
		// also has an OG-image upload area near the top, so target the LAST
		// `.blk-upload-area` — the one belonging to the just-added block.
		const uploadArea = editorSection.locator('.blk-upload-area').last();
		await expect(uploadArea).toBeVisible({ timeout: 5000 });

		// Save so gallery block persists for later tests. Wait for the
		// blocks-save XHR so the next test sees the persisted state.
		const saveBtn = editorSection.locator('button.btn-primary.btn-lg');
		await Promise.all([
			page.waitForResponse(
				(r) => r.request().method() === 'POST' && r.url().includes('~saveBlocks') && r.status() < 500,
				{ timeout: 15000 }
			),
			saveBtn.click(),
		]);
	});

	test('publish page via checkbox in editor and save', async ({ page }) => {
		const editorSection = await openPageEditor(page, TEST_SLUG);

		// The publish checkbox is inside a label with the "published" text
		// Use getByRole to target the specific checkbox by its label name
		const publishCheckbox = page.getByRole('checkbox', { name: /Опубликовано|Published/i });
		await expect(publishCheckbox).toBeVisible({ timeout: 5000 });
		const isChecked = await publishCheckbox.isChecked();
		if (!isChecked) {
			await publishCheckbox.check();
		}
		// React controlled-input — assert the DOM reflects the desired
		// state before we save, otherwise we'd post a stale flag.
		await expect(publishCheckbox).toBeChecked();

		// Save + wait for the `~update` XHR (carries is_published) before
		// the next test reopens the pages list and reads the status badge.
		const saveBtn = editorSection.locator('button.btn-primary.btn-lg');
		await Promise.all([
			page.waitForResponse(
				(r) => r.request().method() === 'POST' && r.url().includes('~update') && !r.url().includes('~updateBlock') && r.status() < 500,
				{ timeout: 10000 }
			),
			saveBtn.click(),
		]);
	});

	test('toggle publish from pages list', async ({ page }) => {
		await openStaticPages(page);
		const row = await waitForPageRow(page, TEST_SLUG);

		// The status badge should now be "published" (status-success)
		const publishedBtn = row.locator('button.status-success');
		await expect(publishedBtn).toBeVisible({ timeout: 5000 });

		// Toggle to unpublish — wait for the `~update` toggle XHR before
		// reading the new state from the row.
		await Promise.all([
			page.waitForResponse(
				(r) => r.request().method() === 'POST' && r.url().includes('~update') && !r.url().includes('~updateBlock') && r.status() < 500,
				{ timeout: 10000 }
			),
			publishedBtn.click(),
		]);

		// Should now be draft (status-muted)
		const draftBtn = row.locator('button.status-muted');
		await expect(draftBtn).toBeVisible({ timeout: 8000 });

		// Toggle back to publish (for the public rendering tests)
		await Promise.all([
			page.waitForResponse(
				(r) => r.request().method() === 'POST' && r.url().includes('~update') && !r.url().includes('~updateBlock') && r.status() < 500,
				{ timeout: 10000 }
			),
			draftBtn.click(),
		]);

		// Should be published again
		await expect(row.locator('button.status-success')).toBeVisible({ timeout: 8000 });
	});
});

// ── Static Pages -- Public rendering ─────────────────────────────────────────

test.describe('Static Pages -- Public rendering', () => {
	test('published page accessible at /page/view~{slug}', async ({ page }) => {
		// Ensure the page is published via DB
		const conn = await mysql.createConnection(DB);
		try {
			await conn.execute(
				`UPDATE ${tn('static_pages')} SET is_published = 1 WHERE slug = ?`,
				[TEST_SLUG]
			);
		} finally {
			await conn.end();
		}

		const response = await page.goto(`/page/view~${TEST_SLUG}`);
		expect(response?.status()).toBe(200);

		// The page title should be visible
		const h1 = page.locator('h1');
		await expect(h1).toBeVisible({ timeout: 5000 });
		const h1Text = await h1.textContent();
		expect(h1Text).toContain(TEST_TITLE);
	});

	test('unpublished page returns 404', async ({ page }) => {
		// Unpublish the page
		const conn = await mysql.createConnection(DB);
		try {
			await conn.execute(
				`UPDATE ${tn('static_pages')} SET is_published = 0 WHERE slug = ?`,
				[TEST_SLUG]
			);
		} finally {
			await conn.end();
		}

		const response = await page.goto(`/page/view~${TEST_SLUG}`);
		expect(response?.status()).toBe(404);

		// Re-publish for remaining tests
		const conn2 = await mysql.createConnection(DB);
		try {
			await conn2.execute(
				`UPDATE ${tn('static_pages')} SET is_published = 1 WHERE slug = ?`,
				[TEST_SLUG]
			);
		} finally {
			await conn2.end();
		}
	});

	test('nonexistent slug returns 404', async ({ page }) => {
		const response = await page.goto('/page/view~this-page-does-not-exist-xyz');
		expect(response?.status()).toBe(404);
	});
});

// ── Static Pages -- Markdown rendering ───────────────────────────────────────

test.describe('Static Pages -- Markdown rendering', () => {
	test('bold, italic, link, and lists render correctly on public page', async ({ page }) => {
		// Ensure the page has markdown content via DB
		const conn = await mysql.createConnection(DB);
		try {
			const [rows] = await conn.execute<any[]>(
				`SELECT id FROM ${tn('static_pages')} WHERE slug = ?`, [TEST_SLUG]
			);
			if (rows.length > 0) {
				const pageId = rows[0].id;
				const [blocks] = await conn.execute<any[]>(
					`SELECT id FROM ${tn('static_page_blocks')} WHERE page_id = ? AND block_type = 'text' LIMIT 1`,
					[pageId]
				);
				const mdContent = '**bold text** and *italic text* and [a link](https://example.com)\n\n- list item 1\n- list item 2';
				if (blocks.length > 0) {
					await conn.execute(
						`UPDATE ${tn('static_page_blocks')} SET content = ?, is_hidden = 0 WHERE id = ?`,
						[mdContent, blocks[0].id]
					);
				} else {
					await conn.execute(
						`INSERT INTO ${tn('static_page_blocks')} (page_id, block_type, content, sort_order, is_hidden, created_at)
						 VALUES (?, 'text', ?, 0, 0, UNIX_TIMESTAMP())`,
						[pageId, mdContent]
					);
				}
				await conn.execute(`UPDATE ${tn('static_pages')} SET is_published = 1 WHERE id = ?`, [pageId]);
			}
		} finally {
			await conn.end();
		}

		const response = await page.goto(`/page/view~${TEST_SLUG}`);
		expect(response?.status()).toBe(200);

		// Check bold text rendered
		await Promise.all([
			expect(page.locator('strong:has-text("bold text")')).toBeVisible({ timeout: 5000 }),

		// Check italic text rendered
			expect(page.locator('em:has-text("italic text")')).toBeVisible({ timeout: 5000 }),

		// Check link rendered
			expect(page.locator('a[href="https://example.com"]')).toBeVisible({ timeout: 5000 }),
		]);
		const liCount = await page.locator('li').count();
		expect(liCount).toBeGreaterThanOrEqual(2);
	});
});

// ── Admin -- Delete page with confirmation ───────────────────────────────────

test.describe('Admin -- Static Pages -- Delete page', () => {
	test('delete page from editor tab with confirmation', async ({ page }) => {
		const editorSection = await openPageEditor(page, TEST_SLUG);

		// Click delete button in the editor
		const deleteBtn = editorSection.locator('button.btn-danger').first();
		await expect(deleteBtn).toBeVisible({ timeout: 5000 });
		await deleteBtn.click();

		// Confirm dialog — wait for the `~delete` XHR to settle so the
		// pages-list re-fetch on tab switch reflects the deletion.
		await expect(page.locator('[data-test-id="modal-confirm-btn"]')).toBeVisible({ timeout: 5000 });
		await Promise.all([
			page.waitForResponse(
				(r: any) => r.request().method() === 'POST' && r.url().includes('~delete') && r.status() < 500,
				{ timeout: 10000 }
			),
			page.locator('[data-test-id="modal-confirm-btn"]').click(),
		]);

		// Switch to pages list and assert the row is gone. Use locator-based
		// expectation so it auto-retries until the list re-fetch finishes.
		await page.locator('[data-test-id="tabnav-btn-pages"]').click();
		const row = page.locator(`tr:has(td:has-text("${TEST_SLUG}"))`);
		await expect(row).toHaveCount(0, { timeout: 10000 });
	});

	test('deleted page returns 404 on public URL', async ({ page }) => {
		// Right after the delete, a shared-hosting box can briefly 5xx on the
		// public view (the delete's async block+page cascade is still settling
		// when the next request lands). The contract is "eventually 404" — poll
		// the status so a transient blip doesn't fail the run, while a page that
		// stays reachable (real regression) still fails.
		await expect.poll(
			async () => (await page.goto(`/page/view~${TEST_SLUG}`))?.status(),
			{ timeout: 15000, intervals: [500, 1000, 2000] },
		).toBe(404);
	});
});

}); // end CRUD chain serial group

// ── Admin -- Static Pages -- Snippets tab ────────────────────────────────────

test.describe('Admin -- Static Pages -- Snippets tab', () => {
	test.describe.configure({ mode: 'serial' });
	test('switch to snippets tab', async ({ page }) => {
		await openStaticPages(page);
		await page.locator('[data-test-id="tabnav-btn-snippets"]').click();
		await expect(page.locator('[data-test-id="tabnav-btn-snippets"]')).toHaveAttribute('aria-selected', 'true');
	});

	test('create snippet: fill slug, name, type, appears in list', async ({ page }) => {
		await openStaticPages(page);
		await page.locator('[data-test-id="tabnav-btn-snippets"]').click();

		// Click the create button
		const createBtn = page.locator('[data-test-id="admin-static-pages"] button:has-text("+")').first();
		await expect(createBtn).toBeVisible({ timeout: 5000 });
		await createBtn.click();

		// Fill snippet form (slug, name, type)
		const formSection = page.locator('[data-test-id="admin-static-pages"] section');
		await expect(formSection).toBeVisible({ timeout: 5000 });
		const inputs = formSection.locator('input.form-control');
		await inputs.nth(0).fill(TEST_SNIPPET_SLUG);
		await inputs.nth(1).fill(TEST_SNIPPET_NAME);

		// Select type "block" (default)
		const typeSelect = formSection.locator('select.form-control');
		await typeSelect.selectOption('block');

		// Submit + wait for the `~snippetCreate` XHR before we navigate
		// back; the list reads need the row in DB.
		const submitBtn = formSection.locator('button.btn-primary').first();
		await Promise.all([
			page.waitForResponse(
				(r) => r.request().method() === 'POST' && r.url().includes('~snippetCreate') && r.status() < 500,
				{ timeout: 10000 }
			),
			submitBtn.click(),
		]);

		// Go back to snippets list and assert the row is present (auto-retry).
		await page.locator('[data-test-id="tabnav-btn-snippets"]').click();
		await Promise.all([
			expect(page.locator('[data-test-id="admin-static-pages"]')).toContainText(TEST_SNIPPET_SLUG, { timeout: 10000 }),
			expect(page.locator('[data-test-id="admin-static-pages"]')).toContainText(TEST_SNIPPET_NAME, { timeout: 5000 }),
		]);
	});

	test('snippet type filter buttons are present', async ({ page }) => {
		await openStaticPages(page);
		await page.locator('[data-test-id="tabnav-btn-snippets"]').click();

		// Type filter buttons should exist (All, header, footer, variable, block)
		const filterButtons = page.locator('[data-test-id="admin-static-pages"] button.status-muted, [data-test-id="admin-static-pages"] button.status-active');
		const count = await filterButtons.count();
		// At least "All" + 4 type filters = 5
		expect(count).toBeGreaterThanOrEqual(5);
	});

	test('edit snippet: opens editor tab with textarea', async ({ page }) => {
		await openStaticPages(page);
		await page.locator('[data-test-id="tabnav-btn-snippets"]').click();

		// Find the snippet row and click edit
		const row = page.locator(`tr:has(td:has-text("${TEST_SNIPPET_SLUG}"))`);
		await expect(row).toBeVisible({ timeout: 10000 });

		const editBtn = row.locator('button.text-accent').first();
		await editBtn.click();

		// The snippet editor tab should be visible
		const editorSection = page.locator('section.section-soft');
		await expect(editorSection).toBeVisible({ timeout: 8000 });

		// Textarea should be present
		const textarea = editorSection.locator('textarea.form-control');
		await expect(textarea).toBeVisible({ timeout: 5000 });
	});

	test('snippet editor has markdown toolbar for block type', async ({ page }) => {
		await openStaticPages(page);
		await page.locator('[data-test-id="tabnav-btn-snippets"]').click();

		// Open snippet editor
		const row = page.locator(`tr:has(td:has-text("${TEST_SNIPPET_SLUG}"))`);
		await expect(row).toBeVisible({ timeout: 10000 });
		await row.locator('button.text-accent').first().click();

		const editorSection = page.locator('section.section-soft');
		await expect(editorSection).toBeVisible({ timeout: 8000 });

		// For block type, markdown toolbar should be present (B = Bold button)
		const boldBtn = editorSection.locator('button.blk-fmt-btn').first();
		await expect(boldBtn).toBeVisible({ timeout: 5000 });
	});

	test('active/inactive toggle works', async ({ page }) => {
		await openStaticPages(page);
		await page.locator('[data-test-id="tabnav-btn-snippets"]').click();

		// Find snippet row
		const row = page.locator(`tr:has(td:has-text("${TEST_SNIPPET_SLUG}"))`);
		await expect(row).toBeVisible({ timeout: 10000 });

		// The active/inactive toggle button in the snippet row
		const toggleBtn = row.locator('button.status-success, button.status-muted');
		await expect(toggleBtn).toBeVisible({ timeout: 5000 });

		const wasSuccess = await row.locator('button.status-success').count() > 0;
		await toggleBtn.click();

		// After toggle, the class should change
		if (wasSuccess) {
			await expect(row.locator('button.status-muted')).toBeVisible({ timeout: 5000 });
		} else {
			await expect(row.locator('button.status-success')).toBeVisible({ timeout: 5000 });
		}

		// Toggle back to restore original state
		const restoreBtn = row.locator('button.status-success, button.status-muted');
		await restoreBtn.click();
	});

	test('delete snippet with confirmation', async ({ page }) => {
		await openStaticPages(page);
		await page.locator('[data-test-id="tabnav-btn-snippets"]').click();

		// Find snippet row and click delete
		const row = page.locator(`tr:has(td:has-text("${TEST_SNIPPET_SLUG}"))`);
		await expect(row).toBeVisible({ timeout: 10000 });

		const deleteBtn = row.locator('button.text-danger').first();
		await deleteBtn.click();

		// Confirm dialog should appear
		await expect(page.locator('[data-test-id="modal-confirm-btn"]')).toBeVisible({ timeout: 5000 });
		await page.locator('[data-test-id="modal-confirm-btn"]').click();

		// Snippet should be gone from the list
		await expect(row).not.toBeVisible({ timeout: 5000 });
	});
});
