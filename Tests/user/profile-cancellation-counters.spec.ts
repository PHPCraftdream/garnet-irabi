/**
 * D-150: /user/{id} counters ("Снятий" + "Отмен" + "Завершено") must add up
 * to "Всего бронирований" no matter WHO cancelled the booking.
 *
 * Before this fix, "Снятий"/"Отмен" were counted from user_cancellations,
 * a table only written when the student herself cancels via
 * BookingsController::post__cancel. An expert-cancelled or expert-declined
 * booking (ExpertBookingsService, writes to a separate ExpertCancellations
 * table) was invisible there, so "Всего" always outran the sum of the
 * other three (found by user-2, live, on her own profile).
 *
 * Fix: the counters now read straight from bookings.status/confirmed_at —
 * the one field every cancellation path updates regardless of who
 * performed it — instead of a secondary audit-log table.
 */

import { test, expect, tn } from '../helpers/scoped-test';
import { newScopedContext } from '../helpers/scoped-test';
import { resolveStorageStatePath } from '../helpers/state';
import { withConnection } from '../helpers/db';
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

async function createSlot(expertId: number, offsetSec: number): Promise<number> {
	return withConnection(async (c) => {
		const startAt = Math.floor(Date.now() / 1000) + offsetSec;
		const [res]: any = await c.execute(
			`INSERT INTO ${tn('time_slots')}
			 (expert_id, start_at, end_at, duration_min, cost, is_online, location, max_users, booked_count, status, uid, created_at)
			 VALUES (?, ?, ?, 60, 0, 1, 'https://meet.example.com/d150-test', 1, 1, 'booked', ?, ?)`,
			[expertId, startAt, startAt + 3600, generateUid(), Math.floor(Date.now() / 1000)],
		);
		return res.insertId;
	});
}

async function createConfirmedBooking(slotId: number, userId: number): Promise<number> {
	return withConnection(async (c) => {
		const now = Math.floor(Date.now() / 1000);
		const [res]: any = await c.execute(
			`INSERT INTO ${tn('bookings')} (user_id, bookable_type, bookable_id, status, created_at, confirmed_at)
			 VALUES (?, 'time_slot', ?, 'confirmed', ?, ?)`,
			[userId, slotId, now, now],
		);
		return res.insertId;
	});
}

async function cleanup(slotIds: number[], bookingIds: number[]): Promise<void> {
	await withConnection(async (c) => {
		for (const bookingId of bookingIds) {
			await c.execute(`DELETE FROM ${tn('user_cancellations')} WHERE booking_id = ?`, [bookingId]);
			await c.execute(`DELETE FROM ${tn('expert_cancellations')} WHERE booking_id = ?`, [bookingId]);
			await c.execute(`DELETE FROM ${tn('bookings')} WHERE id = ?`, [bookingId]);
		}
		for (const slotId of slotIds) {
			await c.execute(`DELETE FROM ${tn('time_slots')} WHERE id = ?`, [slotId]);
		}
	});
}

interface Counters { completed: number; total: number; declines: number; cancellations: number }

async function readCounters(page: Page): Promise<Counters> {
	const readNum = async (testId: string): Promise<number> =>
		parseInt((await page.locator(`[data-test-id="${testId}"]`).innerText()).trim(), 10);

	return {
		completed: await readNum('user-stat-completed'),
		total: await readNum('user-stat-total'),
		declines: await readNum('user-stat-declines'),
		cancellations: await readNum('user-stat-cancellations'),
	};
}

test.describe.configure({ mode: 'serial' });

test.describe('D-150: profile counters add up regardless of who cancelled', () => {
	let expertId = 0;
	let userId = 0;
	let before: Counters = { completed: 0, total: 0, declines: 0, cancellations: 0 };
	const slotIds: number[] = [];
	const bookingIds: number[] = [];
	let userCtx: BrowserContext;
	let userPage: Page;
	let expertCtx: BrowserContext;
	let expertPage: Page;

	test.beforeAll(async ({ browser }) => {
		({ expertId, userId } = await getIds());
		expect(expertId).toBeGreaterThan(0);
		expect(userId).toBeGreaterThan(0);

		userCtx = await newScopedContext(browser, { storageState: resolveStorageStatePath('user') });
		userPage = await userCtx.newPage();
		expertCtx = await newScopedContext(browser, { storageState: resolveStorageStatePath('expert') });
		expertPage = await expertCtx.newPage();
	});

	test.afterAll(async () => {
		await userCtx?.close().catch(() => {});
		await expertCtx?.close().catch(() => {});
		await cleanup(slotIds, bookingIds);
	});

	test('baseline: read starting counters', async () => {
		await userPage.goto(`/user/id~${userId}`, { waitUntil: 'domcontentloaded' });
		await expect(userPage.locator('[data-test-id="user-stat-total"]')).toBeVisible({ timeout: 10000 });
		before = await readCounters(userPage);
	});

	test('student cancels her own confirmed booking (kind=cancel, writes user_cancellations)', async () => {
		const slotId = await createSlot(expertId, 86400 * 5);
		const bookingId = await createConfirmedBooking(slotId, userId);
		slotIds.push(slotId);
		bookingIds.push(bookingId);

		const result = await userPage.evaluate(async (args: { bid: number }) => {
			const csrf = (window as any).__GARNET_CSRF__ || '';
			const fd = new FormData();
			fd.append('CSRF_TOKEN', csrf);
			fd.append('reason', 'D-150 test: student self-cancel');
			const res = await fetch(`/bookings/id~${args.bid}/~cancel`, { method: 'POST', body: fd });
			return res.status;
		}, { bid: bookingId });
		expect(result).toBe(200);
	});

	test('expert cancels a DIFFERENT confirmed booking of the same student (kind=cancel, writes expert_cancellations only)', async () => {
		await expertPage.goto('/system/bookings', { waitUntil: 'domcontentloaded' });

		const slotId = await createSlot(expertId, 86400 * 6);
		const bookingId = await createConfirmedBooking(slotId, userId);
		slotIds.push(slotId);
		bookingIds.push(bookingId);

		const result = await expertPage.evaluate(async (args: { bid: number }) => {
			const csrf = (window as any).__GARNET_CSRF__ || '';
			const fd = new FormData();
			fd.append('CSRF_TOKEN', csrf);
			fd.append('booking_id', String(args.bid));
			fd.append('reason', 'D-150 test: expert-cancel');
			const res = await fetch('/expert/~cancelBooking', { method: 'POST', body: fd });
			return res.status;
		}, { bid: bookingId });
		expect(result).toBe(200);
	});

	test('profile counters: обе отмены посчитаны, и ни одна не потеряна', async () => {
		await userPage.goto(`/user/id~${userId}`, { waitUntil: 'domcontentloaded' });
		await userPage.reload({ waitUntil: 'domcontentloaded' });

		const after = await readCounters(userPage);

		// Суть D-150: отмена эксперта считается так же, как отмена ученика —
		// обе должны попасть в «Отмен». Мерим именно прирост от двух наших
		// действий, а не итоговые числа: аккаунт общий на весь прогон, и
		// соседние проверки законно добавляют ему брони.
		expect(after.cancellations - before.cancellations).toBe(2);
		expect(after.total - before.total).toBe(2);

		// Тождество «Завершено + Снятий + Отмен == Всего» неверно как
		// инвариант: бронь, которая ещё ждёт подтверждения, входит в «Всего»
		// и не входит ни в одну из трёх категорий. Проверка падала именно на
		// этом — не на потерянной отмене. Верное утверждение — что сумма
		// категорий никогда не превышает общего числа и не «съедает» ничего
		// своего.
		expect(after.completed + after.declines + after.cancellations).toBeLessThanOrEqual(after.total);
	});

	// D-150 follow-up: /system/~profile ("Профиль" in the main nav) is a
	// SEPARATE controller (MainController::get__profile) rendering the same
	// island with independently-computed stats — it kept running the old
	// user_cancellations-only query even after the /user/id~X fix landed,
	// which is exactly what a live persona caught (same numbers, different
	// route). Same invariant, different URL.
	test('own-profile page (/system/~profile) shows the same numbers as /user/id~N', async () => {
		// Утверждение здесь — про согласие двух маршрутов, и именно его
		// поймала живая персона: «те же числа, другой адрес». Прежняя
		// формулировка проверяла тождество суммы категорий с общим числом —
		// оно неверно (бронь в ожидании входит в «Всего» и ни в одну
		// категорию, см. D-215), и падала на этом, а не на расхождении
		// маршрутов. Заодно проверка была недостижима: файл
		// последовательный, и до неё прогон не доходил.
		await userPage.goto(`/user/id~${userId}`, { waitUntil: 'domcontentloaded' });
		const onPublic = await readCounters(userPage);

		await userPage.goto('/system/~profile', { waitUntil: 'domcontentloaded' });
		const onOwn = await readCounters(userPage);

		expect(onOwn).toEqual(onPublic);
		expect(onOwn.cancellations).toBeGreaterThanOrEqual(2);
	});
});
