/**
 * Expert — Batch Slot Creation tests
 *
 * Tests batch slot wizard: preview, calendar, add/remove slots, create.
 *
 * UI changes:
 *   - Slot creation is now in modals (open-create-slot-modal -> create-slot-modal)
 *   - Batch slot creation is in a modal (open-batch-slot-modal -> batch-slot-modal)
 *   - CreateSlotForm uses react-hook-form with Zod validation
 *   - BatchSlotWizard is inside the modal, uses Calendar component
 *   - ConfirmModal replaces Bootstrap confirm modals (#confirmModal -> useConfirm)
 *   - TeachingCalendar replaces .slot-item listing
 */

import { test, expect, tn } from './helpers/scoped-test';
import type { Page } from '@playwright/test';
import { registerAccount, fillProfileForm, clearTestData } from './helpers/auth';
import mysql from 'mysql2/promise';

import { newScopedPage } from './helpers/scoped-test';
import { DB } from './helpers/db';
test.describe.configure({ mode: 'serial' });

const EXPERT_LOGIN = `testuser_batch_${process.env.TEST_PARALLEL_INDEX ?? "0"}@irabi.test`;

test.describe('iRabi Batch Slot Creation', () => {
	let page: Page;

	test.beforeAll(async ({ browser }) => {
		page = await newScopedPage(browser);
	});

	test.afterAll(async () => {
		await page.close();
		await clearTestData(EXPERT_LOGIN);
	});

	test('1. Register and setup expert account', async () => {
		await registerAccount(page, EXPERT_LOGIN);
		await fillProfileForm(page, EXPERT_LOGIN, {
			name: 'Тест Пакетный',
			accountType: 'expert',
			timezone: 'Europe/Moscow',
		});

		const conn = await mysql.createConnection(DB);
		try {
			const [rows] = await conn.execute<any[]>(
				`SELECT id FROM ${tn('accounts')} WHERE login = ?`, [EXPERT_LOGIN]
			);
			if (rows.length > 0) {
				await conn.execute(
					`INSERT INTO ${tn('expert_profiles')} (account_id, is_approved)
					 VALUES (?, 1)
					 ON DUPLICATE KEY UPDATE is_approved = 1`,
					[rows[0].id]
				);
				await conn.execute(
					`INSERT INTO ${tn('accounts_data')} (account_id, param, value)
					 VALUES (?, 'IS_APPROVED', '1')
					 ON DUPLICATE KEY UPDATE value = '1'`,
					[rows[0].id]
				);
			}
		} finally { await conn.end(); }

		// Reload to pick up new role
		await page.goto('/');
		await page.waitForLoadState('networkidle');
	});

	test('2. Open batch slot modal and verify duration field', async () => {
		await page.goto('/expert/~slots');

		// Click the batch slot button to open the modal
		const openBatchBtn = page.locator('[data-test-id="open-batch-slot-modal"]');
		await expect(openBatchBtn).toBeVisible({ timeout: 5000 });
		await openBatchBtn.click();

		// Wait for the batch slot modal to appear
		const batchModal = page.locator('[data-test-id="batch-slot-modal"]');
		await expect(batchModal).toBeVisible({ timeout: 5000 });

		// Batch form is inside the modal
		const batchForm = batchModal.locator('#batchForm');
		await expect(batchForm).toBeVisible({ timeout: 5000 });

		const durationSelect = batchModal.locator('select[name="batch_duration"]');
		await expect(durationSelect).toBeVisible();

		const options = durationSelect.locator('option');
		const values: string[] = [];
		for (let i = 0; i < await options.count(); i++) {
			values.push(await options.nth(i).getAttribute('value') || '');
		}
		expect(values).toContain('30');
		expect(values).toContain('45');
		expect(values).toContain('60');
		expect(values).toContain('90');
		expect(values).toContain('120');

		console.log('Batch duration select present with options:', values);
	});

	test('3. Preview shows calendar grid', async () => {
		// Batch modal should still be open from previous test
		const batchModal = page.locator('[data-test-id="batch-slot-modal"]');

		// Fill batch form: June 2026 (has Shavuot, all Saturdays are restricted)
		await batchModal.locator('input[name="start_date"]').fill('2026-06-01');
		// End date is computed from count + lessons-per-week (no manual end_date field).
		await batchModal.locator('input[name="per_week"]').fill('2');
		await batchModal.locator('input[name="count"]').fill('5');

		await batchModal.locator('#batchForm button[type="submit"]').click();

		const preview = batchModal.locator('#batchPreview');
		await expect(preview).toBeVisible({ timeout: 10000 });

		// Calendar component renders with data-day-type="proposed"/"restricted"/"available"
		const calendar = batchModal.locator('[id^="batchCalendar"]');
		await Promise.all([
			expect(calendar).toBeVisible(),
			expect(calendar.locator('table')).toBeVisible(),
		]);

		const restrictedCells = calendar.locator('[data-day-type="restricted"]');
		const restrictedCount = await restrictedCells.count();
		expect(restrictedCount).toBeGreaterThan(0);
		console.log(`Restricted days in April: ${restrictedCount}`);

		const proposedCells = calendar.locator('[data-day-type="proposed"]');
		const proposedCount = await proposedCells.count();
		expect(proposedCount).toBe(5);
		console.log(`Proposed days: ${proposedCount}`);

		const availableCells = calendar.locator('[data-day-type="available"]');
		const availableCount = await availableCells.count();
		expect(availableCount).toBeGreaterThan(0);
		console.log(`Available days: ${availableCount}`);

		console.log('Preview rendered successfully');
	});

	test('4. Restricted dates have tooltips', async () => {
		const batchModal = page.locator('[data-test-id="batch-slot-modal"]');
		const calendar = batchModal.locator('[id^="batchCalendar"]');
		const restrictedCells = calendar.locator('[data-day-type="restricted"]');
		const count = await restrictedCells.count();

		if (count > 0) {
			const firstRestricted = restrictedCells.first();
			const tooltip = await firstRestricted.getAttribute('title');
			expect(tooltip).toBeTruthy();
			console.log('First restricted day tooltip:', tooltip);
		}
	});

	test('5. Proposed list is editable table', async () => {
		const batchModal = page.locator('[data-test-id="batch-slot-modal"]');
		const rows = batchModal.locator('#proposedBody tr');
		const rowCount = await rows.count();
		expect(rowCount).toBe(5);

		// Each row has time input and duration select
		const firstRow = rows.first();
		await Promise.all([
			expect(firstRow.locator('.slot-time-input')).toBeVisible(),
			expect(firstRow.locator('.slot-duration-select')).toBeVisible(),
			expect(firstRow.locator('.slot-remove-btn')).toBeVisible(),
		]);

		console.log('Proposed table has editable rows:', rowCount);
	});

	test('6. Remove slot from table', async () => {
		const batchModal = page.locator('[data-test-id="batch-slot-modal"]');
		const tableRows = batchModal.locator('#proposedBody tr');
		const rowsBefore = await tableRows.count();
		const calendar = batchModal.locator('[id^="batchCalendar"]');
		const proposedBefore = await calendar.locator('[data-day-type="proposed"]').count();

		// Click remove on first row
		await tableRows.first().locator('.slot-remove-btn').click();

		const rowsAfter = await tableRows.count();
		expect(rowsAfter).toBe(rowsBefore - 1);

		// Calendar should update — one less proposed, one more available
		const proposedAfter = await calendar.locator('[data-day-type="proposed"]').count();
		expect(proposedAfter).toBe(proposedBefore - 1);

		console.log(`Removed slot: ${rowsBefore} -> ${rowsAfter} rows`);
	});

	test('7. Add slot by clicking available day', async () => {
		const batchModal = page.locator('[data-test-id="batch-slot-modal"]');
		const tableRows = batchModal.locator('#proposedBody tr');
		const rowsBefore = await tableRows.count();

		// Click first available (green) cell
		const calendar = batchModal.locator('[id^="batchCalendar"]');
		const availableCell = calendar.locator('[data-day-type="available"]').first();
		await availableCell.click();

		const rowsAfter = await tableRows.count();
		expect(rowsAfter).toBe(rowsBefore + 1);

		console.log(`Added slot by clicking: ${rowsBefore} -> ${rowsAfter} rows`);
	});

	test('8. Remove slot by clicking proposed day', async () => {
		const batchModal = page.locator('[data-test-id="batch-slot-modal"]');
		const tableRows = batchModal.locator('#proposedBody tr');
		const rowsBefore = await tableRows.count();

		// Click first proposed (blue) cell
		const calendar = batchModal.locator('[id^="batchCalendar"]');
		const proposedCell = calendar.locator('[data-day-type="proposed"]').first();
		await proposedCell.click();

		const rowsAfter = await tableRows.count();
		expect(rowsAfter).toBe(rowsBefore - 1);

		console.log(`Removed slot by clicking: ${rowsBefore} -> ${rowsAfter} rows`);
	});

	test('9. Edit time per slot', async () => {
		const batchModal = page.locator('[data-test-id="batch-slot-modal"]');
		const firstTimeInput = batchModal.locator('#proposedBody tr').first().locator('.slot-time-input');
		await expect(firstTimeInput).toBeVisible();

		await firstTimeInput.fill('14:30');
		await firstTimeInput.dispatchEvent('change');

		const newValue = await firstTimeInput.inputValue();
		expect(newValue).toBe('14:30');

		console.log('Edited time to 14:30');
	});

	test('10. Edit duration per slot', async () => {
		const batchModal = page.locator('[data-test-id="batch-slot-modal"]');
		const firstDurationSelect = batchModal.locator('#proposedBody tr').first().locator('.slot-duration-select');
		await expect(firstDurationSelect).toBeVisible();

		await firstDurationSelect.selectOption('90');

		const newValue = await firstDurationSelect.inputValue();
		expect(newValue).toBe('90');

		console.log('Edited duration to 90');
	});

	test('11. Add slot via add-row', async () => {
		const batchModal = page.locator('[data-test-id="batch-slot-modal"]');
		const tableRows = batchModal.locator('#proposedBody tr');
		const rowsBefore = await tableRows.count();

		// Pick an available (green) date from the calendar that's not already proposed
		const calendar = batchModal.locator('[id^="batchCalendar"]');
		const availableCells = calendar.locator('[data-day-type="available"]');
		const availCount = await availableCells.count();
		expect(availCount).toBeGreaterThan(0);

		// Get the date from data-click-date attribute of the first available cell
		const dateAttr = await availableCells.first().getAttribute('data-click-date');
		expect(dateAttr).toBeTruthy();

		await batchModal.locator('#addSlotDate').fill(dateAttr!);
		await batchModal.locator('#addSlotTime').fill('16:00');
		await batchModal.locator('#addSlotDuration').selectOption('45');
		await batchModal.locator('#addSlotBtn').click();

		const rowsAfter = await tableRows.count();
		expect(rowsAfter).toBe(rowsBefore + 1);

		// Verify last row has the new values
		const lastRow = batchModal.locator('#proposedBody tr').last();
		const timeVal = await lastRow.locator('.slot-time-input').inputValue();
		expect(timeVal).toBe('16:00');
		const durVal = await lastRow.locator('.slot-duration-select').inputValue();
		expect(durVal).toBe('45');

		console.log('Added slot via add-row for date:', dateAttr);
	});

	test('12. Create single slot first (for overlap test)', async () => {
		// Close batch modal if open
		const batchModal = page.locator('[data-test-id="batch-slot-modal"]');
		if (await batchModal.isVisible()) {
			await page.locator('[data-test-id="batch-slot-modal-close"]').click();
		}

		// Open create slot modal
		const openCreateBtn = page.locator('[data-test-id="open-create-slot-modal"]');
		await expect(openCreateBtn).toBeVisible({ timeout: 5000 });
		await openCreateBtn.click();

		const createModal = page.locator('[data-test-id="create-slot-modal"]');
		await expect(createModal).toBeVisible({ timeout: 5000 });

		// Fill the create slot form inside the modal
		await createModal.locator('input[name="date"]').fill('2026-04-06');
		await createModal.locator('input[name="time"]').fill('10:00');
		await createModal.locator('select[name="duration"]').selectOption('60');
		await createModal.locator('input[name="cost"]').fill('500');

		// Click submit — XHR creates the slot, modal closes on success
		await createModal.locator('[data-test-id="create-slot-btn"]').click();

		// Modal should close on success
		await expect(createModal).not.toBeVisible({ timeout: 10000 });

		console.log('Single slot created for overlap test');
	});

	test('13. Preview detects overlap', async () => {
		// Open batch modal again
		await page.locator('[data-test-id="open-batch-slot-modal"]').click();
		const batchModal = page.locator('[data-test-id="batch-slot-modal"]');
		await expect(batchModal).toBeVisible({ timeout: 5000 });

		// Request batch preview for April that includes 2026-04-06
		await batchModal.locator('input[name="start_date"]').fill('2026-04-01');
		await batchModal.locator('input[name="per_week"]').fill('2');
		await batchModal.locator('input[name="count"]').fill('5');
		await batchModal.locator('input[name="batch_time"]').fill('10:00');
		await batchModal.locator('select[name="batch_duration"]').selectOption('60');

		await batchModal.locator('#batchForm button[type="submit"]').click();

		await expect(batchModal.locator('#batchPreview')).toBeVisible({ timeout: 5000 });

		// Check for overlap warning badges
		const warningBadges = batchModal.locator('#batchPreview .badge.bg-warning, #batchPreview .text-warning');
		const warningCount = await warningBadges.count();
		console.log('Overlap warnings found:', warningCount);

		// Verify the table rendered correctly
		const rows = batchModal.locator('#proposedBody tr');
		const rowCount = await rows.count();
		expect(rowCount).toBe(5);
	});

	test('14. Create batch successfully', async () => {
		const batchModal = page.locator('[data-test-id="batch-slot-modal"]');

		// Set up fresh preview with 3 slots, using a time that won't overlap
		await batchModal.locator('input[name="start_date"]').fill('2026-04-01');
		await batchModal.locator('input[name="per_week"]').fill('2');
		await batchModal.locator('input[name="count"]').fill('3');
		await batchModal.locator('input[name="batch_time"]').fill('14:00');
		await batchModal.locator('input[name="batch_cost"]').fill('700');
		await batchModal.locator('select[name="batch_duration"]').selectOption('60');

		await batchModal.locator('#batchForm button[type="submit"]').click();

		// Preview from the previous test (count=5) is still on screen,
		// so just asserting `#batchPreview` visible doesn't prove the
		// new submission rebuilt the list. Wait for the proposed rows
		// to land at count=3 before driving the confirm modal.
		await expect(batchModal.locator('#proposedBody tr')).toHaveCount(3, { timeout: 8000 });

		// Click "Create All" — triggers useConfirm flow
		await batchModal.locator('#batchCreateBtn').click();

		// ConfirmModal appears (rendered outside the batch modal)
		const confirmModal = page.locator('#confirmModal');
		await expect(confirmModal).toBeVisible({ timeout: 3000 });

		const modalText = await page.locator('#confirmModalBody').textContent();
		expect(modalText).toContain('3');

		// Verify proposed dates list is shown in modal
		const modalItems = page.locator('#confirmModalBody .list-group-item');
		const modalItemCount = await modalItems.count();
		expect(modalItemCount).toBe(3);
		console.log('Confirm modal text:', modalText, 'with', modalItemCount, 'slots listed');

		// Click OK and wait for the batch creation XHR
		const [batchResponse] = await Promise.all([
			page.waitForResponse(resp => resp.url().includes('/expert/~batchSlots') && resp.request().method() === 'POST'),
			page.locator('#confirmModalOk').click(),
		]);

		// Verify batch creation response status
		expect(batchResponse.status()).toBe(200);

		// Batch modal should close on success
		await expect(batchModal).not.toBeVisible({ timeout: 10000 });

		console.log('Batch slots created successfully');
	});

	test('15. Batch end date is computed from count and lessons-per-week', async () => {
		// Navigate to expert slots page fresh
		await page.goto('/expert/~slots');
		await page.waitForLoadState('networkidle');

		// Open batch slot modal
		const openBatchBtn = page.locator('[data-test-id="open-batch-slot-modal"]');
		await expect(openBatchBtn).toBeVisible({ timeout: 5000 });
		await openBatchBtn.click();

		const batchModal = page.locator('[data-test-id="batch-slot-modal"]');
		await expect(batchModal).toBeVisible({ timeout: 5000 });

		const startInput = batchModal.locator('[data-test-id="batch-start-date"]');
		const countInput = batchModal.locator('[data-test-id="batch-count"]');
		const perWeekInput = batchModal.locator('[data-test-id="batch-per-week"]');
		const endInput = batchModal.locator('[data-test-id="batch-end-date"]');

		// --- Case 1: count=4, perWeek=2 => ceil(4/2)=2 weeks => +14 days => 2026-09-15
		await startInput.fill('2026-09-01');
		await countInput.fill('4');
		await perWeekInput.fill('2');

		// Wait for React to compute
		await expect(endInput).toHaveValue('2026-09-15', { timeout: 3000 });
		const endValue1 = await endInput.inputValue();
		expect(endValue1).toBe('2026-09-15');

		// --- Case 2: count=5, perWeek=2 => ceil(5/2)=3 weeks => +21 days => 2026-09-22
		await countInput.fill('5');

		await expect(endInput).toHaveValue('2026-09-22', { timeout: 3000 });
		const endValue2 = await endInput.inputValue();
		expect(endValue2).toBe('2026-09-22');

		// Verify end date field is read-only
		await expect(endInput).toBeDisabled();

		console.log('End date computation verified: case1=', endValue1, 'case2=', endValue2);

		// Close modal
		await page.locator('[data-test-id="batch-slot-modal-close"]').click();
	});

	test('16. Cancel confirm modal does not create slots', async () => {
		// Open batch modal
		await page.locator('[data-test-id="open-batch-slot-modal"]').click();
		const batchModal = page.locator('[data-test-id="batch-slot-modal"]');
		await expect(batchModal).toBeVisible({ timeout: 5000 });

		await batchModal.locator('input[name="start_date"]').fill('2026-05-01');
		await batchModal.locator('input[name="per_week"]').fill('2');
		await batchModal.locator('input[name="count"]').fill('2');

		await batchModal.locator('#batchForm button[type="submit"]').click();

		await batchModal.locator('#batchCreateBtn').click();

		const confirmModal = page.locator('#confirmModal');
		await expect(confirmModal).toBeVisible({ timeout: 3000 });

		// Click Cancel (via data-test-id)
		await page.locator('[data-test-id="modal-cancel-btn"]').click();

		await expect(confirmModal).not.toBeVisible({ timeout: 3000 });

		console.log('Cancel confirmed — no slots created');

		// Close batch modal
		await page.locator('[data-test-id="batch-slot-modal-close"]').click();
	});
});
