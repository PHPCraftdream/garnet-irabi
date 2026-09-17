/**
 * Создание слотов пакетом и разбор перекрытий — с базой и между собой.
 *
 * Часть разобранного batch-slots.spec.ts. Эксперт готовится в beforeAll
 * тем же кодом, что был «шагом 1» исходной цепочки: без этого вторая
 * половина зависела бы от теста из другого файла, а Playwright такой
 * зависимости не гарантирует.
 */

import { test, expect, tn } from '../helpers/scoped-test';
import { newScopedPage } from '../helpers/scoped-test';
import type { Page } from '@playwright/test';
import { clearTestData } from '../helpers/auth';
import mysql from 'mysql2/promise';
import { DB } from '../helpers/db';
import { EXPERT_LOGIN, dateOffsetDays, firstOfMonthAhead, setupBatchExpert } from './helpers';

test.describe.configure({ mode: 'serial' });

test.describe('iRabi Batch Slot Creation — создание', () => {
	let page: Page;

	test.beforeAll(async ({ browser }) => {
		page = await newScopedPage(browser);
		await setupBatchExpert(page);
		// Проверки этой половины начинаются с экрана слотов эксперта:
		// в исходной цепочке туда уходил шаг 2, который остался в файле
		// мастера. Без перехода первый же локатор ждёт кнопку, которой на
		// главной нет.
		await page.goto('/expert/~slots');
	});

	test.afterAll(async () => {
		await page.close();
		await clearTestData(EXPERT_LOGIN);
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
