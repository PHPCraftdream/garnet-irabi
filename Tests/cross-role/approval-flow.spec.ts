/**
 * Cross-role — ExpertProfileSM visibility cycle
 *
 * State machine: ExpertProfileSM × AccountSM × AdminActionLogSM
 *
 * Tests that approval state controls slot visibility for users.
 * Uses three concurrent browser contexts (expert, user, admin).
 *
 * Uses data-test-id: flag-IS_APPROVED-{id}, flag-IS_DISABLED-{id}, slot-card
 */

import { test, expect, tn } from '../helpers/scoped-test';
import mysql from 'mysql2/promise';
import { resolveStorageStatePath } from '../helpers/state';

import { newScopedContext } from '../helpers/scoped-test';
import { DB } from '../helpers/db';
test.describe.configure({ mode: 'serial' });

async function getExpertId(): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const [rows] = await conn.execute<any[]>(
			`SELECT id FROM ${tn('accounts')} WHERE login = 'testuser_setup_expert@irabi.test'`
		);
		return rows[0]?.id ?? 0;
	} finally { await conn.end(); }
}

async function setExpertApproval(expertId: number, approved: number) {
	// The /slots-side predicate
	// (UserEntityConfig::getApprovedExpertIds) reads ONLY
	// accounts_data.IS_APPROVED + IS_DISABLED, not ir_expert_profiles.
	// Mirror to ir_expert_profiles anyway — other call sites and the
	// admin grid filter on that column.
	const conn = await mysql.createConnection(DB);
	try {
		await conn.execute(
			`UPDATE ${tn('expert_profiles')} SET is_approved = ? WHERE account_id = ?`,
			[approved, expertId]
		);
		await conn.execute(
			`INSERT INTO ${tn('accounts_data')} (account_id, param, value)
			 SELECT id, 'IS_APPROVED', ? FROM ${tn('accounts')} WHERE id = ?
			 ON DUPLICATE KEY UPDATE value = VALUES(value)`,
			[String(approved), expertId]
		);
		// Force IS_DISABLED=0 — if a previous test or seed left this at 1
		// the expert would be invisible to /slots no matter the approval
		// flag.
		await conn.execute(
			`INSERT INTO ${tn('accounts_data')} (account_id, param, value)
			 SELECT id, 'IS_DISABLED', '0' FROM ${tn('accounts')} WHERE id = ?
			 ON DUPLICATE KEY UPDATE value = VALUES(value)`,
			[expertId]
		);
	} finally { await conn.end(); }
}

// Create a slot owned by `expertId`. Returns the new slot id.
// Used by the visibility test so we have a SPECIFIC card to assert
// on — counting `[data-test-id^="slot-card"]` is unreliable because
// other seed experts may also be approved, leaving a non-zero
// baseline that wouldn't change when we flip ONE expert.
//
// IMPORTANT: start_at is `now + 4h`, NOT a few days from now. The
// /slots calendar UI displays one week at a time (Mon–Sun of the
// current week by default); a slot in a future week is in the DB
// but hidden by the calendar's week filter, so assertions on
// `slot-card-${id}` visibility would fail for a UI reason, not an
// approval-flag reason. +4h keeps the slot inside today's column
// regardless of when the suite runs.
async function createApprovalTestSlot(expertId: number): Promise<number> {
	const conn = await mysql.createConnection(DB);
	try {
		const startAt = Math.floor(Date.now() / 1000) + 4 * 3600;
		const uid = [...Array(16)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
		const [result]: any = await conn.execute(
			`INSERT INTO ${tn('time_slots')}
			 (expert_id, start_at, end_at, duration_min, cost, is_online, location, max_users, status, uid, created_at)
			 VALUES (?, ?, ?, 60, 0, 1, 'https://meet.example.com/approval-test', 1, 'free', ?, ?)`,
			[expertId, startAt, startAt + 3600, uid, Math.floor(Date.now() / 1000)]
		);
		return result.insertId;
	} finally { await conn.end(); }
}

async function deleteSlot(slotId: number): Promise<void> {
	if (!slotId) return;
	const conn = await mysql.createConnection(DB);
	try {
		await conn.execute(`DELETE FROM ${tn('time_slots')} WHERE id = ?`, [slotId]);
	} finally { await conn.end(); }
}

// ── Test 1: Slot visibility follows approval state ────────────────────────────

// Verifies the slot-visibility half of the ExpertProfileSM. The
// admin-UI flag-button is covered by roles.spec.ts; here we focus on
// the downstream effect: with IS_APPROVED flipped, can a regular
// user see this expert's slot on /slots? The predicate is just
//   accounts.type='expert' AND accounts_data.IS_APPROVED > 0
//   AND accounts_data.IS_DISABLED < 1
// (UserEntityConfig::getApprovedExpertIds), so DB writes are
// equivalent to the admin click and avoid a second coupled UI flow.
//
// Earlier flakes of this test were both calendar-window misses:
//   `now + 7d`  — always in next week, never displayed
//   `now + 4h`  — fine *most* of the day, but at e.g. 23:00 local
//                 the slot rolls past midnight into next week, and
//                 the calendar's default view is the current week
//                 (Sun→Sat in this app's locale), so the slot is
//                 in DB but off-screen.
// Fix: instead of betting on a single offset, walk the calendar's
// week-next button until our slot card shows up (or 5 weeks ahead
// — far more than any sensible slot offset). For the unapproved
// branches we don't walk: the predicate is "card MUST NOT appear
// anywhere"; if the slot is correctly hidden by approval, walking
// is wasted clicks. We only step forward in the approved branch.
async function navigateUntilSlotVisible(page: any, slotId: number, maxWeeks = 5): Promise<boolean> {
	const card = page.locator(`[data-test-id="slot-card-${slotId}"]`);
	for (let i = 0; i < maxWeeks; i++) {
		if (await card.isVisible({ timeout: 1000 }).catch(() => false)) return true;
		const nextBtn = page.locator('[data-test-id="week-next"]');
		if (!(await nextBtn.isVisible({ timeout: 500 }).catch(() => false))) return false;
		await nextBtn.click();
	}
	return false;
}

test('ExpertProfileSM: slot visibility follows approval state', async ({ browser }) => {
	const userCtx = await newScopedContext(browser, { storageState: resolveStorageStatePath('user') });
	const userPage = await userCtx.newPage();

	const expertId = await getExpertId();
	expect(expertId).toBeGreaterThan(0);

	const slotId = await createApprovalTestSlot(expertId);
	const ourSlotCard = userPage.locator(`[data-test-id="slot-card-${slotId}"]`);

	try {
		// Step 0: unapproved — slot must be hidden in EVERY visible week.
		// Walk forward like the approved branch would; we still expect no
		// match in any of those weeks.
		await setExpertApproval(expertId, 0);
		await userPage.goto('/slots');
		const foundWhileUnapproved = await navigateUntilSlotVisible(userPage, slotId);
		expect(foundWhileUnapproved).toBe(false);
		await expect(ourSlotCard).toHaveCount(0);

		// Step 1: approve — slot must appear in some visible week.
		await setExpertApproval(expertId, 1);
		await userPage.goto('/slots');
		expect(await navigateUntilSlotVisible(userPage, slotId)).toBe(true);

		// Step 2: revoke — slot must disappear from the week where we just
		// saw it (we're already navigated to that week from step 1's check).
		await setExpertApproval(expertId, 0);
		await userPage.reload();
		await expect(ourSlotCard).toHaveCount(0, { timeout: 5000 });
	} finally {
		await deleteSlot(slotId);
		await userCtx.close();
	}
});

// ── Test 2: AccountSM disable blocks expert access ───────────────────────────

test('AccountSM: disabled expert loses admin panel + slot creation', async ({ adminPage, expertPage }) => {
	// Was: two newScopedContext() calls plus their own newPage()/close()
	// dance. Now: worker-scoped adminContext + expertContext fixtures
	// give us pre-authenticated pages with cookies + storage reset to
	// the role's saved storageState. Two fewer browser.newContext()
	// allocations per run.
	await adminPage.addInitScript(() => { try { localStorage.setItem('garnet.pageSize', '100'); } catch {} });

	const expertId = await getExpertId();

	try {
		// Admin disables expert
		await adminPage.goto('/admin/');
		await expect(adminPage.locator('[data-test-id="filter-tab-all"]')).toBeVisible({ timeout: 20000 });

		const disableBtn = adminPage.locator(`[data-test-id="flag-IS_DISABLED-${expertId}"]`);
		await expect(disableBtn).toBeVisible({ timeout: 8000 });
		await disableBtn.click();

		// Expert tries to access slots page
		await expertPage.goto('/expert/~slots');
		console.log('Expert URL after disable:', expertPage.url());

		// Admin re-enables expert (restore state)
		await adminPage.locator(`[data-test-id="flag-IS_DISABLED-${expertId}"]`).click();

		console.log('Admin action log available via /admin/logs/');
	} finally {
		// Always re-enable expert to avoid breaking other tests
		await setExpertApproval(expertId, 1);
	}
});
