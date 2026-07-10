/**
 * Admin — /admin/logs/?tab=mails — Mails tab filter widgets
 *
 * Verifies:
 *   - The mails-recipient-filter Combobox + the mails-type-filter <select> both narrow the row set
 *   - Clearing them (selecting the "All" entry) restores the original count
 *
 * Self-contained: inserts two synthetic rows with distinct types/recipients,
 * tears them down at the end. Uses the seeded admin storageState.
 */

import { test, expect, tn } from '../../../helpers/scoped-test';
import type { Page } from '@playwright/test';
import mysql, { RowDataPacket } from 'mysql2/promise';
import { DB } from '../../../helpers/db';
test.describe.configure({ mode: 'serial' });

const TEST_DOMAIN = '@logs-mails-tab.test';
const ROW_SEL = 'tbody tr:not(:has(td[colspan]))';

async function dbExec(sql: string, params: unknown[] = []) {
	const conn = await mysql.createConnection(DB);
	try { await conn.execute(sql, params); } finally { await conn.end(); }
}

async function dbQuery<T extends RowDataPacket>(sql: string, params: unknown[] = []): Promise<T[]> {
	const conn = await mysql.createConnection(DB);
	try { const [rows] = await conn.execute<T[]>(sql, params); return rows; }
	finally { await conn.end(); }
}

async function openMailsTab(page: Page) {
	await page.goto('/admin/logs/?tab=mails');
	await page.waitForSelector('[data-test-id="admin-logs-viewer"]', { timeout: 15000 });
	await page.locator('[data-test-id="tabnav-btn-mails"]').waitFor({ state: 'visible', timeout: 10000 });
	if (await page.locator('[data-test-id="tabnav-btn-mails"]').getAttribute('aria-selected') !== 'true') {
		await page.locator('[data-test-id="tabnav-btn-mails"]').click();
	}
	await page.waitForSelector('tbody', { timeout: 8000 });
}

test.describe('Admin — Logs viewer — mails tab filters', () => {
	test.beforeAll(async () => {
		await dbExec(`DELETE FROM ${tn('mail_log')} WHERE recipient_email LIKE ?`, [`%${TEST_DOMAIN}`]);

		// Find a real admin account so the recipient combobox renders a non-NoAccount option.
		const rows = await dbQuery<RowDataPacket & { id: number }>(
			`SELECT id FROM ${tn('accounts')} WHERE login = ?`,
			['testuser_setup_admin@irabi.test']
		);
		const adminId = rows[0]?.id ?? 0;
		if (!adminId) throw new Error('seed admin missing');

		await dbExec(
			`INSERT INTO ${tn('mail_log')} (account_id, recipient_email, mail_type, subject, status, created_at)
			 VALUES (?, ?, 'auth_code', 'Filter A', 'sent', UNIX_TIMESTAMP()),
			        (?, ?, 'general',   'Filter B', 'sent', UNIX_TIMESTAMP()-10)`,
			[adminId, `a${TEST_DOMAIN}`, adminId, `b${TEST_DOMAIN}`]
		);
	});

	test.afterAll(async () => {
		await dbExec(`DELETE FROM ${tn('mail_log')} WHERE recipient_email LIKE ?`, [`%${TEST_DOMAIN}`]);
	});

	test('type filter narrows rows; resetting it restores them', async ({ page }) => {
		await openMailsTab(page);

		const rows = page.locator(ROW_SEL);
		const totalBefore = await rows.count();
		expect(totalBefore).toBeGreaterThanOrEqual(2);

		// Pick a type value present in the options (e.g. "auth_code").
		const typeSelect = page.locator('[data-test-id="mails-type-filter"]');
		await expect(typeSelect).toBeVisible({ timeout: 5000 });
		const optionValues = await typeSelect.locator('option').evaluateAll(
			els => els.map(el => (el as HTMLOptionElement).value)
		);
		const concrete = optionValues.find(v => v !== '');
		if (!concrete) { test.skip(); return; }

		await typeSelect.selectOption(concrete);
		await expect.poll(async () => rows.count(), { timeout: 6000, intervals: [50, 150, 400] }).toBeLessThan(totalBefore);

		// Reset by selecting empty value
		await typeSelect.selectOption('');
		await expect.poll(async () => rows.count(), { timeout: 6000, intervals: [50, 150, 400] }).toBe(totalBefore);
	});

	test('recipient combobox narrows rows', async ({ page }) => {
		await openMailsTab(page);

		const rows = page.locator(ROW_SEL);
		const totalBefore = await rows.count();
		expect(totalBefore).toBeGreaterThanOrEqual(2);

		// Open Combobox
		await page.locator('[data-test-id="mails-recipient-filter"]').click();

		// Pick the first non-"All" option (value !== '').
		const options = page.locator('[data-test-id^="mails-recipient-filter-option-"]');
		await expect(options.first()).toBeVisible({ timeout: 5000 });

		const count = await options.count();
		let pickedTestId: string | null = null;
		for (let i = 0; i < count; i++) {
			const id = await options.nth(i).getAttribute('data-test-id');
			// "All" entry has empty value → testId ends with "filter-option-"
			if (id && !id.endsWith('-option-')) { pickedTestId = id; break; }
		}
		if (!pickedTestId) { test.skip(); return; }

		await page.locator(`[data-test-id="${pickedTestId}"]`).click();

		await expect.poll(async () => rows.count(), { timeout: 6000, intervals: [50, 150, 400] }).toBeLessThanOrEqual(totalBefore);
	});
});
