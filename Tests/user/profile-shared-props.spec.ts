/**
 * D-151/D-152: UserProfileController (/user/id~X) and MainController
 * (/system/~profile) used to independently duplicate everything the
 * `user-profile` island needs — counters, avatar, disabled placeholder,
 * MyReviews link. They drifted: /system/~profile (the real "Профиль" nav
 * target) never passed myReviewsUrl, /user/id~X never passed
 * avatar/avatar_full/is_disabled. Both now build their props through the
 * single UserProfilePresenter::buildProps(). D-151 also covers the two
 * OTHER surfaces that independently counted cancellations from the
 * (incomplete) user_cancellations table: /users/~preview and the admin
 * user card.
 */

import { test, expect, tn } from '../helpers/scoped-test';
import { newScopedContext } from '../helpers/scoped-test';
import { resolveStorageStatePath } from '../helpers/state';
import { withConnection } from '../helpers/db';
import type { BrowserContext, Page } from '@playwright/test';

async function getUserId(): Promise<number> {
	return withConnection(async (c) => {
		const [rows] = await c.execute<any[]>(`SELECT id FROM ${tn('accounts')} WHERE login = 'testuser_setup_user@irabi.test'`);
		return rows[0]?.id ?? 0;
	});
}

async function createDisabledAccount(): Promise<number> {
	return withConnection(async (c) => {
		const login = `d152-disabled-${Date.now()}@irabi-uat.test`;
		const [res]: any = await c.execute(
			`INSERT INTO ${tn('accounts')} (login, login_type, name, reg_time) VALUES (?, 'email', 'D152 Disabled Test', ?)`,
			[login, Math.floor(Date.now() / 1000)],
		);
		const id = res.insertId;
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

test.describe.configure({ mode: 'serial' });

test.describe('D-152: /system/~profile and /user/id~X render the same props', () => {
	let userId = 0;
	let ctx: BrowserContext;
	let page: Page;

	test.beforeAll(async ({ browser }) => {
		userId = await getUserId();
		expect(userId).toBeGreaterThan(0);
		ctx = await newScopedContext(browser, { storageState: resolveStorageStatePath('user') });
		page = await ctx.newPage();
	});

	test.afterAll(async () => {
		await ctx?.close().catch(() => {});
	});

	// MyReviews itself renders `null` when the account has zero reviews
	// (by design — nothing to do with D-152), so a DOM-visibility check
	// would pass/fail on unrelated seed data. Assert on the actual prop
	// the controller now sends instead — that's what D-152 fixed.
	test('/system/~profile (real "Профиль" nav target) sends myReviewsUrl in island props', async () => {
		const resp = await page.goto('/system/~profile', { waitUntil: 'domcontentloaded' });
		const html = (await resp?.text()) ?? '';
		expect(html).toContain('myReviewsUrl');
		expect(html).toContain('~myList');
	});

	test('/user/id~{ownId} also sends myReviewsUrl (same props builder)', async () => {
		const resp = await page.goto(`/user/id~${userId}`, { waitUntil: 'domcontentloaded' });
		const html = (await resp?.text()) ?? '';
		expect(html).toContain('myReviewsUrl');
		expect(html).toContain('~myList');
	});
});

test.describe('D-152: disabled account gets the disabled avatar placeholder on /user/id~X (avatar/is_disabled now flow through)', () => {
	let disabledId = 0;
	let ctx: BrowserContext;
	let page: Page;

	test.beforeAll(async ({ browser }) => {
		disabledId = await createDisabledAccount();
		expect(disabledId).toBeGreaterThan(0);
		ctx = await newScopedContext(browser, { storageState: resolveStorageStatePath('user') });
		page = await ctx.newPage();
	});

	test.afterAll(async () => {
		await ctx?.close().catch(() => {});
		await cleanupAccount(disabledId);
	});

	test('shows the disabled-account icon, not the initials fallback', async () => {
		await page.goto(`/user/id~${disabledId}`, { waitUntil: 'domcontentloaded' });
		await expect(page.locator('[data-test-id="user-avatar-disabled"]')).toBeVisible({ timeout: 10000 });
		await expect(page.locator('[data-test-id="user-avatar-fallback"]')).toHaveCount(0);
	});
});

test.describe('D-151: /users/~preview stats agree with the profile page', () => {
	let userId = 0;
	let ctx: BrowserContext;
	let page: Page;

	test.beforeAll(async ({ browser }) => {
		userId = await getUserId();
		ctx = await newScopedContext(browser, { storageState: resolveStorageStatePath('user') });
		page = await ctx.newPage();
		await page.goto('/system/', { waitUntil: 'domcontentloaded' });
	});

	test.afterAll(async () => {
		await ctx?.close().catch(() => {});
	});

	test('preview cancellations == profile Снятий + Отмен', async () => {
		const previewResult = await page.evaluate(async (args: { uid: number }) => {
			const csrf = (window as any).__GARNET_CSRF__ || '';
			const fd = new FormData();
			fd.append('CSRF_TOKEN', csrf);
			fd.append('user_id', String(args.uid));
			const previewRes = await fetch('/users/~preview', { method: 'POST', body: fd });
			return previewRes.json();
		}, { uid: userId });

		await page.goto(`/user/id~${userId}`, { waitUntil: 'domcontentloaded' });
		const readNum = async (testId: string): Promise<number> =>
			parseInt((await page.locator(`[data-test-id="${testId}"]`).innerText()).trim(), 10);
		const declines = await readNum('user-stat-declines');
		const cancellations = await readNum('user-stat-cancellations');

		expect(previewResult.user.stats.cancellations).toBe(declines + cancellations);
	});
});
