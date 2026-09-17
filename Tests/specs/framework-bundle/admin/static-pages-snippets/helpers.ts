/**
 * Общее для проверок сниппетов: метка воркера в именах и навигация по
 * вкладке сниппетов.
 */

import { test, expect } from '../../../../helpers/scoped-test';
import { DB } from '../../../../helpers/db/db';
import type { Page } from '@playwright/test';

export const TS = `w${process.env.TEST_PARALLEL_INDEX ?? '0'}`;

// ── Helpers ──────────────────────────────────────────────────────────────────

// `ensureAdminAuth` re-login dance is no longer needed — see notes in
// static-pages.spec.ts. Under nginx + 32-worker php-cgi pool +
// PW_WORKER_ISOLATION, sessions are per-worker-DB-scoped and there's
// no shared-token leak path that the workaround used to paper over.

export async function openStaticPages(page: Page) {
	await page.goto('/admin/pages/', { waitUntil: 'domcontentloaded' });
	// Under full-suite 6-worker load this island's hydration can queue
	// behind other workers' php-cgi requests — 20s wasn't always enough
	// margin (same root cause as static-pages.spec.ts's identical helper).
	await expect(page.locator('[data-test-id="admin-static-pages"]')).toBeVisible({ timeout: 30000 });
}

export async function switchToSnippetsTab(page: Page) {
	await page.locator('[data-test-id="tabnav-btn-snippets"]').click();
	await expect(page.locator('[data-test-id="tabnav-btn-snippets"]')).toHaveAttribute('aria-selected', 'true');
}

export async function createSnippetViaUI(page: Page, slug: string, name: string, type: string) {
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

export async function openSnippetEditor(page: Page, slug: string) {
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
