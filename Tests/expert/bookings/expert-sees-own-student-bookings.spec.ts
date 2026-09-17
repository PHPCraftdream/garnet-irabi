/**
 * D-184 [P1]: раздел «Брони» подменялся по роли одной строкой
 * `isExpert() ? 'expert' : 'user'`, поэтому преподаватель видел ТОЛЬКО
 * входящие заявки на свои слоты. Его собственные ученические брони —
 * включая активные — исчезали из навигации целиком.
 *
 * Почему это дороже, чем звучит: человек, который сначала занимался, а
 * потом сам стал преподавать (обычный путь на такой площадке), не мог
 * ни открыть свою бронь, ни отменить её вовремя. Отмена завязана на
 * сроки и неустойку, так что недоступность превращается в деньги.
 * Данные при этом никуда не девались — профиль честно показывал «1 в
 * процессе», просто дороги к ним из раздела не существовало.
 *
 * Тест закрепляет обе половины контракта: преподавателю доступны обе
 * стороны, и на своей стороне он видит именно свою бронь.
 */
import { test, expect, tn } from '../../helpers/scoped-test';
import { withConnection } from '../../helpers/db/db';

test.describe.configure({ mode: 'serial' });

async function accountId(login: string): Promise<number> {
	return withConnection(async (c) => {
		const [rows] = await c.execute<any[]>(`SELECT id FROM ${tn('accounts')} WHERE login = ?`, [login]);
		return rows[0]?.id ?? 0;
	});
}

function generateUid(): string {
	return [...Array(16)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
}

test.describe('D-184: преподаватель видит свои ученические брони, а не только входящие', () => {
	let hostExpertId = 0; // чей слот бронируем
	let learnerExpertId = 0; // кто бронирует — сам преподаватель
	let slotId = 0;
	let bookingId = 0;

	test.beforeAll(async () => {
		// Слот принадлежит ДРУГОМУ преподавателю: бронировать у самого себя
		// нельзя, а нам нужна именно ученическая бронь преподавателя.
		hostExpertId = await accountId('testuser_setup_expert_moderator@irabi.test');
		learnerExpertId = await accountId('testuser_setup_expert@irabi.test');
		expect(hostExpertId, 'нужен второй аккаунт-преподаватель').toBeGreaterThan(0);
		expect(learnerExpertId).toBeGreaterThan(0);

		const startAt = Math.floor(Date.now() / 1000) + 86400 * 5;

		slotId = await withConnection(async (c) => {
			const [res]: any = await c.execute(
				`INSERT INTO ${tn('time_slots')}
				 (expert_id, start_at, end_at, duration_min, cost, is_online, location, max_users, booked_count, status, uid, created_at)
				 VALUES (?, ?, ?, 60, 500, 1, 'https://meet.example.com/d184', 1, 1, 'booked', ?, ?)`,
				[hostExpertId, startAt, startAt + 3600, generateUid(), Math.floor(Date.now() / 1000)],
			);
			return res.insertId;
		});

		bookingId = await withConnection(async (c) => {
			const [res]: any = await c.execute(
				`INSERT INTO ${tn('bookings')} (user_id, bookable_type, bookable_id, status, created_at, confirmed_at)
				 VALUES (?, 'time_slot', ?, 'confirmed', ?, ?)`,
				[learnerExpertId, slotId, Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000)],
			);
			return res.insertId;
		});

		expect(slotId).toBeGreaterThan(0);
		expect(bookingId).toBeGreaterThan(0);
	});

	test.afterAll(async () => {
		await withConnection(async (c) => {
			if (bookingId) await c.execute(`DELETE FROM ${tn('bookings')} WHERE id = ?`, [bookingId]);
			if (slotId) await c.execute(`DELETE FROM ${tn('time_slots')} WHERE id = ?`, [slotId]);
		});
	});

	test('преподавателю доступны обе стороны раздела', async ({ expertPage }) => {
		await expertPage.goto('/system/bookings', { waitUntil: 'domcontentloaded' });

		const swith = expertPage.locator('[data-test-id="bookings-view-switch"]');
		await expect(swith, 'у преподавателя должен быть выбор стороны').toBeVisible({ timeout: 15000 });
		await expect(expertPage.locator('[data-test-id="bookings-view-expert"]')).toBeVisible();
		await expect(expertPage.locator('[data-test-id="bookings-view-user"]')).toBeVisible();
	});

	test('на своей стороне видна собственная бронь преподавателя', async ({ expertPage }) => {
		await expertPage.goto('/system/bookings', { waitUntil: 'domcontentloaded' });

		// По умолчанию открыты входящие — прежнее поведение сохранено, свою
		// бронь там показывать и не должны.
		const card = expertPage.locator(`[data-test-id="booking-card-${bookingId}"]`);
		await expect(card, 'своя бронь не должна попадать во входящие заявки').toHaveCount(0);

		await expertPage.locator('[data-test-id="bookings-view-user"]').click();

		// Вот она — ровно то, что раньше было недостижимо из интерфейса.
		await expect(card, 'своя ученическая бронь должна быть видна').toBeVisible({ timeout: 15000 });
	});

	test('обычный ученик переключателя не видит — выбирать ему нечего', async ({ userPage }) => {
		await userPage.goto('/system/bookings', { waitUntil: 'domcontentloaded' });

		await expect(userPage.locator('[data-test-id="bookings-tab"]')).toBeVisible({ timeout: 15000 });
		await expect(userPage.locator('[data-test-id="bookings-view-switch"]')).toHaveCount(0);
	});
});
