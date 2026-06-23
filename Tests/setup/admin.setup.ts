import { test as setup } from '@playwright/test';
import mysql from 'mysql2/promise';
import { registerAccount, fillProfileForm } from '../helpers/auth';
import { saveUserMeta, resolveStorageStatePath } from '../helpers/state';
import { ADMIN_LOGIN } from '../helpers/logins';

import { tn } from '../helpers/scoped-test';
export { ADMIN_LOGIN };

const DB_CONFIG = {
	host: '127.0.0.1',
	port: 3306,
	database: 'app_db',
	user: 'app_db',
	password: 'app_db',
};

setup('create admin user', async ({ page }) => {
	setup.skip(process.env.PW_WORKER_ISOLATION !== '0', 'isolation mode: globalSetup runs registration + dev-login per worker');
	// Create testuser_setup_admin@irabi.test as a regular admin in DB so
	// other specs can find this account by name in user grids.
	await registerAccount(page, ADMIN_LOGIN);

	await fillProfileForm(page, ADMIN_LOGIN, {
		name: 'Setup Admin',
		accountType: 'user',
	});

	const conn = await mysql.createConnection(DB_CONFIG);
	try {
		await conn.execute(
			`INSERT INTO ${tn('accounts_data')} (account_id, param, value)
			 SELECT id, 'IS_ADMIN', '1' FROM ${tn('accounts')} WHERE login = ?
			 ON DUPLICATE KEY UPDATE value = '1'`,
			[ADMIN_LOGIN]
		);
		await conn.execute(
			`INSERT INTO ${tn('accounts_data')} (account_id, param, value)
			 SELECT id, 'IS_MODERATOR', '1' FROM ${tn('accounts')} WHERE login = ?
			 ON DUPLICATE KEY UPDATE value = '1'`,
			[ADMIN_LOGIN]
		);
	} finally {
		await conn.end();
	}

	// Persist storage as admin@dev.test (a DEV seed account that survives
	// globalTeardown). The testuser_setup_admin's session would otherwise be
	// wiped together with all *@irabi.test sessions — leaving the storage
	// pointing at an already-deleted DB row that touchCookie can collide with.
	// Using the dev account guarantees the saved storage stays valid across
	// runs and points at an account that always carries IS_ADMIN=1.
	await page.context().clearCookies();
	await page.goto('/');
	await page.waitForLoadState('networkidle');
	await page.evaluate(async () => {
		const fd = new FormData();
		fd.append('role', 'admin');
		await fetch('/dev-login', { method: 'POST', body: fd });
	});
	await page.goto('/');
	await page.waitForLoadState('networkidle');

	await page.context().storageState({ path: resolveStorageStatePath('admin') });
	saveUserMeta('admin', { login: ADMIN_LOGIN });
	console.log(`Admin setup complete: ${ADMIN_LOGIN} (storage as admin@dev.test)`);
});
