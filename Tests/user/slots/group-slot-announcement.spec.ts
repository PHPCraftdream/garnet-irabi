/**
 * D-154: SlotsController::post__book (multi-slot booking via the catalog
 * checkboxes) purged the "new_slot" public announcement after EVERY
 * successful booking, unconditionally — even for a group slot with seats
 * still open. BookingsController::post__book (the single-slot detail-page
 * flow) only purges it once the slot is actually full. A group class
 * announced via the catalog checkbox flow lost its "new class!" listing
 * after the FIRST student booked, while 2 more seats sat unadvertised.
 *
 * Both paths now agree: the announcement survives until booked_count
 * reaches max_users.
 */

import { test, expect, tn } from '../../helpers/scoped-test';
import { newScopedContext } from '../../helpers/scoped-test';
import { resolveStorageStatePath } from '../../helpers/auth/state';
import { withConnection } from '../../helpers/db/db';
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

async function createGroupSlot(expertId: number, maxUsers: number): Promise<number> {
	return withConnection(async (c) => {
		const startAt = Math.floor(Date.now() / 1000) + 86400 * 9;
		const [res]: any = await c.execute(
			`INSERT INTO ${tn('time_slots')}
			 (expert_id, start_at, end_at, duration_min, cost, is_online, location, max_users, booked_count, status, uid, created_at)
			 VALUES (?, ?, ?, 60, 0, 1, 'https://meet.example.com/d154-test', ?, 0, 'free', ?, ?)`,
			[expertId, startAt, startAt + 3600, maxUsers, generateUid(), Math.floor(Date.now() / 1000)],
		);
		return res.insertId;
	});
}

async function seedNewSlotAnnouncement(slotId: number, expertId: number): Promise<void> {
	await withConnection(async (c) => {
		await c.execute(
			`INSERT INTO ${tn('news_events')} (event_type, audience_type, audience_id, actor_id, target_key, payload, created_at)
			 VALUES ('new_slot', 'broadcast', 0, ?, ?, '{}', ?)`,
			[expertId, `slot:${slotId}`, Math.floor(Date.now() / 1000)],
		);
	});
}

async function newSlotAnnouncementExists(slotId: number): Promise<boolean> {
	return withConnection(async (c) => {
		const [rows] = await c.execute<any[]>(
			`SELECT id FROM ${tn('news_events')} WHERE event_type = 'new_slot' AND target_key = ?`,
			[`slot:${slotId}`],
		);
		return rows.length > 0;
	});
}

async function cleanup(slotId: number): Promise<void> {
	await withConnection(async (c) => {
		await c.execute(`DELETE FROM ${tn('news_events')} WHERE target_key = ?`, [`slot:${slotId}`]);
		await c.execute(`DELETE FROM ${tn('bookings')} WHERE bookable_type = 'time_slot' AND bookable_id = ?`, [slotId]);
		await c.execute(`DELETE FROM ${tn('time_slots')} WHERE id = ?`, [slotId]);
	});
}

test.describe.configure({ mode: 'serial' });

test.describe('D-154: multi-book path keeps the group-slot announcement until the slot is actually full', () => {
	let expertId = 0;
	let userId = 0;
	let slotId = 0;
	let ctx: BrowserContext;
	let page: Page;

	test.beforeAll(async ({ browser }) => {
		({ expertId, userId } = await getIds());
		expect(expertId).toBeGreaterThan(0);
		expect(userId).toBeGreaterThan(0);

		slotId = await createGroupSlot(expertId, 3);
		expect(slotId).toBeGreaterThan(0);
		await seedNewSlotAnnouncement(slotId, expertId);
		expect(await newSlotAnnouncementExists(slotId)).toBe(true);

		ctx = await newScopedContext(browser, { storageState: resolveStorageStatePath('user') });
		page = await ctx.newPage();
		await page.goto('/system/', { waitUntil: 'domcontentloaded' });
	});

	test.afterAll(async () => {
		await ctx?.close().catch(() => {});
		await cleanup(slotId);
	});

	test('booking 1 of 3 seats via /slots/~book keeps the announcement', async () => {
		const result = await page.evaluate(async (args: { slotId: number }) => {
			const csrf = (window as any).__GARNET_CSRF__ || '';
			const fd = new FormData();
			fd.append('CSRF_TOKEN', csrf);
			fd.append('slot_ids[]', String(args.slotId));
			const res = await fetch('/slots/~book', { method: 'POST', body: fd });
			const text = await res.text();
			let body: any = null;
			try { body = JSON.parse(text); } catch { body = text; }
			return { status: res.status, body };
		}, { slotId });

		expect(result.status).toBe(200);
		expect(result.body.success).toBe(true);
		expect(await newSlotAnnouncementExists(slotId)).toBe(true);
	});

	test('DB: slot still free, booked_count = 1 of 3', async () => {
		const row = await withConnection(async (c) => {
			const [rows] = await c.execute<any[]>(
				`SELECT status, booked_count FROM ${tn('time_slots')} WHERE id = ?`,
				[slotId],
			);
			return rows[0];
		});
		expect(row.status).toBe('free');
		expect(row.booked_count).toBe(1);
	});

	test('TYPE_SLOT_BOOKED event now carries booking_id (parity with the single-slot path)', async () => {
		const row = await withConnection(async (c) => {
			const [rows] = await c.execute<any[]>(
				`SELECT payload FROM ${tn('news_events')} WHERE event_type = 'slot_booked' AND target_key = ? ORDER BY id DESC LIMIT 1`,
				[`slot:${slotId}`],
			);
			return rows[0];
		});
		expect(row).toBeTruthy();
		const payload = JSON.parse(row.payload);
		expect(payload.booking_id).toBeGreaterThan(0);
	});
});
