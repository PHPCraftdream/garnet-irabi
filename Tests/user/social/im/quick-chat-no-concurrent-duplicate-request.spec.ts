/**
 * D-203/D-185: opening a booking card's preview mounts `<QuickChat>`, which
 * fetches `/im/~quickChat` on mount. If the user sends a message before that
 * fetch resolves, `handleSend` used to call `fetchMessages()` again with no
 * guard — a second identical POST fired while the first was still in flight.
 * A user-2 persona (cycle7, deploy fb66cf5) saw 3-5 duplicate reads land on
 * a single click, one of them coming back 403 — consistent with concurrent
 * identical requests racing each other server-side.
 *
 * Same family as D-171 (duplicate `~cancel` requests), but for a READ
 * instead of a mutation: `~cancel` already had a `useSending` ref-guard;
 * `~counts` (liveCounts.ts) and `~quickChat` (QuickChat.tsx) had none.
 * Fixed with an in-flight ref guard + a single coalesced re-fetch for a
 * call that lands while one is already running, so a send during a slow
 * poll still shows up without firing a second concurrent request.
 *
 * This spec forces the overlap directly (delaying the `~quickChat` response
 * so the mount fetch is still in flight when the send-triggered re-fetch
 * would normally fire) and asserts no two `~quickChat` requests are ever
 * in flight at the same time.
 */
import { test, expect, tn } from '../../../helpers/scoped-test';
import mysql from 'mysql2/promise';
import { DB } from '../../../helpers/db/db';

test.describe.configure({ mode: 'serial' });

async function createTestSlot(): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const [expertAccRows] = await conn.execute<any[]>(
			`SELECT id FROM ${tn('accounts')} WHERE login = 'testuser_setup_expert@irabi.test'`
		);
		const expertId = expertAccRows[0]?.id;
		if (!expertId) return 0;

		const startAt = Math.floor(Date.now() / 1000) + 86400 * 7;
		const uid = [...Array(16)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
		const [result]: any = await conn.execute(
			`INSERT INTO ${tn('time_slots')}
			 (expert_id, start_at, end_at, duration_min, cost, is_online, location, max_users, status, uid, created_at)
			 VALUES (?, ?, ?, 60, 0, 1, 'https://meet.example.com/d203-test', 1, 'free', ?, ?)`,
			[expertId, startAt, startAt + 3600, uid, Math.floor(Date.now() / 1000)]
		);
		return result.insertId;
	} finally {
		await conn.end();
	}
}

async function deleteTestSlot(slotId: number): Promise<void> {
	const conn = await mysql.createConnection(DB);
	try {
		await conn.execute(`DELETE FROM ${tn('bookings')} WHERE bookable_type='time_slot' AND bookable_id=?`, [slotId]);
		await conn.execute(`DELETE FROM ${tn('time_slots')} WHERE id=?`, [slotId]);
	} finally {
		await conn.end();
	}
}

test.describe('D-203/D-185: no two ~quickChat requests are ever in flight at once', () => {
	let slotId = 0;

	test.beforeAll(async () => {
		slotId = await createTestSlot();
		expect(slotId).toBeGreaterThan(0);
	});

	test.afterAll(async () => {
		if (slotId) await deleteTestSlot(slotId);
	});

	test('mount fetch + a send-triggered re-fetch never overlap', async ({ page }) => {
		if (!slotId) { test.skip(); return; }

		await page.goto(`/system/bookings/id~${slotId}/~book`);
		const bookBtn = page.locator('[data-test-id="book-btn"]');
		await bookBtn.waitFor({ state: 'visible', timeout: 8000 });
		await Promise.all([
			page.waitForURL(url => url.pathname === '/system/bookings' || url.pathname === '/bookings', { timeout: 10000 }),
			bookBtn.click(),
		]);
		await page.reload();

		// Delay every ~quickChat response so the mount-time fetch is still
		// in flight when the send below tries to trigger a re-fetch.
		const DELAY_MS = 1500;
		await page.route('**/im/~quickChat', async (route) => {
			await new Promise((r) => setTimeout(r, DELAY_MS));
			await route.continue();
		});

		const spans: { start: number; end: number }[] = [];
		const requestStarts = new Map<any, number>();
		page.on('request', (req) => {
			if (req.method() === 'POST' && req.url().includes('~quickChat')) {
				requestStarts.set(req, Date.now());
			}
		});
		page.on('requestfinished', (req) => {
			if (req.method() === 'POST' && req.url().includes('~quickChat') && requestStarts.has(req)) {
				spans.push({ start: requestStarts.get(req)!, end: Date.now() });
			}
		});

		const link = page.locator('[data-test-id^="entity-link-preview-"]').first();
		await expect(link).toBeVisible({ timeout: 8000 });
		await link.click(); // mounts <QuickChat> → fetch #1 (delayed) starts

		const quickChat = page.locator('[data-test-id="quick-chat"]');
		await expect(quickChat).toBeVisible({ timeout: 5000 });

		// Send before fetch #1 resolves — this is the exact overlap window
		// that used to fire a second concurrent ~quickChat request.
		await page.locator('[data-test-id="quick-chat-input"]').fill('D-203/D-185 regression');
		await page.locator('[data-test-id="quick-chat-send"]').click();

		// Wait out the delayed fetch plus its coalesced follow-up.
		await page.waitForTimeout(DELAY_MS * 2 + 1500);

		expect(spans.length).toBeGreaterThanOrEqual(1);
		const sorted = [...spans].sort((a, b) => a.start - b.start);
		for (let i = 1; i < sorted.length; i++) {
			expect(sorted[i].start).toBeGreaterThanOrEqual(sorted[i - 1].end);
		}
	});
});
