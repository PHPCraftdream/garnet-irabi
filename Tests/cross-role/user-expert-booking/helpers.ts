/**
 * Подготовка для сквозной проверки «пользователь бронирует — эксперт
 * видит — пользователь отменяет»: балансы, состояние слота, проводки.
 */

import { test, expect, tn } from '../../helpers/scoped-test';
import { DB } from '../../helpers/db';
import mysql from 'mysql2/promise';

export const SLOT_COST = 1000;


// State shared across tests

// ── DB helpers ─────────────────────────────────────────────────────────────────

export async function getBalance(login: string): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT ab.balance FROM ${tn('account_balance')} ab
			 JOIN ${tn('accounts')} a ON a.id = ab.account_id
			 WHERE a.login = ?`, [login]
		);
		return rows.length ? Number(rows[0].balance) : 0;
	} finally { await conn.end(); }
}

export async function getSlotStatus(slotId: number): Promise<string> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT status FROM ${tn('time_slots')} WHERE id = ?`, [slotId]
		);
		return rows[0]?.status ?? 'unknown';
	} finally { await conn.end(); }
}

export async function getLedgerRefundCount(userLogin: string): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT COUNT(*) as cnt FROM ${tn('balance_ledger')} bl
			 JOIN ${tn('accounts')} a ON a.id = bl.account_id
			 WHERE a.login = ? AND bl.entry_type = 'booking_refund'`, [userLogin]
		);
		return rows[0]?.cnt ?? 0;
	} finally { await conn.end(); }
}

export async function cleanupSlot(slotId: number): Promise<void> {
	if (!slotId) return;
	const conn = await mysql.createConnection(DB);
	try {
		await conn.execute(`DELETE FROM ${tn('user_cancellations')} WHERE slot_id = ?`, [slotId]);
		await conn.execute(`DELETE FROM ${tn('balance_ledger')} WHERE ref_type = 'booking' AND ref_id IN (SELECT id FROM ${tn('bookings')} WHERE bookable_type = 'time_slot' AND bookable_id = ?)`, [slotId]);
		await conn.execute(`DELETE FROM ${tn('bookings')} WHERE bookable_type = 'time_slot' AND bookable_id = ?`, [slotId]);
		await conn.execute(`DELETE FROM ${tn('time_slots')} WHERE id = ?`, [slotId]);
	} finally { await conn.end(); }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

export function getTomorrowStr(): string {
	const d = new Date();
	d.setDate(d.getDate() + 1);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── Tests ─────────────────────────────────────────────────────────────────────
