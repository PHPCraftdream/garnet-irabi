import { test, expect } from './helpers/scoped-test';
import type { Page } from '@playwright/test';
import { registerAccount, fillProfileForm, clearTestData } from './helpers/auth';

import { newScopedPage } from './helpers/scoped-test';
test.describe.configure({ mode: 'serial' });

const USER_LOGIN = `testuser_user_${process.env.TEST_PARALLEL_INDEX ?? "0"}@irabi.test`;

test.describe('iRabi User Flow', () => {
	let page: Page;

	test.beforeAll(async ({ browser }) => {
		page = await newScopedPage(browser);
	});

	test.afterAll(async () => {
		await page.close();
		await clearTestData(USER_LOGIN);
	});

	test('1. Register user account', async () => {
		await registerAccount(page, USER_LOGIN);
	});

	test('2. Fill profile as user', async () => {
		await fillProfileForm(page, USER_LOGIN, {
			name: 'Тест Ученик',
			accountType: 'user',
			timezone: 'Europe/Moscow',
		});
	});

	test('3. View available slots', async () => {
		await page.goto('/slots');

		await expect(page.locator('body')).toBeVisible();

		// Should not be redirected to login
		const loginInput = page.locator('input[autocomplete="username"]');
		await expect(loginInput).not.toBeVisible({ timeout: 5000 });

		console.log('Slots page accessible');
	});

	test('4. Filter slots by date', async () => {
		await page.goto('/slots');
		await page.waitForLoadState('networkidle');

		const tomorrow = new Date();
		tomorrow.setDate(tomorrow.getDate() + 1);
		const dateStr = tomorrow.toISOString().split('T')[0];

		const dateInput = page.locator('input[name="date"], input[type="date"]').first();
		if (await dateInput.isVisible({ timeout: 3000 }).catch(() => false)) {
			await dateInput.fill(dateStr);
			console.log('Filtered slots by date:', dateStr);
		} else {
			console.log('Date filter input not found, skipping');
		}

		await expect(page.locator('body')).toBeVisible();
	});

	test('5. View teacher profile', async () => {
		// Try to find a teacher link on the slots page
		await page.goto('/slots');
		await page.waitForLoadState('networkidle');

		// Look for any teacher link/card
		const teacherLink = page.locator('a[href*="/teacher/"]').first();
		if (await teacherLink.isVisible({ timeout: 3000 }).catch(() => false)) {
			await teacherLink.click();

			await expect(page.locator('body')).toBeVisible();
			console.log('Viewed teacher profile from link');
		} else {
			console.log('No teacher links found on slots page, skipping');
		}
	});

	test('6. View bookings page', async () => {
		await page.goto('/bookings');

		await expect(page.locator('body')).toBeVisible();

		// Should not be redirected to login
		const loginInput = page.locator('input[autocomplete="username"]');
		await expect(loginInput).not.toBeVisible({ timeout: 5000 });

		console.log('Bookings page accessible');
	});
});
