import { test, expect } from '../helpers/scoped-test';

test.describe('Example tests', () => {
	test('homepage loads', async ({ page }) => {
		await page.goto('/');

		await expect(page).toHaveTitle(/.*/);
	});
});
