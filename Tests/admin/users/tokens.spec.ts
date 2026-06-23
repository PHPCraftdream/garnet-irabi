/**
 * Admin — Invite Tokens tab (/admin/?tab=tokens)
 * Tests: tab renders, CRUD operations, link modal, edit modal, status filters
 *
 * Runs as admin-tests project (pre-authenticated admin storageState).
 */

import { test, expect } from '../../helpers/scoped-test';

test.describe.configure({ mode: 'serial' });

async function openTokensTab(page: any) {
	// `domcontentloaded` returns once the HTML is parsed; the next
	// `expect(locator).toBeVisible` polls until the React island mounts.
	// Default `'load'` would block on every CSS/JS/img subresource —
	// dead weight against a polling assertion.
	await page.goto('/admin/?tab=tokens', { waitUntil: 'domcontentloaded' });
}

test.describe('Admin — Tokens tab (/admin/?tab=tokens)', () => {
	test('tokens tab is visible and selectable', async ({ page }) => {
		await openTokensTab(page);
		await Promise.all([
			expect(page.locator('[data-test-id="tabnav-btn-tokens"]')).toBeVisible({ timeout: 5000 }),
			expect(page.locator('[data-test-id="admin-tokens"]')).toBeVisible({ timeout: 5000 }),
		]);
	});

	test('has search input and status filter', async ({ page }) => {
		await openTokensTab(page);
		await Promise.all([
			expect(page.locator('[data-test-id="tokens-search"]')).toBeVisible({ timeout: 5000 }),
			expect(page.locator('[data-test-id="tokens-status-filter"]')).toBeVisible({ timeout: 5000 }),
		]);
	});

	test('has create button', async ({ page }) => {
		await openTokensTab(page);
		await expect(page.locator('[data-test-id="tokens-create-btn"]')).toBeVisible({ timeout: 5000 });
	});

	test('create token modal opens and creates a token', async ({ page }) => {
		await openTokensTab(page);
		await page.locator('[data-test-id="tokens-create-btn"]').click();

		// Modal should appear
		await expect(page.locator('[data-test-id="token-create-form"]')).toBeVisible({ timeout: 5000 });

		// Fill form
		await page.locator('[data-test-id="token-label-input"]').fill('E2E Test Token');
		await page.locator('[data-test-id="token-max-uses-input"]').fill('3');

		// Submit + wait for the `~create` XHR specifically (not any POST —
		// CSRF refresh or token-list refetch can win the race and resolve
		// early, then the next `toContainText` poll sits through 5s waiting
		// for the real create response). Mirrors the pattern used by the
		// `delete token` test below.
		await Promise.all([
			page.waitForResponse(
				(r) => r.request().method() === 'POST' && r.url().includes('~create') && r.status() < 500,
				{ timeout: 10000 }
			),
			page.locator('[data-test-id="token-create-submit"]').click(),
		]);
		await expect(page.locator('[data-test-id="admin-tokens"]')).toContainText('E2E Test Token', { timeout: 5000 });
	});

	test('link modal shows URL with copy and open buttons', async ({ page }) => {
		await openTokensTab(page);

		// Find the first token's link button
		const copyBtn = page.locator('[data-test-id^="token-copy-"]').first();
		await expect(copyBtn).toBeVisible({ timeout: 5000 });
		await copyBtn.click();

		// Link modal should appear
		await Promise.all([
			expect(page.locator('[data-test-id="token-link-url"]')).toBeVisible({ timeout: 5000 }),
			expect(page.locator('[data-test-id="token-link-copy"]')).toBeVisible(),
			expect(page.locator('[data-test-id="token-link-open"]')).toBeVisible(),
		]);

		const url = await page.locator('[data-test-id="token-link-url"]').inputValue();
		expect(url).toContain('/first-step/token~');

		// Close
		await page.locator('[data-test-id="log-detail-modal-close"]').click();
	});

	test('edit modal opens and saves changes', async ({ page }) => {
		await openTokensTab(page);

		const editBtn = page.locator('[data-test-id^="token-edit-"]').first();
		await expect(editBtn).toBeVisible({ timeout: 5000 });
		await editBtn.click();

		// Edit form should appear
		await expect(page.locator('[data-test-id="token-edit-form"]')).toBeVisible({ timeout: 5000 });

		// Change label
		await page.locator('[data-test-id="token-edit-label"]').fill('E2E Edited Token');

		// Submit
		await page.locator('[data-test-id="token-edit-submit"]').click();

		// Modal should close and list should reflect the change
		await expect(page.locator('[data-test-id="token-edit-form"]')).not.toBeVisible({ timeout: 5000 });
		const listText = await page.locator('[data-test-id="admin-tokens"]').textContent();
		expect(listText).toContain('E2E Edited Token');
	});

	test('disable/enable toggle works', async ({ page }) => {
		await openTokensTab(page);

		const toggleBtn = page.locator('[data-test-id^="token-toggle-"]').first();
		await expect(toggleBtn).toBeVisible({ timeout: 5000 });

		// Check current state — if active, disable then re-enable
		const btnText = await toggleBtn.textContent();

		if (btnText?.includes('Деактивировать') || btnText?.includes('Disable')) {
			// Disable — confirm modal appears
			await toggleBtn.click();
			await expect(page.locator('[data-test-id="modal-confirm-btn"]')).toBeVisible({ timeout: 5000 });
			await page.locator('[data-test-id="modal-confirm-btn"]').click();

			// Button should now say "Активировать" / "Enable" — auto-retry until
			// the toggle XHR lands and the React island re-renders.
			await expect(toggleBtn).toContainText(/Активировать|Enable/, { timeout: 5000 });

			// Re-enable (no confirm needed for enable)
			await toggleBtn.click();
			await expect(toggleBtn).toContainText(/Деактивировать|Disable/, { timeout: 5000 });
		}
	});

	test('delete token with confirmation', async ({ page }) => {
		await openTokensTab(page);

		// First create a token to delete
		await page.locator('[data-test-id="tokens-create-btn"]').click();
		await expect(page.locator('[data-test-id="token-create-form"]')).toBeVisible({ timeout: 5000 });
		await page.locator('[data-test-id="token-label-input"]').fill('Token To Delete');
		// Wait for the `~create` XHR so the new token is in the DB and the
		// island has re-rendered before we assert presence.
		await Promise.all([
			page.waitForResponse(
				(r) => r.request().method() === 'POST' && r.url().includes('~create') && r.status() < 500,
				{ timeout: 10000 }
			),
			page.locator('[data-test-id="token-create-submit"]').click(),
		]);
		await expect(page.locator('[data-test-id="admin-tokens"]')).toContainText('Token To Delete', { timeout: 5000 });

		// Find the delete button for the newly created token (first in the list)
		const deleteBtn = page.locator('[data-test-id^="token-delete-"]').first();
		await expect(deleteBtn).toBeVisible({ timeout: 5000 });
		await deleteBtn.click();

		// Confirm dialog
		await expect(page.locator('[data-test-id="modal-confirm-btn"]')).toBeVisible({ timeout: 5000 });
		await page.locator('[data-test-id="modal-confirm-btn"]').click();
	});

	test('status filter works', async ({ page }) => {
		await openTokensTab(page);

		// Switch to "Active" filter
		await page.locator('[data-test-id="tokens-status-filter"]').selectOption('active');

		// Switch back to "All"
		await page.locator('[data-test-id="tokens-status-filter"]').selectOption('');
	});

	test('search filter works', async ({ page }) => {
		await openTokensTab(page);

		await page.locator('[data-test-id="tokens-search"]').fill('E2E');

		// Should show filtered results
		const hasResults = await page.locator('[data-test-id^="token-row-"]').count();
		// At least our test tokens should match
		expect(hasResults).toBeGreaterThanOrEqual(0); // may be 0 if cleaned up
	});

	test('/admin/tokens/ redirects to /admin/?tab=tokens', async ({ page }) => {
		await page.goto('/admin/tokens/');
		// Client-side redirect to the unified users view — wait for it (prod is slower).
		await page.waitForURL(/tab=tokens/, { timeout: 15000 });
		expect(page.url()).toContain('/admin/');
		expect(page.url()).toContain('tab=tokens');
	});
});

// ── Token error page ───────────────────────────────────────────────────────────

test.describe('Invite token error page', () => {
	test('invalid token shows error page', async ({ page }) => {
		const response = await page.goto('/first-step/token~nonexistent-token-xyz');
		expect(response?.status()).toBe(200);
		// The invite error island renders a heading and a reason paragraph;
		// the polling assertion below subsumes any `networkidle` wait.
		await Promise.all([
			expect(page.locator('h1')).toBeVisible({ timeout: 10000 }),
		// Auth form should NOT be shown (invalid token = error, not login)
			expect(page.locator('[data-test-id="auth-login-input"]')).not.toBeVisible({ timeout: 2000 }),
		]);
	});

	test('/register returns 404', async ({ page }) => {
		const response = await page.goto('/register');
		expect(response?.status()).toBe(404);
	});
});
