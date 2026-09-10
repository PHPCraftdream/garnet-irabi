/**
 * Consolidation (agent-oh audit, B2/B4): the full expert profile
 * (/expert/id~X), the mini preview (/users/~preview) and the expert's own
 * dashboard used to compute "Проведено"/"Предстоящих"/"Отмен"/"Отклонений"
 * via three independently-written queries. They already disagreed once
 * (D-121 — "мини-карточка говорила 6, полная страница — 4"). Now
 * Bookings::expertOutcomeCounts() and ExpertCancellations::countsFor() are
 * the one source; this asserts the full profile and the preview agree,
 * whatever the current seed data happens to be.
 */

import { test, expect, tn } from '../helpers/scoped-test';
import { newScopedContext } from '../helpers/scoped-test';
import { resolveStorageStatePath } from '../helpers/state';
import { withConnection } from '../helpers/db';

async function getExpertId(): Promise<number> {
	return withConnection(async (c) => {
		const [rows] = await c.execute<any[]>(`SELECT id FROM ${tn('accounts')} WHERE login = 'testuser_setup_expert@irabi.test'`);
		return rows[0]?.id ?? 0;
	});
}

test.describe('Consolidation: expert stats agree between full profile and mini preview', () => {
	test('conducted/upcoming/cancellations/declines match', async ({ browser }) => {
		const expertId = await getExpertId();
		expect(expertId).toBeGreaterThan(0);

		const ctx = await newScopedContext(browser, { storageState: resolveStorageStatePath('user') });
		const page = await ctx.newPage();
		try {
			await page.goto(`/expert/id~${expertId}`, { waitUntil: 'domcontentloaded' });
			const readNum = async (testId: string): Promise<number> =>
				parseInt((await page.locator(`[data-test-id="${testId}"]`).innerText()).trim(), 10);

			const conducted = await readNum('expert-stat-conducted');
			const upcoming = await readNum('expert-stat-upcoming');
			const declines = await readNum('expert-stat-declines');
			const cancellations = await readNum('expert-stat-cancellations');

			const preview = await page.evaluate(async (args: { id: number }) => {
				const csrf = (window as any).__GARNET_CSRF__ || '';
				const fd = new FormData();
				fd.append('CSRF_TOKEN', csrf);
				fd.append('user_id', String(args.id));
				const res = await fetch('/users/~preview', { method: 'POST', body: fd });
				return res.json();
			}, { id: expertId });

			expect(preview.user.stats.conducted).toBe(conducted);
			expect(preview.user.stats.totalBookings).toBe(upcoming);
			expect(preview.user.stats.cancellations).toBe(cancellations);
			// The mini preview has no separate "declines" field (single
			// "cancellations" stat, D-151) — nothing to compare it against here.
			expect(declines).toBeGreaterThanOrEqual(0);
		} finally {
			await ctx.close();
		}
	});
});
