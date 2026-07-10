/**
 * SEO / Open-Graph meta tags on the public home page ("/").
 *
 * Verifies the cascade: every page emits the full OG/Twitter set; og:image
 * falls back to the site favicon when none is configured; and per-page
 * seo_title / og_image override the head.
 */

import { test, expect, tn } from './helpers/scoped-test';
import mysql from 'mysql2/promise';
import { DB } from './helpers/db';

test.describe.configure({ mode: 'serial' });

async function meta(page: import('@playwright/test').Page, selector: string): Promise<string> {
    return (await page.locator(selector).first().getAttribute('content')) ?? '';
}

test.describe('SEO / OG meta on the public home page', () => {

    test('emits the full OG + Twitter set, og:image falls back to favicon', async ({ page }) => {
        const resp = await page.goto('/', { waitUntil: 'domcontentloaded' });
        expect(resp && resp.status()).toBeLessThan(400);

        // Core Open Graph
        expect(await meta(page, 'meta[property="og:type"]')).toBe('website');
        expect((await meta(page, 'meta[property="og:title"]')).length).toBeGreaterThan(0);
        expect((await meta(page, 'meta[property="og:url"]')).length).toBeGreaterThan(0);
        expect((await meta(page, 'meta[property="og:site_name"]')).length).toBeGreaterThan(0);

        // Twitter card present
        expect(await meta(page, 'meta[name="twitter:card"]')).toMatch(/summary/);

        // og:image falls back to the site favicon (absolute) when none is set
        const ogImage = await meta(page, 'meta[property="og:image"]');
        expect(ogImage).toMatch(/^https?:\/\//);
        expect(ogImage).toContain('favicon.ico');
    });

    test('per-page seo_title + og_image override the head', async ({ page }) => {
        let pageId = 0;
        let prevTitle = '';
        let prevImage = '';

        const conn = await mysql.createConnection(DB);
        try {
            const [rows] = await conn.execute<any[]>(
                `SELECT id, seo_title, og_image FROM ${tn('static_pages')} WHERE slug = 'home'`,
            );
            if (!rows.length) { test.skip(true, 'no home page'); return; }
            pageId = Number(rows[0].id);
            prevTitle = String(rows[0].seo_title ?? '');
            prevImage = String(rows[0].og_image ?? '');

            await conn.execute(
                `UPDATE ${tn('static_pages')} SET seo_title = ?, og_image = ? WHERE id = ?`,
                ['SEO Title Test', 'https://example.test/og.png', pageId],
            );
        } finally { await conn.end(); }

        try {
            await page.goto('/', { waitUntil: 'domcontentloaded' });

            expect(await meta(page, 'meta[property="og:title"]')).toBe('SEO Title Test');
            expect(await page.title()).toContain('SEO Title Test');
            expect(await meta(page, 'meta[property="og:image"]')).toBe('https://example.test/og.png');
            // A real image → large summary card.
            expect(await meta(page, 'meta[name="twitter:card"]')).toBe('summary_large_image');
            expect(await meta(page, 'meta[property="og:image:width"]')).toBe('1200');
        } finally {
            const c2 = await mysql.createConnection(DB);
            try {
                await c2.execute(
                    `UPDATE ${tn('static_pages')} SET seo_title = ?, og_image = ? WHERE id = ?`,
                    [prevTitle, prevImage, pageId],
                );
            } finally { await c2.end(); }
        }
    });
});
