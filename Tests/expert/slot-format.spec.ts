/**
 * Expert — slot format (is_online) + location fields on the three slot
 * management surfaces (audit 16-feature-completeness-admin §3.1).
 *
 * Before this change the backend accepted is_online/location on create/edit
 * but NO form exposed them, so every slot was created as is_online=1 with an
 * empty location forever; batchSlots() additionally hardcoded 1/''. This spec
 * covers all three surfaces plus the batchSlots() backend fix.
 *
 * Coverage:
 *   1. CreateSlotForm — create one slot as Offline with an address →
 *      DB row has is_online=0, location saved.
 *   2. BatchSlotWizard — batch-create as Offline with one shared address →
 *      every created slot in DB has is_online=0 + the same location (proves
 *      batchSlots() no longer hardcodes 1/'').
 *   3. EditSlotModal — flip an existing Online slot to Offline + change
 *      location → DB row updated.
 *
 * UI test-ids added by the feature:
 *   {slot,batch,edit-slot}-format-online / -format-offline  (radio group)
 *   {slot,batch,edit-slot}-location                         (text input)
 *
 * API endpoints:
 *   POST /expert/~slots       — single create
 *   POST /expert/~batchSlots  — batch create
 *   POST /expert/~editSlot    — edit existing slot
 */
import {test, expect, tn} from '../helpers/scoped-test';
import mysql from 'mysql2/promise';
import {DB} from '../helpers/db';

test.describe.configure({mode: 'parallel'});

const EXPERT_LOGIN = 'testuser_setup_expert@irabi.test';
const USER_LOGIN = 'testuser_setup_user@irabi.test';

// ── DB helpers ─────────────────────────────────────────────────────────────────

async function getAccountId(login: string): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT id FROM ${tn('accounts')} WHERE login = ?`, [login],
		);
		return Number(rows[0]?.id ?? 0);
	} finally { await conn.end(); }
}

async function getSlot(slotId: number): Promise<any> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT * FROM ${tn('time_slots')} WHERE id = ?`, [slotId],
		);
		return rows[0] ?? null;
	} finally { await conn.end(); }
}

async function createFreeSlot(expertId: number, isOnline = 1, location = '', futureOffsetSec = 86400 * 4): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const startAt = Math.floor(Date.now() / 1000) + futureOffsetSec;
		const uid = [...Array(16)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
		const [result]: any = await conn.execute(
			`INSERT INTO ${tn('time_slots')}
			 (expert_id, start_at, end_at, duration_min, cost, is_online, location, max_users, status, uid, created_at)
			 VALUES (?, ?, ?, 60, 100, ?, ?, 1, 'free', ?, ?)`,
			[expertId, startAt, startAt + 3600, isOnline, location, uid, Math.floor(Date.now() / 1000)],
		);
		return Number(result.insertId);
	} finally { await conn.end(); }
}

/**
 * Seed a multi-seat slot (max_users=3) directly with a real cost, so it can
 * carry a partial booking below.
 */
async function createMultiSlot(expertId: number, cost: number, maxUsers: number): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const startAt = Math.floor(Date.now() / 1000) + 86400 * 4;
		const uid = [...Array(16)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
		const [result]: any = await conn.execute(
			`INSERT INTO ${tn('time_slots')}
			 (expert_id, start_at, end_at, duration_min, cost, is_online, location, max_users, booked_count, status, uid, created_at)
			 VALUES (?, ?, ?, 60, ?, 1, '', ?, 0, 'free', ?, ?)`,
			[expertId, startAt, startAt + 3600, cost, maxUsers, uid, Math.floor(Date.now() / 1000)],
		);
		return Number(result.insertId);
	} finally { await conn.end(); }
}

/**
 * Seed one active booking on a multi-seat slot WITHOUT flipping status —
 * reproduces the C-2 partially-booked state (1 of N seats taken, status
 * stays 'free' — a single-seat slot flips straight to 'booked' on its first
 * booking, which editSlot() refuses to touch at all regardless of the
 * money-gate; the money-gate fix this test guards only matters for slots
 * editSlot() still considers 'free').
 */
async function seedActiveBooking(slotId: number, userId: number): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const now = Math.floor(Date.now() / 1000);
		const [result]: any = await conn.execute(
			`INSERT INTO ${tn('bookings')} (user_id, bookable_type, bookable_id, status, created_at)
			 VALUES (?, 'time_slot', ?, 'confirmed', ?)`,
			[userId, slotId, now],
		);
		await conn.execute(
			`UPDATE ${tn('time_slots')} SET booked_count = booked_count + 1 WHERE id = ?`,
			[slotId],
		);
		return Number(result.insertId);
	} finally { await conn.end(); }
}

async function deleteSlots(slotIds: number[]): Promise<void> {
	if (!slotIds.length) return;
	const conn = await mysql.createConnection(DB);
	try {
		const ph = slotIds.map(() => '?').join(',');
		await conn.execute(`DELETE FROM ${tn('bookings')} WHERE bookable_type='time_slot' AND bookable_id IN (${ph})`, slotIds);
		await conn.execute(`DELETE FROM ${tn('time_slots')} WHERE id IN (${ph})`, slotIds);
	} finally { await conn.end(); }
}

function dateStr(daysFromNow: number): string {
	const d = new Date();
	d.setDate(d.getDate() + daysFromNow);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── Test 1: CreateSlotForm — offline slot with location ───────────────────────

test.describe('Slot format: create single offline slot with location', () => {
	test.describe.configure({mode: 'serial'});

	let slotId = 0;

	test('create slot as Offline + address → DB has is_online=0, location saved', async ({page}) => {
		const modal = page.locator('[data-test-id="create-slot-modal"]');

		// Register the listener BEFORE navigating so the POST is not missed.
		const respPromise = page.waitForResponse(
			r => r.url().includes('/expert/~slots') && r.request().method() === 'POST',
			{timeout: 15000},
		).then(async r => ({status: r.status(), body: await r.json().catch(() => null)}));

		await page.goto('/expert/~slots');
		await page.locator('[data-test-id="open-create-slot-modal"]').click();
		await expect(modal).toBeVisible({timeout: 8000});

		await modal.locator('input[name="date"]').fill(dateStr(7));
		await modal.locator('input[name="time"]').fill('11:00');
		await modal.locator('input[name="cost"]').fill('300');

		// Switch to Offline + set location
		await modal.locator('[data-test-id="slot-format-offline"]').check();
		await modal.locator('[data-test-id="slot-location"]').fill('ул. Тестовая, 1, офис 5');

		await modal.locator('[data-test-id="create-slot-btn"]').click();
		const resp = await respPromise;

		expect(resp.status).toBe(200);
		expect(resp.body?.success).toBe(true);
		slotId = Number(resp.body?.slot_id ?? 0);
		expect(slotId).toBeGreaterThan(0);

		await expect(modal).not.toBeVisible({timeout: 10000});

		const slot = await getSlot(slotId);
		expect(slot).toBeTruthy();
		expect(Number(slot.is_online)).toBe(0);
		expect(slot.location).toBe('ул. Тестовая, 1, офис 5');
	});

	test.afterAll(async () => {
		if (slotId) await deleteSlots([slotId]);
	});
});

// ── Test 2: BatchSlotWizard — batch offline with one shared location ──────────

test.describe('Slot format: batch create offline with shared location', () => {
	test.describe.configure({mode: 'serial'});

	const createdIds: number[] = [];

	test('batch create as Offline + address → every created slot is_online=0, same location', async ({page}) => {
		const batchModal = page.locator('[data-test-id="batch-slot-modal"]');

		// Drive the UI up to the batchSlots POST and capture its response.
		const respPromise = page.waitForResponse(
			r => r.url().includes('/expert/~batchSlots') && r.request().method() === 'POST',
			{timeout: 20000},
		).then(async r => ({status: r.status(), body: await r.json().catch(() => null)}));

		await page.goto('/expert/~slots');
		await page.locator('[data-test-id="open-batch-slot-modal"]').click();
		await expect(batchModal).toBeVisible({timeout: 8000});

		// A future range broad enough to offer available weekdays.
		await batchModal.locator('input[name="start_date"]').fill(dateStr(14));
		await batchModal.locator('input[name="per_week"]').fill('2');
		await batchModal.locator('input[name="count"]').fill('3');
		await batchModal.locator('input[name="batch_cost"]').fill('400');

		// Shared batch format/location
		await batchModal.locator('[data-test-id="batch-format-offline"]').check();
		await batchModal.locator('[data-test-id="batch-location"]').fill('Conference Hall B');

		await batchModal.locator('#batchForm button[type="submit"]').click();
		await expect(batchModal.locator('#proposedBody tr')).toHaveCount(3, {timeout: 10000});

		await batchModal.locator('#batchCreateBtn').click();
		const confirmModal = page.locator('#confirmModal');
		await expect(confirmModal).toBeVisible({timeout: 5000});

		await page.locator('#confirmModalOk').click();
		const resp = await respPromise;

		expect(resp.status).toBe(200);
		expect(resp.body?.success).toBe(true);
		expect(Number(resp.body?.created ?? 0)).toBeGreaterThan(0);
		for (const s of (resp.body?.slots ?? [])) createdIds.push(Number(s.id));

		await expect(batchModal).not.toBeVisible({timeout: 10000});

		// Every created slot must carry the batch-wide offline + location
		// (previously batchSlots() hardcoded is_online=1 / location='').
		expect(createdIds.length).toBeGreaterThan(0);
		for (const id of createdIds) {
			const slot = await getSlot(id);
			expect(slot, `slot ${id} missing`).toBeTruthy();
			expect(Number(slot.is_online)).toBe(0);
			expect(slot.location).toBe('Conference Hall B');
		}
	});

	test.afterAll(async () => {
		await deleteSlots(createdIds);
	});
});

// ── Test 3: EditSlotModal — flip format + change location ─────────────────────

test.describe('Slot format: edit existing slot format + location', () => {
	test.describe.configure({mode: 'serial'});

	let expertId = 0;
	let slotId = 0;

	// beforeAll/afterAll (not plain tests) — serial mode skips every
	// subsequent test once one fails, so a cleanup step written as a
	// regular test never runs after a mid-flow assertion fails, leaving
	// a stray test slot behind for the rest of this worker's run.
	// Hooks run regardless of test outcome.
	test.beforeAll(async () => {
		expertId = await getAccountId(EXPERT_LOGIN);
		expect(expertId).toBeGreaterThan(0);
		slotId = await createFreeSlot(expertId, 1, '');
		expect(slotId).toBeGreaterThan(0);
	});

	test('edit slot → Offline + new location saved in DB', async ({page}) => {
		test.skip(!slotId, 'setup failed');
		const modal = page.locator('[data-test-id="edit-slot-modal"]');

		const respPromise = page.waitForResponse(
			r => r.url().includes('/expert/~editSlot') && r.request().method() === 'POST',
			{timeout: 15000},
		).then(async r => ({status: r.status(), body: await r.json().catch(() => null)}));

		await page.goto('/expert/~slots');
		const editBtn = page.locator(`[data-test-id="edit-slot-${slotId}"]`);
		await expect(editBtn).toBeVisible({timeout: 15000});
		await editBtn.click();
		await expect(modal).toBeVisible({timeout: 8000});

		// Toggle to Offline + change location
		await modal.locator('[data-test-id="edit-slot-format-offline"]').check();
		await modal.locator('[data-test-id="edit-slot-location"]').fill('Zoom was wrong, meet at Office 12');

		await modal.locator('[data-test-id="edit-slot-save"]').click();
		const resp = await respPromise;

		expect(resp.status).toBe(200);
		expect(resp.body?.success).toBe(true);

		await expect(modal).not.toBeVisible({timeout: 8000});

		const slot = await getSlot(slotId);
		expect(Number(slot.is_online)).toBe(0);
		expect(slot.location).toBe('Zoom was wrong, meet at Office 12');
	});

	test.afterAll(async () => {
		if (slotId) await deleteSlots([slotId]);
	});
});

// ── Test 4: EditSlotModal on a slot with an active booking ────────────────────
//
// Regression guard for a bug this feature would otherwise reintroduce:
// EditSlotModal always echoes the slot's CURRENT cost/cancellation_penalty_
// percent back in its save payload (Front/Islands/ExpertSlots/ExpertSlotsIsland.tsx),
// even when the user is only touching is_online/location. The audit #47
// money-gate (ExpertSlotsService::editSlot) originally keyed off mere
// PRESENCE of the cost/penalty POST fields, not whether their value actually
// changed — so once a slot had an active booking, ANY edit via this modal
// (including a pure location change) would be wrongly rejected with 400/409.
// Fixed to compare against the slot's current cost/penalty instead. This
// test drives the real modal (not a hand-built payload) against a booked
// slot to prove the fix holds for the actual UI path.
test.describe('Slot format: EditSlotModal on a slot with an active booking still works', () => {
	test.describe.configure({mode: 'serial'});

	let expertId = 0;
	let userId = 0;
	let slotId = 0;
	let bookingId = 0;

	test.beforeAll(async () => {
		expertId = await getAccountId(EXPERT_LOGIN);
		userId = await getAccountId(USER_LOGIN);
		expect(expertId).toBeGreaterThan(0);
		expect(userId).toBeGreaterThan(0);

		slotId = await createMultiSlot(expertId, 100, 3);
		expect(slotId).toBeGreaterThan(0);
		bookingId = await seedActiveBooking(slotId, userId);
		expect(bookingId).toBeGreaterThan(0);

		const slot = await getSlot(slotId);
		expect(Number(slot.booked_count)).toBe(1);
		expect(slot.status).toBe('free');
	});

	test('edit format/location on a booked slot → success (money-gate does not fire)', async ({page}) => {
		test.skip(!slotId, 'setup failed');
		const modal = page.locator('[data-test-id="edit-slot-modal"]');

		const respPromise = page.waitForResponse(
			r => r.url().includes('/expert/~editSlot') && r.request().method() === 'POST',
			{timeout: 15000},
		).then(async r => ({status: r.status(), body: await r.json().catch(() => null)}));

		await page.goto('/expert/~slots');
		const editBtn = page.locator(`[data-test-id="edit-slot-${slotId}"]`);
		await expect(editBtn).toBeVisible({timeout: 15000});
		await editBtn.click();
		await expect(modal).toBeVisible({timeout: 8000});

		await modal.locator('[data-test-id="edit-slot-format-offline"]').check();
		await modal.locator('[data-test-id="edit-slot-location"]').fill('Booked slot — moved to Room 3');

		await modal.locator('[data-test-id="edit-slot-save"]').click();
		const resp = await respPromise;

		expect(resp.status).toBe(200);
		expect(resp.body?.success).toBe(true);

		await expect(modal).not.toBeVisible({timeout: 8000});

		const slot = await getSlot(slotId);
		expect(Number(slot.is_online)).toBe(0);
		expect(slot.location).toBe('Booked slot — moved to Room 3');
		// Cost must be untouched — the modal echoed it back unchanged, and the
		// (fixed) gate must not have treated that as a cost-change attempt.
		expect(Number(slot.cost)).toBe(100);
	});

	test.afterAll(async () => {
		if (bookingId) {
			const conn = await mysql.createConnection(DB);
			try {
				await conn.execute(`DELETE FROM ${tn('bookings')} WHERE id = ?`, [bookingId]);
			} finally { await conn.end(); }
		}
		if (slotId) await deleteSlots([slotId]);
	});
});
