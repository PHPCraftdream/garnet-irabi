/**
 * D-160: the profile stat tiles ("Завершено"/"Всего"/"Снятий"/"Отмен") never
 * summed to "Всего" whenever the user had a still-open booking — pending
 * (awaiting the expert's decision) or confirmed but the lesson hasn't
 * happened yet. Those two states had no tile of their own, so "Всего"
 * silently ran ahead of the other three by exactly that count — read by a
 * live user as broken arithmetic on their own profile.
 *
 * Fixed: `Bookings::userOutcomeCounts()` now derives a fifth number,
 * `active = total - completed - cancellations - declines`, guaranteed to
 * reconcile by construction (no separate query to race against the other
 * three). `UserProfileIsland` renders it as a fifth "В процессе" tile.
 */

import { test, expect, tn } from '../../../helpers/scoped-test';
import { newScopedContext } from '../../../helpers/scoped-test';
import { resolveStorageStatePath } from '../../../helpers/auth/state';
import { withConnection } from '../../../helpers/db/db';
import type { BrowserContext, Page } from '@playwright/test';

async function getIds(): Promise<{ expertId: number; userId: number }> {
	return withConnection(async (c) => {
		const [er] = await c.execute<any[]>(`SELECT id FROM ${tn('accounts')} WHERE login = 'testuser_setup_expert@irabi.test'`);
		const [ur] = await c.execute<any[]>(`SELECT id FROM ${tn('accounts')} WHERE login = 'testuser_setup_user@irabi.test'`);
		return { expertId: er[0]?.id ?? 0, userId: ur[0]?.id ?? 0 };
	});
}

function generateUid(): string {
	return [...Array(16)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
}

async function createPendingBooking(expertId: number, userId: number): Promise<{ slotId: number; bookingId: number }> {
	return withConnection(async (c) => {
		const startAt = Math.floor(Date.now() / 1000) + 86400 * 8;
		const [slotRes]: any = await c.execute(
			`INSERT INTO ${tn('time_slots')}
			 (expert_id, start_at, end_at, duration_min, cost, is_online, location, max_users, booked_count, status, uid, created_at)
			 VALUES (?, ?, ?, 60, 0, 1, 'https://meet.example.com/d160-test', 1, 1, 'booked', ?, ?)`,
			[expertId, startAt, startAt + 3600, generateUid(), Math.floor(Date.now() / 1000)],
		);
		const slotId = slotRes.insertId;
		const [bookingRes]: any = await c.execute(
			`INSERT INTO ${tn('bookings')} (user_id, bookable_type, bookable_id, status, created_at)
			 VALUES (?, 'time_slot', ?, 'pending', ?)`,
			[userId, slotId, Math.floor(Date.now() / 1000)],
		);
		return { slotId, bookingId: bookingRes.insertId };
	});
}

async function cleanup(slotId: number, bookingId: number): Promise<void> {
	await withConnection(async (c) => {
		if (bookingId) await c.execute(`DELETE FROM ${tn('bookings')} WHERE id = ?`, [bookingId]);
		if (slotId) await c.execute(`DELETE FROM ${tn('time_slots')} WHERE id = ?`, [slotId]);
	});
}

async function readStats(page: Page): Promise<{ completed: number; total: number; declines: number; cancellations: number; active: number }> {
	const readNum = async (testId: string): Promise<number> =>
		parseInt((await page.locator(`[data-test-id="${testId}"]`).innerText()).trim(), 10);
	return {
		completed: await readNum('user-stat-completed'),
		total: await readNum('user-stat-total'),
		declines: await readNum('user-stat-declines'),
		cancellations: await readNum('user-stat-cancellations'),
		active: await readNum('user-stat-active'),
	};
}

test.describe.configure({ mode: 'serial' });

test.describe('D-160: profile stat tiles reconcile even with an open (pending) booking', () => {
	let expertId = 0;
	let userId = 0;
	let slotId = 0;
	let bookingId = 0;
	let ctx: BrowserContext;
	let page: Page;

	test.beforeAll(async ({ browser }) => {
		({ expertId, userId } = await getIds());
		expect(expertId).toBeGreaterThan(0);
		expect(userId).toBeGreaterThan(0);

		ctx = await newScopedContext(browser, { storageState: resolveStorageStatePath('user') });
		page = await ctx.newPage();
	});

	test.afterAll(async () => {
		await ctx?.close().catch(() => {});
		await cleanup(slotId, bookingId);
	});

	test('"В процессе" tile appears and the five tiles always sum to "Всего"', async () => {
		await page.goto('/system/~profile', { waitUntil: 'domcontentloaded' });
		await expect(page.locator('[data-test-id="user-stat-total"]')).toBeVisible({ timeout: 10000 });
		const before = await readStats(page);
		expect(before.completed + before.cancellations + before.declines + before.active).toBe(before.total);

		({ slotId, bookingId } = await createPendingBooking(expertId, userId));

		await page.reload({ waitUntil: 'domcontentloaded' });
		const after = await readStats(page);

		// The new pending booking must land in "active" and nowhere else.
		expect(after.total).toBe(before.total + 1);
		expect(after.active).toBe(before.active + 1);
		expect(after.completed).toBe(before.completed);
		expect(after.cancellations).toBe(before.cancellations);
		expect(after.declines).toBe(before.declines);

		// The invariant the persona expected but couldn't find: the four
		// outcome tiles sum to "Всего" once "В процессе" is counted too.
		expect(after.completed + after.cancellations + after.declines + after.active).toBe(after.total);
	});

	test('the old (pre-fix) invariant without "active" would have been wrong', async () => {
		// Documents the actual bug: without the active tile, "Всего" ran
		// ahead of the other three by exactly the number of open bookings.
		const stats = await readStats(page);
		expect(stats.active).toBeGreaterThan(0);
		expect(stats.completed + stats.cancellations + stats.declines).toBeLessThan(stats.total);
	});
});
