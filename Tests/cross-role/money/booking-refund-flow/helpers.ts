/**
 * Подготовка для сквозной проверки возврата: слот, баланс, состояние
 * брони и запись в истории отмен.
 */

import { test, expect, tn } from '../../../helpers/scoped-test';
import { newScopedContext } from '../../../helpers/scoped-test';
import { DB } from '../../../helpers/db/db';
import mysql from 'mysql2/promise';
import { roleLogin } from '../../../helpers/auth/role-login';
import type { BrowserContext, Page } from '@playwright/test';

export const SLOT_COST = 750;
export const CANCEL_REASON = 'E2E тест: эксперт отменяет бронирование';

let expertContext: BrowserContext;
let userContext: BrowserContext;
let expertPage: Page;
let userPage: Page;

// State shared across tests
let expertId = 0;
let userId = 0;
let slotId = 0;
let bookingId = 0;
let userBalanceBefore = 0;
let expertBalanceBefore = 0;

// ── Dev-login helper ────────────────────────────────────────────────────────

export async function devLogin(browser: any, role: string): Promise<{ context: BrowserContext; page: Page }> {
	const context = await newScopedContext(browser);
	const page = await context.newPage();
	await page.goto('/');

	await roleLogin(page, role);

	await page.goto('/');
	return { context, page };
}

// ── DB helpers ──────────────────────────────────────────────────────────────

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
				 VALUES (?, 1, ?, 'top_up', '', 0, 'E2E refund-flow top-up', UNIX_TIMESTAMP())`,
				[accountId, topUp]
			);
			await conn.execute(
				`UPDATE ${tn('account_balance')} SET balance = balance + ?, updated_at = UNIX_TIMESTAMP() WHERE account_id = ?`,
				[topUp, accountId]
			);
		}
	} finally { await conn.end(); }
}

export async function createFreeSlot(tId: number, cost: number): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const startAt = Math.floor(Date.now() / 1000) + 86400 * 7;
		const uid = [...Array(16)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
		const [result]: any = await conn.execute(
			`INSERT INTO ${tn('time_slots')}
			 (expert_id, start_at, end_at, duration_min, cost, is_online, location, max_users, status, uid, created_at)
			 VALUES (?, ?, ?, 60, ?, 1, 'https://meet.example.com/refund-flow-test', 1, 'free', ?, ?)`,
			[tId, startAt, startAt + 3600, cost, uid, Math.floor(Date.now() / 1000)]
		);
		return result.insertId;
	} finally { await conn.end(); }
}

export async function getSlotStatus(sId: number): Promise<string> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT status FROM ${tn('time_slots')} WHERE id = ?`, [sId]
		);
		return rows[0]?.status ?? 'unknown';
	} finally { await conn.end(); }
}

export async function getBookingForSlot(sId: number): Promise<{ id: number; status: string } | null> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT id, status FROM ${tn('bookings')}
			 WHERE bookable_type = 'time_slot' AND bookable_id = ?
			 ORDER BY id DESC LIMIT 1`,
			[sId]
		);
		return rows[0] ?? null;
	} finally { await conn.end(); }
}

export async function getCancellationLog(sId: number): Promise<{ reason: string } | null> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT reason FROM ${tn('expert_cancellations')}
			 WHERE slot_id = ? ORDER BY id DESC LIMIT 1`,
			[sId]
		);
		return rows[0] ?? null;
	} finally { await conn.end(); }
}

export async function cleanupSlot(sId: number): Promise<void> {
	if (!sId) return;
	const conn = await mysql.createConnection(DB);
	try {
		await conn.execute(`DELETE FROM ${tn('expert_cancellations')} WHERE slot_id = ?`, [sId]);
		await conn.execute(`DELETE FROM ${tn('user_cancellations')} WHERE slot_id = ?`, [sId]);
		await conn.execute(
			`DELETE FROM ${tn('balance_ledger')} WHERE ref_type = 'booking' AND ref_id IN
			 (SELECT id FROM ${tn('bookings')} WHERE bookable_type = 'time_slot' AND bookable_id = ?)`,
			[sId]
		);
		await conn.execute(`DELETE FROM ${tn('bookings')} WHERE bookable_type = 'time_slot' AND bookable_id = ?`, [sId]);
		await conn.execute(`DELETE FROM ${tn('time_slots')} WHERE id = ?`, [sId]);
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

// ── Tests ───────────────────────────────────────────────────────────────────
