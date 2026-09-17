/**
 * D-156: "Доход за месяц" (expert dashboard) and "Доход за месяц" (owner
 * platform stats) both summed only booking_payment credits, ignoring
 * booking_refund debits from the same month — a booking paid and then
 * refunded within the same month still counted its full payment, diverging
 * from the account's actual balance by exactly the refunded amount.
 *
 * MainController (expert widget) is scoped to one account_id, so a plain
 * credit-minus-debit net over (booking_payment, booking_refund) is safe.
 * DashboardMainController (owner widget) has NO account_id filter — a naive
 * net-sum there would also pick up the student's booking_refund CREDIT (same
 * entry_type, opposite account) and silently cancel the fix back out. Only
 * the debit side of booking_refund (money leaving the expert) belongs in
 * platform revenue.
 */

import { test, expect, tn } from '../../helpers/scoped-test';
import { newScopedContext } from '../../helpers/scoped-test';
import { resolveStorageStatePath } from '../../helpers/auth/state';
import { withConnection } from '../../helpers/db/db';
import type { BrowserContext, Page } from '@playwright/test';

async function getAccountId(login: string): Promise<number> {
	return withConnection(async (c) => {
		const [rows] = await c.execute<any[]>(`SELECT id FROM ${tn('accounts')} WHERE login = ?`, [login]);
		return rows[0]?.id ?? 0;
	});
}

async function insertLedgerRow(accountId: number, isCredit: boolean, amount: number, entryType: string, refId: number): Promise<void> {
	await withConnection(async (c) => {
		await c.execute(
			`INSERT INTO ${tn('balance_ledger')} (account_id, is_credit, amount, entry_type, ref_type, ref_id, note, created_at)
			 VALUES (?, ?, ?, ?, 'booking', ?, 'D-156 regression test', UNIX_TIMESTAMP())`,
			[accountId, isCredit ? 1 : 0, amount, entryType, refId],
		);
	});
}

async function deleteLedgerRows(refIds: number[]): Promise<void> {
	if (!refIds.length) return;
	await withConnection(async (c) => {
		for (const id of refIds) {
			await c.execute(`DELETE FROM ${tn('balance_ledger')} WHERE ref_type = 'booking' AND ref_id = ?`, [id]);
		}
	});
}

async function readExpertEarnings(browser: any): Promise<number> {
	const ctx: BrowserContext = await newScopedContext(browser, { storageState: resolveStorageStatePath('expert') });
	const page: Page = await ctx.newPage();
	try {
		await page.goto('/system/', { waitUntil: 'domcontentloaded' });
		const text = await page.locator('[data-test-id="expert-stat-earnings"]').innerText();
		return parseInt(text.replace(/\D/g, ''), 10) || 0;
	} finally {
		await ctx.close();
	}
}

async function readPlatformRevenue(browser: any): Promise<number> {
	const ctx: BrowserContext = await newScopedContext(browser, { storageState: resolveStorageStatePath('owner') });
	const page: Page = await ctx.newPage();
	try {
		await page.goto('/admin/dashboard/', { waitUntil: 'domcontentloaded' });
		const text = await page.locator('[data-test-id="admin-dash-stat-revenue"]').innerText();
		return parseInt(text.replace(/\D/g, ''), 10) || 0;
	} finally {
		await ctx.close();
	}
}

test.describe.configure({ mode: 'serial' });

test.describe('D-156: "Доход за месяц" nets booking_refund against booking_payment', () => {
	let expertId = 0;
	let userId = 0;
	const refIds: number[] = [];
	let baseId = 900000000 + Math.floor(Math.random() * 90000000);

	test.beforeAll(async () => {
		expertId = await getAccountId('testuser_setup_expert@irabi.test');
		userId = await getAccountId('testuser_setup_user@irabi.test');
		expect(expertId).toBeGreaterThan(0);
		expect(userId).toBeGreaterThan(0);
	});

	test.afterAll(async () => {
		await deleteLedgerRows(refIds);
	});

	test('expert widget: full refund within the month nets to zero, not +payment', async ({ browser }) => {
		const before = await readExpertEarnings(browser);

		const refId = baseId++;
		refIds.push(refId);
		await insertLedgerRow(expertId, true, 1000, 'booking_payment', refId);
		await insertLedgerRow(expertId, false, 1000, 'booking_refund', refId);

		const after = await readExpertEarnings(browser);
		expect(after - before).toBe(0);
	});

	test('expert widget: partial refund nets to payment minus refund', async ({ browser }) => {
		const before = await readExpertEarnings(browser);

		const refId = baseId++;
		refIds.push(refId);
		await insertLedgerRow(expertId, true, 500, 'booking_payment', refId);
		await insertLedgerRow(expertId, false, 200, 'booking_refund', refId);

		const after = await readExpertEarnings(browser);
		expect(after - before).toBe(300);
	});

	test('owner platform stats: full refund nets to zero, and does not double-subtract via the student\'s refund credit', async ({ browser }) => {
		const before = await readPlatformRevenue(browser);

		const refId = baseId++;
		refIds.push(refId);
		// Mirrors the real cancellation ledger shape: expert gets the
		// payment credit, then on refund the student gets a credit back
		// and the expert gets the matching debit — same entry_type on both
		// refund rows, opposite is_credit, opposite accounts.
		await insertLedgerRow(expertId, true, 1000, 'booking_payment', refId);
		await insertLedgerRow(userId, true, 1000, 'booking_refund', refId);
		await insertLedgerRow(expertId, false, 1000, 'booking_refund', refId);

		const after = await readPlatformRevenue(browser);
		expect(after - before).toBe(0);
	});
});
