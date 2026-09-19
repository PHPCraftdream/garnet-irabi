/**
 * D-166: карточка входящей брони должна показывать время в ЧАСОВОМ ПОЯСЕ
 * АККАУНТА эксперта, а не в часовом поясе браузера — иначе преподаватель
 * может прийти на занятие не в тот час.
 *
 * Прежняя проверка (через magic-login-токен, вставленный напрямую в БД, в
 * обход обычного входа) не смогла ни подтвердить, ни опровергнуть находку:
 * цепочка в коде выглядела корректной (`formatTs` берёт часовой пояс из
 * `window.__GARNET_USER__.timezone`, который кладёт `HtmlLayout::render()`
 * из `Account::readParam('time_zone')`), но подозревался устаревший кэш
 * `__GARNET_USER__` именно из-за нестандартного пути входа — то есть
 * нужен был повтор обычным входом, которого тогда не сделали.
 *
 * Этот тест — обещанный повтор, и он опровергает находку. Вход обычный
 * (сохранённая сессия роли expert, та же кука, каким входят все проверки),
 * а браузер намеренно выставлен в ДРУГОЙ часовой пояс (UTC), чтобы откат
 * к часовому поясу браузера был виден, если бы он случился: `DateUtils.ts`
 * резолвит часовой пояс в три шага, и третий (браузер) — молчаливый
 * запасной вариант на случай, если `__GARNET_USER__.timezone` не пришёл.
 * Карточка показывает московское время корректно даже при браузере в
 * UTC — конвертация работает, и подозрение исходного расследования
 * (нестандартный путь входа, а не продукт) подтвердилось.
 */
import { test, expect } from '../../helpers/scoped-test';
import { newScopedContext, tn } from '../../helpers/scoped-test';
import { roleStateFile } from '../../helpers/scoped-test/role-fixtures';
import { withConnection } from '../../helpers/db/db';

function generateUid(): string {
	return [...Array(16)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
}

test.describe('D-166: время входящей брони — в часовом поясе аккаунта, не браузера', () => {
	let expertId = 0;
	let studentId = 0;
	let slotId = 0;
	let bookingId = 0;
	// Круглый час UTC, далеко в будущем — конвертацию легко проверить на глаз.
	const startAt = Math.floor(Date.UTC(2026, 11, 1, 12, 0, 0) / 1000); // 2026-12-01 12:00:00 UTC
	// testuser_setup_expert@irabi.test — именно этот аккаунт стоит за
	// сохранённой сессией roleStateFile(0, 'expert') (её пишет
	// global-setup.prod.ts своей картой ROLES — отдельной от
	// PROD_ROLE_LOGIN в role-login.ts, см. #504). time_zone=Europe/Moscow
	// (TestScopeSeedService), в декабре UTC+3.
	const EXPECTED_MOSCOW_TIME = '01.12.2026, 15:00';

	test.beforeAll(async () => {
		expertId = await withConnection(async (c) => {
			const [rows] = await c.execute<any[]>(`SELECT id FROM ${tn('accounts')} WHERE login = ?`, ['testuser_setup_expert@irabi.test']);
			return rows[0]?.id ?? 0;
		});
		studentId = await withConnection(async (c) => {
			const [rows] = await c.execute<any[]>(`SELECT id FROM ${tn('accounts')} WHERE login = ?`, ['testuser_setup_user@irabi.test']);
			return rows[0]?.id ?? 0;
		});
		expect(expertId, 'нужен testuser_setup_expert@irabi.test').toBeGreaterThan(0);
		expect(studentId, 'нужен testuser_setup_user@irabi.test').toBeGreaterThan(0);

		slotId = await withConnection(async (c) => {
			const [res]: any = await c.execute(
				`INSERT INTO ${tn('time_slots')}
				 (expert_id, start_at, end_at, duration_min, cost, is_online, location, max_users, booked_count, status, uid, created_at)
				 VALUES (?, ?, ?, 60, 0, 1, 'https://meet.example.com/d166-tz', 1, 1, 'booked', ?, UNIX_TIMESTAMP())`,
				[expertId, startAt, startAt + 3600, generateUid()],
			);
			return res.insertId;
		});
		bookingId = await withConnection(async (c) => {
			const [res]: any = await c.execute(
				`INSERT INTO ${tn('bookings')} (user_id, bookable_type, bookable_id, status, created_at, confirmed_at)
				 VALUES (?, 'time_slot', ?, 'confirmed', UNIX_TIMESTAMP(), UNIX_TIMESTAMP())`,
				[studentId, slotId],
			);
			return res.insertId;
		});
		expect(slotId, 'слот для эксперимента не создался').toBeGreaterThan(0);
		expect(bookingId, 'бронь для эксперимента не создалась').toBeGreaterThan(0);
	});

	test.afterAll(async () => {
		await withConnection(async (c) => {
			if (bookingId) await c.execute(`DELETE FROM ${tn('bookings')} WHERE id = ?`, [bookingId]);
			if (slotId) await c.execute(`DELETE FROM ${tn('time_slots')} WHERE id = ?`, [slotId]);
		});
	});

	test('браузер в UTC, эксперт в Europe/Moscow — карточка показывает московское время', async ({ browser }) => {
		// Собственный контекст, а не общая роль-фикстура: forcing timezoneId
		// на разделяемом worker-контексте задело бы другие проверки в том же
		// воркере. storageState роли expert даёт обычную, настоящую сессию —
		// тот же путь входа, каким проходят все проверки этого набора.
		const ctx = await newScopedContext(browser, {
			storageState: roleStateFile(0, 'expert'),
			timezoneId: 'UTC',
		});
		const page = await ctx.newPage();
		try {
			await page.goto('/system/bookings', { waitUntil: 'domcontentloaded' });
			await expect(page.locator('[data-test-id="bookings-tab"]')).toBeVisible({ timeout: 15000 });

			const card = page.locator(`[data-test-id="booking-card-${bookingId}"]`);
			await expect(card, 'карточка входящей брони не появилась').toBeVisible({ timeout: 15000 });

			// Решающее утверждение: если бы часовой пояс молча откатился на
			// браузерный (UTC), карточка показала бы «01.12.2026, 12:00» —
			// эту возможность исключаем явно, а не только проверяем позитив.
			await expect(card).not.toContainText('01.12.2026, 12:00');
			await expect(card).toContainText(EXPECTED_MOSCOW_TIME);
		} finally {
			await ctx.close();
		}
	});
});
