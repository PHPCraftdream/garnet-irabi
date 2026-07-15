/**
 * H-01 regression (docs/security-audit/09-ms-fresh-authorization-review.md):
 * concurrent bookings on the same slot must never exceed max_users.
 *
 * Before the fix, both BookingsController::post__book() and
 * SlotsController::post__book() checked capacity via a non-atomic
 * `COUNT(active bookings) < max_users` BEFORE the INSERT — two concurrent
 * requests for different users could both pass the check and both insert,
 * since the only UNIQUE guard was per-(user, slot), not per-slot capacity.
 *
 * The fix adds TimeSlots::reserveSeat() — an atomic CAS
 * `UPDATE time_slots SET booked_count = booked_count + 1 WHERE id = ? AND
 * booked_count < max_users` — as the real concurrency gate before every
 * booking INSERT, with compensating releaseSeat() on any rollback path.
 *
 * This spec fires genuinely concurrent HTTP requests (Promise.all, not
 * sequential awaits) from separate logged-in browser contexts, so it
 * exercises the real race window against a live MySQL57 backend.
 */
import { test, expect, tn } from '../helpers/scoped-test';
import { newScopedContext } from '../helpers/scoped-test';
import { DB, withConnection } from '../helpers/db';
import type { BrowserContext, Page } from '@playwright/test';
import mysql from 'mysql2/promise';

function generateUid(): string {
    return [...Array(16)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
}

async function getAccountId(login: string): Promise<number> {
    return withConnection(async (c) => {
        const [rows] = await c.execute<any[]>(`SELECT id FROM ${tn('accounts')} WHERE login = ?`, [login]);
        return rows[0]?.id ?? 0;
    });
}

async function seedSlot(expertId: number, maxUsers: number): Promise<number> {
    return withConnection(async (c) => {
        const startAt = Math.floor(Date.now() / 1000) + 86400 * 6 + 10 * 3600;
        const [result]: any = await c.execute(
            `INSERT INTO ${tn('time_slots')}
             (expert_id, start_at, end_at, duration_min, cost, is_online, location, max_users, booked_count, status, uid, created_at)
             VALUES (?, ?, ?, 60, 0, 1, 'https://meet.example.com/h01-test', ?, 0, 'free', ?, ?)`,
            [expertId, startAt, startAt + 3600, maxUsers, generateUid(), Math.floor(Date.now() / 1000)],
        );
        return result.insertId;
    });
}

async function cleanupSlot(slotId: number): Promise<void> {
    if (!slotId) return;
    await withConnection(async (c) => {
        await c.execute(
            `DELETE FROM ${tn('balance_ledger')} WHERE ref_type = 'booking' AND ref_id IN
             (SELECT id FROM ${tn('bookings')} WHERE bookable_type = 'time_slot' AND bookable_id = ?)`,
            [slotId],
        );
        await c.execute(`DELETE FROM ${tn('bookings')} WHERE bookable_type = 'time_slot' AND bookable_id = ?`, [slotId]);
        await c.execute(`DELETE FROM ${tn('time_slots')} WHERE id = ?`, [slotId]);
    });
}

async function activeBookingCount(slotId: number): Promise<number> {
    return withConnection(async (c) => {
        const [rows] = await c.execute<any[]>(
            `SELECT COUNT(*) as cnt FROM ${tn('bookings')}
             WHERE bookable_type = 'time_slot' AND bookable_id = ? AND status IN ('pending','confirmed')`,
            [slotId],
        );
        return Number(rows[0]?.cnt ?? 0);
    });
}

async function slotBookedCount(slotId: number): Promise<number> {
    return withConnection(async (c) => {
        const [rows] = await c.execute<any[]>(`SELECT booked_count FROM ${tn('time_slots')} WHERE id = ?`, [slotId]);
        return Number(rows[0]?.booked_count ?? -1);
    });
}

/** Fast-lane dev-login as an arbitrary *.test account (bypasses role mapping). */
async function loginAs(browser: any, login: string): Promise<{ context: BrowserContext; page: Page }> {
    const context = await newScopedContext(browser);
    const page = await context.newPage();
    await page.goto('/');
    const resp = await page.evaluate(async (loginParam: string) => {
        const fd = new FormData();
        fd.append('login', loginParam);
        const res = await fetch('/dev-login', { method: 'POST', body: fd });
        return { ok: res.ok, body: await res.json().catch(() => null) };
    }, login);
    if (!resp.ok || !(resp.body as any)?.success) {
        throw new Error(`dev-login (login-fastlane) failed for ${login}: ${JSON.stringify(resp)}`);
    }
    await page.goto('/');
    return { context, page };
}

async function postBook(page: Page, slotId: number): Promise<{ status: number; body: any }> {
    return page.evaluate(async (slotId: number) => {
        const csrf = (window as any).__GARNET_CSRF__ || '';
        const res = await fetch(`/bookings/id~${slotId}/~book`, {
            method: 'POST',
            headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ CSRF_TOKEN: csrf }),
        });
        const text = await res.text();
        let body: any = null;
        try { body = JSON.parse(text); } catch { body = text; }
        return { status: res.status, body };
    }, slotId);
}

// ── max_users = 1: two different users race for the single seat ────

test.describe('H-01: max_users=1, two concurrent bookers', () => {
    test.describe.configure({ mode: 'serial' });
    let slotId = 0;
    let ctxA: BrowserContext, ctxB: BrowserContext;
    let pageA: Page, pageB: Page;

    test('setup: seed a single-seat slot, log in two distinct users', async ({ browser }) => {
        const expertId = await getAccountId('expert1@dev.test');
        expect(expertId).toBeGreaterThan(0);
        slotId = await seedSlot(expertId, 1);
        expect(slotId).toBeGreaterThan(0);

        ({ context: ctxA, page: pageA } = await loginAs(browser, 'user1@dev.test'));
        ({ context: ctxB, page: pageB } = await loginAs(browser, 'user2@dev.test'));
    });

    test('exactly one of two truly concurrent bookings succeeds', async () => {
        if (!slotId) { test.skip(); return; }

        const [resA, resB] = await Promise.all([
            postBook(pageA, slotId),
            postBook(pageB, slotId),
        ]);

        // Exactly one must succeed. The loser is rejected either at the
        // capacity CAS (400 "Slot is full") or — if the winner's status
        // flip to 'booked' lands first — at the `status='free'` precondition
        // fetch (404 "not available"). Both are correct rejections; the
        // real invariant under test is the DB state asserted below.
        const statuses = [resA.status, resB.status];
        expect(statuses.filter((s) => s === 200).length).toBe(1);
        expect(statuses.filter((s) => s === 400 || s === 404).length).toBe(1);

        const cnt = await activeBookingCount(slotId);
        expect(cnt).toBe(1);

        const bc = await slotBookedCount(slotId);
        expect(bc).toBe(1);
    });

    test('cleanup', async () => {
        await ctxA?.close().catch(() => {});
        await ctxB?.close().catch(() => {});
        if (slotId) await cleanupSlot(slotId);
    });
});

// ── max_users = 2: three concurrent bookers, exactly two win ────────

test.describe('H-01: max_users=2, three concurrent bookers', () => {
    test.describe.configure({ mode: 'serial' });
    let slotId = 0;
    let ctxA: BrowserContext, ctxB: BrowserContext, ctxC: BrowserContext;
    let pageA: Page, pageB: Page, pageC: Page;

    test('setup: seed a two-seat slot, log in three distinct users', async ({ browser }) => {
        const expertId = await getAccountId('expert1@dev.test');
        expect(expertId).toBeGreaterThan(0);
        slotId = await seedSlot(expertId, 2);
        expect(slotId).toBeGreaterThan(0);

        ({ context: ctxA, page: pageA } = await loginAs(browser, 'user1@dev.test'));
        ({ context: ctxB, page: pageB } = await loginAs(browser, 'user2@dev.test'));
        ({ context: ctxC, page: pageC } = await loginAs(browser, 'user3@dev.test'));
    });

    test('exactly two of three truly concurrent bookings succeed', async () => {
        if (!slotId) { test.skip(); return; }

        const [resA, resB, resC] = await Promise.all([
            postBook(pageA, slotId),
            postBook(pageB, slotId),
            postBook(pageC, slotId),
        ]);

        // See the max_users=1 test above for why the loser may be 400 or 404.
        const statuses = [resA.status, resB.status, resC.status];
        const okCount = statuses.filter((s) => s === 200).length;
        const rejectedCount = statuses.filter((s) => s === 400 || s === 404).length;

        expect(okCount).toBe(2);
        expect(rejectedCount).toBe(1);

        const cnt = await activeBookingCount(slotId);
        expect(cnt).toBe(2);

        const bc = await slotBookedCount(slotId);
        expect(bc).toBe(2);
    });

    test('cleanup', async () => {
        await ctxA?.close().catch(() => {});
        await ctxB?.close().catch(() => {});
        await ctxC?.close().catch(() => {});
        if (slotId) await cleanupSlot(slotId);
    });
});
