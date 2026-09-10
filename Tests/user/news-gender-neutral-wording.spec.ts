/**
 * D-143: news-feed action strings used a Russian past-tense verb that
 * requires gender ("подтвердил(а)", "отменил(а)", ...), but the feed has
 * no idea of the actor's gender — the literal "(а)" placeholder rendered
 * on screen. Fixed by rephrasing to a genderless "<Имя>: <ссылка> <причастие>"
 * pattern for every affected event type (new_slot, booking_confirmed,
 * booking_rejected, booking_cancelled both directions).
 *
 * One event seeded per test (immediately before the page load, like
 * news-name-resolution.spec.ts) — keeps the row on page 1 of the feed
 * regardless of what other parallel specs are doing to the shared fixture
 * accounts, and avoids batching cleanup into a single multi-id DELETE.
 */

import { test, expect, tn } from '../helpers/scoped-test';
import { newScopedContext } from '../helpers/scoped-test';
import { resolveStorageStatePath } from '../helpers/state';
import mysql from 'mysql2/promise';
import { DB } from '../helpers/db';

test.describe.configure({ mode: 'serial' });

const USER_LOGIN = 'testuser_setup_user@irabi.test';
const EXPERT_LOGIN = 'testuser_setup_expert@irabi.test';

let userId = 0;
let expertId = 0;

async function seedEvent(eventType: string, audienceId: number, actorId: number, payload: object): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const now = Math.floor(Date.now() / 1000);
		const [result] = await conn.execute<any>(
			`INSERT INTO ${tn('news_events')}
				(event_type, audience_type, audience_id, actor_id, target_key, payload, created_at)
			 VALUES (?, 'personal', ?, ?, NULL, ?, ?)`,
			[eventType, audienceId, actorId, JSON.stringify(payload), now],
		);
		return Number(result.insertId);
	} finally { await conn.end(); }
}

async function deleteEvent(id: number): Promise<void> {
	if (!id) return;
	const conn = await mysql.createConnection(DB);
	try {
		await conn.execute(`DELETE FROM ${tn('news_events')} WHERE id = ?`, [id]);
	} finally { await conn.end(); }
}

async function readRowText(page: import('@playwright/test').Page, eventId: number): Promise<string> {
	await page.goto('/system/', { waitUntil: 'domcontentloaded' });
	const feed = page.locator('[data-test-id="news-feed"]');
	// The freshly-created scoped context (expert-cancels test) needs more
	// margin on its first navigation than the pre-warmed default `page`
	// fixture — 10s flaked consistently, 20s matches the row-visibility
	// budget below.
	await expect(feed).toBeVisible({ timeout: 20_000 });
	await page.waitForResponse(
		r => r.url().includes('/news/~feed') && r.request().method() === 'POST',
		{ timeout: 10_000 },
	).catch(() => {});
	const row = page.locator(`[data-test-id="news-event-${eventId}"]`);
	await expect(row).toBeVisible({ timeout: 20_000 });
	return (await row.textContent()) ?? '';
}

test.describe('D-143: news feed action strings have no gendered-verb placeholder', () => {
	test.beforeAll(async () => {
		const conn = await mysql.createConnection(DB);
		try {
			const [uRows] = await conn.execute<any[]>(`SELECT id FROM ${tn('accounts')} WHERE login = ?`, [USER_LOGIN]);
			const [eRows] = await conn.execute<any[]>(`SELECT id FROM ${tn('accounts')} WHERE login = ?`, [EXPERT_LOGIN]);
			userId = Number(uRows[0]?.id ?? 0);
			expertId = Number(eRows[0]?.id ?? 0);
			expect(userId).toBeGreaterThan(0);
			expect(expertId).toBeGreaterThan(0);
		} finally { await conn.end(); }
	});

	test('booking_confirmed: "<имя>: занятие подтверждено", no "(а)"', async ({ page }) => {
		const now = Math.floor(Date.now() / 1000);
		const id = await seedEvent('booking_confirmed', userId, expertId, {
			booking_id: 1, slot_id: 1, expert_id: expertId, name: 'Тестовый Эксперт', time: now + 86400,
		});
		try {
			const text = await readRowText(page, id);
			expect(text).not.toContain('(а)');
			expect(text).toContain('занятие подтверждено');
		} finally {
			await deleteEvent(id);
		}
	});

	test('booking_rejected: no "(а)"', async ({ page }) => {
		const now = Math.floor(Date.now() / 1000);
		const id = await seedEvent('booking_rejected', userId, expertId, {
			booking_id: 2, slot_id: 2, expert_id: expertId, name: 'Тестовый Эксперт', time: now + 86400,
		});
		try {
			const text = await readRowText(page, id);
			expect(text).not.toContain('(а)');
		} finally {
			await deleteEvent(id);
		}
	});

	test('new_slot: no "(а)"', async ({ page }) => {
		const now = Math.floor(Date.now() / 1000);
		const id = await seedEvent('new_slot', userId, expertId, {
			slot_id: 3, expert_id: expertId, name: 'Тестовый Эксперт', time: now + 86400,
		});
		try {
			const text = await readRowText(page, id);
			expect(text).not.toContain('(а)');
		} finally {
			await deleteEvent(id);
		}
	});

	test('booking_cancelled (expert-initiated, shown to student): no "(а)"', async ({ page }) => {
		const now = Math.floor(Date.now() / 1000);
		const id = await seedEvent('booking_cancelled', userId, expertId, {
			booking_id: 4, slot_id: 4, expert_id: expertId, name: 'Тестовый Эксперт', time: now + 86400,
		});
		try {
			const text = await readRowText(page, id);
			expect(text).not.toContain('(а)');
		} finally {
			await deleteEvent(id);
		}
	});

	test('booking_cancelled (user-initiated, shown to expert): no "(а)"', async ({ browser }) => {
		// Audience is the EXPERT account here — the default `page` fixture
		// in Tests/user/** logs in as the student, so it would read its own
		// feed, not the expert's, and never see this event at all.
		const ctx = await newScopedContext(browser, { storageState: resolveStorageStatePath('expert') });
		const page = await ctx.newPage();
		const now = Math.floor(Date.now() / 1000);
		const id = await seedEvent('booking_cancelled', expertId, userId, {
			booking_id: 5, slot_id: 5, user_id: userId, name: 'Тестовый Студент', time: now + 86400,
		});
		try {
			const text = await readRowText(page, id);
			expect(text).not.toContain('(а)');
		} finally {
			await deleteEvent(id);
			await ctx.close();
		}
	});
});
