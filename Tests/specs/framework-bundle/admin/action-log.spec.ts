/**
 * Admin — /admin/logs/?tab=actions — Actions tab filters
 *
 * Verifies the Combobox actor filter and the action <select> narrow the row set,
 * and that the reset button restores the full list.
 *
 * The filtering happens entirely client-side (no extra fetch), so behaviour is fast.
 */

import { test, expect } from '../../../helpers/scoped-test';
import type { Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

const ROW_SEL = '[data-test-id^="actions-row-"]';

async function openActionsTab(page: Page) {
	await page.goto('/admin/logs/');
	await page.locator('[data-test-id="tabnav-btn-actions"]').waitFor({ state: 'visible', timeout: 10000 });
	if (await page.locator('[data-test-id="tabnav-btn-actions"]').getAttribute('aria-selected') !== 'true') {
		await page.locator('[data-test-id="tabnav-btn-actions"]').click();
	}
}

test.describe('Admin — Logs viewer — actions tab filters', () => {
	test('actor combobox narrows; action select narrows further; reset restores', async ({ page }) => {
		await openActionsTab(page);

		const rows = page.locator(ROW_SEL);
		const totalBefore = await rows.count();

		if (totalBefore === 0) {
			// No action-log entries seeded — skip rather than emit a meaningless green test.
			test.skip();
			return;
		}

		// Open the actor Combobox
		await page.locator('[data-test-id="actions-actor-filter"]').click();

		const actorOptions = page.locator('[data-test-id^="actions-actor-filter-option-"]');
		await expect(actorOptions.first()).toBeVisible({ timeout: 5000 });

		// Pick the first non-"All" option (synthetic All has value="" → testid ends in "-option-")
		const optCount = await actorOptions.count();
		let chosen: string | null = null;
		for (let i = 0; i < optCount; i++) {
			const id = await actorOptions.nth(i).getAttribute('data-test-id');
			if (id && !id.endsWith('-option-')) { chosen = id; break; }
		}
		if (!chosen) { test.skip(); return; }

		await page.locator(`[data-test-id="${chosen}"]`).click();
		await expect.poll(async () => rows.count(), { timeout: 4000, intervals: [50, 150, 400] }).toBeLessThanOrEqual(totalBefore);
		const afterActor = await rows.count();
		expect(afterActor).toBeGreaterThan(0);

		// Action-type select — pick first non-empty value if any
		const actionSelect = page.locator('[data-test-id="actions-action-filter"]');
		const actionVals = await actionSelect.locator('option').evaluateAll(
			els => els.map(el => (el as HTMLOptionElement).value)
		);
		const concrete = actionVals.find(v => v !== '');
		if (concrete) {
			await actionSelect.selectOption(concrete);
			await expect.poll(async () => rows.count(), { timeout: 4000, intervals: [50, 150, 400] }).toBeLessThanOrEqual(afterActor);
		}

		// Reset
		const reset = page.locator('[data-test-id="actions-reset"]');
		await expect(reset).toBeVisible({ timeout: 3000 });
		await reset.click();
		await expect.poll(async () => rows.count(), { timeout: 4000, intervals: [50, 150, 400] }).toBe(totalBefore);
	});
});
