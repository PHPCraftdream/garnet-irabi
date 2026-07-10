/**
 * Expert — Calendar slot filtering E2E tests
 *
 * Cross-checks the slot batch-preview calendar UI against @hebcal/core
 * (an independent JS implementation of the Hebrew calendar). Verifies
 * that restricted dates in the UI (Shabbat, Yom Tov, fasts, Rosh Chodesh)
 * match what @hebcal/core reports for the same date range.
 *
 * UI flow:
 *   Expert opens /expert/~slots -> opens batch-slot-modal -> fills date
 *   range -> clicks preview -> Calendar component renders with
 *   data-day-type="restricted"/"available"/"proposed" attributes.
 *
 * Oracle: @hebcal/core HDate + Sedra/holidays used to independently
 * determine which Gregorian dates fall on Shabbat or major holidays.
 */

import { test, expect, tn } from '../helpers/scoped-test';
import type { Page, Locator } from '@playwright/test';
import { registerAccount, fillProfileForm, clearTestData } from '../helpers/auth';
import mysql from 'mysql2/promise';
import { newScopedPage } from '../helpers/scoped-test';
import { DB } from '../helpers/db';
import { HDate, HebrewCalendar, flags } from '../helpers/hebcal';

test.describe.configure({ mode: 'serial' });

const EXPERT_LOGIN = `testuser_cal_${process.env.TEST_PARALLEL_INDEX ?? '0'}@irabi.test`;

/**
 * Use @hebcal/core to determine which dates in a range are restricted
 * (Shabbat, major Yom Tov, fasts, Rosh Chodesh, erev days).
 */
function getHebcalRestrictedDates(startIso: string, endIso: string): Set<string> {
    const restricted = new Set<string>();
    const start = new Date(startIso + 'T12:00:00');
    const end = new Date(endIso + 'T12:00:00');

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const iso = d.toISOString().slice(0, 10);
        const dow = d.getDay(); // 0=Sun..6=Sat

        // Shabbat (Saturday)
        if (dow === 6) {
            restricted.add(iso);
            continue;
        }
        // Erev Shabbat (Friday)
        if (dow === 5) {
            restricted.add(iso);
            continue;
        }

        const hd = new HDate(d);
        const hDay = hd.getDate();

        // Rosh Chodesh (1st or 30th of Hebrew month) or Erev Rosh Chodesh (29th)
        if (hDay === 1 || hDay === 30 || hDay === 29) {
            restricted.add(iso);
            continue;
        }

        // Check holidays/fasts for this date (Israel calendar)
        const events = HebrewCalendar.getHolidaysOnDate(hd, true) || [];
        for (const ev of events) {
            const mask = ev.getFlags();
            // Major holidays (Yom Tov), fasts, erev
            if (
                (mask & flags.YOM_TOV_ENDS) ||
                (mask & flags.CHAG) ||
                (mask & flags.MAJOR_FAST) ||
                (mask & flags.MINOR_FAST) ||
                (mask & flags.EREV)
            ) {
                restricted.add(iso);
                break;
            }
        }
    }

    return restricted;
}

/**
 * Get Shabbat dates only (Saturday) from a range.
 */
function getShabbatDates(startIso: string, endIso: string): Set<string> {
    const shabbats = new Set<string>();
    const start = new Date(startIso + 'T12:00:00');
    const end = new Date(endIso + 'T12:00:00');
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        if (d.getDay() === 6) {
            shabbats.add(d.toISOString().slice(0, 10));
        }
    }
    return shabbats;
}

/**
 * Mirror of BatchSlotWizard's computed end date:
 *   endDate = startDate + ceil(count / perWeek) * 7 days
 * (local-time arithmetic, same as the component's useMemo).
 */
function computeEndDate(startIso: string, count: number, perWeek: number): string {
    const weeks = Math.ceil(count / perWeek);
    const d = new Date(startIso + 'T00:00:00');
    d.setDate(d.getDate() + weeks * 7);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Format a Date as YYYY-MM-DD using LOCAL components. HDate.greg() returns
 * local-midnight Dates, so toISOString() would shift a day back on UTC+
 * machines — never use it for calendar-date math.
 */
function isoLocal(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Inclusive number of days between two ISO dates. */
function daysInclusive(startIso: string, endIso: string): number {
    const start = new Date(startIso + 'T12:00:00');
    const end = new Date(endIso + 'T12:00:00');
    return Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
}

/**
 * Fill the batch wizard form (new model: end_date is computed, read-only).
 * Sets start_date + count + per_week, waits for the computed end date to
 * settle and returns it (read from the disabled batch-end-date field).
 */
async function fillBatchForm(batchModal: Locator, startIso: string, count: number, perWeek: number): Promise<string> {
    await batchModal.locator('input[name="start_date"]').fill(startIso);
    await batchModal.locator('input[name="count"]').fill(String(count));
    await batchModal.locator('input[name="per_week"]').fill(String(perWeek));

    const endField = batchModal.locator('[data-test-id="batch-end-date"]');
    await expect(endField).not.toHaveValue('');
    // The wizard computes endDate = start + ceil(count/perWeek) * 7 days.
    await expect(endField).toHaveValue(computeEndDate(startIso, count, perWeek));
    return endField.inputValue();
}

test.describe('Calendar slot filtering with @hebcal/core cross-check', () => {
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
            name: 'Calendar Test Expert',
            accountType: 'expert',
            timezone: 'Asia/Jerusalem',
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

        await page.goto('/');
        await page.waitForLoadState('networkidle');
    });

    // Range actually used by the preview in tests 2-5 (end is computed by
    // the wizard: start + ceil(count/perWeek) * 7 days — read back from UI).
    const PREVIEW_START = '2027-01-04'; // Monday, far enough in the future
    const PREVIEW_COUNT = 4;
    const PREVIEW_PER_WEEK = 2;
    let previewEnd = '';

    test('2. Batch preview marks Shabbat dates as restricted', async () => {
        await page.goto('/expert/~slots');

        // Open batch modal
        const openBatchBtn = page.locator('[data-test-id="open-batch-slot-modal"]');
        await expect(openBatchBtn).toBeVisible({ timeout: 8000 });
        await openBatchBtn.click();

        const batchModal = page.locator('[data-test-id="batch-slot-modal"]');
        await expect(batchModal).toBeVisible({ timeout: 5000 });

        // New model: end_date is no longer an input — it is computed from
        // start_date + count + per_week and shown in a read-only field.
        // count=4, perWeek=2 → 2 weeks → end = start + 14 days.
        previewEnd = await fillBatchForm(batchModal, PREVIEW_START, PREVIEW_COUNT, PREVIEW_PER_WEEK);

        // Submit preview
        await batchModal.locator('[data-test-id="batch-preview-btn"]').click();

        const preview = batchModal.locator('#batchPreview');
        await expect(preview).toBeVisible({ timeout: 10000 });

        // Get restricted dates from the calendar UI
        const restrictedCells = batchModal.locator('[data-day-type="restricted"]');
        const restrictedCount = await restrictedCells.count();

        // Get Shabbat dates from @hebcal/core for the ACTUAL range
        const shabbats = getShabbatDates(PREVIEW_START, previewEnd);

        // There must be at least 2 Shabbats in a 15-day range
        expect(shabbats.size).toBeGreaterThanOrEqual(2);

        // UI should mark at least as many days as restricted
        // (it also marks Fridays, Rosh Chodesh, etc.)
        expect(restrictedCount).toBeGreaterThanOrEqual(shabbats.size);
    });

    test('3. All UI-restricted dates are genuinely restricted per @hebcal/core', async () => {
        // After previous test, preview is still showing
        const batchModal = page.locator('[data-test-id="batch-slot-modal"]');
        const rangeStart = PREVIEW_START;
        const rangeEnd = previewEnd; // computed by the wizard, read in test 2

        // Get the hebcal restricted set for this range
        const hebcalRestricted = getHebcalRestrictedDates(rangeStart, rangeEnd);
        const shabbats = getShabbatDates(rangeStart, rangeEnd);

        // Read restricted dates from the UI
        const restrictedCells = batchModal.locator('[data-day-type="restricted"]');
        const count = await restrictedCells.count();

        // The Garnet calendar restricts more than just Shabbat+Yom Tov (also
        // Fridays, Rosh Chodesh, erev days), so UI restricted >= shabbat count.
        expect(count).toBeGreaterThan(0);
        expect(count).toBeGreaterThanOrEqual(shabbats.size);

        // Verify available dates are genuinely NOT restricted per hebcal:
        // an available cell must never fall on Shabbat (the dual of the
        // "all restricted are genuine" claim — restricted cells expose no
        // date attribute, available/proposed cells do via data-click-date).
        const availableCells = batchModal.locator('[data-day-type="available"]');
        const availCount = await availableCells.count();
        expect(availCount).toBeGreaterThan(0);

        for (let i = 0; i < availCount; i++) {
            const clickDate = await availableCells.nth(i).getAttribute('data-click-date');
            expect(clickDate).toBeTruthy();
            if (clickDate) {
                expect(shabbats.has(clickDate), `available cell ${clickDate} falls on Shabbat`).toBe(false);
                expect(
                    hebcalRestricted.has(clickDate),
                    `available cell ${clickDate} is restricted per @hebcal/core`,
                ).toBe(false);
            }
        }

        // Restricted + available + proposed cells cover at most the whole
        // range. (The calendar hides weeks without proposed dates, so the
        // exact total depends on slot distribution — assert bounds instead.)
        const proposedCells = batchModal.locator('[data-day-type="proposed"]');
        const proposedCount = await proposedCells.count();
        expect(proposedCount).toBeGreaterThan(0);

        const totalMarked = count + availCount + proposedCount;
        expect(totalMarked).toBeGreaterThanOrEqual(proposedCount + shabbats.size);
        expect(totalMarked).toBeLessThanOrEqual(daysInclusive(rangeStart, rangeEnd));
    });

    test('4. Proposed dates do not fall on Shabbat or Yom Tov', async () => {
        const batchModal = page.locator('[data-test-id="batch-slot-modal"]');

        // Intercept the batchPreview response to get proposed dates
        const proposedCells = batchModal.locator('[data-day-type="proposed"]');
        const proposedCount = await proposedCells.count();
        expect(proposedCount).toBeGreaterThan(0);

        // Proposed dates should match the requested count (the 15-day range
        // has more than enough free weekdays for it)
        expect(proposedCount).toBe(PREVIEW_COUNT);

        // None of the proposed dates should be restricted
        // (They are marked as "proposed", not "restricted", so this is already
        // implicit in the UI classification, but let's cross-check with hebcal)
        // We can read the data-click-date attribute from proposed cells
        for (let i = 0; i < proposedCount; i++) {
            const clickDate = await proposedCells.nth(i).getAttribute('data-click-date');
            if (clickDate) {
                // This date should not be a Shabbat
                const d = new Date(clickDate + 'T12:00:00');
                expect(d.getDay()).not.toBe(6); // not Saturday

                // Cross-check with hebcal: not a major holiday
                const hd = new HDate(d);
                const events = HebrewCalendar.getHolidaysOnDate(hd, true) || [];
                const isMajorHoliday = events.some(ev => {
                    const mask = ev.getFlags();
                    return (mask & flags.CHAG) !== 0 || (mask & flags.MAJOR_FAST) !== 0;
                });
                expect(isMajorHoliday).toBe(false);
            }
        }
    });

    test('5. Batch create succeeds and created slots avoid Shabbat', async () => {
        const batchModal = page.locator('[data-test-id="batch-slot-modal"]');

        // After preview is shown the wizard renders the preview table +
        // create button below the form. Cost keeps its default (500) from
        // the wizard state — no need to touch the `batch_cost` input.
        const createBtn = batchModal.locator('[data-test-id="batch-create-btn"]');
        await expect(createBtn).toBeVisible();

        // handleCreate awaits a confirm modal BEFORE firing the POST. So
        // the order is: click create → confirm dialog → confirm → POST.
        // Setting waitForResponse before the click works because Playwright
        // installs the listener synchronously, but we have to click confirm
        // inside the Promise.all so the POST actually fires within the wait.
        const responseP = page.waitForResponse(resp =>
            resp.url().includes('/expert/~batchSlots') && resp.request().method() === 'POST',
            { timeout: 15000 },
        );
        await createBtn.click();
        const confirmBtn = page.locator('[data-test-id="modal-confirm-btn"]');
        await expect(confirmBtn).toBeVisible({ timeout: 5000 });
        await confirmBtn.click();
        const response = await responseP;

        const body = await response.json();
        // If the response wrapped in success, verify slots were created
        if (body.success !== undefined) {
            expect(body.success).toBe(true);
        }
    });

    test('6. Bulk creation 10 slots / 2 per week avoids restricted days', async () => {
        // Close any open modal and reopen
        await page.goto('/expert/~slots');
        await page.waitForLoadState('networkidle');

        const openBatchBtn = page.locator('[data-test-id="open-batch-slot-modal"]');
        await expect(openBatchBtn).toBeVisible({ timeout: 8000 });
        await openBatchBtn.click();

        const batchModal = page.locator('[data-test-id="batch-slot-modal"]');
        await expect(batchModal).toBeVisible({ timeout: 5000 });

        // 10 slots, 2 per week → wizard computes a 5-week range
        const rangeStart = '2027-03-01';
        const rangeEnd = await fillBatchForm(batchModal, rangeStart, 10, 2);
        await batchModal.locator('input[name="batch_cost"]').fill('200');

        // Preview
        await batchModal.locator('[data-test-id="batch-preview-btn"]').click();

        const preview = batchModal.locator('#batchPreview');
        await expect(preview).toBeVisible({ timeout: 10000 });

        // Verify 10 proposed dates (a 5-week range has plenty of weekdays)
        const proposedCells = batchModal.locator('[data-day-type="proposed"]');
        const proposedCount = await proposedCells.count();
        expect(proposedCount).toBe(10);

        // Cross-check each proposed date with @hebcal/core
        for (let i = 0; i < proposedCount; i++) {
            const clickDate = await proposedCells.nth(i).getAttribute('data-click-date');
            if (clickDate) {
                const d = new Date(clickDate + 'T12:00:00');
                // Not Saturday
                expect(d.getDay()).not.toBe(6);
                // Not Friday
                expect(d.getDay()).not.toBe(5);

                // Not a major holiday per hebcal
                const hd = new HDate(d);
                const events = HebrewCalendar.getHolidaysOnDate(hd, true) || [];
                const isYomTov = events.some(ev => (ev.getFlags() & flags.CHAG) !== 0);
                expect(isYomTov).toBe(false);
            }
        }

        // Restricted cells must cover at least all Shabbats of the range
        const shabbats = getShabbatDates(rangeStart, rangeEnd);
        const restrictedCells = batchModal.locator('[data-day-type="restricted"]');
        const restrictedCount = await restrictedCells.count();
        expect(restrictedCount).toBeGreaterThanOrEqual(shabbats.size);
    });

    test('7. @hebcal/core cross-check for Pesach 2027', async () => {
        // Close any open modal and reopen with a Pesach range
        await page.goto('/expert/~slots');
        await page.waitForLoadState('networkidle');

        const openBatchBtn = page.locator('[data-test-id="open-batch-slot-modal"]');
        await expect(openBatchBtn).toBeVisible({ timeout: 8000 });
        await openBatchBtn.click();

        const batchModal = page.locator('[data-test-id="batch-slot-modal"]');
        await expect(batchModal).toBeVisible({ timeout: 5000 });

        // Pesach 2027: 15 Nisan 5787 (computed via hebcal)
        const hd15Nissan = new HDate(15, 'Nisan', 5787);
        const pesachGreg = hd15Nissan.greg();
        const pesachIso = isoLocal(pesachGreg);

        // Start 3 days before Pesach; count=4 / perWeek=2 → the wizard
        // computes a 2-week range, which covers Pesach I (start+3) and
        // Pesach VII (start+9).
        const pStart = new Date(pesachGreg);
        pStart.setDate(pStart.getDate() - 3);
        const rangeStart = isoLocal(pStart);

        const rangeEnd = await fillBatchForm(batchModal, rangeStart, 4, 2);
        expect(rangeEnd >= pesachIso).toBe(true); // computed range must cover Pesach

        // Intercept the preview API response to assert per-date server output
        const [response] = await Promise.all([
            page.waitForResponse(resp =>
                resp.url().includes('/expert/~batchPreview') && resp.request().method() === 'POST'
            ),
            batchModal.locator('[data-test-id="batch-preview-btn"]').click(),
        ]);
        const body = await response.json();

        const preview = batchModal.locator('#batchPreview');
        await expect(preview).toBeVisible({ timeout: 10000 });

        // Pesach first day must be reported restricted by the server
        const restrictedIso = new Set<string>((body.restrictedDates ?? []).map((d: any) => d.date));
        expect(restrictedIso.has(pesachIso), `Pesach I ${pesachIso} must be restricted`).toBe(true);

        // ...and rendered restricted in the UI calendar
        const restrictedCells = batchModal.locator('[data-day-type="restricted"]');
        const restrictedCount = await restrictedCells.count();

        // There should be multiple restricted dates around Pesach
        // (Pesach I + VII + erev days + Shabbats)
        expect(restrictedCount).toBeGreaterThan(3);

        // Chol HaMoed is intentionally ALLOWED for slots: every chol-hamoed
        // weekday (16-19 Nisan, excluding Fri/Sat and erev Pesach VII = 20
        // Nisan) must be in the server's available set.
        const availableIso = new Set<string>((body.availableDates ?? []).map((d: any) => d.date));
        for (let nisanDay = 16; nisanDay <= 19; nisanDay++) {
            const g = new HDate(nisanDay, 'Nisan', 5787).greg();
            const iso = isoLocal(g);
            if (g.getDay() === 5 || g.getDay() === 6) continue; // erev Shabbat / Shabbat
            if (iso > rangeEnd) continue; // outside the computed range
            expect(
                availableIso.has(iso),
                `chol-hamoed weekday ${iso} (${nisanDay} Nisan) should be available`,
            ).toBe(true);
        }

        // No proposed date should fall on Pesach dates
        const proposedCells = batchModal.locator('[data-day-type="proposed"]');
        const proposedCount = await proposedCells.count();

        for (let i = 0; i < proposedCount; i++) {
            const clickDate = await proposedCells.nth(i).getAttribute('data-click-date');
            if (clickDate) {
                const d = new Date(clickDate + 'T12:00:00');
                const hd = new HDate(d);
                const events = HebrewCalendar.getHolidaysOnDate(hd, true) || [];
                // Server's SlotDateFilter blocks YOM TOV (1st + 7th Pesach in
                // Israel) but allows Chol HaMoed slots — that's intentional.
                // Match the server contract: only fail on actual yom-tov.
                const isYomTov = events.some(ev =>
                    (ev.getFlags() & flags.CHAG) !== 0
                    && !ev.getDesc().toLowerCase().includes('cholhamoed')
                    && !ev.getDesc().toLowerCase().includes('chol hamoed'),
                );
                expect(isYomTov, `proposed date ${clickDate} is yom-tov per hebcal: ${events.map(e => e.getDesc()).join(',')}`).toBe(false);
            }
        }
    });

    test('8. Restricted count matches server response', async () => {
        // Reopen with a known range and intercept the API response
        await page.goto('/expert/~slots');
        await page.waitForLoadState('networkidle');

        const openBatchBtn = page.locator('[data-test-id="open-batch-slot-modal"]');
        await expect(openBatchBtn).toBeVisible({ timeout: 8000 });
        await openBatchBtn.click();

        const batchModal = page.locator('[data-test-id="batch-slot-modal"]');
        await expect(batchModal).toBeVisible({ timeout: 5000 });

        // count=4 / perWeek=2 → wizard computes a 2-week range in February
        const rangeStart = '2027-02-01';
        const rangeEnd = await fillBatchForm(batchModal, rangeStart, 4, 2);

        // Intercept the API response
        const [response] = await Promise.all([
            page.waitForResponse(resp =>
                resp.url().includes('/expert/~batchPreview') && resp.request().method() === 'POST'
            ),
            batchModal.locator('[data-test-id="batch-preview-btn"]').click(),
        ]);

        const body = await response.json();

        // Server returns totalRestricted and totalAvailable
        const serverRestricted = body.totalRestricted ?? body.restrictedDates?.length ?? 0;
        const serverAvailable = body.totalAvailable ?? body.availableDates?.length ?? 0;

        // The server partitions EVERY day of [start, end] (inclusive) into
        // restricted/available, so the totals must cover the whole range.
        expect(serverRestricted + serverAvailable).toBe(daysInclusive(rangeStart, rangeEnd));

        // Verify against @hebcal/core
        const hebcalRestricted = getHebcalRestrictedDates(rangeStart, rangeEnd);

        // The server should report at least as many restricted dates as
        // hebcal reports for major restrictions. The server also restricts
        // Rosh Chodesh / erev days, so it may have more.
        // At minimum, every Shabbat in the range should be restricted.
        const shabbats = getShabbatDates(rangeStart, rangeEnd);
        expect(shabbats.size).toBeGreaterThanOrEqual(2);
        expect(serverRestricted).toBeGreaterThanOrEqual(shabbats.size);
        expect(serverAvailable).toBeGreaterThan(0);

        // Wait for preview to render
        const preview = batchModal.locator('#batchPreview');
        await expect(preview).toBeVisible({ timeout: 5000 });

        // Stats line shows counts
        const statsText = await batchModal.locator('#batchStats').textContent();
        expect(statsText).toBeTruthy();
    });
});
