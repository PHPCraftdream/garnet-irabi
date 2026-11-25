/**
 * DB fixtures of the expert-deactivation cascade specs: a paid slot with a booking inserted
 * straight into the tables (no ledger rows), and the ledger / balance probes that go with it.
 */
import mysql from 'mysql2/promise';
import { tn } from '../scoped-test';
import { DB } from './db';

export async function getAccountId(login: string): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT id FROM ${tn('accounts')} WHERE login = ?`, [login]
		);
		return Number(rows[0]?.id ?? 0);
	} finally { await conn.end(); }
}

/**
 * The cascade rebuilds a balance from the ledger. A cache an earlier spec left away from the
 * ledger (a direct UPDATE without ledger rows) would shift the "before" baseline by exactly
 * that drift and fail the refund assertions, so every describe starts from a resynced cache.
 */
export async function resyncBalanceFromLedger(accountId: number): Promise<void> {
	const conn = await mysql.createConnection(DB);
	try {
		await conn.execute(
			`UPDATE ${tn('account_balance')}
			 SET balance = (SELECT COALESCE(SUM(CASE WHEN is_credit = 1 THEN amount ELSE -amount END), 0)
			                FROM ${tn('balance_ledger')} WHERE account_id = ?),
			     updated_at = UNIX_TIMESTAMP()
			 WHERE account_id = ?`,
			[accountId, accountId],
		);
	} finally { await conn.end(); }
}

/**
 * The cascade cancels every future booking of the expert, so a live booking another spec left
 * on the shared expert is refunded in the same pass and moves the whole balance. The refund of
 * this test's own booking is what the test owns: its ledger rows.
 */
export async function bookingLedgerNet(login: string, bookingId: number): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT COALESCE(SUM(CASE WHEN l.is_credit = 1 THEN l.amount ELSE -l.amount END), 0) AS net
			 FROM ${tn('balance_ledger')} l JOIN ${tn('accounts')} a ON a.id = l.account_id
			 WHERE a.login = ? AND l.ref_type = 'booking' AND l.ref_id = ?`,
			[login, bookingId],
		);
		return Number(rows[0]?.net ?? 0);
	} finally { await conn.end(); }
}

/** Cached balance minus the ledger sum: the cascade must leave the cache equal to the ledger. */
export async function balanceDriftFromLedger(login: string): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT ab.balance - COALESCE((SELECT SUM(CASE WHEN l.is_credit = 1 THEN l.amount ELSE -l.amount END)
			                               FROM ${tn('balance_ledger')} l WHERE l.account_id = a.id), 0) AS drift
			 FROM ${tn('account_balance')} ab JOIN ${tn('accounts')} a ON a.id = ab.account_id
			 WHERE a.login = ?`,
			[login],
		);
		return Number(rows[0]?.drift ?? 0);
	} finally { await conn.end(); }
}

export async function createPaidSlot(expertId: number, cost: number, maxUsers: number): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const startAt = Math.floor(Date.now() / 1000) + 86400 * 7;
		const uid = [...Array(16)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
		const [result]: any = await conn.execute(
			`INSERT INTO ${tn('time_slots')}
			 (expert_id, start_at, end_at, duration_min, cost, is_online, location, max_users, booked_count, status, uid, created_at)
			 VALUES (?, ?, ?, 60, ?, 1, 'https://meet.example.com/cascade-test', ?, 0, 'free', ?, ?)`,
			[expertId, startAt, startAt + 3600, cost, maxUsers, uid, Math.floor(Date.now() / 1000)]
		);
		return Number(result.insertId);
	} finally { await conn.end(); }
}

/**
 * Insert a booking row directly and bump the slot's booked_count. The caller
 * decides whether the slot should flip to 'booked' (single-seat) or stay 'free'
 * (partially-booked multi-seat, audit C-2) via `slotBecomesBooked`.
 */
export async function insertBooking(slotId: number, userId: number, status: string, slotBecomesBooked: boolean): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const now = Math.floor(Date.now() / 1000);
		const [result]: any = await conn.execute(
			`INSERT INTO ${tn('bookings')} (user_id, bookable_type, bookable_id, status, created_at)
			 VALUES (?, 'time_slot', ?, ?, ?)`,
			[userId, slotId, status, now]
		);
		await conn.execute(
			`UPDATE ${tn('time_slots')} SET booked_count = booked_count + 1, status = ? WHERE id = ?`,
			[slotBecomesBooked ? 'booked' : 'free', slotId]
		);
		return Number(result.insertId);
	} finally { await conn.end(); }
}

export async function getBookingStatus(bookingId: number): Promise<string> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT status FROM ${tn('bookings')} WHERE id = ?`, [bookingId]
		);
		return rows[0]?.status ?? 'unknown';
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

export async function setBookingsPref(accountId: number, freq: string): Promise<void> {
	const conn = await mysql.createConnection(DB);
	try {
		const value = JSON.stringify({ bookings: freq, messages: 'each', support: 'each' });
		await conn.execute(
			`INSERT INTO ${tn('accounts_data')} (account_id, param, value)
			 VALUES (?, 'email_notif_prefs', ?)
			 ON DUPLICATE KEY UPDATE value = VALUES(value)`,
			[accountId, value]
		);
	} finally { await conn.end(); }
}

export async function restoreExpertFlags(expertId: number): Promise<void> {
	const conn = await mysql.createConnection(DB);
	try {
		// IS_APPROVED = 1, IS_DISABLED unset (0).
		await conn.execute(
			`INSERT INTO ${tn('accounts_data')} (account_id, param, value)
			 VALUES (?, 'IS_APPROVED', '1')
			 ON DUPLICATE KEY UPDATE value = '1'`,
			[expertId]
		);
		await conn.execute(
			`DELETE FROM ${tn('accounts_data')} WHERE account_id = ? AND param = 'IS_DISABLED'`,
			[expertId]
		);
	} finally { await conn.end(); }
}
