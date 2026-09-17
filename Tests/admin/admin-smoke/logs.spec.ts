/**
 * Журналы и перенаправления старых адресов на единый просмотр.
 *
 * Часть разобранного admin-smoke.spec.ts. Режим параллельный, как и был:
 * группы независимы и ничего друг другу не оставляют.
 */

import { test, expect } from '../../helpers/scoped-test';
import {
    openAdminPage,
    expectTableVisible,
} from './helpers';

test.describe.configure({ mode: 'parallel' });

test.describe('Admin — Logs page (/admin/logs/)', () => {
	test('page loads and shows the viewer + 5 tab buttons', async ({ page }) => {
		await openAdminPage(page, '/admin/logs/');
		await expect(page.locator('[data-test-id="admin-logs-viewer"]')).toBeVisible({ timeout: 8000 });
		for (const id of ['actions', 'mails', 'requests', 'errors', 'cron']) {
			await expect(page.locator(`[data-test-id="tabnav-btn-${id}"]`)).toBeVisible({ timeout: 5000 });
		}
	});

	test('actions tab is active by default and shows the action log table', async ({ page }) => {
		await openAdminPage(page, '/admin/logs/');
		await expect(page.locator('[data-test-id="tabnav-btn-actions"]')).toHaveAttribute('aria-selected', 'true');
		await expectTableVisible(page);
	});

	test('actions tab exposes actor / target / action / actor-type / date filters', async ({ page }) => {
		await openAdminPage(page, '/admin/logs/');
		await Promise.all([
			expect(page.locator('[data-test-id="tabnav-btn-actions"]')).toHaveAttribute('aria-selected', 'true'),
			expect(page.locator('[data-test-id="actions-actor-filter"]')).toBeVisible({ timeout: 5000 }),
			expect(page.locator('[data-test-id="actions-target-filter"]')).toBeVisible({ timeout: 5000 }),
			expect(page.locator('[data-test-id="actions-action-filter"]')).toBeVisible({ timeout: 5000 }),
			expect(page.locator('[data-test-id="actions-actor-type-filter"]')).toBeVisible({ timeout: 5000 }),
			expect(page.locator('[data-test-id="actions-date-from"]')).toBeVisible({ timeout: 5000 }),
			expect(page.locator('[data-test-id="actions-date-to"]')).toBeVisible({ timeout: 5000 }),
		]);
	});

	test('switching to mails tab updates URL and renders mail log', async ({ page }) => {
		await openAdminPage(page, '/admin/logs/');
		await page.locator('[data-test-id="tabnav-btn-mails"]').click();
		await expect(page.locator('[data-test-id="tabnav-btn-mails"]')).toHaveAttribute('aria-selected', 'true');
		expect(page.url()).toContain('tab=mails');
	});

	test('switching to requests tab renders the requests panel', async ({ page }) => {
		await openAdminPage(page, '/admin/logs/');
		await page.locator('[data-test-id="tabnav-btn-requests"]').click();
		await expect(page.locator('[data-test-id="admin-request-log"]')).toBeVisible({ timeout: 5000 });
	});

	test('switching to errors tab renders the errors panel', async ({ page }) => {
		await openAdminPage(page, '/admin/logs/');
		await page.locator('[data-test-id="tabnav-btn-errors"]').click();
		await expect(page.locator('[data-test-id="admin-errors-log"]')).toBeVisible({ timeout: 5000 });
	});

	test('?tab=requests deep-link opens requests tab on initial load', async ({ page }) => {
		await openAdminPage(page, '/admin/logs/?tab=requests');
		await Promise.all([
			expect(page.locator('[data-test-id="tabnav-btn-requests"]')).toHaveAttribute('aria-selected', 'true'),
			expect(page.locator('[data-test-id="admin-request-log"]')).toBeVisible({ timeout: 5000 }),
		]);
	});
});

test.describe('Admin — legacy log URLs redirect to unified viewer', () => {
	test('/admin/mail-log/ redirects to /admin/logs/?tab=mails', async ({ page }) => {
		// The redirect to the unified viewer is CLIENT-side, so it can land a
		// tick after `load` — wait for it (noticeably slower on prod) before
		// reading the URL, instead of assuming `goto` already settled it.
		await page.goto('/admin/mail-log/');
		await page.waitForURL('**/admin/logs/**', { timeout: 15000 });
		expect(page.url()).toContain('/admin/logs/');
		expect(page.url()).toContain('tab=mails');
	});

	test('/admin/request-log/ redirects to /admin/logs/?tab=requests', async ({ page }) => {
		await page.goto('/admin/request-log/');
		await page.waitForURL('**/admin/logs/**', { timeout: 15000 });
		expect(page.url()).toContain('/admin/logs/');
		expect(page.url()).toContain('tab=requests');
	});
});

test.describe('Admin — Cancellations page (/admin/cancellations/) — redirects to /admin/bookings/', () => {
	test('page loads and ends up on bookings tab', async ({ page }) => {
		const response = await page.goto('/admin/cancellations/');
		expect(response?.status()).toBe(200);
		// Client-side redirect to the bookings view — wait for it to land.
		await page.waitForURL('**/admin/bookings/**', { timeout: 15000 });
		expect(page.url()).toContain('/admin/bookings/');
		await expect(page.locator('text=/Fatal|Exception/i')).toHaveCount(0);
	});

	test('page shows expert and user cancellation tabs', async ({ page }) => {
		await openAdminPage(page, '/admin/cancellations/');
		await Promise.all([
			expect(page.locator('[data-test-id="tabnav-btn-expert-cancellations"]')).toBeVisible({ timeout: 8000 }),
			expect(page.locator('[data-test-id="tabnav-btn-user-cancellations"]')).toBeVisible({ timeout: 8000 }),
		]);
	});

	test('page shows table or empty state on each cancellation tab', async ({ page }) => {
		await openAdminPage(page, '/admin/cancellations/');
		// Wait for the tab strip to render so we know JS has mounted —
		// otherwise the non-polling `isVisible()` snapshot below races
		// the React island under load.
		await expect(page.locator('[data-test-id="tabnav-btn-expert-cancellations"]')).toBeVisible({ timeout: 8000 });
		// Expert cancellations tab is default after redirect. Either-or
		// check via `expect.poll` so both alternatives keep being
		// re-evaluated until one is true (or the timeout trips).
		await expect.poll(async () => {
			const t = await page.locator('table').isVisible().catch(() => false);
			const e = await page.locator('text=/не найдено|No.*found/i').isVisible().catch(() => false);
			return t || e;
		}, { timeout: 8000, intervals: [50, 150, 400] }).toBeTruthy();
		// User cancellations tab
		await page.locator('[data-test-id="tabnav-btn-user-cancellations"]').click();
		await expect.poll(async () => {
			const t = await page.locator('table').isVisible().catch(() => false);
			const e = await page.locator('text=/не найдено|No.*found/i').isVisible().catch(() => false);
			return t || e;
		}, { timeout: 8000, intervals: [50, 150, 400] }).toBeTruthy();
	});

	test('expert-cancellations tab exposes expert/user/date filters', async ({ page }) => {
		await openAdminPage(page, '/admin/bookings/?tab=expert-cancellations');
		await Promise.all([
			expect(page.locator('[data-test-id="expert-cancellations-tab"]')).toBeVisible({ timeout: 8000 }),
			expect(page.locator('[data-test-id="expert-cancellations-expert"]')).toBeVisible({ timeout: 5000 }),
			expect(page.locator('[data-test-id="expert-cancellations-user"]')).toBeVisible({ timeout: 5000 }),
			expect(page.locator('[data-test-id="expert-cancellations-date-from"]')).toBeVisible({ timeout: 5000 }),
			expect(page.locator('[data-test-id="expert-cancellations-date-to"]')).toBeVisible({ timeout: 5000 }),
			expect(page.locator('[data-test-id="expert-cancellations-reset"]')).toBeVisible({ timeout: 5000 }),
		]);
	});

	test('user-cancellations tab exposes expert/user/date filters', async ({ page }) => {
		await openAdminPage(page, '/admin/bookings/?tab=user-cancellations');
		await Promise.all([
			expect(page.locator('[data-test-id="user-cancellations-tab"]')).toBeVisible({ timeout: 8000 }),
			expect(page.locator('[data-test-id="user-cancellations-expert"]')).toBeVisible({ timeout: 5000 }),
			expect(page.locator('[data-test-id="user-cancellations-user"]')).toBeVisible({ timeout: 5000 }),
			expect(page.locator('[data-test-id="user-cancellations-date-from"]')).toBeVisible({ timeout: 5000 }),
			expect(page.locator('[data-test-id="user-cancellations-date-to"]')).toBeVisible({ timeout: 5000 }),
			expect(page.locator('[data-test-id="user-cancellations-reset"]')).toBeVisible({ timeout: 5000 }),
		]);
	});
});
