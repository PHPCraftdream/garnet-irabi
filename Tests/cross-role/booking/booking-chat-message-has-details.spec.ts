/**
 * D-202: the auto-generated chat message about a booking ("Ваша бронь на
 * ... подтверждена") named only the date, time and timezone — never
 * duration, price or format. Two personas (user-4, expert-1) independently
 * flagged this in cycle8: one dialog carries ALL of a pair's bookings over
 * time, and with several "Ваша бронь на ... подтверждена" lines in a row,
 * the date was the ONLY thing telling them apart — the same gap already
 * closed in emails (D-129/D-139).
 *
 * Fix: `BookingChatNotifier::when()` now appends duration, price and format
 * to the same line, mirroring `EmailNotifications::formatSlotInfo()`. This
 * spec confirms the confirmation message states all three, with the online
 * slot's location resolved to a platform name (not the raw meeting URL,
 * same policy as everywhere else a slot's format is shown).
 */
import { test, expect, tn } from '../../helpers/scoped-test';
import { newScopedContext } from '../../helpers/scoped-test';
import { resolveStorageStatePath } from '../../helpers/auth/state';
import { withConnection } from '../../helpers/db/db';
import type { Page } from '@playwright/test';

function generateUid(): string {
	return [...Array(16)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
}

async function getAccountId(login: string): Promise<number> {
	return withConnection(async (c) => {
		const [rows] = await c.execute<any[]>(`SELECT id FROM ${tn('accounts')} WHERE login = ?`, [login]);
		return rows[0]?.id ?? 0;
	});
}

async function createSlot(expertId: number, startAt: number): Promise<number> {
	return withConnection(async (c) => {
		const [res]: any = await c.execute(
			`INSERT INTO ${tn('time_slots')}
			 (expert_id, start_at, end_at, duration_min, cost, is_online, location, max_users, status, uid, created_at)
			 VALUES (?, ?, ?, 45, 750, 1, 'https://zoom.us/j/1234567890', 1, 'free', ?, ?)`,
			[expertId, startAt, startAt + 45 * 60, generateUid(), Math.floor(Date.now() / 1000)],
		);
		return res.insertId;
	});
}

async function latestChatMessage(expertId: number, studentId: number): Promise<string> {
	return withConnection(async (c) => {
		const [convRows] = await c.execute<any[]>(
			`SELECT id FROM ${tn('im_conversations')}
			 WHERE (participant_a = ? AND participant_b = ?) OR (participant_a = ? AND participant_b = ?)`,
			[expertId, studentId, studentId, expertId],
		);
		const convId = convRows[0]?.id;
		if (!convId) return '';
		const [msgRows] = await c.execute<any[]>(
			`SELECT body FROM ${tn('im_messages')} WHERE conversation_id = ? ORDER BY id DESC LIMIT 1`,
			[convId],
		);
		return msgRows[0]?.body ?? '';
	});
}

async function cleanup(slotId: number): Promise<void> {
	await withConnection(async (c) => {
		await c.execute(`DELETE FROM ${tn('bookings')} WHERE bookable_type = 'time_slot' AND bookable_id = ?`, [slotId]);
		await c.execute(`DELETE FROM ${tn('time_slots')} WHERE id = ?`, [slotId]);
	});
}

test.describe.configure({ mode: 'serial' });

test.describe('D-202: the booking-confirmed chat message states duration, price and format', () => {
	let expertId = 0;
	let studentId = 0;
	let slotId = 0;
	let startAt = 0;

	test.beforeAll(async () => {
		expertId = await getAccountId('testuser_setup_expert@irabi.test');
		studentId = await getAccountId('testuser_setup_user@irabi.test');
		expect(expertId).toBeGreaterThan(0);
		expect(studentId).toBeGreaterThan(0);

		const now = Math.floor(Date.now() / 1000);
		startAt = now - (now % 86400) + 7 * 86400 + 12 * 3600;
		slotId = await createSlot(expertId, startAt);
		expect(slotId).toBeGreaterThan(0);
	});

	test.afterAll(async () => {
		await cleanup(slotId);
	});

	test('confirm a booking, then the chat message names duration + price + platform', async ({ browser }) => {
		const studentCtx = await newScopedContext(browser, { storageState: resolveStorageStatePath('user') });
		const studentPage: Page = await studentCtx.newPage();
		try {
			await studentPage.goto(`/bookings/id~${slotId}/~book`, { waitUntil: 'domcontentloaded' });
			const bookBtn = studentPage.locator('[data-test-id="book-btn"]');
			await expect(bookBtn).toBeVisible({ timeout: 8000 });
			await Promise.all([
				studentPage.waitForURL(url => url.pathname === '/bookings' || url.pathname === '/system/bookings', { timeout: 15000 }),
				bookBtn.click(),
			]);
			await studentPage.waitForLoadState('networkidle');
		} finally {
			await studentCtx.close();
		}

		const bookingId: number = await withConnection(async (c) => {
			const [rows] = await c.execute<any[]>(
				`SELECT id FROM ${tn('bookings')} WHERE bookable_type = 'time_slot' AND bookable_id = ? ORDER BY id DESC LIMIT 1`,
				[slotId],
			);
			return rows[0]?.id ?? 0;
		});
		expect(bookingId).toBeGreaterThan(0);

		const expertCtx = await newScopedContext(browser, { storageState: resolveStorageStatePath('expert') });
		const expertPage: Page = await expertCtx.newPage();
		try {
			await expertPage.goto('/system/', { waitUntil: 'domcontentloaded' });
			const result = await expertPage.evaluate(async (bid: number) => {
				const csrf = (window as any).__GARNET_CSRF__ || '';
				const fd = new FormData();
				fd.append('CSRF_TOKEN', csrf);
				fd.append('booking_id', String(bid));
				const res = await fetch('/expert/~confirmBooking', { method: 'POST', body: fd });
				return { status: res.status, body: await res.text() };
			}, bookingId);
			expect(result.status).toBe(200);
		} finally {
			await expertCtx.close();
		}

		const body = await latestChatMessage(expertId, studentId);
		expect(body).toContain('подтверждена');

		// Duration, price, format — the gap D-202 reported. The raw meeting
		// URL must NOT leak into the message; only the resolved platform name.
		expect(body).toContain('45');
		expect(body).toContain('750');
		expect(body).toContain('Zoom');
		expect(body).not.toContain('zoom.us/j/');
	});
});
