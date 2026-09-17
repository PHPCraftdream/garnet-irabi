/**
 * D-149: the general catalog (/slots) never marked which lessons were
 * group lessons — no badge on the card, and the existing "Тип" filter row
 * had an "Индивидуальные" chip that was wired to nothing (slotType was
 * never read by the client-side filter). Fixed:
 *   - SlotCard shows a "Групповое, мест: N" badge when max_users > 1.
 *   - A "group" filter option was added and actually applied.
 */

import { test, expect, tn } from '../../helpers/scoped-test';
import type { Page } from '@playwright/test';
import mysql from 'mysql2/promise';
import { DB } from '../../helpers/db/db';

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
			 VALUES (?, ?, ?, 60, 500, 1, 'https://meet.example.com/d149-test', ?, 'free', ?, ?)`,
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

/**
 * The catalog is a week-by-week grid, not a flat list — a slot a few days
 * out may already be in next week's page. Click forward (matching the
 * pattern in cross-role/booking-refund-flow.spec.ts) until it shows up.
 */
async function revealSlot(page: Page, slotId: number): Promise<void> {
	const card = page.locator(`[data-test-id="slot-card-${slotId}"]`);
	const nextBtn = page.locator('[data-test-id="week-next"]');
	for (let i = 0; i < 5; i++) {
		if (await card.isVisible({ timeout: 2000 }).catch(() => false)) return;
		await nextBtn.click();
	}
}

test.describe('D-149: catalog marks group lessons and the type filter actually filters', () => {
	let expertId = 0;
	let individualSlotId = 0;
	let groupSlotId = 0;

	test.beforeAll(async () => {
		expertId = await getAccountId('testuser_setup_expert@irabi.test');
		expect(expertId).toBeGreaterThan(0);

		// Same day, different hours — whichever week either lands in, both do.
		const dayStart = Math.floor(Date.now() / 1000) + 86400 * 5;
		individualSlotId = await createFreeSlot(expertId, 1, dayStart + 3600 * 8);
		groupSlotId = await createFreeSlot(expertId, 4, dayStart + 3600 * 10);
		expect(individualSlotId).toBeGreaterThan(0);
		expect(groupSlotId).toBeGreaterThan(0);
	});

	test.afterAll(async () => {
		await deleteSlot(individualSlotId);
		await deleteSlot(groupSlotId);
	});

	test('group slot shows the seats badge, individual slot does not', async ({ page }) => {
		await page.goto('/slots');
		await expect(page.locator('[data-test-id="slots-calendar"]')).toBeVisible({ timeout: 8000 });
		await revealSlot(page, groupSlotId);

		const groupCard = page.locator(`[data-test-id="slot-card-${groupSlotId}"]`);
		await expect(groupCard).toBeVisible({ timeout: 8000 });
		const groupBadge = page.locator(`[data-test-id="slot-group-badge-${groupSlotId}"]`);
		await expect(groupBadge).toBeVisible();
		await expect(groupBadge).toContainText('4');

		const individualCard = page.locator(`[data-test-id="slot-card-${individualSlotId}"]`);
		await expect(individualCard).toBeVisible({ timeout: 8000 });
		await expect(page.locator(`[data-test-id="slot-group-badge-${individualSlotId}"]`)).toHaveCount(0);
	});

	test('"Групповые" filter hides the individual slot, keeps the group one', async ({ page }) => {
		await page.goto('/slots');
		await revealSlot(page, groupSlotId);
		await expect(page.locator(`[data-test-id="slot-card-${groupSlotId}"]`)).toBeVisible({ timeout: 8000 });

		await page.locator('[data-test-id="filter-type-group"]').click();
		await expect(page.locator(`[data-test-id="slot-card-${groupSlotId}"]`)).toBeVisible({ timeout: 5000 });
		await expect(page.locator(`[data-test-id="slot-card-${individualSlotId}"]`)).toHaveCount(0);
	});

	test('"Индивидуальные" filter hides the group slot, keeps the individual one', async ({ page }) => {
		await page.goto('/slots');
		await revealSlot(page, individualSlotId);
		await expect(page.locator(`[data-test-id="slot-card-${individualSlotId}"]`)).toBeVisible({ timeout: 8000 });

		await page.locator('[data-test-id="filter-type-individual"]').click();
		await expect(page.locator(`[data-test-id="slot-card-${individualSlotId}"]`)).toBeVisible({ timeout: 5000 });
		await expect(page.locator(`[data-test-id="slot-card-${groupSlotId}"]`)).toHaveCount(0);
	});

	test('"Все" filter shows both again', async ({ page }) => {
		await page.goto('/slots');
		await revealSlot(page, groupSlotId);
		await page.locator('[data-test-id="filter-type-group"]').click();
		await expect(page.locator(`[data-test-id="slot-card-${individualSlotId}"]`)).toHaveCount(0);

		await page.locator('[data-test-id="filter-type-all"]').click();
		await expect(page.locator(`[data-test-id="slot-card-${groupSlotId}"]`)).toBeVisible({ timeout: 5000 });
		await expect(page.locator(`[data-test-id="slot-card-${individualSlotId}"]`)).toBeVisible({ timeout: 5000 });
	});
});
