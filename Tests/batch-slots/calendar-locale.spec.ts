/**
 * D-255 (UAT round, expert-4/Хана Городецкая): the batch wizard's preview
 * calendar month headers ("September 2026", "October 2026") rendered in
 * English on an otherwise all-Russian page.
 *
 * Root cause: `Calendar.tsx` (garnet-framework) built its month/year title
 * with `new Intl.DateTimeFormat(undefined, {...})` — `undefined` resolves
 * to the BROWSER's own language, not the site's `__GARNET_UI_LANG__`.
 * Reproduced by pointing the browser CONTEXT at `en-US` while the site
 * itself stays Russian (a fixed, non-Accept-Language-driven site setting)
 * — exactly the mismatch an expert with an English OS would hit.
 */
import { test, expect } from '../helpers/scoped-test';
import { newScopedPage } from '../helpers/scoped-test';
import type { Page } from '@playwright/test';
import { clearTestData } from '../helpers/auth/auth';
import { EXPERT_LOGIN, firstOfMonthAhead, setupBatchExpert } from './helpers';

test.describe.configure({ mode: 'serial' });

test.describe('D-255: batch preview calendar month header follows the SITE language, not the browser\'s', () => {
    let page: Page;

    test.beforeAll(async ({ browser }) => {
        // Browser/OS locale is English; the site's own UI language is a
        // fixed Russian setting, independent of Accept-Language — this is
        // the exact mismatch the report describes.
        page = await newScopedPage(browser, { locale: 'en-US' });
        await setupBatchExpert(page);
        await page.goto('/expert/~slots');
    });

    test.afterAll(async () => {
        await page.close();
        await clearTestData(EXPERT_LOGIN);
    });

    test('the month header is in Russian even with an English browser locale', async () => {
        await page.locator('[data-test-id="open-batch-slot-modal"]').click();
        const batchModal = page.locator('[data-test-id="batch-slot-modal"]');
        await expect(batchModal).toBeVisible({ timeout: 5000 });

        await batchModal.locator('input[name="start_date"]').fill(firstOfMonthAhead(7));
        await batchModal.locator('input[name="per_week"]').fill('2');
        await batchModal.locator('input[name="count"]').fill('2');
        await batchModal.locator('input[name="batch_time"]').fill('10:00');

        await batchModal.locator('#batchForm button[type="submit"]').click();
        await expect(batchModal.locator('#batchPreview')).toBeVisible({ timeout: 5000 });

        const header = batchModal.locator('#batchPreview h6').first();
        await expect(header).toBeVisible({ timeout: 5000 });
        const headerText = (await header.innerText()).trim();

        // Cyrillic month name present, no English month name leaking in.
        expect(headerText).toMatch(/[а-яА-Я]/);
        expect(headerText).not.toMatch(/January|February|March|April|May|June|July|August|September|October|November|December/);
    });
});
