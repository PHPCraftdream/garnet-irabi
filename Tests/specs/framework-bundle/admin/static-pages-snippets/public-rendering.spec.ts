/**
 * Как структурные шапка и подвал выглядят на публичной странице —
 * то есть то, ради чего редакторы и существуют.
 *
 * Часть разобранного static-pages-snippets.spec.ts (был один файл на
 * 913 строк).
 */

import { test, expect, tn } from '../../../../helpers/scoped-test';
import { DB } from '../../../../helpers/db';
import mysql from 'mysql2/promise';
import type { Page } from '@playwright/test';
import {
    TS,
} from './helpers';

test.describe.configure({ mode: 'serial' });

test.describe('Public rendering -- Structured header/footer snippets', () => {
	test.describe.configure({ mode: 'serial' });

	const PAGE_SLUG = `e2e-render-${TS}`;
	const PAGE_TITLE = 'E2E Structured Render';
	const HDR_SLUG = `e2e-rhdr-${TS}`;
	const FTR_SLUG = `e2e-rftr-${TS}`;
	let hdrId = 0;
	let ftrId = 0;
	let pageId = 0;

	test.beforeAll(async () => {
		const conn = await mysql.createConnection(DB);
		try {
			const now = Math.floor(Date.now() / 1000);

			// Create header snippet with structured JSON
			const headerJson = JSON.stringify({
				logo: { url: '', alt: 'Test Logo', link: '/', height: 40 },
				items: [
					{ type: 'link', label: 'Home', url: '/' },
					{ type: 'link', label: 'About', url: '/about' },
					{ type: 'divider' },
					{ type: 'link', label: 'Contact', url: '/contact' },
				],
				layout: 'left',
				sticky: false,
			});
			const [hdrRes] = await conn.execute<any>(
				`INSERT INTO ${tn('static_snippets')} (slug, name, snippet_type, content, is_active, sort_order, updated_at, created_at) VALUES (?, 'Render Header', 'header', ?, 1, 0, ?, ?)`,
				[HDR_SLUG, headerJson, now, now]
			);
			hdrId = hdrRes.insertId;

			// Create footer snippet with structured JSON
			const footerJson = JSON.stringify({
				columns: [
					{
						title: 'Quick Links',
						items: [
							{ type: 'link', label: 'Home Page', url: '/' },
							{ type: 'link', label: 'External Site', url: 'https://example.com', external: true },
						],
					},
					{
						title: 'Resources',
						items: [
							{ type: 'link', label: 'Documentation', url: '/docs' },
						],
					},
				],
				copyright: '2026 E2E Test Corp',
			});
			const [ftrRes] = await conn.execute<any>(
				`INSERT INTO ${tn('static_snippets')} (slug, name, snippet_type, content, is_active, sort_order, updated_at, created_at) VALUES (?, 'Render Footer', 'footer', ?, 1, 0, ?, ?)`,
				[FTR_SLUG, footerJson, now, now]
			);
			ftrId = ftrRes.insertId;

			// Create published page with both snippets
			const [pgRes] = await conn.execute<any>(
				`INSERT INTO ${tn('static_pages')} (slug, title, is_published, meta_description, max_width, visibility, sort_order, header_snippet_id, footer_snippet_id, updated_at, updated_by, created_at) VALUES (?, ?, 1, '', '3xl', 'all', 0, ?, ?, ?, 0, ?)`,
				[PAGE_SLUG, PAGE_TITLE, hdrId, ftrId, now, now]
			);
			pageId = pgRes.insertId;

			// Add a text block
			await conn.execute(
				`INSERT INTO ${tn('static_page_blocks')} (page_id, block_type, content, sort_order, is_hidden, created_at) VALUES (?, 'text', 'Page body content here.', 0, 0, ?)`,
				[pageId, now]
			);
		} finally {
			await conn.end();
		}
	});

	test.afterAll(async () => {
		const conn = await mysql.createConnection(DB);
		try {
			if (pageId > 0) {
				await conn.execute(`DELETE FROM ${tn('static_page_blocks')} WHERE page_id = ?`, [pageId]);
				await conn.execute(`DELETE FROM ${tn('static_pages')} WHERE id = ?`, [pageId]);
			}
			if (hdrId > 0) await conn.execute(`DELETE FROM ${tn('static_snippets')} WHERE id = ?`, [hdrId]);
			if (ftrId > 0) await conn.execute(`DELETE FROM ${tn('static_snippets')} WHERE id = ?`, [ftrId]);
		} finally {
			await conn.end();
		}
	});

	test('page with header snippet shows <nav> with navigation links', async ({ page }) => {
		const response = await page.goto(`/page/view~${PAGE_SLUG}`);
		expect(response?.status()).toBe(200);

		const nav = page.locator('nav.sp-nav');
		await expect(nav).toBeVisible({ timeout: 5000 });

		// Check links are rendered
		const navLinks = nav.locator('a.sp-nav-link');
		const linkCount = await navLinks.count();
		expect(linkCount).toBeGreaterThanOrEqual(3);

		await Promise.all([
			expect(navLinks.filter({ hasText: 'Home' })).toBeVisible(),
			expect(navLinks.filter({ hasText: 'About' })).toBeVisible(),
			expect(navLinks.filter({ hasText: 'Contact' })).toBeVisible(),
		]);
	});

	test('header has divider elements', async ({ page }) => {
		await page.goto(`/page/view~${PAGE_SLUG}`);

		const dividers = page.locator('nav.sp-nav .sp-nav-divider');
		const count = await dividers.count();
		expect(count).toBeGreaterThanOrEqual(1);
	});

	test('header has correct layout class', async ({ page }) => {
		await page.goto(`/page/view~${PAGE_SLUG}`);

		const nav = page.locator('nav.sp-nav');
		await expect(nav).toHaveClass(/sp-nav-left/);
	});

	test('header nav links point to correct URLs', async ({ page }) => {
		await page.goto(`/page/view~${PAGE_SLUG}`);

		const nav = page.locator('nav.sp-nav');
		await Promise.all([
			expect(nav.locator('a.sp-nav-link:has-text("Home")')).toHaveAttribute('href', '/'),
			expect(nav.locator('a.sp-nav-link:has-text("About")')).toHaveAttribute('href', '/about'),
			expect(nav.locator('a.sp-nav-link:has-text("Contact")')).toHaveAttribute('href', '/contact'),
		]);
	});

	test('page with footer snippet shows <footer> with columns', async ({ page }) => {
		await page.goto(`/page/view~${PAGE_SLUG}`);

		const footer = page.locator('footer.sp-footer');
		await expect(footer).toBeVisible({ timeout: 5000 });

		const cols = footer.locator('.sp-footer-col');
		expect(await cols.count()).toBe(2);

		await Promise.all([
			expect(cols.nth(0).locator('.sp-footer-col-title')).toHaveText('Quick Links'),
			expect(cols.nth(1).locator('.sp-footer-col-title')).toHaveText('Resources'),
		]);
	});

	test('footer column links are correct', async ({ page }) => {
		await page.goto(`/page/view~${PAGE_SLUG}`);

		const footer = page.locator('footer.sp-footer');
		const firstCol = footer.locator('.sp-footer-col').nth(0);

		const homeLink = firstCol.locator('a.sp-footer-link:has-text("Home Page")');
		await expect(homeLink).toHaveAttribute('href', '/');

		const extLink = firstCol.locator('a.sp-footer-link:has-text("External Site")');
		await Promise.all([
			expect(extLink).toHaveAttribute('href', 'https://example.com'),
			expect(extLink).toHaveAttribute('target', '_blank'),
		]);
	});

	test('footer copyright is rendered with variable substitution', async ({ page }) => {
		await page.goto(`/page/view~${PAGE_SLUG}`);

		const copyright = page.locator('footer.sp-footer .sp-footer-copyright');
		await expect(copyright).toBeVisible();
		const text = await copyright.textContent();
		expect(text).toContain('2026');
		expect(text).toContain('E2E Test Corp');
	});

	test('page title and body content appear between header and footer', async ({ page }) => {
		await page.goto(`/page/view~${PAGE_SLUG}`);

		// Title
		const h1 = page.locator('h1');
		await Promise.all([
			expect(h1).toContainText(PAGE_TITLE),

		// Body content
			expect(page.locator('text=Page body content here.')).toBeVisible(),
		]);
		const navBox = await page.locator('nav.sp-nav').boundingBox();
		const h1Box = await h1.boundingBox();
		const footerBox = await page.locator('footer.sp-footer').boundingBox();

		expect(navBox).not.toBeNull();
		expect(h1Box).not.toBeNull();
		expect(footerBox).not.toBeNull();

		if (navBox && h1Box && footerBox) {
			expect(navBox.y).toBeLessThan(h1Box.y);
			expect(h1Box.y).toBeLessThan(footerBox.y);
		}
	});

	test('sticky header gets sp-nav-sticky class', async ({ page }) => {
		const conn = await mysql.createConnection(DB);
		try {
			const [rows] = await conn.execute<any[]>(
				`SELECT content FROM ${tn('static_snippets')} WHERE id = ?`, [hdrId]
			);
			const data = JSON.parse(rows[0].content);
			data.sticky = true;
			await conn.execute(`UPDATE ${tn('static_snippets')} SET content = ? WHERE id = ?`,
				[JSON.stringify(data), hdrId]);
		} finally {
			await conn.end();
		}

		await page.goto(`/page/view~${PAGE_SLUG}`);
		await expect(page.locator('nav.sp-nav')).toHaveClass(/sp-nav-sticky/);

		// Restore
		const conn2 = await mysql.createConnection(DB);
		try {
			const [rows] = await conn2.execute<any[]>(
				`SELECT content FROM ${tn('static_snippets')} WHERE id = ?`, [hdrId]
			);
			const data = JSON.parse(rows[0].content);
			data.sticky = false;
			await conn2.execute(`UPDATE ${tn('static_snippets')} SET content = ? WHERE id = ?`,
				[JSON.stringify(data), hdrId]);
		} finally {
			await conn2.end();
		}
	});

	test('footer with no columns renders only copyright', async ({ page }) => {
		const conn = await mysql.createConnection(DB);
		let originalContent = '';
		try {
			const [rows] = await conn.execute<any[]>(
				`SELECT content FROM ${tn('static_snippets')} WHERE id = ?`, [ftrId]
			);
			originalContent = rows[0].content;
			const ftrJson = JSON.stringify({ columns: [], copyright: '2026 Copyright Only' });
			await conn.execute(`UPDATE ${tn('static_snippets')} SET content = ? WHERE id = ?`, [ftrJson, ftrId]);
		} finally {
			await conn.end();
		}

		await page.goto(`/page/view~${PAGE_SLUG}`);

		const footer = page.locator('footer.sp-footer');
		await expect(footer).toBeVisible({ timeout: 5000 });

		// No columns div when columns array is empty
		const colsDiv = footer.locator('.sp-footer-cols');
		await expect(colsDiv).not.toBeVisible();

		const copyright = footer.locator('.sp-footer-copyright');
		await expect(copyright).toContainText('2026 Copyright Only');

		// Restore original content
		const conn2 = await mysql.createConnection(DB);
		try {
			await conn2.execute(`UPDATE ${tn('static_snippets')} SET content = ? WHERE id = ?`, [originalContent, ftrId]);
		} finally {
			await conn2.end();
		}
	});

	test('inactive header snippet is not rendered', async ({ page }) => {
		const conn = await mysql.createConnection(DB);
		try {
			await conn.execute(`UPDATE ${tn('static_snippets')} SET is_active = 0 WHERE id = ?`, [hdrId]);
		} finally {
			await conn.end();
		}

		await page.goto(`/page/view~${PAGE_SLUG}`);

		await Promise.all([
			expect(page.locator('nav.sp-nav')).not.toBeVisible(),

		// Footer should still render
			expect(page.locator('footer.sp-footer')).toBeVisible({ timeout: 5000 }),
		]);
		const conn2 = await mysql.createConnection(DB);
		try {
			await conn2.execute(`UPDATE ${tn('static_snippets')} SET is_active = 1 WHERE id = ?`, [hdrId]);
		} finally {
			await conn2.end();
		}
	});

	test('inactive footer snippet is not rendered', async ({ page }) => {
		const conn = await mysql.createConnection(DB);
		try {
			await conn.execute(`UPDATE ${tn('static_snippets')} SET is_active = 0 WHERE id = ?`, [ftrId]);
		} finally {
			await conn.end();
		}

		await page.goto(`/page/view~${PAGE_SLUG}`);

		await Promise.all([
			expect(page.locator('footer.sp-footer')).not.toBeVisible(),

		// Header should still render
			expect(page.locator('nav.sp-nav')).toBeVisible({ timeout: 5000 }),
		]);
		const conn2 = await mysql.createConnection(DB);
		try {
			await conn2.execute(`UPDATE ${tn('static_snippets')} SET is_active = 1 WHERE id = ?`, [ftrId]);
		} finally {
			await conn2.end();
		}
	});
});
