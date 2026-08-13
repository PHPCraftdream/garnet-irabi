/**
 * H-1 regression (docs/handover-audit/03-financial-integrity-balance-ledger.md):
 * a concurrent recalculate() of the same account must not resurrect a
 * transient CAS-debit and let the overdraft guard be bypassed.
 *
 * The booking debit flow is two-phase: (1) a transient CAS
 * `UPDATE account_balance SET balance = balance - X WHERE balance >= X`,
 * then (2) a `booking_invoice` ledger row, then (3) recalculate() rebuilds
 * the cached balance from `SUM(ledger)`. Between (1) and (2) the cache and
 * the ledger disagree. If ANY concurrent recalculate() of the same account
 * runs in that window — every addEntry() calls it: a top-up, a refund, a
 * parallel booking's finally-block — it recomputes the cache from a ledger
 * that still MISSES this debit, resurrecting the spent money. The next
 * CAS-debit then sees an inflated cache, passes `balance >= X`, and lets the
 * account spend the same money twice. The final recalculate() then yields a
 * negative balance (double spend).
 *
 * The fix serialises the whole CAS-debit → final-recalculate section per
 * account with a MySQL advisory lock (AccountBalance::acquireAccountLock /
 * withAccountLock), and every recalculate() acquires the same lock too, so a
 * concurrent recalculate() blocks until the in-flight debit's ledger row
 * exists.
 *
 * This spec reproduces the audit scenario over the live HTTP server + MySQL:
 * a user with balance for exactly ONE booking, two paid slots of the same
 * cost, and a concurrent top-up that triggers addEntry() → recalculate() in
 * the race window. Requests are fired with Promise.all (genuinely concurrent,
 * not sequential awaits) so they hit separate PHP workers / DB connections.
 *
 * Determinism caveat: the bug window is only a few ms wide, so a single race
 * round is NOT guaranteed to reproduce it over HTTP. The test runs ROUNDS
 * iterations to raise the catch probability; even so it is a best-effort
 * race detector, not a 100%-deterministic one. The invariant under test
 * (balance == SUM(ledger) and balance >= 0) holds always once fixed.
 */
import { test, expect, tn } from '../helpers/scoped-test';
import { newScopedContext } from '../helpers/scoped-test';
import { withConnection } from '../helpers/db';
import { emailLogin } from '../helpers/role-login';
import { isProd } from '../helpers/ssh-bridge';
import type { BrowserContext, Page } from '@playwright/test';

/** Number of independent race rounds. Each seeds fresh slots and resets the
 *  balance, so a timing miss in one round doesn't poison the next. */
const ROUNDS = 3;
const SLOT_COST = 100;

function generateUid(): string {
    return [...Array(16)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
}

async function getAccountId(login: string): Promise<number> {
    return withConnection(async (c) => {
        const [rows] = await c.execute<any[]>(`SELECT id FROM ${tn('accounts')} WHERE login = ?`, [login]);
        return rows[0]?.id ?? 0;
    });
}

async function seedPaidSlot(expertId: number, cost: number): Promise<number> {
    return withConnection(async (c) => {
        const startAt = Math.floor(Date.now() / 1000) + 86400 * 7;
        const [result]: any = await c.execute(
            `INSERT INTO ${tn('time_slots')}
             (expert_id, start_at, end_at, duration_min, cost, is_online, location, max_users, booked_count, status, uid, created_at)
             VALUES (?, ?, ?, 60, ?, 1, 'https://meet.example.com/h01-balance-race', 1, 0, 'free', ?, ?)`,
            [expertId, startAt, startAt + 3600, cost, generateUid(), Math.floor(Date.now() / 1000)],
        );
        return result.insertId;
    });
}

/**
 * Reset the user to a clean slate with exactly `balance` available, encoded
 * as a single top_up ledger row plus a matching account_balance cache row.
 * Wipes any prior ledger noise (invoices/top-ups from earlier rounds/tests)
 * so each race round starts from a known position.
 */
async function resetUserBalance(userId: number, balance: number): Promise<void> {
    await withConnection(async (c) => {
        await c.execute(`DELETE FROM ${tn('balance_ledger')} WHERE account_id = ?`, [userId]);
        await c.execute(
            `INSERT INTO ${tn('balance_ledger')} (account_id, is_credit, amount, entry_type, ref_type, ref_id, note, created_at)
             VALUES (?, 1, ?, 'top_up', NULL, NULL, ?, ?)`,
            [userId, balance, 'race-test seed', Math.floor(Date.now() / 1000)],
        );
        await c.execute(
            `INSERT INTO ${tn('account_balance')} (account_id, balance, updated_at)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE balance = VALUES(balance), updated_at = VALUES(updated_at)`,
            [userId, balance, Math.floor(Date.now() / 1000)],
        );
    });
}

async function getBalanceAndLedgerSum(userId: number): Promise<{ balance: number; ledgerSum: number }> {
    return withConnection(async (c) => {
        const [bRows] = await c.execute<any[]>(
            `SELECT balance FROM ${tn('account_balance')} WHERE account_id = ?`,
            [userId],
        );
        const [lRows] = await c.execute<any[]>(
            `SELECT COALESCE(SUM(CASE WHEN is_credit = 1 THEN amount ELSE -amount END), 0) AS s
             FROM ${tn('balance_ledger')} WHERE account_id = ?`,
            [userId],
        );
        return {
            balance: Number(bRows[0]?.balance ?? 0),
            ledgerSum: Number(lRows[0]?.s ?? 0),
        };
    });
}

async function cleanupSlots(slotIds: number[]): Promise<void> {
    await withConnection(async (c) => {
        for (const slotId of slotIds) {
            if (!slotId) continue;
            await c.execute(
                `DELETE FROM ${tn('balance_ledger')} WHERE ref_type = 'booking' AND ref_id IN
                 (SELECT id FROM ${tn('bookings')} WHERE bookable_type = 'time_slot' AND bookable_id = ?)`,
                [slotId],
            );
            await c.execute(`DELETE FROM ${tn('bookings')} WHERE bookable_type = 'time_slot' AND bookable_id = ?`, [slotId]);
            await c.execute(`DELETE FROM ${tn('time_slots')} WHERE id = ?`, [slotId]);
        }
    });
}

/**
 * Fast-lane login as an arbitrary *.test account. Dev → `/dev-login` POST;
 * prod → the real passwordless email flow (see `emailLogin` in
 * `helpers/role-login.ts` — there is no `/dev-login` on prod).
 */
async function loginAs(browser: any, login: string): Promise<{ context: BrowserContext; page: Page }> {
    const context = await newScopedContext(browser);
    const page = await context.newPage();

    if (isProd()) {
        await emailLogin(page, login);
        return { context, page };
    }

    await page.goto('/');
    const resp = await page.evaluate(async (loginParam: string) => {
        const fd = new FormData();
        fd.append('login', loginParam);
        const res = await fetch('/dev-login', { method: 'POST', body: fd });
        return { ok: res.ok, body: await res.json().catch(() => null) };
    }, login);
    if (!resp.ok || !(resp.body as any)?.success) {
        throw new Error(`dev-login failed for ${login}: ${JSON.stringify(resp)}`);
    }
    await page.goto('/');
    return { context, page };
}

async function postBook(page: Page, slotId: number): Promise<{ status: number; body: any }> {
    return page.evaluate(async (sid: number) => {
        const csrf = (window as any).__GARNET_CSRF__ || '';
        const res = await fetch(`/bookings/id~${sid}/~book`, {
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

async function postTopup(page: Page, amount: number): Promise<{ status: number; body: any }> {
    // top_up is the audit's concurrent-recalculate trigger: addEntry() →
    // recalculate() of the same account, the exact call that resurrects an
    // in-flight transient debit when the H-1 window is open.
    return page.evaluate(async (amt: number) => {
        const csrf = (window as any).__GARNET_CSRF__ || '';
        const fd = new FormData();
        fd.append('amount', String(amt));
        fd.append('CSRF_TOKEN', csrf);
        const res = await fetch('/balance/~topup', { method: 'POST', body: fd });
        const text = await res.text();
        let body: any = null;
        try { body = JSON.parse(text); } catch { body = text; }
        return { status: res.status, body };
    }, amount);
}

test.describe('H-1: concurrent CAS-debit ↔ recalculate() race (balance must not go negative)', () => {
    test.describe.configure({ mode: 'serial' });
    let ctx: BrowserContext;
    let page: Page;
    let userId = 0;
    let expertId = 0;
    const slotIds: number[] = [];
    // user1@dev.test's balance BEFORE this spec's repeated resetUserBalance()
    // wipes — restored in afterAll so this spec doesn't permanently pin the
    // shared dev-seed fixture's balance for the rest of this worker's run.
    let trueUserBalanceBefore = 0;

    // beforeAll/afterAll (not plain tests) — serial mode skips every
    // subsequent test once one fails, so a cleanup step written as a
    // regular test never runs after a mid-flow assertion fails, leaving
    // the shared user1@dev.test fixture's ledger wiped/reset and stray
    // test slots behind for the rest of this worker's run. Hooks run
    // regardless of test outcome.
    test.beforeAll(async ({ browser }) => {
        userId = await getAccountId('user1@dev.test');
        expertId = await getAccountId('expert1@dev.test');
        expect(userId).toBeGreaterThan(0);
        expect(expertId).toBeGreaterThan(0);
        expect(userId).not.toBe(expertId);

        trueUserBalanceBefore = (await getBalanceAndLedgerSum(userId)).balance;

        ({ context: ctx, page } = await loginAs(browser, 'user1@dev.test'));
    });

    test('race: two concurrent bookings + a top-up never double-spend the balance', async () => {
        for (let round = 0; round < ROUNDS; round++) {
            await resetUserBalance(userId, SLOT_COST);

            const slotA = await seedPaidSlot(expertId, SLOT_COST);
            const slotB = await seedPaidSlot(expertId, SLOT_COST);
            slotIds.push(slotA, slotB);

            // Fire genuinely concurrent requests: two bookings for the SAME
            // balance (the double-spend attempt) plus a top-up whose
            // addEntry()→recalculate() is the call that reopens the window.
            const [bookA, topup, bookB] = await Promise.all([
                postBook(page, slotA),
                postTopup(page, 1),
                postBook(page, slotB),
            ]);

            const { balance, ledgerSum } = await getBalanceAndLedgerSum(userId);

            // Invariant (a): cache and ledger are always in sync — the lock
            // guarantees no recalculate() sees a half-applied debit.
            expect(ledgerSum).toBe(balance);

            // Invariant (b): a buyer can never spend more than they had plus
            // legitimate top-ups. Started with SLOT_COST, topped up 1, so at
            // most ONE SLOT_COST booking may succeed (the other must be
            // refused by the overdraft guard). If both succeeded the balance
            // would be `SLOT_COST + 1 - 2*SLOT_COST = -99` — the H-1 bug.
            const successes = [bookA.status, bookB.status].filter((s) => s === 200).length;
            expect(
                balance,
                `round ${round}: statuses bookA=${bookA.status} bookB=${bookB.status} topup=${topup.status}, ` +
                `balance=${balance} ledgerSum=${ledgerSum} successes=${successes}`,
            ).toBeGreaterThanOrEqual(0);
        }
    });

    test('positive: a sequential booking still works and debits correctly', async () => {
        await resetUserBalance(userId, SLOT_COST);
        const slot = await seedPaidSlot(expertId, SLOT_COST);
        slotIds.push(slot);

        const res = await postBook(page, slot);
        expect(res.status).toBe(200);

        const { balance, ledgerSum } = await getBalanceAndLedgerSum(userId);
        // SLOT_COST top_up − SLOT_COST booking_invoice = 0.
        expect(ledgerSum).toBe(0);
        expect(balance).toBe(0);
    });

    test.afterAll(async () => {
        await page?.close().catch(() => {});
        await ctx?.close().catch(() => {});
        await cleanupSlots(slotIds);
        if (userId) await resetUserBalance(userId, trueUserBalanceBefore);
    });
});
