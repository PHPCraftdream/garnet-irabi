/**
 * Открытая вкладка обращения переживает перезагрузку раздела.
 *
 * Поведение намеренное (AdminSupportIsland, `admin-support-open-tickets` в
 * sessionStorage): модератор посреди разбора не должен заново искать тикет в
 * очереди, вернувшись из раздела слотов или просто обновив страницу.
 *
 * Проверка появилась после разбора трёх падений полного прогона
 * (admin-moderates-support шаг 8, support-concurrent-reply-notice,
 * support-stale-reply-warning): все три ждали список очереди там, где
 * восстановление уже показало вкладку тикета, и выглядело это как «тикета нет
 * в очереди». Фича при этом не была покрыта ничем — то есть следующий, кто
 * решит «починить» такие падения удалением восстановления, не встретит
 * никакого сопротивления. Теперь встретит.
 *
 * У тех же падений была и вторая причина, вскрывшаяся только на полном
 * прогоне: очередь пагинирована по 10 строк и отсортирована по времени
 * обновления, поэтому под параллельной нагрузкой наше обращение уходит со
 * первой страницы — соседние проверки создают более свежие. Поэтому
 * открывать обращение стало делом deep-link'а (`#ticket=<id>`), а искать
 * его в очереди — делом поиска по теме. Один симптом, две причины: первая
 * доказана по trace, вторая — по тому, что целевой прогон из одного файла
 * проходил, а полный падал.
 */
import { test, expect, tn } from '../../helpers/scoped-test';
import { withConnection } from '../../helpers/db/db';
import { USER_LOGIN } from '../../helpers/auth/logins';
import { openAdminSupportQueue, openAdminTicket, OPEN_TICKETS_KEY } from '../../helpers/ui/admin-support';

async function getAccountId(login: string): Promise<number> {
	return withConnection(async (c) => {
		const [rows] = await c.execute<any[]>(`SELECT id FROM ${tn('accounts')} WHERE login = ?`, [login]);
		return rows[0]?.id ?? 0;
	});
}

async function createTicket(accountId: number): Promise<number> {
	return withConnection(async (c) => {
		const now = Math.floor(Date.now() / 1000);
		const [res]: any = await c.execute(
			`INSERT INTO ${tn('support_tickets')} (account_id, subject, status, assignee_id, unread_user, unread_staff, context, created_at, updated_at)
			 VALUES (?, ?, 'open', NULL, 0, 1, '{}', ?, ?)`,
			[accountId, TICKET_SUBJECT, now, now],
		);
		const ticketId = res.insertId;
		await c.execute(
			`INSERT INTO ${tn('support_messages')} (ticket_id, author_id, body, is_internal, msg_type, created_at)
			 VALUES (?, ?, 'Сообщение клиента для проверки восстановления вкладки', 0, 'user', ?)`,
			[ticketId, accountId, now],
		);
		return ticketId;
	});
}

async function cleanup(ticketId: number): Promise<void> {
	if (!ticketId) return;
	await withConnection(async (c) => {
		await c.execute(`DELETE FROM ${tn('support_messages')} WHERE ticket_id = ?`, [ticketId]);
		await c.execute(`DELETE FROM ${tn('support_tickets')} WHERE id = ?`, [ticketId]);
	});
}

const TICKET_SUBJECT = 'Восстановление вкладки: обращение для проверки';

test.describe.configure({ mode: 'serial' });

test.describe('Раздел обращений помнит, какой тикет был открыт', () => {
	let ticketId = 0;

	test.beforeAll(async () => {
		const userId = await getAccountId(USER_LOGIN);
		expect(userId).toBeGreaterThan(0);
		ticketId = await createTicket(userId);
		expect(ticketId).toBeGreaterThan(0);
	});

	test.afterAll(async () => {
		await cleanup(ticketId);
	});

	test('после перезагрузки на экране снова тикет, а не очередь', async ({ page }) => {
		await openAdminTicket(page, ticketId);
		await expect(page.locator('[data-test-id="support-reply-input"]')).toBeVisible({ timeout: 10000 });

		await page.reload();

		// Вкладка тикета вернулась сама — модератор продолжает с того же
		// места, без повторного поиска в очереди.
		await expect(page.locator('[data-test-id="support-reply-input"]')).toBeVisible({ timeout: 15000 });
		// И именно поэтому строки очереди на экране нет: это не сбой, а
		// прямое следствие восстановления.
		await expect(page.locator(`[data-test-id="support-ticket-${ticketId}"]`)).toHaveCount(0);
	});

	test('очередь возвращается, когда открытых вкладок не осталось', async ({ page }) => {
		// Ровно то, что делает openAdminSupportQueue: без сохранённых вкладок
		// раздел открывается списком. Тикет ищем поиском, а не глазами по
		// первой странице: очередь пагинирована по 10 строк, и под полным
		// прогоном наше обращение законно не самое свежее.
		await openAdminSupportQueue(page);
		await page.locator('[data-test-id="admin-grid-search"]').fill(TICKET_SUBJECT);
		await expect(page.locator(`[data-test-id="support-ticket-${ticketId}"]`)).toBeVisible({ timeout: 15000 });

		const saved = await page.evaluate((key: string) => sessionStorage.getItem(key), OPEN_TICKETS_KEY);
		expect(saved).toBeNull();
	});
});
