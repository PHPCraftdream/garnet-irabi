/**
 * D-162 (follow-up to D-149): the catalog card already flags a group lesson
 * with a "Групповое, мест: N" badge, but the booking modal — the screen
 * where the person actually decides to pay for a shared slot vs. a private
 * one — stayed silent about it. Same class of gap as D-149 (and the
 * D-138/booking-format fix noted in the modal's own comments): a badge
 * added to the catalog card, not to the modal that opens from it.
 */

import { test, expect, tn } from '../../../helpers/scoped-test';
import type { Page } from '@playwright/test';
import mysql from 'mysql2/promise';
import { DB } from '../../../helpers/db/db';

test.describe.configure({ mode: 'serial' });

async function getAccountId(login: string): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT id FROM ${tn('accounts')} WHERE login = ?`, [login]
		);
		return rows[0]?.id ?? 0;
	} finally { await conn.end(); }
}

function generateUid(): string {
	return [...Array(16)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
}

async function createFreeSlot(expertId: number, maxUsers: number, startAt: number): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const [result]: any = await conn.execute(
			`INSERT INTO ${tn('time_slots')}
			 (expert_id, start_at, end_at, duration_min, cost, is_online, location, max_users, status, uid, created_at)
			 VALUES (?, ?, ?, 60, 500, 1, 'https://meet.example.com/d162-test', ?, 'free', ?, ?)`,
			[expertId, startAt, startAt + 3600, maxUsers, generateUid(), Math.floor(Date.now() / 1000)]
		);
		return result.insertId;
	} finally { await conn.end(); }
}

async function deleteSlot(slotId: number): Promise<void> {
	if (!slotId) return;
	const conn = await mysql.createConnection(DB);
	try {
		await conn.execute(`DELETE FROM ${tn('bookings')} WHERE bookable_type = 'time_slot' AND bookable_id = ?`, [slotId]);
		await conn.execute(`DELETE FROM ${tn('time_slots')} WHERE id = ?`, [slotId]);
	} finally { await conn.end(); }
}

async function revealSlot(page: Page, slotId: number): Promise<void> {
	const card = page.locator(`[data-test-id="slot-card-${slotId}"]`);
	const nextBtn = page.locator('[data-test-id="week-next"]');
	for (let i = 0; i < 5; i++) {
		if (await card.isVisible({ timeout: 2000 }).catch(() => false)) return;
		await nextBtn.click();
	}
}

test.describe('D-162: booking modal marks a group slot as group', () => {
	let expertId = 0;
	let individualSlotId = 0;
	let groupSlotId = 0;

	test.beforeAll(async () => {
		expertId = await getAccountId('testuser_setup_expert@irabi.test');
		expect(expertId).toBeGreaterThan(0);

		const dayStart = Math.floor(Date.now() / 1000) + 86400 * 13;
		individualSlotId = await createFreeSlot(expertId, 1, dayStart + 3600 * 8);
		groupSlotId = await createFreeSlot(expertId, 3, dayStart + 3600 * 10);
		expect(individualSlotId).toBeGreaterThan(0);
		expect(groupSlotId).toBeGreaterThan(0);
	});

	test.afterAll(async () => {
		await deleteSlot(individualSlotId);
		await deleteSlot(groupSlotId);
	});

	test('booking modal shows the group badge for a group slot', async ({ page }) => {
		await page.goto('/slots');
		await expect(page.locator('[data-test-id="slots-calendar"]')).toBeVisible({ timeout: 8000 });
		await revealSlot(page, groupSlotId);

		await page.locator(`[data-test-id="slot-book-btn-${groupSlotId}"]`).click();
		const modal = page.locator('[data-test-id="booking-modal"]');
		await expect(modal).toBeVisible({ timeout: 5000 });

		const badge = page.locator('[data-test-id="booking-group-badge"]');
		await expect(badge).toBeVisible({ timeout: 5000 });
		await expect(badge).toContainText('3');
	});

	test('booking modal shows no group badge for an individual slot', async ({ page }) => {
		await page.goto('/slots');
		await revealSlot(page, individualSlotId);

		await page.locator(`[data-test-id="slot-book-btn-${individualSlotId}"]`).click();
		const modal = page.locator('[data-test-id="booking-modal"]');
		await expect(modal).toBeVisible({ timeout: 5000 });

		await expect(page.locator('[data-test-id="booking-group-badge"]')).toHaveCount(0);
	});
});
