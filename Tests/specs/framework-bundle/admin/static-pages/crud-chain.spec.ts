/**
 * Цепочка жизни страницы: создание и правка в админке, показ на сайте,
 * разметка markdown, удаление.
 *
 * Все четыре группы лежат в ОДНОМ файле и внутри serial-обёртки
 * намеренно: они делят одну тестовую страницу (TEST_SLUG) и идут по
 * порядку. Растащить их по файлам значило бы превратить проверку
 * «страница создана → видна → отрисована → удалена» в четыре проверки
 * ни о чём.
 */

import { test, expect, tn } from '../../../../helpers/scoped-test';
import { withConnection, DB } from '../../../../helpers/db';
import mysql from 'mysql2/promise';
import {
    TEST_SLUG,
    TEST_TITLE,
    openStaticPages,
    waitForPageRow,
    openPageEditor,
} from './helpers';

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
