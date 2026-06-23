/**
 * Cookie disclosure pages: verifies /cookies renders and /privacy §7
 * contains the updated concrete cookie table.
 */

import { test, expect } from '../../helpers/scoped-test';
import { newScopedContext } from '../../helpers/scoped-test';

const BASE = process.env.BASE_URL || 'http://localhost:8001';

test.describe('Cookie disclosure pages', () => {
    test('/cookies renders with cookie details', async ({ browser }) => {
        const context = await newScopedContext(browser, { baseURL: BASE });
        const page = await context.newPage();

        const response = await page.goto('/page/view~cookies');
        expect(response?.status()).toBe(200);

        const bodyText = await page.locator('body').innerText();
        expect(bodyText).toContain('session');
        expect(bodyText).toContain('CSRF_TOKEN');
        expect(bodyText).toContain('Технически необходимые');

        await context.close();
    });

    test('/privacy section 7 lists concrete cookies', async ({ browser }) => {
        const context = await newScopedContext(browser, { baseURL: BASE });
        const page = await context.newPage();

        const response = await page.goto('/page/view~privacy');
        expect(response?.status()).toBe(200);

        const bodyText = await page.locator('body').innerText();
        expect(bodyText).toContain('CSRF_TOKEN');
        expect(bodyText).toContain('до 5 лет');

        await context.close();
    });
});
