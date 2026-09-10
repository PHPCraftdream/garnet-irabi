/**
 * D-153: MainController (moderator widget on /system/) excluded disabled
 * accounts from "pendingApprovals"; DashboardMainController (owner's
 * /admin/dashboard/ widget) didn't — a disabled, never-approved expert
 * counted on one screen and not the other. Both now read
 * UserEntityConfig::pendingExpertApprovals().
 */

import { test, expect, tn } from '../helpers/scoped-test';
import { newScopedContext } from '../helpers/scoped-test';
import { resolveStorageStatePath } from '../helpers/state';
import { withConnection } from '../helpers/db';
import type { BrowserContext, Page } from '@playwright/test';

async function createDisabledUnapprovedExpert(): Promise<number> {
	return withConnection(async (c) => {
		const login = `d153-disabled-expert-${Date.now()}@irabi-uat.test`;
		const [res]: any = await c.execute(
			`INSERT INTO ${tn('accounts')} (login, login_type, name, type, reg_time) VALUES (?, 'email', 'D153 Disabled Expert', 'expert', ?)`,
			[login, Math.floor(Date.now() / 1000)],
		);
		const id = res.insertId;
		await c.execute(
			`INSERT INTO ${tn('accounts_data')} (account_id, param, value) VALUES (?, 'IS_APPROVED', '0')`,
			[String(id)],
		);
		await c.execute(
			`INSERT INTO ${tn('accounts_data')} (account_id, param, value) VALUES (?, 'IS_DISABLED', '1')`,
			[String(id)],
		);
		return id;
	});
}

async function cleanupAccount(id: number): Promise<void> {
	await withConnection(async (c) => {
		await c.execute(`DELETE FROM ${tn('accounts_data')} WHERE account_id = ?`, [String(id)]);
		await c.execute(`DELETE FROM ${tn('accounts')} WHERE id = ?`, [id]);
	});
}

async function readModeratorPendingCount(browser: any): Promise<number> {
	const ctx: BrowserContext = await newScopedContext(browser, { storageState: resolveStorageStatePath('moderator') });
	const page: Page = await ctx.newPage();
	try {
		await page.goto('/system/', { waitUntil: 'domcontentloaded' });
		const text = await page.locator('[data-test-id="moderator-pending-approvals"]').innerText();
		return parseInt(text.trim(), 10);
	} finally {
		await ctx.close();
	}
}

async function readOwnerPendingCount(browser: any): Promise<number> {
	const ctx: BrowserContext = await newScopedContext(browser, { storageState: resolveStorageStatePath('owner') });
	const page: Page = await ctx.newPage();
	try {
		await page.goto('/admin/dashboard/', { waitUntil: 'domcontentloaded' });
		const text = await page.locator('[data-test-id="admin-dash-approvals-count"]').innerText();
		return parseInt(text.trim(), 10);
	} finally {
		await ctx.close();
	}
}

test.describe.configure({ mode: 'serial' });

test.describe('D-153: pending-approvals count agrees between moderator widget and owner dashboard', () => {
	let disabledExpertId = 0;
	let baselineModerator = 0;
	let baselineOwner = 0;

	test.beforeAll(async ({ browser }) => {
		baselineModerator = await readModeratorPendingCount(browser);
		baselineOwner = await readOwnerPendingCount(browser);
		expect(baselineModerator).toBe(baselineOwner);

		disabledExpertId = await createDisabledUnapprovedExpert();
		expect(disabledExpertId).toBeGreaterThan(0);
	});

	test.afterAll(async () => {
		if (disabledExpertId) await cleanupAccount(disabledExpertId);
	});

	test('a disabled, never-approved expert does not move either counter', async ({ browser }) => {
		const moderatorCount = await readModeratorPendingCount(browser);
		const ownerCount = await readOwnerPendingCount(browser);

		expect(moderatorCount).toBe(baselineModerator);
		expect(ownerCount).toBe(baselineOwner);
		expect(moderatorCount).toBe(ownerCount);
	});
});
