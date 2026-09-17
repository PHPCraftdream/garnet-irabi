import { test as base, Page } from '@playwright/test';

interface GarnetFixtures {
	loginPage: Page;
	dashboardPage: Page;
}

export const test = base.extend<GarnetFixtures>({
	loginPage: async ({ page }, use) => {
		await page.goto('/login');
		await use(page);
	},

	dashboardPage: async ({ page }, use) => {
		await page.goto('/dashboard');
		await use(page);
	},
});

export { expect } from '@playwright/test';
