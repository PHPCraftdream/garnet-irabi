/**
 * Cross-role — Approval triggers new_slot news broadcast
 *
 * When an admin approves an expert (IS_APPROVED 0 -> 1), the backend
 * broadcasts a `new_slot` news event for EVERY future, non-cancelled
 * slot the expert already had (announceFutureSlots). Idempotent: it
 * deletes any existing new_slot for the slot first, then inserts.
 *
 * Uses data-test-id: filter-tab-experts, flag-IS_APPROVED-{id}
 */

import { test, expect, tn, newScopedContext } from '../helpers/scoped-test';
import mysql from 'mysql2/promise';
import { resolveStorageStatePath } from '../helpers/state';
import { DB } from '../helpers/db';

test.describe.configure({ mode: 'serial' });

let expertId = 0;
let initialApprovalState = 0;
let slotId1 = 0;
let slotId2 = 0;

async function getExpertId(): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT id FROM ${tn('accounts')} WHERE login = 'testuser_setup_expert@irabi.test'`
		);
		return rows[0]?.id ?? 0;
	} finally { await conn.end(); }
}

async function getExpertApprovalState(id: number): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT is_approved FROM ${tn('expert_profiles')} WHERE account_id = ?`,
			[id]
		);
		return rows[0]?.is_approved ?? 0;
	} finally { await conn.end(); }
}

async function setExpertUnapproved(id: number): Promise<void> {
	const conn = await mysql.createConnection(DB);
	try {
		await conn.execute(
			`UPDATE ${tn('expert_profiles')} SET is_approved = 0 WHERE account_id = ?`,
			[id]
		);
		await conn.execute(
			`INSERT INTO ${tn('accounts_data')} (account_id, param, value)
			 SELECT id, 'IS_APPROVED', '0' FROM ${tn('accounts')} WHERE id = ?
			 ON DUPLICATE KEY UPDATE value = '0'`,
			[id]
		);
	} finally { await conn.end(); }
}

async function restoreExpertApproval(id: number, state: number): Promise<void> {
	const conn = await mysql.createConnection(DB);
	try {
		await conn.execute(
			`UPDATE ${tn('expert_profiles')} SET is_approved = ? WHERE account_id = ?`,
			[state, id]
		);
		await conn.execute(
			`INSERT INTO ${tn('accounts_data')} (account_id, param, value)
			 SELECT id, 'IS_APPROVED', ? FROM ${tn('accounts')} WHERE id = ?
			 ON DUPLICATE KEY UPDATE value = VALUES(value)`,
			[String(state), id]
		);
	} finally { await conn.end(); }
}

async function insertFutureSlot(eid: number, daysAhead: number): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const startAt = Math.floor(Date.now() / 1000) + 86400 * daysAhead;
		const endAt = startAt + 3600;
		const uid = [...Array(16)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
		const [result]: any = await conn.execute(
			`INSERT INTO ${tn('time_slots')}
			 (expert_id, start_at, end_at, duration_min, cost, is_online, location, max_users, status, uid, cancellation_penalty_percent, created_at)
			 VALUES (?, ?, ?, 60, 500, 1, 'https://m.example/x', 1, 'free', ?, 0, ?)`,
			[eid, startAt, endAt, uid, Math.floor(Date.now() / 1000)]
		);
		return result.insertId;
	} finally { await conn.end(); }
}

async function deleteSlots(ids: number[]): Promise<void> {
	if (!ids.length) return;
	const conn = await mysql.createConnection(DB);
	try {
		await conn.execute(
			`DELETE FROM ${tn('time_slots')} WHERE id IN (${ids.map(() => '?').join(',')})`,
			ids
		);
	} finally { await conn.end(); }
}

async function deleteNewsForSlots(ids: number[]): Promise<void> {
	if (!ids.length) return;
	const conn = await mysql.createConnection(DB);
	try {
		const keys = ids.map(id => `slot:${id}`);
		await conn.execute(
			`DELETE FROM ${tn('news_events')} WHERE target_key IN (${keys.map(() => '?').join(',')})`,
			keys
		);
	} finally { await conn.end(); }
}

async function countNewSlotNews(ids: number[]): Promise<number> {
	if (!ids.length) return 0;
	const conn = await mysql.createConnection(DB);
	try {
		const keys = ids.map(id => `slot:${id}`);
		const [rows] = await conn.execute<any[]>(
			`SELECT COUNT(*) AS cnt FROM ${tn('news_events')}
			 WHERE event_type = 'new_slot' AND target_key IN (${keys.map(() => '?').join(',')})`,
			keys
		);
		return rows[0]?.cnt ?? 0;
	} finally { await conn.end(); }
}

async function getNewsForSlot(slotId: number): Promise<any[]> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT * FROM ${tn('news_events')}
			 WHERE event_type = 'new_slot' AND target_key = ?`,
			[`slot:${slotId}`]
		);
		return rows;
	} finally { await conn.end(); }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Approval broadcasts new_slot news for future slots', () => {

	test('entry: make expert unapproved, seed 2 future slots, clear their news', async () => {
		expertId = await getExpertId();
		expect(expertId).toBeGreaterThan(0);

		initialApprovalState = await getExpertApprovalState(expertId);

		// Set unapproved
		await setExpertUnapproved(expertId);

		// Seed two future slots
		slotId1 = await insertFutureSlot(expertId, 10);
		slotId2 = await insertFutureSlot(expertId, 11);
		expect(slotId1).toBeGreaterThan(0);
		expect(slotId2).toBeGreaterThan(0);

		// Clear any existing news for these slots
		await deleteNewsForSlots([slotId1, slotId2]);
	});

	test('precondition: no new_slot news for the seeded slots', async () => {
		if (!expertId) { test.skip(); return; }

		const count = await countNewSlotNews([slotId1, slotId2]);
		expect(count).toBe(0);
	});

	test('approving the expert broadcasts new_slot for each future slot', async ({ browser }) => {
		if (!expertId) { test.skip(); return; }

		const adminCtx = await newScopedContext(browser, {
			storageState: resolveStorageStatePath('admin'),
		});
		const adminPage = await adminCtx.newPage();

		try {
			await adminPage.goto('/admin/');
			await adminPage.waitForSelector('table', { timeout: 12000 });

			await adminPage.locator('[data-test-id="filter-tab-experts"]').click();

			const approveBtn = adminPage.locator(`[data-test-id="flag-IS_APPROVED-${expertId}"]`);
			await expect(approveBtn).toBeVisible({ timeout: 8000 });

			// Click approve and wait for POST response
			await Promise.all([
				adminPage.waitForResponse(
					r => r.request().method() === 'POST' && r.status() < 500,
					{ timeout: 10000 }
				),
				approveBtn.click(),
			]);

			// Verify approval took effect in DB
			const approval = await getExpertApprovalState(expertId);
			expect(approval).toBe(1);

			// Allow backend async news broadcast to settle
			await adminPage.waitForTimeout(1500);

			// Assert new_slot news exists for both slots
			const news1 = await getNewsForSlot(slotId1);
			expect(news1.length).toBeGreaterThanOrEqual(1);
			expect(news1[0].audience_type).toBe('broadcast');
			expect(news1[0].actor_id).toBe(expertId);

			const news2 = await getNewsForSlot(slotId2);
			expect(news2.length).toBeGreaterThanOrEqual(1);
			expect(news2[0].audience_type).toBe('broadcast');
			expect(news2[0].actor_id).toBe(expertId);
		} finally {
			await adminCtx.close();
		}
	});

	test('exit: cleanup + restore', async () => {
		// Delete seeded slots and their news
		await deleteNewsForSlots([slotId1, slotId2]);
		await deleteSlots([slotId1, slotId2]);

		// Restore expert approval to initial state
		if (expertId) {
			await restoreExpertApproval(expertId, initialApprovalState);
		}
	});
});
