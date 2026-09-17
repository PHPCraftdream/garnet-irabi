/**
 * Общая подготовка для проверок временных гардов бронирования.
 *
 * Сеется напрямую в MySQL — намеренно в обход проверок контроллера:
 * иначе прошлый слот или осиротевшую бронь просто не создать, а
 * проверять надо именно их.
 */

import { test, expect, tn, getDbPrefix } from '../../helpers/scoped-test';
import { newScopedContext } from '../../helpers/scoped-test';
import type { BrowserContext, Page } from '@playwright/test';
import mysql from 'mysql2/promise';
import { DB, withConnection } from '../../helpers/db';
import { roleLogin } from '../../helpers/role-login';
import { runServerCommand } from '../../helpers/server-command';

export function generateUid(): string {
	return [...Array(16)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
}

export async function getAccountId(login: string): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT id FROM ${tn('accounts')} WHERE login = ?`, [login]
		);
		return rows[0]?.id ?? 0;
	} finally { await conn.end(); }
}

export async function getBalance(accountId: number): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT balance FROM ${tn('account_balance')} WHERE account_id = ?`, [accountId]
		);
		return rows.length ? Number(rows[0].balance) : 0;
	} finally { await conn.end(); }
}

export async function ensureBalance(accountId: number, minBalance: number): Promise<void> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT balance FROM ${tn('account_balance')} WHERE account_id = ?`, [accountId]
		);
		const current = rows.length ? Number(rows[0].balance) : 0;
		if (current < minBalance) {
			const topUp = minBalance - current + 5000;
			await conn.execute(
				`INSERT INTO ${tn('account_balance')} (account_id, balance, updated_at)
				 VALUES (?, 0, UNIX_TIMESTAMP())
				 ON DUPLICATE KEY UPDATE account_id = account_id`,
				[accountId]
			);
			await conn.execute(
				`INSERT INTO ${tn('balance_ledger')} (account_id, is_credit, amount, entry_type, ref_type, ref_id, note, created_at)
				 VALUES (?, 1, ?, 'top_up', '', 0, 'Test top-up', UNIX_TIMESTAMP())`,
				[accountId, topUp]
			);
			await conn.execute(
				`UPDATE ${tn('account_balance')} SET balance = balance + ?, updated_at = UNIX_TIMESTAMP() WHERE account_id = ?`,
				[topUp, accountId]
			);
		}
	} finally { await conn.end(); }
}

export async function recalcBalance(accountId: number): Promise<void> {
	const conn = await mysql.createConnection(DB);
	try {
		const [[sum]]: any = await conn.execute(
			`SELECT COALESCE(SUM(CASE WHEN is_credit=1 THEN amount ELSE -amount END), 0) as bal
			 FROM ${tn('balance_ledger')} WHERE account_id = ?`, [accountId]
		);
		await conn.execute(
			`UPDATE ${tn('account_balance')} SET balance = ?, updated_at = UNIX_TIMESTAMP() WHERE account_id = ?`,
			[sum.bal, accountId]
		);
	} finally { await conn.end(); }
}

/** Insert a slot directly in DB — bypasses controller validation on purpose. */
export async function seedSlot(params: {
	expertId: number;
	startAt: number;
	endAt: number;
	status?: string;
	maxUsers?: number;
	cost?: number;
}): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const [result]: any = await conn.execute(
			`INSERT INTO ${tn('time_slots')}
			 (expert_id, start_at, end_at, duration_min, cost, is_online, location, max_users, status, uid, created_at)
			 VALUES (?, ?, ?, 60, ?, 1, 'https://meet.example.com/time-guards-test', ?, ?, ?, ?)`,
			[
				params.expertId,
				params.startAt,
				params.endAt,
				params.cost ?? 500,
				params.maxUsers ?? 1,
				params.status ?? 'free',
				generateUid(),
				Math.floor(Date.now() / 1000),
			]
		);
		return result.insertId;
	} finally { await conn.end(); }
}

/** Insert a booking directly in DB. */
export async function seedBooking(params: {
	userId: number;
	slotId: number;
	status: string;
	cost?: number;
	expertId?: number;
}): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const [result]: any = await conn.execute(
			`INSERT INTO ${tn('bookings')} (user_id, bookable_type, bookable_id, status, created_at)
			 VALUES (?, 'time_slot', ?, ?, ?)`,
			[params.userId, params.slotId, params.status, Math.floor(Date.now() / 1000)]
		);
		const bookingId = result.insertId;

		// If there is a cost, add ledger entries (booking_invoice for user, booking_payment for expert)
		// so refund checks work correctly. Both sides mirror what post__book does
		// at booking time: the user is debited and the expert credited unconditionally.
		if (params.cost && params.cost > 0) {
			try {
				await conn.execute(
					`INSERT INTO ${tn('balance_ledger')} (account_id, is_credit, amount, entry_type, ref_type, ref_id, note, created_at)
					 VALUES (?, 0, ?, 'booking_invoice', 'booking', ?, 'seed booking_invoice', UNIX_TIMESTAMP())`,
					[params.userId, params.cost, bookingId]
				);
				await conn.execute(
					`UPDATE ${tn('account_balance')} SET balance = balance - ?, updated_at = UNIX_TIMESTAMP() WHERE account_id = ?`,
					[params.cost, params.userId]
				);
				if (params.expertId && params.expertId > 0) {
					await conn.execute(
						`INSERT INTO ${tn('balance_ledger')} (account_id, is_credit, amount, entry_type, ref_type, ref_id, note, created_at)
						 VALUES (?, 1, ?, 'booking_payment', 'booking', ?, 'seed booking_payment', UNIX_TIMESTAMP())`,
						[params.expertId, params.cost, bookingId]
					);
					await conn.execute(
						`UPDATE ${tn('account_balance')} SET balance = balance + ?, updated_at = UNIX_TIMESTAMP() WHERE account_id = ?`,
						[params.cost, params.expertId]
					);
				}
			} catch {
				// ignore ledger errors — balance deduction is optional for these guard tests
			}
		}

		return bookingId;
	} finally { await conn.end(); }
}

export async function cleanupSlot(slotId: number): Promise<void> {
	if (!slotId) return;
	const conn = await mysql.createConnection(DB);
	try {
		// clean ledger
		await conn.execute(
			`DELETE FROM ${tn('balance_ledger')} WHERE ref_type = 'booking' AND ref_id IN
			 (SELECT id FROM ${tn('bookings')} WHERE bookable_type = 'time_slot' AND bookable_id = ?)`,
			[slotId]
		);
		// clean user_cancellations
		await conn.execute(`DELETE FROM ${tn('user_cancellations')} WHERE slot_id = ?`, [slotId]);
		await conn.execute(`DELETE FROM ${tn('bookings')} WHERE bookable_type = 'time_slot' AND bookable_id = ?`, [slotId]);
		await conn.execute(`DELETE FROM ${tn('time_slots')} WHERE id = ?`, [slotId]);
	} finally { await conn.end(); }
}

export async function getBookingStatus(bookingId: number): Promise<string> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT status FROM ${tn('bookings')} WHERE id = ?`, [bookingId]
		);
		return rows[0]?.status ?? 'not_found';
	} finally { await conn.end(); }
}

export async function getUserCancellationKind(bookingId: number): Promise<string | null> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT kind FROM ${tn('user_cancellations')} WHERE booking_id = ?`, [bookingId]
		);
		return rows[0]?.kind ?? null;
	} finally { await conn.end(); }
}

/**
 * The refund row a cancellation wrote for ONE booking: credit on the student's
 * side, debit on the expert's. Exact by construction — the ledger has a UNIQUE
 * key on (account_id, entry_type, ref_type, ref_id), so there is at most one.
 */
export async function refundEntryAmount(bookingId: number, accountId: number, isCredit: boolean): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows]: any = await conn.execute(
			`SELECT amount FROM ${tn('balance_ledger')}
			 WHERE account_id = ? AND entry_type = 'booking_refund'
			   AND ref_type = 'booking' AND ref_id = ? AND is_credit = ?`,
			[accountId, bookingId, isCredit ? 1 : 0]
		);
		return rows.length > 0 ? Number(rows[0].amount) : 0;
	} finally { await conn.end(); }
}

export async function getSlotStatus(slotId: number): Promise<string> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT status FROM ${tn('time_slots')} WHERE id = ?`, [slotId]
		);
		return rows[0]?.status ?? 'not_found';
	} finally { await conn.end(); }
}

/** Highest email_queue id for a recipient login — used to detect new emails. */
export async function emailQueueMaxId(login: string): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT COALESCE(MAX(id), 0) AS maxId FROM ${tn('email_queue')} WHERE recipient_email = ?`,
			[login]
		);
		return Number(rows[0]?.maxId ?? 0);
	} finally { await conn.end(); }
}

/** POST to a booking endpoint from within page context, returns {status, body}. */
export async function postBookingCancel(
	page: Page,
	bookingId: number,
	reason: string
): Promise<{ status: number; body: any }> {
	return await page.evaluate(async (args: { bid: number; reason: string }) => {
		const csrf = (window as any).__GARNET_CSRF__ || '';
		const fd = new FormData();
		fd.append('CSRF_TOKEN', csrf);
		fd.append('reason', args.reason);
		const res = await fetch(`/bookings/id~${args.bid}/~cancel`, { method: 'POST', body: fd });
		const text = await res.text();
		let body: any = null;
		try { body = JSON.parse(text); } catch { body = text; }
		return { status: res.status, body };
	}, { bid: bookingId, reason });
}

/** POST to the slots multi-book endpoint from within page context. */
export async function postSlotsBook(
	page: Page,
	slotIds: number[]
): Promise<{ status: number; body: any }> {
	return await page.evaluate(async (args: { slotIds: number[] }) => {
		const csrf = (window as any).__GARNET_CSRF__ || '';
		const fd = new FormData();
		fd.append('CSRF_TOKEN', csrf);
		for (const id of args.slotIds) {
			fd.append('slot_ids[]', String(id));
		}
		const res = await fetch('/slots/~book', { method: 'POST', body: fd });
		const text = await res.text();
		let body: any = null;
		try { body = JSON.parse(text); } catch { body = text; }
		return { status: res.status, body };
	}, { slotIds });
}

/** POST to expert cancel booking endpoint from within page context. */
export async function postExpertCancelBooking(
	page: Page,
	bookingId: number,
	reason: string
): Promise<{ status: number; body: any }> {
	return await page.evaluate(async (args: { bid: number; reason: string }) => {
		const csrf = (window as any).__GARNET_CSRF__ || '';
		const fd = new FormData();
		fd.append('CSRF_TOKEN', csrf);
		fd.append('booking_id', String(args.bid));
		fd.append('reason', args.reason);
		const res = await fetch('/expert/~cancelBooking', { method: 'POST', body: fd });
		const text = await res.text();
		let body: any = null;
		try { body = JSON.parse(text); } catch { body = text; }
		return { status: res.status, body };
	}, { bid: bookingId, reason });
}

export async function devLogin(browser: any, role: string): Promise<{ context: BrowserContext; page: Page }> {
	const context = await newScopedContext(browser);
	const page = await context.newPage();
	await page.goto('/');
	await roleLogin(page, role);
	await page.goto('/');
	return { context, page };
}

// ─────────────────────────────────────────────────────────────────────────────
// Fix 1: post__book returns 404 when slot not found OR slot not free
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST на страницу списка броней с показом прошедших — так список
 * получают проверки, которым нужны завершённые занятия.
 */
export async function postBookingsPage(page: Page): Promise<{ status: number; body: any }> {
	return await page.evaluate(async () => {
		const csrf = (window as any).__GARNET_CSRF__ || '';
		const fd = new FormData();
		fd.append('CSRF_TOKEN', csrf);
		fd.append('status', '');
		fd.append('showPast', 'true');
		const res = await fetch('/bookings/~page', { method: 'POST', body: fd });
		const text = await res.text();
		let body: any = null;
		try { body = JSON.parse(text); } catch { body = text; }
		return { status: res.status, body };
	});
}
