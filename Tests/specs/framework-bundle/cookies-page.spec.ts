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

    // Regression for content audit 15-content-copywriting-seo.md B-1/B-2:
    // the privacy→cookies cross-link used to point at the non-existent
    // /cookies route (404). It must resolve to /page/view~cookies. Targeted
    // by its link text — the nav/footer also link to /page/view~privacy.
    test('/privacy cross-link to cookies resolves (not 404)', async ({ browser }) => {
        const context = await newScopedContext(browser, { baseURL: BASE });
        const page = await context.newPage();

        await page.goto('/page/view~privacy');

        const link = page.getByRole('link', { name: 'Уведомление об использовании cookies' });
        const href = await link.getAttribute('href');
        expect(href).toBe('/page/view~cookies');

        const target = await page.goto(href!);
        expect(target?.status()).toBe(200);

        await context.close();
    });

    // Regression for content audit 15-content-copywriting-seo.md B-1/B-2:
    // the cookies→privacy cross-link used to point at the non-existent
    // /privacy route (404). It must resolve to /page/view~privacy. Targeted
    // by its link text — the nav/footer also link to /page/view~privacy.
    test('/cookies cross-link to privacy resolves (not 404)', async ({ browser }) => {
        const context = await newScopedContext(browser, { baseURL: BASE });
        const page = await context.newPage();

        await page.goto('/page/view~cookies');

        const link = page.getByRole('link', { name: 'Политике обработки персональных данных' });
        const href = await link.getAttribute('href');
        expect(href).toBe('/page/view~privacy');

        const target = await page.goto(href!);
        expect(target?.status()).toBe(200);

        await context.close();
    });
});
