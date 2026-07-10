import { test as setup } from '@playwright/test';
import { registerAccount, fillProfileForm } from '../helpers/auth';
import { saveUserMeta, resolveStorageStatePath } from '../helpers/state';
import { USER_LOGIN } from '../helpers/logins';

export { USER_LOGIN };

setup('create user account', async ({ page }) => {
	setup.skip(process.env.PW_WORKER_ISOLATION !== '0', 'isolation mode: globalSetup runs registration + dev-login per worker');
	await registerAccount(page, USER_LOGIN);

	await fillProfileForm(page, USER_LOGIN, {
		name: 'Setup User',
		accountType: 'user',
		timezone: 'Europe/Moscow',
	});

	await page.context().storageState({ path: resolveStorageStatePath('user') });
	saveUserMeta('user', { login: USER_LOGIN });
	console.log(`User setup complete: ${USER_LOGIN}`);
});
