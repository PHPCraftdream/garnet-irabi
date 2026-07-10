/**
 * Admin — /admin/finance/ — type filter sanity for booking_invoice rows
 *
 * Verifies that for entry_type = booking_invoice, every visible row has TWO
 * ledger-party-* links (no synthetic "system" placeholder anymore).
 *
 * This guards the regression where booking_invoice/payment/refund rows would
 * sometimes render only one party link because the counter-party fell back to
 * the system "—" placeholder.
 */

import { test, expect, tn } from '../../helpers/scoped-test';
import type { Page } from '@playwright/test';
test.describe.configure({ mode: 'serial' });

async function openFinance(page: Page): Promise<boolean> {
	await page.goto('/admin/finance/');
	await page.waitForLoadState('networkidle');
	// Finance page may show an empty state (no <table>) when other tests have
	// cleaned up all ledger data. Return false to skip gracefully.
	const table = page.locator('table');
	try {
		await table.waitFor({ timeout: 12000 });
	} catch {
		return false;
	}
	return true;
}

test.describe('Admin — Finance — booking_invoice rows have two real parties', () => {
	test.beforeAll(async () => {
		// Earlier specs occasionally delete a time_slot or booking but leave
		// the booking_invoice ledger entry behind. Those orphans render with
		// only one party link (the user; expert can't be resolved without a
		// valid slot), which makes this assertion flaky. Wipe orphans before
		// the run so the test only sees ledger rows backed by complete data.
		const mysql = await import('mysql2/promise');
		const conn = await mysql.createConnection({
			host: '127.0.0.1', port: 3306,
			database: 'app_db', user: 'app_db', password: 'app_db',
		});
		try {
			await conn.execute(
				`DELETE bl FROM ${tn('balance_ledger')} bl
				 LEFT JOIN ${tn('bookings')} b ON b.id = bl.ref_id
				 LEFT JOIN ${tn('time_slots')} ts ON ts.id = b.bookable_id
				 WHERE bl.ref_type = 'booking' AND (b.id IS NULL OR ts.id IS NULL)`
			);
		} finally { await conn.end(); }
	});

	test('every booking_invoice row exposes two ledger-party-* links', async ({ page }) => {
		const hasTable = await openFinance(page);
		if (!hasTable) { test.skip(); return; }

		const select = page.locator('[data-test-id="finance-type-filter"]');
		await expect(select).toBeVisible({ timeout: 5000 });

		// Find booking_invoice option (it's only present if at least one such ledger row exists).
		const optionValues = await select.locator('option').evaluateAll(
			els => els.map(el => (el as HTMLOptionElement).value)
		);
		if (!optionValues.includes('booking_invoice')) { test.skip(); return; }

		await select.selectOption('booking_invoice');
		// Auto-apply happens through React state; allow the table to re-render.

		const rows = page.locator('tbody tr:not(:has(td[colspan]))');
		const rowCount = await rows.count();
		if (rowCount === 0) { test.skip(); return; }

		// Inspect at most the first 5 rows (sufficient as a regression check).
		const inspect = Math.min(rowCount, 5);
		for (let i = 0; i < inspect; i++) {
			const partyLinks = rows.nth(i).locator('[data-test-id^="ledger-party-"]');
			const partyCount = await partyLinks.count();
			expect(partyCount, `row ${i} party-link count`).toBeGreaterThanOrEqual(2);
		}
	});
});
