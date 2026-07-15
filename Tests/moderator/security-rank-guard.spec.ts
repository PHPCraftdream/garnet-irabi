/**
 * Security regression — H-1 / H-2 rank-guard enforcement
 *
 * Verifies that a moderator CANNOT:
 *   (a) adjust the balance of an owner/admin account (H-1)
 *   (b) set flags (IS_DISABLED, IS_OWNER, IS_ADMIN) on an owner/admin (H-2)
 *   (c) change the account type of an owner/admin (H-2)
 *   (d) adjust balance at all (adjustBalance requires isOwner, not isModerator)
 *
 * All requests are made as the moderator role via its storageState.
 * Expected response: 403 Access denied.
 */

import { test, expect, tn } from '../helpers/scoped-test';
import mysql from 'mysql2/promise';
import { DB } from '../helpers/db';
import { OWNER_LOGIN, ADMIN_LOGIN } from '../helpers/logins';
test.describe.configure({ mode: 'serial' });

async function getAccountId(login: string): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT id FROM ${tn('accounts')} WHERE login = ?`, [login]
		);
		return rows[0]?.id ?? 0;
	} finally { await conn.end(); }
}

async function getBalance(accountId: number): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT balance FROM ${tn('account_balance')} WHERE account_id = ?`, [accountId]
		);
		return rows.length ? Number(rows[0].balance) : 0;
	} finally { await conn.end(); }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('H-1: moderator cannot adjust balance (requires isOwner)', () => {
	let ownerId = 0;
	let adminId = 0;

	test('entry: resolve owner and admin account ids', async () => {
		ownerId = await getAccountId(OWNER_LOGIN);
		adminId = await getAccountId(ADMIN_LOGIN);
		expect(ownerId).toBeGreaterThan(0);
		expect(adminId).toBeGreaterThan(0);
	});

	test('POST adjustBalance on owner account returns 403', async ({ page }) => {
		if (!ownerId) { test.skip(); return; }

		const resp = await page.request.post('/admin/finance/~adjustBalance', {
			form: {
				account_id: String(ownerId),
				amount: '100',
				is_credit: '1',
				note: 'Security test — must be rejected',
			},
		});
		expect(resp.status()).toBe(403);
	});

	test('POST adjustBalance on admin account returns 403', async ({ page }) => {
		if (!adminId) { test.skip(); return; }

		const resp = await page.request.post('/admin/finance/~adjustBalance', {
			form: {
				account_id: String(adminId),
				amount: '100',
				is_credit: '1',
				note: 'Security test — must be rejected',
			},
		});
		expect(resp.status()).toBe(403);
	});

	test('POST adjustBalance on regular user also returns 403 (moderator lacks isOwner)', async ({ page }) => {
		// adjustBalance requires isOwner(), so even targeting a regular user must fail for a moderator
		const userId = await getAccountId('testuser_setup_user@irabi.test');
		expect(userId).toBeGreaterThan(0);

		const resp = await page.request.post('/admin/finance/~adjustBalance', {
			form: {
				account_id: String(userId),
				amount: '50',
				is_credit: '1',
				note: 'Security test — moderator on user must fail',
			},
		});
		expect(resp.status()).toBe(403);
	});
});

test.describe('H-2: moderator cannot set flags on owner/admin', () => {
	let ownerId = 0;
	let adminId = 0;

	test('entry: resolve ids', async () => {
		ownerId = await getAccountId(OWNER_LOGIN);
		adminId = await getAccountId(ADMIN_LOGIN);
		expect(ownerId).toBeGreaterThan(0);
		expect(adminId).toBeGreaterThan(0);
	});

	test('setUserFlag IS_DISABLED on owner returns 403', async ({ page }) => {
		if (!ownerId) { test.skip(); return; }

		const resp = await page.request.post('/admin/~setUserFlag', {
			form: { user_id: String(ownerId), flag: 'IS_DISABLED', value: '1' },
		});
		expect(resp.status()).toBe(403);
	});

	test('setUserFlag IS_DISABLED on admin returns 403', async ({ page }) => {
		if (!adminId) { test.skip(); return; }

		const resp = await page.request.post('/admin/~setUserFlag', {
			form: { user_id: String(adminId), flag: 'IS_DISABLED', value: '1' },
		});
		expect(resp.status()).toBe(403);
	});

	test('setUserFlag IS_OWNER on any user is rejected (moderator cannot set owner flags)', async ({ page }) => {
		// IS_OWNER is only in the allowed list when callerIsOwner — moderator gets 400 (invalid flag)
		// or 403 (rank guard). Either way, the action is denied.
		const userId = await getAccountId('testuser_setup_user@irabi.test');
		expect(userId).toBeGreaterThan(0);

		const resp = await page.request.post('/admin/~setUserFlag', {
			form: { user_id: String(userId), flag: 'IS_OWNER', value: '1' },
		});
		expect([400, 403]).toContain(resp.status());
	});

	test('setUserFlag IS_ADMIN on any user is rejected (moderator cannot set admin flags)', async ({ page }) => {
		const userId = await getAccountId('testuser_setup_user@irabi.test');
		expect(userId).toBeGreaterThan(0);

		const resp = await page.request.post('/admin/~setUserFlag', {
			form: { user_id: String(userId), flag: 'IS_ADMIN', value: '1' },
		});
		expect([400, 403]).toContain(resp.status());
	});
});

test.describe('H-2: moderator cannot change type of owner/admin', () => {
	let ownerId = 0;
	let adminId = 0;

	test('entry: resolve ids', async () => {
		ownerId = await getAccountId(OWNER_LOGIN);
		adminId = await getAccountId(ADMIN_LOGIN);
		expect(ownerId).toBeGreaterThan(0);
		expect(adminId).toBeGreaterThan(0);
	});

	test('setUserType on owner returns 403', async ({ page }) => {
		if (!ownerId) { test.skip(); return; }

		const resp = await page.request.post('/admin/~setUserType', {
			form: { user_id: String(ownerId), type: 'expert' },
		});
		expect(resp.status()).toBe(403);
	});

	test('setUserType on admin returns 403', async ({ page }) => {
		if (!adminId) { test.skip(); return; }

		const resp = await page.request.post('/admin/~setUserType', {
			form: { user_id: String(adminId), type: 'expert' },
		});
		expect(resp.status()).toBe(403);
	});
});

test.describe('H-1: balance unchanged after rejected adjustBalance', () => {
	test('owner balance unchanged after moderator attempt', async ({ page }) => {
		const ownerId = await getAccountId(OWNER_LOGIN);
		if (!ownerId) { test.skip(); return; }

		const balanceBefore = await getBalance(ownerId);

		await page.request.post('/admin/finance/~adjustBalance', {
			form: {
				account_id: String(ownerId),
				amount: '999999',
				is_credit: '1',
				note: 'Should never land',
			},
		});

		const balanceAfter = await getBalance(ownerId);
		expect(balanceAfter).toBe(balanceBefore);
	});
});
