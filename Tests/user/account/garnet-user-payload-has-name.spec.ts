/**
 * D-391: `window.__GARNET_USER__.name` was empty for every signed-in account,
 * even one with a real name in the database.
 *
 * The root cause was a method mix-up in `IRabi.php`'s layout params closure:
 * `Account::readData('name')` reads the EAV `accounts_data` table by param
 * key — and no account has ever had a row there with `param = 'name'`, since
 * the name lives natively in `accounts.name`. `readParam('name')` is the call
 * that reads that column, and it is the one used two lines above for
 * `time_zone` — this was a single mistyped method name, not a missing
 * feature.
 *
 * No client code reads `.name` off this payload today (checked: only
 * `.timezone` is consumed, by DateUtils.ts). The field is still part of the
 * public contract the framework ships (`GarnetUser.name` is typed for it),
 * so a value that is silently wrong for every account is worth pinning down
 * before something starts relying on it.
 */
import { test, expect } from '../../helpers/scoped-test';
import { USER_LOGIN } from '../../helpers/auth/logins';
import { withConnection } from '../../helpers/db/db';
import { tn } from '../../helpers/scoped-test';

test('window.__GARNET_USER__.name matches the account\'s real name', async ({ page }) => {
	const dbName = await withConnection(async (c) => {
		const [rows] = await c.execute<any[]>(
			`SELECT name FROM ${tn('accounts')} WHERE login = ?`, [USER_LOGIN],
		);
		return String(rows[0]?.name ?? '');
	});
	// The fixture account must actually have a name for this test to mean
	// anything — an empty expectation would pass by accident.
	expect(dbName.length).toBeGreaterThan(0);

	await page.goto('/system/', { waitUntil: 'domcontentloaded' });
	const payload = await page.evaluate(() => (window as any).__GARNET_USER__);

	expect(payload).toBeTruthy();
	expect(payload.name).toBe(dbName);
});
