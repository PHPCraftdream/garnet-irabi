/**
 * Прийти в очередь обращений так, как её видит модератор, только что
 * открывший раздел.
 *
 * AdminSupportIsland намеренно запоминает открытые вкладки тикетов в
 * `sessionStorage['admin-support-open-tickets']` и после перезагрузки снова
 * делает активной вкладку тикета: модератор посреди разбора не должен заново
 * искать обращение в очереди. Побочное следствие для проверок — после
 * `goto('/admin/support/')` на экране может оказаться НЕ очередь, а
 * последний открытый тикет, и клик по строке `support-ticket-N` ждёт до
 * таймаута, потому что списка в DOM нет.
 *
 * Так падали три проверки (admin-moderates-support шаг 8,
 * support-concurrent-reply-notice, support-stale-reply-warning): контекст
 * роли живёт дольше одного файла, и вкладка, открытая предыдущей проверкой,
 * восстанавливалась в следующей. Продукт при этом вёл себя как задумано —
 * ломались именно проверки, причём молча: падение выглядело как «тикета нет
 * в очереди».
 *
 * Поэтому проверки, которым нужна именно очередь, приходят сюда: ключ
 * очищается, страница перезагружается, на экране гарантированно список.
 */
import type { Page } from '@playwright/test';

export const OPEN_TICKETS_KEY = 'admin-support-open-tickets';

/** Открыть раздел обращений с гарантированно активной вкладкой очереди. */
export async function openAdminSupportQueue(page: Page): Promise<void> {
    await page.goto('/admin/support/');
    await page.evaluate((key: string) => {
        try {
            sessionStorage.removeItem(key);
        } catch { /* хранилище недоступно — значит и восстанавливать нечего */ }
    }, OPEN_TICKETS_KEY);
    await page.reload();
}

/** Очередь → клик по строке обращения → открытая вкладка тикета. */
export async function openAdminTicket(page: Page, ticketId: number): Promise<void> {
    await openAdminSupportQueue(page);
    await page.locator(`[data-test-id="support-ticket-${ticketId}"]`).click();
}
