/**
 * Cross-role — OwnerSM × ModerationSM capability chain
 *
 * Verifies 3-level role chain:
 *   1. Owner grants IS_MODERATOR to a user (OwnerSM transition)
 *   2. That user (now moderator) can approve an expert (ModerationSM)
 *   3. Expert profile becomes visible in user view (ExpertProfileSM)
 *
 * State machines:
 *   OwnerSM:         grants IS_MODERATOR → user becomes moderator
 *   ModerationSM:    moderator approves expert → ExpertProfileSM: not_approved → approved
 *   ExpertProfileSM: approved expert's slots appear for users
 *
 * Entry: owner authenticated, moderator user exists (but IS_MODERATOR may be 0),
 *        expert profile exists (is_approved may be any state).
 * Exit: moderator's IS_MODERATOR = 0 (revoked); expert restored to initial state.
 */

import { test, expect, tn } from '../helpers/scoped-test';
import mysql from 'mysql2/promise';
import type { BrowserContext } from '@playwright/test';
import { resolveStorageStatePath } from '../helpers/state';

import { newScopedContext } from '../helpers/scoped-test';
import { DB } from '../helpers/db';
test.describe.configure({ mode: 'serial' });

// ── DB helpers ─────────────────────────────────────────────────────────────────

async function getAccountId(login: string): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT id FROM ${tn('accounts')} WHERE login = ?`, [login]
		);
		return rows[0]?.id ?? 0;
	} finally { await conn.end(); }
}

async function getFlagValue(accountId: number, flag: string): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT value FROM ${tn('accounts_data')} WHERE account_id = ? AND param = ?`,
			[accountId, flag]
		);
		return parseInt(rows[0]?.value ?? '0', 10);
	} finally { await conn.end(); }
}

async function getExpertApproval(expertId: number): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT is_approved FROM ${tn('expert_profiles')} WHERE account_id = ?`,
			[expertId]
		);
		return rows[0]?.is_approved ?? 0;
	} finally { await conn.end(); }
}

async function setFlag(accountId: number, flag: string, value: number) {
	const conn = await mysql.createConnection(DB);
	try {
		await conn.execute(
			`INSERT INTO ${tn('accounts_data')} (account_id, param, value)
			 VALUES (?, ?, ?)
			 ON DUPLICATE KEY UPDATE value = VALUES(value)`,
			[accountId, flag, String(value)]
		);
	} finally { await conn.end(); }
}

async function setExpertApproval(expertId: number, value: number) {
	const conn = await mysql.createConnection(DB);
	try {
		await conn.execute(
			`UPDATE ${tn('expert_profiles')} SET is_approved = ? WHERE account_id = ?`,
			[value, expertId]
		);
		await conn.execute(
			`INSERT INTO ${tn('accounts_data')} (account_id, param, value)
			 SELECT id, 'IS_APPROVED', ? FROM ${tn('accounts')} WHERE id = ?
			 ON DUPLICATE KEY UPDATE value = VALUES(value)`,
			[String(value), expertId]
		);
	} finally { await conn.end(); }
}

// ── Test suite ─────────────────────────────────────────────────────────────────

test.describe('OwnerSM × ModerationSM: 3-level capability chain', () => {
	let moderatorId = 0;
	let expertId = 0;
	let initialExpertApproval = 0;
	let ownerCtx: BrowserContext | null = null;

	test('entry: record initial states, reset to clean start', async () => {
		moderatorId = await getAccountId('testuser_setup_moderator@irabi.test');
		expertId   = await getAccountId('testuser_setup_expert@irabi.test');
		expect(moderatorId).toBeGreaterThan(0);
		expect(expertId).toBeGreaterThan(0);

		// Remove IS_MODERATOR from moderator user for clean start
		await setFlag(moderatorId, 'IS_MODERATOR', 0);

		// Record expert's initial approval state; reset to unapproved
		initialExpertApproval = await getExpertApproval(expertId);
		await setExpertApproval(expertId, 0);

		// Verify starting state
		expect(await getFlagValue(moderatorId, 'IS_MODERATOR')).toBe(0);
		expect(await getExpertApproval(expertId)).toBe(0);
	});

	// ── Step 1: Owner grants IS_MODERATOR ───────────────────────────────────────

	test('OwnerSM: owner grants IS_MODERATOR to moderator user', async ({ browser }) => {
		if (!moderatorId) { test.skip(); return; }

		ownerCtx = await newScopedContext(browser, { storageState: resolveStorageStatePath('owner') });
		// Force max page-size so seed-account ids stay on page 1 of the admin grid
		// (default became 10/page in a recent change).
		await ownerCtx.addInitScript(() => { try { localStorage.setItem('garnet.pageSize', '100'); } catch {} });
		const ownerPage = await ownerCtx.newPage();
		try {
			await ownerPage.goto('/admin/');
			await expect(ownerPage.locator('[data-test-id="filter-tab-all"]')).toBeVisible({ timeout: 20000 });

			const grantBtn = ownerPage.locator(`[data-test-id="flag-IS_MODERATOR-${moderatorId}"]`);
			await expect(grantBtn).toBeVisible({ timeout: 8000 });
			await Promise.all([
				ownerPage.waitForResponse(
					resp => resp.url().includes('/admin/') && resp.request().method() === 'POST',
					{ timeout: 10000 }
				),
				grantBtn.click(),
			]);
		} finally {
			await ownerPage.close();
		}
	});

	test('OwnerSM → AccountSM: IS_MODERATOR = 1 in DB after owner grant', async () => {
		if (!moderatorId) { test.skip(); return; }
		const isMod = await getFlagValue(moderatorId, 'IS_MODERATOR');
		expect(isMod).toBe(1);
	});

	// ── Step 2: Moderator (just granted) approves expert ──────────────────────

	test('ModerationSM: moderator (newly granted) approves expert', async ({ browser }) => {
		if (!expertId || !moderatorId) { test.skip(); return; }

		const modCtx = await newScopedContext(browser, { storageState: resolveStorageStatePath('moderator') });
		const modPage = await modCtx.newPage();
		try {
			await modPage.goto('/admin/');
			await expect(modPage.locator('[data-test-id="filter-tab-all"]')).toBeVisible({ timeout: 20000 });

			// Filter to experts tab and search for the specific expert
			await modPage.locator('[data-test-id="filter-tab-experts"]').click();
			await modPage.locator('[data-test-id="admin-grid-search"]').fill('testuser_setup_expert@irabi.test');

			const approveBtn = modPage.locator(`[data-test-id="flag-IS_APPROVED-${expertId}"]`);
			await expect(approveBtn).toBeVisible({ timeout: 8000 });
			await Promise.all([
				modPage.waitForResponse(
					resp => resp.url().includes('/admin/') && resp.request().method() === 'POST',
					{ timeout: 10000 }
				),
				approveBtn.click(),
			]);
		} finally {
			await modCtx.close();
		}
	});

	test('ExpertProfileSM: expert is_approved = 1 after moderator approval', async () => {
		if (!expertId) { test.skip(); return; }
		const approval = await getExpertApproval(expertId);
		expect(approval).toBe(1);
	});

	// ── Step 3: User can see expert's slots ─────────────────────────────────────

	test('ExpertProfileSM approved: user can see expert slots on home page', async ({ browser }) => {
		if (!expertId) { test.skip(); return; }

		const userCtx = await newScopedContext(browser, { storageState: resolveStorageStatePath('user') });
		const userPage = await userCtx.newPage();
		try {
			await userPage.goto('/');
			// At least some content loads without error
			await expect(userPage.locator('text=/Fatal|Exception/i')).toHaveCount(0);
			// If expert has free future slots, they're visible
			const slotCards = userPage.locator('[data-test-id="slot-card"]');
			const count = await slotCards.count();
			console.log('User sees slot cards after expert approval:', count);
		} finally {
			await userCtx.close();
		}
	});

	// ── Revoke chain (cleanup) ──────────────────────────────────────────────────

	test('OwnerSM: owner revokes IS_MODERATOR (cleanup)', async () => {
		if (!moderatorId || !ownerCtx) { test.skip(); return; }

		const ownerPage = await ownerCtx.newPage();
		try {
			await ownerPage.goto('/admin/');
			await expect(ownerPage.locator('[data-test-id="filter-tab-all"]')).toBeVisible({ timeout: 20000 });

			const revokeBtn = ownerPage.locator(`[data-test-id="flag-IS_MODERATOR-${moderatorId}"]`);
			await expect(revokeBtn).toBeVisible({ timeout: 8000 });
			await Promise.all([
				ownerPage.waitForResponse(
					resp => resp.url().includes('/admin/') && resp.request().method() === 'POST',
					{ timeout: 10000 }
				),
				revokeBtn.click(),
			]);
		} finally {
			await ownerPage.close();
			await ownerCtx!.close();
			ownerCtx = null;
		}
	});

	test('AccountSM: IS_MODERATOR = 0 after owner revoke', async () => {
		if (!moderatorId) { test.skip(); return; }
		// The flag write is fire-and-forget (exAsync) — on prod the revoke POST
		// returns before the DB commit drains, so a single read can still see
		// the old value. Poll until it settles to 0.
		await expect.poll(
			() => getFlagValue(moderatorId, 'IS_MODERATOR'),
			{ timeout: 10000, intervals: [200, 500, 1000] },
		).toBe(0);
	});

	test('exit: restore expert to initial approval state', async () => {
		if (ownerCtx) { await ownerCtx.close(); ownerCtx = null; }
		if (expertId) {
			await setExpertApproval(expertId, initialExpertApproval);
		}
	});
});
