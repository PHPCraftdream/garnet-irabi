/**
 * Admin -- per-page OG image upload (/admin/pages/)
 *
 * Covers the convenient upload / preview / delete flow for a static page's
 * Open-Graph preview image (the picture Telegram/WhatsApp show when the page
 * link is shared). Drives the real UI:
 *   create page → upload image → preview appears → persists to DB (og_image)
 *   → remove (with confirm) → upload area returns → DB cleared.
 *
 * Access: /admin/pages/ is ownerOnly, but IS_ADMIN implies isOwner() so the
 * admin-tests storageState works (same as static-pages.spec.ts).
 */

import { test, expect, tn } from '../../../helpers/scoped-test';
import mysql from 'mysql2/promise';
import { DB } from '../../../helpers/db';

test.describe.configure({ mode: 'serial' });

const WORKER_TAG = process.env.TEST_PARALLEL_INDEX ?? '0';
const SLUG = `e2e-seo-og-w${WORKER_TAG}`;
const TITLE = 'E2E SEO OG Page';

// 1×1 transparent PNG — smallest valid upload payload.
const PNG_1x1 = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMCAd8m7vQAAAAASUVORK5CYII=',
    'base64',
);

async function ogImageInDb(slug: string): Promise<string | null> {
    const conn = await mysql.createConnection(DB);
    try {
        const [rows] = await conn.execute<any[]>(
            `SELECT og_image FROM ${tn('static_pages')} WHERE slug = ?`, [slug],
        );
        return rows.length ? String(rows[0].og_image ?? '') : null;
    } finally { await conn.end(); }
}

test.afterAll(async () => {
    const conn = await mysql.createConnection(DB);
    try { await conn.execute(`DELETE FROM ${tn('static_pages')} WHERE slug = ?`, [SLUG]); }
    finally { await conn.end(); }
});

test.describe('Admin -- per-page OG image upload', () => {
    test('upload → preview → persists to DB → remove clears it', async ({ page }) => {
        // Create a fresh page; the editor opens automatically afterwards.
        await page.goto('/admin/pages/', { waitUntil: 'domcontentloaded' });
        await expect(page.locator('[data-test-id="admin-static-pages"]')).toBeVisible({ timeout: 20000 });

        await page.locator('[data-test-id="admin-static-pages"] button:has-text("+")').first().click();
        const formSection = page.locator('[data-test-id="admin-static-pages"] section');
        const inputs = formSection.locator('input.form-control');
        await inputs.nth(0).fill(SLUG);
        await inputs.nth(1).fill(TITLE);
        await Promise.all([
            page.waitForResponse(r => r.request().method() === 'POST' && r.url().includes('~create') && r.status() < 500, { timeout: 10000 }),
            formSection.locator('button.btn-primary').first().click(),
        ]);

        // Editor is now open; the OG field shows an upload area (no image yet).
        await expect(page.locator('.blk-upload-area').first()).toBeVisible({ timeout: 8000 });

        // Upload a file into the (hidden) OG field input.
        const [uploadResp] = await Promise.all([
            page.waitForResponse(r => r.url().includes('~uploadImage') && r.request().method() === 'POST', { timeout: 15000 }),
            page.locator('input[type="file"]').first().setInputFiles({ name: 'og.png', mimeType: 'image/png', buffer: PNG_1x1 }),
        ]);
        expect(uploadResp.status()).toBeLessThan(400);

        // Preview appears with a URL under the public pages upload path.
        const preview = page.locator('.blk-img-preview-img').first();
        await expect(preview).toBeVisible({ timeout: 5000 });
        expect(String(await preview.getAttribute('src'))).toContain('/pages/');

        // Save the page (~update) so og_image persists; assert it in the DB.
        await Promise.all([
            page.waitForResponse(r => r.request().method() === 'POST' && r.url().includes('~update') && r.status() < 500, { timeout: 15000 }),
            page.locator('button.btn-primary.btn-lg').click(),
        ]);
        expect(String(await ogImageInDb(SLUG))).toContain('/pages/');

        // Remove the image: × → confirm modal → confirm.
        await page.locator('.blk-img-preview-remove').first().click();
        await Promise.all([
            page.waitForResponse(r => r.url().includes('~deleteImage') && r.request().method() === 'POST', { timeout: 10000 }),
            page.locator('[data-test-id="modal-confirm-btn"]').click(),
        ]);
        // Back to the upload area — no preview.
        await expect(page.locator('.blk-img-preview-img')).toHaveCount(0, { timeout: 5000 });

        // Save again → DB og_image cleared.
        await Promise.all([
            page.waitForResponse(r => r.request().method() === 'POST' && r.url().includes('~update') && r.status() < 500, { timeout: 15000 }),
            page.locator('button.btn-primary.btn-lg').click(),
        ]);
        expect(await ogImageInDb(SLUG)).toBe('');
    });
});
