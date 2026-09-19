/**
 * D-203: остаток мест в групповом слоте обновляется В ТОМ ЖЕ действии, что
 * и бронь, а не только после ответа сервера.
 *
 * Нашла Рита Ландау (user-6, UAT): «сразу после своей брони экран секунду
 * показывал, что мест ещё много, хотя место заняла она сама» — испугалась,
 * что деньги списались зря. Более ранний фикс D-198 добавил перечитывание
 * занятого слота с сервера после брони (`refreshSlot()` в
 * `SlotsCalendarIsland.tsx`), но само перечитывание — сетевой круг, и пока
 * он не завершился, `slot.booked_count` в состоянии клиента остаётся
 * прежним: ровно та «вспышка», что видела Рита.
 *
 * Проверка задерживает ответ `/slots/~slotCard` искусственно, чтобы поймать
 * именно этот промежуток, и утверждает: число мест меняется СРАЗУ по
 * успеху брони, не дожидаясь задержанного ответа.
 */
import { test, expect, tn } from '../../../helpers/scoped-test';
import { withConnection } from '../../../helpers/db/db';

function generateUid(): string {
	return [...Array(16)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
}

test.describe('D-203: счётчик мест группового слота обновляется без ожидания сервера', () => {
	let expertId = 0;
	let slotId = 0;

	test.beforeAll(async () => {
		expertId = await withConnection(async (c) => {
			const [rows] = await c.execute<any[]>(`SELECT id FROM ${tn('accounts')} WHERE login = ?`, ['testuser_setup_expert@irabi.test']);
			return rows[0]?.id ?? 0;
		});
		expect(expertId, 'нужен testuser_setup_expert@irabi.test').toBeGreaterThan(0);

		const startAt = Math.floor(Date.now() / 1000) + 86400 * 7;
		slotId = await withConnection(async (c) => {
			const [res]: any = await c.execute(
				`INSERT INTO ${tn('time_slots')}
				 (expert_id, start_at, end_at, duration_min, cost, is_online, location, max_users, booked_count, status, uid, created_at)
				 VALUES (?, ?, ?, 60, 0, 1, 'https://meet.example.com/d203-seats', 2, 0, 'free', ?, UNIX_TIMESTAMP())`,
				[expertId, startAt, startAt + 3600, generateUid()],
			);
			return res.insertId;
		});
		expect(slotId, 'групповой слот для эксперимента не создался').toBeGreaterThan(0);
	});

	test.afterAll(async () => {
		await withConnection(async (c) => {
			if (slotId) {
				await c.execute(
					`DELETE FROM ${tn('bookings')} WHERE bookable_type = 'time_slot' AND bookable_id = ?`,
					[slotId],
				);
				await c.execute(`DELETE FROM ${tn('time_slots')} WHERE id = ?`, [slotId]);
			}
		});
	});

	test('счётчик «осталось мест» падает сразу, не дожидаясь задержанного ответа сервера', async ({ userPage }) => {
		// Задержка искусственная и НАМНОГО больше, чем таймаут решающей
		// проверки ниже (500 мс против 8 секунд здесь) — это принципиально:
		// у `expect().toContainText()` есть собственный поллинг длиной в
		// project.expect.timeout (12с на прод-конфиге), и при задержке
		// КОРОЧЕ этого окна проверка прошла бы даже без оптимистичного
		// обновления — просто дождавшись задержанного ответа сервера
		// внутри своего же поллинга. Так эта проверка и была ложно-зелёной
		// в первой версии (задержка 3с < таймаут по умолчанию 12с).
		let slotCardRequested = false;
		await userPage.route('**/slots/~slotCard', async (route) => {
			slotCardRequested = true;
			await new Promise((resolve) => setTimeout(resolve, 8000));
			await route.continue();
		});

		await userPage.goto('/slots/');
		await expect(userPage.locator('[data-test-id="slots-calendar"]')).toBeVisible({ timeout: 10000 });

		let slotCard = userPage.locator(`[data-test-id="slot-card-${slotId}"]`);
		if (!(await slotCard.isVisible({ timeout: 3000 }).catch(() => false))) {
			const nextBtn = userPage.locator('[data-test-id="week-next"]');
			if (await nextBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
				await nextBtn.click();
			}
		}
		slotCard = userPage.locator(`[data-test-id="slot-card-${slotId}"]`);
		await expect(slotCard).toBeVisible({ timeout: 10000 });

		const seatsLeft = userPage.locator(`[data-test-id="slot-seats-left-${slotId}"]`);
		await expect(seatsLeft, 'до брони должно быть видно 2 из 2').toContainText('2');

		const bookBtn = userPage.locator(`[data-test-id="slot-book-btn-${slotId}"]`);
		await bookBtn.click();

		const modal = userPage.locator('[data-test-id="booking-modal"]');
		await expect(modal).toBeVisible({ timeout: 5000 });
		const confirmBtn = userPage.locator('[data-test-id="booking-confirm-btn"]');

		const [bookResponse] = await Promise.all([
			userPage.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes('/slots') && r.url().includes('~book')),
			confirmBtn.click(),
		]);
		expect(bookResponse.ok(), 'бронь должна пройти успешно').toBeTruthy();
		await expect(modal).not.toBeVisible({ timeout: 15000 });

		// Решающая проверка: счётчик уже «1 из 2» ДО того, как задержанный
		// /slots/~slotCard успел ответить. Таймаут здесь короткий НАРОЧНО —
		// это и есть точка теста: если бы обновление ждало сеть, а не
		// оптимистичного локального изменения, за 800 мс оно бы не успело,
		// и проверка упала бы (а не тихо дождалась задержанного ответа).
		await expect(seatsLeft, 'счётчик мест не обновился мгновенно после своей же брони')
			.toContainText('1', { timeout: 800 });
		expect(slotCardRequested, 'refreshSlot() не был вызван вовсе — проверка ничего не проверила').toBe(true);

		// И после того как задержанный ответ всё же пришёл — число по-прежнему верное (совпадает с сервером).
		await userPage.waitForTimeout(8500);
		await expect(seatsLeft).toContainText('1');
	});
});
