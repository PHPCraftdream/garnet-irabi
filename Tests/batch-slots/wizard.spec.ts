/**
 * Мастер пакетного создания: предпросмотр, календарь, правка
 * предложенного списка.
 *
 * Часть разобранного batch-slots.spec.ts (был один файл на 594 строки).
 * Порядок внутри файла сохранён: шаги правят один и тот же список.
 */

import { test, expect, tn } from '../helpers/scoped-test';
import { newScopedPage } from '../helpers/scoped-test';
import type { Page } from '@playwright/test';
import { clearTestData, registerAccount, fillProfileForm } from '../helpers/auth';
import mysql from 'mysql2/promise';
import { DB } from '../helpers/db';
import { EXPERT_LOGIN, dateOffsetDays, firstOfMonthAhead, setupBatchExpert } from './helpers';

test.describe.configure({ mode: 'serial' });

test.describe('iRabi Batch Slot Creation — мастер', () => {
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

		// Fill batch form starting on the 1st of a month a few months out.
		// Restrictions are NOT just "always Saturday" — they come from the
		// framework's real Hebrew-calendar SlotDateFilter (shabbat, erev_shabbat,
		// yom_tov/holidays like Shavuot, fasts, rosh_chodesh — see
		// Kernel/Core/HCalendar/SlotDateFilter.php and
		// Common/Calendar/SlotDateFilterLocalized.php), so a holiday-dense month
		// can legitimately push a 5-slot proposal window past the month
		// boundary into a second calendar month even though start_date is
		// the 1st. The assertions below therefore verify totals across
		// however many months actually render, rather than assuming one.
		await batchModal.locator('input[name="start_date"]').fill(firstOfMonthAhead(2));
		// End date is computed from count + lessons-per-week (no manual end_date field).
		await batchModal.locator('input[name="per_week"]').fill('2');
		await batchModal.locator('input[name="count"]').fill('5');

		await batchModal.locator('#batchForm button[type="submit"]').click();

		const preview = batchModal.locator('#batchPreview');
		await expect(preview).toBeVisible({ timeout: 10000 });

		// Calendar component renders with data-day-type="proposed"/"restricted"/"available".
		// The `idPrefix` sits on ONE outer <div> wrapping every month; each
		// month renders as a <table> INSIDE that single container (see
		// Calendar.tsx), so `[id^="batchCalendar"]` always matches exactly
		// one element — but a proposal window spilling past a month boundary
		// renders 2+ <table>s inside it. Hence `.locator('table').first()`
		// below (`.first().locator('table')` is container-first and resolves
		// to 2+ tables under strict mode); the cell counts below aggregate
		// across the whole container, so they are spill-safe as-is.
		const calendars = batchModal.locator('[id^="batchCalendar"]');
		const calendarCount = await calendars.count();
		expect(calendarCount).toBeGreaterThanOrEqual(1);
		await Promise.all([
			expect(calendars.first()).toBeVisible(),
			expect(calendars.locator('table').first()).toBeVisible(),
		]);

		const restrictedCells = calendars.locator('[data-day-type="restricted"]');
		const restrictedCount = await restrictedCells.count();
		expect(restrictedCount).toBeGreaterThan(0);
		console.log(`Restricted days across ${calendarCount} calendar table(s): ${restrictedCount}`);

		const proposedCells = calendars.locator('[data-day-type="proposed"]');
		const proposedCount = await proposedCells.count();
		expect(proposedCount).toBe(5);
		console.log(`Proposed days: ${proposedCount}`);

		const availableCells = calendars.locator('[data-day-type="available"]');
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
});
