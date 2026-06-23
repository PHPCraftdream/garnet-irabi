import { test as setup } from '@playwright/test';
import mysql from 'mysql2/promise';
import { registerAccount, fillProfileForm } from '../helpers/auth';
import { saveUserMeta, resolveStorageStatePath } from '../helpers/state';
import { OWNER_LOGIN } from '../helpers/logins';

import { tn } from '../helpers/scoped-test';
export { OWNER_LOGIN };

const DB_CONFIG = {
	host: '127.0.0.1',
	port: 3306,
	database: 'app_db',
	user: 'app_db',
	password: 'app_db',
};

setup('create owner user', async ({ page }) => {
	setup.skip(process.env.PW_WORKER_ISOLATION !== '0', 'isolation mode: globalSetup runs registration + dev-login per worker');
	await registerAccount(page, OWNER_LOGIN);

	await fillProfileForm(page, OWNER_LOGIN, {
		name: 'Setup Owner',
		accountType: 'user',
		timezone: 'Europe/Moscow',
	});

	const conn = await mysql.createConnection(DB_CONFIG);
	try {
		await conn.execute(
			`INSERT INTO ${tn('accounts_data')} (account_id, param, value)
			 SELECT id, 'IS_OWNER', '1' FROM ${tn('accounts')} WHERE login = ?
			 ON DUPLICATE KEY UPDATE value = '1'`,
			[OWNER_LOGIN]
		);
		await conn.execute(
			`INSERT INTO ${tn('accounts_data')} (account_id, param, value)
			 SELECT id, 'IS_MODERATOR', '1' FROM ${tn('accounts')} WHERE login = ?
			 ON DUPLICATE KEY UPDATE value = '1'`,
			[OWNER_LOGIN]
		);
		console.log(`Owner setup complete: ${OWNER_LOGIN}`);
	} finally {
		await conn.end();
	}

	await page.context().storageState({ path: resolveStorageStatePath('owner') });
	saveUserMeta('owner', { login: OWNER_LOGIN });
});
