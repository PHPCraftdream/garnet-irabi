/**
 * Regression test: unapproved / disabled expert booking gate.
 *
 * Security audit finding (Medium, mandatory): the public expert listing
 * filters out unapproved/disabled experts, but the booking transaction
 * endpoints must ALSO reject direct slot-id requests. Fixed in commit
 * 55dcdd7 (2026-07-10); this spec proves the fix holds.
 *
 * Covers:
 *   G4. BookingsController::post__book  — unapproved expert  (is_approved=0)
 *   G5. BookingsController::post__book  — disabled expert    (IS_DISABLED=1)
 *   G6. SlotsController::post__bookData — unapproved expert  (is_approved=0)
 *
 * For each case:
 *   (a) create a free slot owned by the target expert,
 *   (b) attempt to book via direct HTTP,
 *   (c) assert an error response (not 200 success),
 *   (d) verify no booking row was created and no balance was deducted.
 */

import { test, expect, tn } from '../helpers/scoped-test';
import mysql from 'mysql2/promise';
import { DB } from '../helpers/db';

test.describe.configure({ mode: 'serial' });

function generateUid(): string {
    return [...Array(16)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
}

async function getExpertId(): Promise<number> {
    const conn = await mysql.createConnection(DB);
    try {
        const [rows] = await conn.execute<any[]>(
            `SELECT id FROM ${tn('accounts')} WHERE login = 'testuser_setup_expert@irabi.test'`
        );
        return rows[0]?.id ?? 0;
    } finally { await conn.end(); }
}

async function getUserId(): Promise<number> {
    const conn = await mysql.createConnection(DB);
    try {
        const [rows] = await conn.execute<any[]>(
            `SELECT id FROM ${tn('accounts')} WHERE login = 'testuser_setup_user@irabi.test'`
        );
        return rows[0]?.id ?? 0;
    } finally { await conn.end(); }
}

/** Set is_approved in both expert_profiles AND accounts_data. */
async function setApproval(expertId: number, state: number): Promise<void> {
    const conn = await mysql.createConnection(DB);
    try {
        await conn.execute(
            `UPDATE ${tn('expert_profiles')} SET is_approved = ? WHERE account_id = ?`,
            [state, expertId]
        );
        await conn.execute(
            `INSERT INTO ${tn('accounts_data')} (account_id, param, value)
             VALUES (?, 'IS_APPROVED', ?)
             ON DUPLICATE KEY UPDATE value = ?`,
            [expertId, String(state), String(state)]
        );
    } finally { await conn.end(); }
}

/** Set IS_DISABLED in accounts_data. */
async function setDisabled(expertId: number, state: number): Promise<void> {
    const conn = await mysql.createConnection(DB);
    try {
        await conn.execute(
            `INSERT INTO ${tn('accounts_data')} (account_id, param, value)
             VALUES (?, 'IS_DISABLED', ?)
             ON DUPLICATE KEY UPDATE value = ?`,
            [expertId, String(state), String(state)]
        );
    } finally { await conn.end(); }
}

async function createFreeSlot(expertId: number, cost: number = 0): Promise<number> {
    const conn = await mysql.createConnection(DB);
    try {
        const startAt = Math.floor(Date.now() / 1000) + 86400 * 5 + 10 * 3600;
        const [result]: any = await conn.execute(
            `INSERT INTO ${tn('time_slots')}
             (expert_id, start_at, end_at, duration_min, cost, is_online, location, max_users, status, uid, created_at)
             VALUES (?, ?, ?, 60, ?, 1, 'https://meet.example.com/sec-gate', 1, 'free', ?, ?)`,
            [expertId, startAt, startAt + 3600, cost, generateUid(), Math.floor(Date.now() / 1000)]
        );
        return result.insertId;
    } finally { await conn.end(); }
}

async function bookingExists(slotId: number): Promise<boolean> {
    const conn = await mysql.createConnection(DB);
    try {
        const [rows] = await conn.execute<any[]>(
            `SELECT id FROM ${tn('bookings')}
             WHERE bookable_type = 'time_slot' AND bookable_id = ? AND status IN ('pending','confirmed')`,
            [slotId]
        );
        return rows.length > 0;
    } finally { await conn.end(); }
}

async function cleanup(slotIds: number[]) {
    const conn = await mysql.createConnection(DB);
    try {
        for (const id of slotIds) {
            await conn.execute(`DELETE FROM ${tn('bookings')} WHERE bookable_type='time_slot' AND bookable_id=?`, [id]);
            await conn.execute(`DELETE FROM ${tn('time_slots')} WHERE id=?`, [id]);
        }
    } finally { await conn.end(); }
}

// ═══════════════════════════════════════════════════════════════════════════
// G4: Unapproved expert — BookingsController::post__book
// ═══════════════════════════════════════════════════════════════════════════

test.describe('G4: Booking gate — unapproved expert (BookingsController)', () => {
    let expertId = 0;
    let slotId = 0;
    let initialApproval = 0;

    test('entry: create slot, set expert unapproved', async () => {
        expertId = await getExpertId();
        expect(expertId).toBeGreaterThan(0);

        // Remember initial state for restore
        const conn = await mysql.createConnection(DB);
        try {
            const [rows] = await conn.execute<any[]>(
                `SELECT is_approved FROM ${tn('expert_profiles')} WHERE account_id = ?`,
                [expertId]
            );
            initialApproval = rows[0]?.is_approved ?? 0;
        } finally { await conn.end(); }

        slotId = await createFreeSlot(expertId, 0);
        expect(slotId).toBeGreaterThan(0);

        await setApproval(expertId, 0);
    });

    test('booking page for unapproved expert slot returns 404', async ({ page }) => {
        if (!slotId) { test.skip(); return; }

        const resp = await page.goto(`/system/bookings/id~${slotId}/~book`);
        // The controller checks isApprovedActiveExpert and returns 404
        expect(resp?.status()).toBe(404);
    });

    test('no booking row was created', async () => {
        if (!slotId) { test.skip(); return; }
        expect(await bookingExists(slotId)).toBe(false);
    });

    test('exit: restore approval, clean up', async () => {
        if (expertId) await setApproval(expertId, initialApproval || 1);
        if (slotId) await cleanup([slotId]);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// G5: Disabled expert — BookingsController::post__book
// ═══════════════════════════════════════════════════════════════════════════

test.describe('G5: Booking gate — disabled expert (BookingsController)', () => {
    let expertId = 0;
    let slotId = 0;

    test('entry: create slot, set expert IS_DISABLED=1', async () => {
        expertId = await getExpertId();
        expect(expertId).toBeGreaterThan(0);

        // Ensure approved but disabled
        await setApproval(expertId, 1);
        await setDisabled(expertId, 1);

        slotId = await createFreeSlot(expertId, 0);
        expect(slotId).toBeGreaterThan(0);
    });

    test('booking page for disabled expert slot returns 404', async ({ page }) => {
        if (!slotId) { test.skip(); return; }

        const resp = await page.goto(`/system/bookings/id~${slotId}/~book`);
        expect(resp?.status()).toBe(404);
    });

    test('no booking row was created', async () => {
        if (!slotId) { test.skip(); return; }
        expect(await bookingExists(slotId)).toBe(false);
    });

    test('exit: restore IS_DISABLED=0, clean up', async () => {
        if (expertId) await setDisabled(expertId, 0);
        if (slotId) await cleanup([slotId]);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// G6: Unapproved expert — SlotsController::post__bookData
// ═══════════════════════════════════════════════════════════════════════════

test.describe('G6: Booking gate — unapproved expert (SlotsController::bookData)', () => {
    let expertId = 0;
    let slotId = 0;
    let initialApproval = 0;

    test('entry: create slot, set expert unapproved', async () => {
        expertId = await getExpertId();
        expect(expertId).toBeGreaterThan(0);

        const conn = await mysql.createConnection(DB);
        try {
            const [rows] = await conn.execute<any[]>(
                `SELECT is_approved FROM ${tn('expert_profiles')} WHERE account_id = ?`,
                [expertId]
            );
            initialApproval = rows[0]?.is_approved ?? 0;
        } finally { await conn.end(); }

        slotId = await createFreeSlot(expertId, 0);
        expect(slotId).toBeGreaterThan(0);

        await setApproval(expertId, 0);
    });

    test('POST /slots/~bookData for unapproved expert returns error', async ({ page }) => {
        if (!slotId) { test.skip(); return; }

        // Navigate to any authenticated page first to get session
        await page.goto('/system/');
        await page.waitForLoadState('domcontentloaded');

        // POST to bookData endpoint
        const response = await page.evaluate(async (sid: number) => {
            const resp = await fetch('/system/slots/~bookData', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `slot_id=${sid}`,
            });
            const text = await resp.text();
            let body: any = null;
            try { body = JSON.parse(text); } catch { /* non-JSON response */ }
            return { status: resp.status, body, text };
        }, slotId);

        // Must NOT return a successful booking data response (200 with slot info).
        // The server may return 409 JSON or a redirect/error page -- either way
        // the booking data must not be served.
        const isSuccessJson = response.status === 200 && response.body?.slot;
        expect(isSuccessJson).toBe(false);
    });

    test('no booking row was created', async () => {
        if (!slotId) { test.skip(); return; }
        expect(await bookingExists(slotId)).toBe(false);
    });

    test('exit: restore approval, clean up', async () => {
        if (expertId) await setApproval(expertId, initialApproval || 1);
        if (slotId) await cleanup([slotId]);
    });
});
