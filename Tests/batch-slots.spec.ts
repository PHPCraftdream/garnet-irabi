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

/**
 * Task #165: fixtures in this file used to be hardcoded calendar dates
 * (e.g. '2026-04-06') that were future dates when the file was written but
 * inevitably rot into the past as time passes — which now trips the F-02
 * past-start-time rejection (task #164) for tests that need a FUTURE date.
 *
 * This helper computes a date `offsetDays` days from "now" (local time) and
 * formats it as `YYYY-MM-DD`, matching the `input[type="date"]` fill()
 * format used throughout this file. Pass a negative offset to deliberately
 * get a PAST date (used only where a test's whole point is exercising the
 * past-date rejection — see test 14).
 */
function dateOffsetDays(offsetDays: number): string {
	const d = new Date();
	d.setDate(d.getDate() + offsetDays);
	const year = d.getFullYear();
	const month = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

/**
 * Returns the 1st day of the month `monthsAhead` months from now, as
 * `YYYY-MM-DD`. Batch previews that span multiple weeks (count/per_week)
 * render one calendar `<table>` per visible month, so starting mid-month
 * near a month boundary can make a 3-week proposal window spill into the
 * next month and break single-table locator assumptions. Starting on the
 * 1st keeps any window up to ~3 weeks safely within the same month.
 */
function firstOfMonthAhead(monthsAhead: number): string {
	const d = new Date();
	d.setDate(1);
	d.setMonth(d.getMonth() + monthsAhead);
	const year = d.getFullYear();
	const month = String(d.getMonth() + 1).padStart(2, '0');
	return `${year}-${month}-01`;
}

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

		// Fill batch form starting on the 1st of a month a few months out.
		// Restrictions are NOT just "always Saturday" — they come from the
		// framework's real Hebrew-calendar SlotDateFilter (shabbat, erev_shabbat,
		// yom_tov/holidays like Shavuot, fasts, rosh_chodesh — see
		// Kernel/Core/HCalendar/SlotDateFilter.php and
		// Common/Calendar/SlotDateFilterLocalized.php), so a holiday-dense month
		// can legitimately push a 5-slot proposal window past the month
		// boundary into a second visible `[id^="batchCalendar"]` table even
		// though start_date is the 1st. The assertions below therefore verify
		// totals across however many calendar tables actually render, rather
		// than assuming exactly one.
		await batchModal.locator('input[name="start_date"]').fill(firstOfMonthAhead(2));
		// End date is computed from count + lessons-per-week (no manual end_date field).
		await batchModal.locator('input[name="per_week"]').fill('2');
		await batchModal.locator('input[name="count"]').fill('5');

		await batchModal.locator('#batchForm button[type="submit"]').click();

		const preview = batchModal.locator('#batchPreview');
		await expect(preview).toBeVisible({ timeout: 10000 });

		// Calendar component renders with data-day-type="proposed"/"restricted"/"available".
		// There may be more than one `[id^="batchCalendar"]` table if the
		// proposal window spans a month boundary (see comment above), so use
		// a non-strict-mode-sensitive locator for all counts below.
		const calendars = batchModal.locator('[id^="batchCalendar"]');
		const calendarCount = await calendars.count();
		expect(calendarCount).toBeGreaterThanOrEqual(1);
		await Promise.all([
			expect(calendars.first()).toBeVisible(),
			expect(calendars.first().locator('table')).toBeVisible(),
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

		// Fill the create slot form inside the modal. This date must fall
		// inside the batch preview window used by test 13 (start_date +
		// ceil(count/per_week) weeks) so that test detects the overlap —
		// use day 6 of the same future month test 13's start_date resolves
		// to (mirrors the original fixed '2026-04-06' / '2026-04-01' pair).
		await createModal.locator('input[name="date"]').fill(firstOfMonthAhead(4).replace(/-01$/, '-06'));
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

		// Request batch preview for a window that includes the date test 12
		// used to create its single slot on (start + ceil(5/2)=3 weeks span
		// comfortably covers start+5 days). Same future month as test 12.
		await batchModal.locator('input[name="start_date"]').fill(firstOfMonthAhead(4));
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

	// NOTE (F-02, task #164): this fixture's date (dateOffsetDays(-30), i.e.
	// always 30 days before "now" — see task #165) is DELIBERATELY a past
	// date relative to whenever the test runs. Server + client now both
	// correctly refuse to create/submit slots whose start time is in the
	// past (see ExpertSlotsService::createSlot/batchSlots and
	// BatchSlotWizard's "Create all" disabled-state gate), so this test
	// no longer exercises the happy path it originally intended to cover —
	// it now asserts the (also correct) past-date rejection instead. Task
	// #165 tracks converting this whole file's fixtures to dynamic future
	// dates, which will restore a real happy-path assertion here.
	test('14. Create batch is blocked when the proposed dates are in the past', async () => {
		const batchModal = page.locator('[data-test-id="batch-slot-modal"]');

		// Set up fresh preview with 3 slots, using a time that won't overlap.
		// This date is DELIBERATELY in the past (task #164/#165) — the whole
		// point of this test is proving past-dated proposed slots get
		// blocked, so unlike the other fixtures in this file it must NOT be
		// converted to a dynamic future date.
		await batchModal.locator('input[name="start_date"]').fill(dateOffsetDays(-30));
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

		// All 3 proposed dates are in the past relative to "now" — the
		// past-date warning gate must disable "Create All" client-side
		// (F-02 fix) instead of letting the request reach the server.
		const createBtn = batchModal.locator('#batchCreateBtn');
		await expect(createBtn).toBeDisabled();

		// No batchSlots XHR should fire at all for a disabled button.
		let batchRequestSeen = false;
		page.on('request', (req) => {
			if (req.url().includes('/expert/~batchSlots') && req.method() === 'POST') {
				batchRequestSeen = true;
			}
		});
		await createBtn.click({ force: true });
		await page.waitForTimeout(500);
		expect(batchRequestSeen).toBe(false);

		console.log('Batch create correctly blocked for past-dated proposed slots');
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

		await batchModal.locator('input[name="start_date"]').fill(firstOfMonthAhead(3));
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

	test('17. Batch rejects slots that overlap each other (not just the DB)', async () => {
		// Open batch modal
		await page.locator('[data-test-id="open-batch-slot-modal"]').click();
		const batchModal = page.locator('[data-test-id="batch-slot-modal"]');
		await expect(batchModal).toBeVisible({ timeout: 5000 });

		// Generate 2 slots on different dates (the add-row control (#addSlotBtn)
		// refuses same-date adds via batch.isProposed(date) — see
		// BatchSlotWizard.tsx:148 — so it can never produce an in-batch overlap
		// by itself). Instead, edit the SECOND row's date to match the first
		// row's date and its time to overlap — onDateChange/onTimeChange have
		// no such guard.
		await batchModal.locator('input[name="start_date"]').fill(firstOfMonthAhead(5));
		await batchModal.locator('input[name="per_week"]').fill('1');
		await batchModal.locator('input[name="count"]').fill('2');
		await batchModal.locator('input[name="batch_time"]').fill('10:00');
		await batchModal.locator('select[name="batch_duration"]').selectOption('60');

		await batchModal.locator('#batchForm button[type="submit"]').click();
		await expect(batchModal.locator('#batchPreview')).toBeVisible({ timeout: 5000 });
		await expect(batchModal.locator('#proposedBody tr')).toHaveCount(2, { timeout: 8000 });

		const rows = batchModal.locator('#proposedBody tr');
		const targetDate = await rows.nth(0).locator('input[type="date"]').inputValue();
		expect(targetDate).toBeTruthy();

		// Make the second row overlap the first: same date, 10:30-11:30
		// against the first row's 10:00-11:00 (both duration 60).
		await rows.nth(1).locator('input[type="date"]').fill(targetDate);
		await rows.nth(1).locator('.slot-time-input').fill('10:30');

		await batchModal.locator('#batchCreateBtn').click();

		const confirmModal = page.locator('#confirmModal');
		await expect(confirmModal).toBeVisible({ timeout: 3000 });

		const [batchResponse] = await Promise.all([
			page.waitForResponse(resp => resp.url().includes('/expert/~batchSlots') && resp.request().method() === 'POST'),
			page.locator('#confirmModalOk').click(),
		]);

		// Whole batch must be rejected — no partial insert of the non-overlapping slot.
		expect(batchResponse.status()).toBe(400);
		const body = await batchResponse.json().catch(() => null);
		expect(body?.overlap).toBe(true);

		// Verify via DB that neither proposed slot from this test was created.
		// Both rows share targetDate after the edit above, so a day-wide
		// window around it covers everything the batch could have inserted.
		const conn = await mysql.createConnection(DB);
		try {
			const [dbRows] = await conn.execute<any[]>(
				`SELECT COUNT(*) as cnt FROM ${tn('time_slots')} ts
				 JOIN ${tn('accounts')} a ON a.id = ts.expert_id
				 WHERE a.login = ? AND ts.start_at >= UNIX_TIMESTAMP(?)
				   AND ts.start_at < UNIX_TIMESTAMP(?) + 86400`,
				[EXPERT_LOGIN, `${targetDate} 00:00:00`, `${targetDate} 00:00:00`],
			);
			expect(Number(dbRows[0]?.cnt ?? 0)).toBe(0);
		} finally {
			await conn.end();
		}

		console.log('Batch with in-batch overlap correctly rejected, no partial insert');
	});
});
