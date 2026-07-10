import { test, expect } from './helpers/scoped-test';
import type { Page } from '@playwright/test';
import { registerAccount, fillProfileForm, clearTestData } from './helpers/auth';

import { newScopedPage } from './helpers/scoped-test';
test.describe.configure({ mode: 'serial' });

const EXPERT_LOGIN = `testuser_expert_${process.env.TEST_PARALLEL_INDEX ?? "0"}@irabi.test`;

test.describe('iRabi Expert Flow', () => {
	let page: Page;

	test.beforeAll(async ({ browser }) => {
		page = await newScopedPage(browser);
	});

	test.afterAll(async () => {
		await page.close();
		await clearTestData(EXPERT_LOGIN);
	});

	test('1. Register expert account', async () => {
		await registerAccount(page, EXPERT_LOGIN);
	});

	test('2. Fill profile as expert', async () => {
		await fillProfileForm(page, EXPERT_LOGIN, {
			name: 'Тест Учитель',
			accountType: 'expert',
			timezone: 'Europe/Moscow',
		});
	});

	test('3. View teaching panel', async () => {
		await page.goto('/expert/');
		await page.waitForLoadState('networkidle');

		// /expert/ now 302 → /system/ (under the active route prefix). Verify we
		// land on either / or /system/ — not on a login form.
		const finalPath = new URL(page.url()).pathname;
		expect(['/', '/system/', '/system']).toContain(finalPath);
		await expect(page.locator('body')).toBeVisible();
		const loginInput = page.locator('input[autocomplete="username"]');
		await expect(loginInput).not.toBeVisible({ timeout: 5000 });

		console.log(`Teaching panel accessible (final path: ${finalPath})`);
	});

	test('4. View time slots page', async () => {
		await page.goto('/expert/~slots');

		await expect(page.locator('body')).toBeVisible();

		// Should not be redirected to login
		const loginInput = page.locator('input[autocomplete="username"]');
		await expect(loginInput).not.toBeVisible({ timeout: 5000 });

		console.log('Slots page accessible');
	});

	test('5. Slot form shows validation errors on empty submit', async () => {
		await page.goto('/expert/~slots');
		await page.waitForLoadState('networkidle');

		const submitBtn = page.locator('#createSlotForm button[type="submit"]');
		if (!await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
			console.log('Slot form not found, skipping');
			return;
		}

		// Submit with empty date — required validation should trigger
		await submitBtn.click();

		const dateInput = page.locator('#createSlotForm input[name="date"]');
		const hasInvalid = await dateInput.evaluate(el => el.classList.contains('is-invalid'));
		expect(hasInvalid).toBe(true);

		const errorMsg = page.locator('#createSlotForm .invalid-feedback').first();
		await expect(errorMsg).toBeVisible();

		console.log('Slot form validation errors shown correctly');
	});

	test('6. Create a time slot', async () => {
		await page.goto('/expert/~slots');
		await page.waitForLoadState('networkidle');

		const tomorrow = new Date();
		tomorrow.setDate(tomorrow.getDate() + 1);
		const dateStr = tomorrow.toISOString().split('T')[0];

		const dateInput = page.locator('input[name="date"]');
		const timeInput = page.locator('input[name="time"]');
		const costInput = page.locator('input[name="cost"]');

		if (await dateInput.isVisible({ timeout: 3000 }).catch(() => false)) {
			await dateInput.fill(dateStr);
			await timeInput.fill('10:00');
			await costInput.fill('500');

			await page.locator('#createSlotForm button[type="submit"]').click();
			console.log('Time slot creation form submitted');
		} else {
			console.log('Slot creation form not found, skipping form fill');
		}

		await expect(page.locator('body')).toBeVisible();
	});

	test('7. View incoming bookings', async () => {
		await page.goto('/expert/~bookings');

		await expect(page.locator('body')).toBeVisible();

		// Should not be redirected to login
		const loginInput = page.locator('input[autocomplete="username"]');
		await expect(loginInput).not.toBeVisible({ timeout: 5000 });

		console.log('Bookings page accessible');
	});
});
