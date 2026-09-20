/**
 * D-219 (UAT 20.09): the "Евр. дата" column in the batch-slot wizard's
 * preview table appended a stray "AM" (and "г.") after every Hebrew year —
 * "11 тишрей 5787 г. AM". `BatchPreviewTable.formatHebrewDate()` recomputes
 * the Hebrew date client-side via `Intl.DateTimeFormat({calendar:'hebrew'})`
 * without requesting an era, but ICU always includes one for calendars
 * without a "no era" convention — now stripped via `formatToParts()`.
 */
import { test, expect } from '../helpers/scoped-test';
import { newScopedPage } from '../helpers/scoped-test';
import type { Page } from '@playwright/test';
import { clearTestData } from '../helpers/auth/auth';
import { EXPERT_LOGIN, firstOfMonthAhead, setupBatchExpert } from './helpers';

test.describe.configure({ mode: 'serial' });

test.describe('D-219: batch wizard Hebrew date column has no stray era suffix', () => {
    let page: Page;

    test.beforeAll(async ({ browser }) => {
        page = await newScopedPage(browser);
        await setupBatchExpert(page);
    });

    test.afterAll(async () => {
        await page.close();
        await clearTestData(EXPERT_LOGIN);
    });

    test('proposed dates table shows a plain Hebrew date, no era/AM/г.', async () => {
        await page.goto('/expert/~slots');

        await page.locator('[data-test-id="open-batch-slot-modal"]').click();
        const batchModal = page.locator('[data-test-id="batch-slot-modal"]');
        await expect(batchModal).toBeVisible({ timeout: 5000 });

        await batchModal.locator('input[name="start_date"]').fill(firstOfMonthAhead(2));
        await batchModal.locator('input[name="per_week"]').fill('2');
        await batchModal.locator('input[name="count"]').fill('4');
        await batchModal.locator('#batchForm button[type="submit"]').click();

        const rows = batchModal.locator('#proposedBody tr');
        await expect(rows.first()).toBeVisible({ timeout: 10000 });

        const rowCount = await rows.count();
        expect(rowCount).toBeGreaterThan(0);

        for (let i = 0; i < rowCount; i++) {
            const hebrewCell = rows.nth(i).locator('td').nth(1);
            const text = (await hebrewCell.textContent())?.trim() ?? '';
            expect(text).toBeTruthy();
            expect(text).not.toMatch(/\bAM\b/);
            expect(text).not.toContain('г.');
            expect(text).toMatch(/^\d+\s+.+\s+\d{4}$/);
        }
    });
});
