/**
 * Даты для проверок календаря: независимый расчёт запрещённых дней по
 * @hebcal/core и заполнение формы пакетного создания.
 *
 * Запрещённые дни считаются ВТОРЫМ способом намеренно: проверка сверяет
 * календарь приложения с независимым расчётом, а не с самим собой.
 */

import { test, expect } from '../../helpers/scoped-test';
import type { Locator } from '@playwright/test';
import { HDate, HebrewCalendar, flags } from '../../helpers/hebcal';


export const EXPERT_LOGIN = `testuser_cal_${process.env.TEST_PARALLEL_INDEX ?? '0'}@irabi.test`;

/**
 * Use @hebcal/core to determine which dates in a range are restricted
 * (Shabbat, major Yom Tov, fasts, Rosh Chodesh, erev days).
 */
export function getHebcalRestrictedDates(startIso: string, endIso: string): Set<string> {
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
export function getShabbatDates(startIso: string, endIso: string): Set<string> {
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
export function computeEndDate(startIso: string, count: number, perWeek: number): string {
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
export function isoLocal(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Inclusive number of days between two ISO dates. */
export function daysInclusive(startIso: string, endIso: string): number {
    const start = new Date(startIso + 'T12:00:00');
    const end = new Date(endIso + 'T12:00:00');
    return Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
}

/**
 * Fill the batch wizard form (new model: end_date is computed, read-only).
 * Sets start_date + count + per_week, waits for the computed end date to
 * settle and returns it (read from the disabled batch-end-date field).
 */
export async function fillBatchForm(batchModal: Locator, startIso: string, count: number, perWeek: number): Promise<string> {
    await batchModal.locator('input[name="start_date"]').fill(startIso);
    await batchModal.locator('input[name="count"]').fill(String(count));
    await batchModal.locator('input[name="per_week"]').fill(String(perWeek));

    const endField = batchModal.locator('[data-test-id="batch-end-date"]');
    await expect(endField).not.toHaveValue('');
    // The wizard computes endDate = start + ceil(count/perWeek) * 7 days.
    await expect(endField).toHaveValue(computeEndDate(startIso, count, perWeek));
    return endField.inputValue();
}
