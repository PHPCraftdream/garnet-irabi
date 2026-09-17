import { test as setup } from '@playwright/test';
import mysql from 'mysql2/promise';
import { registerAccount, fillProfileForm } from '../helpers/auth/auth';
import { saveUserMeta, resolveStorageStatePath } from '../helpers/auth/state';
import { EXPERT_LOGIN } from '../helpers/auth/logins';

import { tn } from '../helpers/scoped-test';
export { EXPERT_LOGIN };

const DB_CONFIG = {
	host: '127.0.0.1',
	port: 3306,
	database: 'app_db',
	user: 'app_db',
	password: 'app_db',
};

setup('create expert user', async ({ page }) => {
	setup.skip(process.env.PW_WORKER_ISOLATION !== '0', 'isolation mode: globalSetup runs registration + dev-login per worker');
	await registerAccount(page, EXPERT_LOGIN);

	await fillProfileForm(page, EXPERT_LOGIN, {
		name: 'Setup Expert',
		accountType: 'expert',
		timezone: 'Europe/Moscow',
	});

	const conn = await mysql.createConnection(DB_CONFIG);
	try {
		await conn.execute(
			`UPDATE ${tn('accounts')} SET type = 'expert' WHERE login = ?`,
			[EXPERT_LOGIN]
		);

		await conn.execute(
			`INSERT INTO ${tn('accounts_data')} (account_id, param, value)
			 SELECT id, 'IS_APPROVED', '1' FROM ${tn('accounts')} WHERE login = ?
			 ON DUPLICATE KEY UPDATE value = '1'`,
			[EXPERT_LOGIN]
		);

		const [allRows]: any = await conn.execute(
			`SELECT id, login FROM ${tn('accounts')} WHERE login = ?`,
			[EXPERT_LOGIN]
		);
		const row = allRows[0];
		if (!row) {
			// Debug: check all test accounts
			const [allTestRows]: any = await conn.execute(
				`SELECT id, login FROM ${tn('accounts')} WHERE login LIKE '%@%.test' LIMIT 10`
			);
			console.error(`Expert account not found! EXPERT_LOGIN='${EXPERT_LOGIN}', test accounts in DB:`, JSON.stringify(allTestRows));
			throw new Error(`Expert account not found in DB after registration: ${EXPERT_LOGIN}`);
		}
		const expertId: number = row.id;

		// Профиль преподавателя больше не отдельная таблица: имя берётся из
		// аккаунта, «о себе» — из `accounts.about`.
		await conn.execute(
			`UPDATE ${tn('accounts')} SET about = 'Test expert bio' WHERE id = ?`,
			[expertId]
		);

		const now = Math.floor(Date.now() / 1000);
		const day = 86400;

		for (let i = 1; i <= 3; i++) {
			// Слоты фикстуры привязаны к полуночи UTC, а не к моменту запуска.
		// Раньше было `now + 36000`, и время слота ехало вместе с часом
		// прогона: под утро оно доезжало до 14:00 и накладывалось на слот,
		// который создаёт expert-onboarding, — тест падал только ночью.
		const midnightUtc = Math.floor(now / day) * day;
		const startAt = midnightUtc + day * i + 36000;
			const uid = [...Array(16)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
			await conn.execute(
				`INSERT INTO ${tn('time_slots')}
				 (expert_id, start_at, end_at, duration_min, cost, is_online, location, max_users, status, uid, created_at)
				 VALUES (?, ?, ?, 60, 500, 1, 'https://meet.example.com/test', 1, 'free', ?, ?)`,
				[expertId, startAt, startAt + 3600, uid, now]
			);
		}

		console.log(`Expert seed data created: expertId=${expertId}`);
	} finally {
		await conn.end();
	}

	await page.context().storageState({ path: resolveStorageStatePath('expert') });
	saveUserMeta('expert', { login: EXPERT_LOGIN });
	console.log(`Expert setup complete: ${EXPERT_LOGIN}`);
});
