/**
 * D-157: two personas independently reported that the auto-confirmation
 * chat message ("Ваша бронь на ... подтверждена") shows a different time
 * than the rest of the UI for the same booking — one persona confirmed by
 * arithmetic that the message printed the RAW UTC hour of `start_at`,
 * un-converted, while every other screen showed the account's local
 * (Europe/Berlin) time.
 *
 * BookingChatNotifier::when() already reads `accounts.time_zone` and calls
 * DateUtils::formatForUser() — reading the code shows no bug. This spec
 * exercises the real confirm flow end-to-end (book → confirm → read the
 * resulting im_messages row) to settle whether the reported mismatch is
 * still live or was a stale message sent before an earlier session's
 * timezone fix to this same file was deployed.
 */

import { test, expect, tn } from '../helpers/scoped-test';
import { newScopedContext } from '../helpers/scoped-test';
import { resolveStorageStatePath } from '../helpers/state';
import { withConnection } from '../helpers/db';
import type { Page } from '@playwright/test';

const STUDENT_TZ = 'America/New_York'; // fixed, large, unambiguous offset from UTC

function generateUid(): string {
	return [...Array(16)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
}

async function getAccountId(login: string): Promise<number> {
	return withConnection(async (c) => {
		const [rows] = await c.execute<any[]>(`SELECT id FROM ${tn('accounts')} WHERE login = ?`, [login]);
		return rows[0]?.id ?? 0;
	});
}

async function setTimezone(accountId: number, tz: string): Promise<string> {
	return withConnection(async (c) => {
		const [rows] = await c.execute<any[]>(`SELECT time_zone FROM ${tn('accounts')} WHERE id = ?`, [accountId]);
		const prev = rows[0]?.time_zone ?? '';
		await c.execute(`UPDATE ${tn('accounts')} SET time_zone = ? WHERE id = ?`, [tz, accountId]);
		return prev;
	});
}

async function createSlot(expertId: number, startAt: number): Promise<number> {
	return withConnection(async (c) => {
		const [res]: any = await c.execute(
			`INSERT INTO ${tn('time_slots')}
			 (expert_id, start_at, end_at, duration_min, cost, is_online, location, max_users, status, uid, created_at)
			 VALUES (?, ?, ?, 60, 0, 1, 'https://meet.example.com/d157-test', 1, 'free', ?, ?)`,
			[expertId, startAt, startAt + 3600, generateUid(), Math.floor(Date.now() / 1000)],
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

async function cleanup(slotId: number, studentId: number, prevTz: string): Promise<void> {
	await withConnection(async (c) => {
		await c.execute(`DELETE FROM ${tn('bookings')} WHERE bookable_type = 'time_slot' AND bookable_id = ?`, [slotId]);
		await c.execute(`DELETE FROM ${tn('time_slots')} WHERE id = ?`, [slotId]);
	});
	if (studentId) await setTimezone(studentId, prevTz);
}

test.describe.configure({ mode: 'serial' });

test.describe('D-157: booking-confirmed chat message uses the recipient\'s local timezone, not raw UTC', () => {
	let expertId = 0;
	let studentId = 0;
	let slotId = 0;
	let prevStudentTz = '';
	let startAt = 0;

	test.beforeAll(async () => {
		expertId = await getAccountId('testuser_setup_expert@irabi.test');
		studentId = await getAccountId('testuser_setup_user@irabi.test');
		expect(expertId).toBeGreaterThan(0);
		expect(studentId).toBeGreaterThan(0);

		prevStudentTz = await setTimezone(studentId, STUDENT_TZ);

		// A UTC noon start — unambiguous in every timezone, no date-boundary
		// or DST edge case to worry about.
		const now = Math.floor(Date.now() / 1000);
		const daysAhead = 7;
		startAt = now - (now % 86400) + daysAhead * 86400 + 12 * 3600;
		slotId = await createSlot(expertId, startAt);
		expect(slotId).toBeGreaterThan(0);
	});

	test.afterAll(async () => {
		await cleanup(slotId, studentId, prevStudentTz);
	});

	test('confirm a booking, then read the chat message time against the student\'s configured timezone', async ({ browser }) => {
		// Student books.
		const studentCtx = await newScopedContext(browser, { storageState: resolveStorageStatePath('user') });
		const studentPage: Page = await studentCtx.newPage();
		let bookingId = 0;
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

		bookingId = await withConnection(async (c) => {
			const [rows] = await c.execute<any[]>(
				`SELECT id FROM ${tn('bookings')} WHERE bookable_type = 'time_slot' AND bookable_id = ? ORDER BY id DESC LIMIT 1`,
				[slotId],
			);
			return rows[0]?.id ?? 0;
		});
		expect(bookingId).toBeGreaterThan(0);

		// Expert confirms via the real HTTP endpoint.
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

		// Expected local time string, e.g. "08.09.2026, 08:00" for a UTC
		// 12:00 start in America/New_York (UTC-4 in September, DST).
		const expectedLocal = new Intl.DateTimeFormat('ru-RU', {
			timeZone: STUDENT_TZ,
			day: '2-digit', month: '2-digit', year: 'numeric',
			hour: '2-digit', minute: '2-digit', hour12: false,
		}).format(new Date(startAt * 1000)).replace(',', ',');

		// The raw-UTC bug would instead print the UTC wall-clock hour —
		// assert it's absent so a regression can't slip through by
		// accident matching the local string too.
		const utcHour = new Date(startAt * 1000).toISOString().slice(11, 16);
		const localHour = expectedLocal.slice(-5);
		expect(localHour).not.toBe(utcHour); // sanity: the two must actually differ for this test to mean anything

		expect(body).toContain(localHour);
		expect(body).not.toContain(utcHour);

		// D-166: the same message is read by the expert too, in their own
		// timezone — an unlabeled local time misleads whichever participant
		// isn't the one it was converted for. The zone must be spelled out.
		expect(body).toMatch(/\(America\/New_York, UTC-?\d/);
	});
});
