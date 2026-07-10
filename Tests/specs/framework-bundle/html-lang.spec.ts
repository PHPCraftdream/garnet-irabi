/**
 * Invariant: every public page renders a valid BCP-47 lang on <html>.
 *
 * `<html lang="auto">` is NOT a valid value — browsers treat it as
 * "language unknown" and fall back to the OS UI locale for any native UI:
 *   - <input type="date"> / <input type="time"> month/weekday labels
 *   - spellcheck dictionary
 *   - number / weekday formatting defaults
 *
 * That meant the slot datepicker showed English month names for users on
 * an English-OS machine even when the site was set to Russian. The fix is
 * a single twig change in HtmlLayout — this spec exists so it doesn't
 * regress: if someone ever swaps the lang back to "auto" or removes the
 * attribute, every public-page test in this file fails loudly.
 */

import { test, expect } from '../../helpers/scoped-test';
import { newScopedContext } from '../../helpers/scoped-test';

const URLS = ['/', '/system/', '/page/view~terms', '/page/view~privacy'];

test.describe('html lang attribute', () => {
	test('every public page renders a real BCP-47 lang, never "auto"', async ({ browser }) => {
		const context = await newScopedContext(browser);
		const page = await context.newPage();
		try {
			for (const url of URLS) {
				const resp = await page.goto(url);
				if (!resp || resp.status() >= 400) {
					continue;
				}
				const lang = await page.evaluate(() => document.documentElement.getAttribute('lang') ?? '');
				expect(lang, `URL ${url}: empty lang`).not.toBe('');
				expect(lang, `URL ${url}: lang="auto" is not BCP-47 — native UI (datepicker, spellcheck) fall back to OS locale`).not.toBe('auto');
				// Lowercase, 2-letter primary tag (ru, en).
				expect(lang, `URL ${url}: lang "${lang}" is not a 2-letter lowercase tag`).toMatch(/^[a-z]{2}(-[a-zA-Z0-9]+)?$/);
			}
		} finally {
			await context.close();
		}
	});
});
