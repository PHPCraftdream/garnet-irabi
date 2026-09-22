/**
 * The catalog card's base rule (padding, background, rounded corners,
 * shadow) lived on garnet-framework's `.time-slot-card` class — but
 * `SlotCard.tsx` rendered with `className="slot-card"` (no `time-`
 * prefix), a class the base rule never matched. Only the framework's
 * `.slot-card:hover` line happened to share the (wrong) name, so cards
 * had a lift-on-hover shadow but no padding/background at rest — text
 * ran edge-to-edge, cards had no visible boundary against the page.
 * The mismatch predates this fix; `glass.css` already referenced
 * `.time-slot-card` consistently alongside `.user-balance-card` /
 * `.admin-dash-card`, so the component's className was the outlier.
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

async function createFreeSlot(expertId: number, startAt: number): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const [result]: any = await conn.execute(
			`INSERT INTO ${tn('time_slots')}
			 (expert_id, start_at, end_at, duration_min, cost, is_online, location, max_users, status, uid, created_at)
			 VALUES (?, ?, ?, 60, 500, 1, 'https://meet.example.com/card-styling-test', 1, 'free', ?, ?)`,
			[expertId, startAt, startAt + 3600, generateUid(), Math.floor(Date.now() / 1000)]
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

test.describe('catalog slot card carries the framework\'s base padding/background rule', () => {
	let expertId = 0;
	let slotId = 0;

	test.beforeAll(async () => {
		expertId = await getAccountId('testuser_setup_expert@irabi.test');
		expect(expertId).toBeGreaterThan(0);

		const dayStart = Math.floor(Date.now() / 1000) + 86400 * 5;
		slotId = await createFreeSlot(expertId, dayStart + 3600 * 8);
		expect(slotId).toBeGreaterThan(0);
	});

	test.afterAll(async () => {
		await deleteSlot(slotId);
	});

	test('the card has real padding and a non-transparent background', async ({ page }) => {
		await page.goto('/slots');
		await expect(page.locator('[data-test-id="slots-calendar"]')).toBeVisible({ timeout: 8000 });
		await revealSlot(page, slotId);

		const card = page.locator(`[data-test-id="slot-card-${slotId}"]`);
		await expect(card).toBeVisible({ timeout: 8000 });

		const style = await card.evaluate((el) => {
			const cs = getComputedStyle(el);
			return { padding: cs.paddingTop, background: cs.backgroundColor, radius: cs.borderRadius };
		});

		expect(parseFloat(style.padding)).toBeGreaterThan(0);
		expect(style.background).not.toBe('rgba(0, 0, 0, 0)');
		expect(parseFloat(style.radius)).toBeGreaterThan(0);
	});
});
