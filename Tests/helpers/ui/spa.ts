import { Page, Locator } from '@playwright/test';

export async function waitForSPA(page: Page) {
	await page.waitForLoadState('networkidle');
}

export async function navigateWithHotClick(page: Page, selector: string) {
	await page.click(selector);
	await waitForSPA(page);
}

export async function fillForm(page: Page, fields: Record<string, string>) {
	for (const [selector, value] of Object.entries(fields)) {
		await page.fill(selector, value);
	}
}

export async function getFormErrors(page: Page): Promise<string[]> {
	const errors = await page.locator('.garnet-form-error').allTextContents();
	return errors.filter(Boolean);
}

export async function submitFormAndWait(page: Page, submitSelector: string) {
	await page.click(submitSelector);
	await page.waitForLoadState('networkidle');
}

export async function isElementVisible(locator: Locator): Promise<boolean> {
	try {
		await locator.waitFor({ state: 'visible', timeout: 5000 });
		return true;
	} catch {
		return false;
	}
}

export async function takeScreenshotOnFailure(page: Page, testInfo: { title: string }) {
	const screenshot = await page.screenshot();
	// Attach to test report if needed
	return screenshot;
}
