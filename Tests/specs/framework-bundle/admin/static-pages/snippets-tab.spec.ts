/**
 * Вкладка сниппетов: список, создание и правка вставок.
 */

import { test, expect, tn } from '../../../../helpers/scoped-test';
import { withConnection, DB } from '../../../../helpers/db/db';
import {
    TEST_SNIPPET_SLUG,
    TEST_SNIPPET_NAME,
    openStaticPages,
} from './helpers';

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
		const inputs = formSection.locator('input.static-admin-input');
		await inputs.nth(0).fill(TEST_SNIPPET_SLUG);
		await inputs.nth(1).fill(TEST_SNIPPET_NAME);

		// Select type "block" (default)
		const typeSelect = formSection.locator('select.static-admin-input');
		await typeSelect.selectOption('block');

		// Submit + wait for the `~snippetCreate` XHR before we navigate
		// back; the list reads need the row in DB.
		const submitBtn = formSection.locator('button.static-admin-create-submit').first();
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
		const filterButtons = page.locator('[data-test-id="admin-static-pages"] button.static-admin-filter');
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

		const editBtn = row.locator('button.static-admin-link').first();
		await editBtn.click();

		// The snippet editor tab should be visible
		const editorSection = page.locator('section.snippet-editor');
		await expect(editorSection).toBeVisible({ timeout: 8000 });

		// Textarea should be present
		const textarea = editorSection.locator('textarea.snippet-content');
		await expect(textarea).toBeVisible({ timeout: 5000 });
	});

	test('snippet editor has markdown toolbar for block type', async ({ page }) => {
		await openStaticPages(page);
		await page.locator('[data-test-id="tabnav-btn-snippets"]').click();

		// Open snippet editor
		const row = page.locator(`tr:has(td:has-text("${TEST_SNIPPET_SLUG}"))`);
		await expect(row).toBeVisible({ timeout: 10000 });
		await row.locator('button.static-admin-link').first().click();

		const editorSection = page.locator('section.snippet-editor');
		await expect(editorSection).toBeVisible({ timeout: 8000 });

		// For block type, markdown toolbar should be present (B = Bold button)
		const boldBtn = editorSection.locator('button.snippet-format-button').first();
		await expect(boldBtn).toBeVisible({ timeout: 5000 });
	});

	test('active/inactive toggle works', async ({ page }) => {
		await openStaticPages(page);
		await page.locator('[data-test-id="tabnav-btn-snippets"]').click();

		// Find snippet row
		const row = page.locator(`tr:has(td:has-text("${TEST_SNIPPET_SLUG}"))`);
		await expect(row).toBeVisible({ timeout: 10000 });

		// The active/inactive toggle button in the snippet row
		const toggleBtn = row.locator('button.static-admin-status[data-published="true"], button.static-admin-status[data-published="false"]');
		await expect(toggleBtn).toBeVisible({ timeout: 5000 });

		const wasSuccess = await row.locator('button.static-admin-status[data-published="true"]').count() > 0;
		await toggleBtn.click();

		// After toggle, the class should change
		if (wasSuccess) {
			await expect(row.locator('button.static-admin-status[data-published="false"]')).toBeVisible({ timeout: 5000 });
		} else {
			await expect(row.locator('button.static-admin-status[data-published="true"]')).toBeVisible({ timeout: 5000 });
		}

		// Toggle back to restore original state
		const restoreBtn = row.locator('button.static-admin-status[data-published="true"], button.static-admin-status[data-published="false"]');
		await restoreBtn.click();
	});

	test('delete snippet with confirmation', async ({ page }) => {
		await openStaticPages(page);
		await page.locator('[data-test-id="tabnav-btn-snippets"]').click();

		// Find snippet row and click delete
		const row = page.locator(`tr:has(td:has-text("${TEST_SNIPPET_SLUG}"))`);
		await expect(row).toBeVisible({ timeout: 10000 });

		const deleteBtn = row.locator('button.static-admin-delete').first();
		await deleteBtn.click();

		// Confirm dialog should appear
		await expect(page.locator('[data-test-id="modal-confirm-btn"]')).toBeVisible({ timeout: 5000 });
		await page.locator('[data-test-id="modal-confirm-btn"]').click();

		// Snippet should be gone from the list
		await expect(row).not.toBeVisible({ timeout: 5000 });
	});
});
