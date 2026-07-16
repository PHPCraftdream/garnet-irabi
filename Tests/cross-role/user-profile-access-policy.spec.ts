/**
 * M-03 regression (docs/security-audit/12-ms-postfix-authorization-review.md):
 * UserProfileController::get__main() ('/user/id~N') exposed any authenticated
 * actor's name and booking/cancellation counters for ANY other regular user,
 * with no restriction and no disabled-account anonymization.
 *
 * Policy (confirmed): visible to the profile's own owner, staff (moderator+),
 * or an expert who has actually had a booking from this user (a real
 * counterparty). Everyone else gets a 404 (existence not confirmed, matching
 * the controller's existing not-found pattern).
 */
import { test, expect, tn } from '../helpers/scoped-test';
import { newScopedContext } from '../helpers/scoped-test';
import { withConnection } from '../helpers/db';
import { roleLogin } from '../helpers/role-login';
import type { BrowserContext, Page } from '@playwright/test';

async function devLogin(browser: any, role: string): Promise<{ context: BrowserContext; page: Page }> {
    const context = await newScopedContext(browser);
    const page = await context.newPage();
    await page.goto('/');
    await roleLogin(page, role);
    await page.goto('/');
    return { context, page };
}

async function getAccountId(login: string): Promise<number> {
    return withConnection(async (c) => {
        const [rows] = await c.execute<any[]>(`SELECT id FROM ${tn('accounts')} WHERE login = ?`, [login]);
        return rows[0]?.id ?? 0;
    });
}

async function getViaPage(page: Page, path: string): Promise<number> {
    return page.evaluate(async (path: string) => {
        const res = await fetch(path);
        return res.status;
    }, path);
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

test.describe('M-03: /user/id~N is restricted to self, staff, or a real booking counterparty', () => {
    let user1Ctx: BrowserContext;
    let user1Page: Page;
    let user2Id = 0;
    let moderatorCtx: BrowserContext;
    let moderatorPage: Page;
    let expertCtx: BrowserContext;
    let expertPage: Page;

    test.beforeAll(async ({ browser }) => {
        ({ context: user1Ctx, page: user1Page } = await devLogin(browser, 'user'));
        ({ context: moderatorCtx, page: moderatorPage } = await devLogin(browser, 'moderator'));
        ({ context: expertCtx, page: expertPage } = await devLogin(browser, 'expert'));
        user2Id = await getAccountId('user2@dev.test');
    });

    test.afterAll(async () => {
        const strangerLogin = `test_m03_stranger_${process.env.TEST_PARALLEL_INDEX ?? '0'}@irabi.test`;
        await withConnection(async (c) => {
            await c.execute(
                `DELETE ad FROM ${tn('accounts_data')} ad JOIN ${tn('accounts')} a ON a.id = ad.account_id WHERE a.login = ?`,
                [strangerLogin],
            );
            await c.execute(`DELETE FROM ${tn('accounts')} WHERE login = ?`, [strangerLogin]);
        });
        await user1Ctx?.close().catch(() => {});
        await moderatorCtx?.close().catch(() => {});
        await expertCtx?.close().catch(() => {});
    });

    test('user cannot view another unrelated regular user profile (404)', async () => {
        expect(user2Id).toBeGreaterThan(0);
        const status = await getViaPage(user1Page, `/user/id~${user2Id}`);
        expect(status).toBe(404);
    });

    test('user CAN view their own profile', async () => {
        const selfId = await getAccountId('user1@dev.test');
        const status = await getViaPage(user1Page, `/user/id~${selfId}`);
        expect(status).toBe(200);
    });

    test('moderator (staff) CAN view any regular user profile', async () => {
        const status = await getViaPage(moderatorPage, `/user/id~${user2Id}`);
        expect(status).toBe(200);
    });

    test('expert who never had a booking from this user cannot view it (404)', async ({ browser }) => {
        // user2@dev.test may already have dev-seed sample bookings with
        // expert1 — use a freshly-minted, genuinely unrelated account
        // instead of asserting on a shared fixture's incidental state.
        const strangerLogin = `test_m03_stranger_${process.env.TEST_PARALLEL_INDEX ?? '0'}@irabi.test`;
        const { context: strangerCtx } = await loginAs(browser, strangerLogin);
        const strangerId = await getAccountId(strangerLogin);
        try {
            expect(strangerId).toBeGreaterThan(0);
            const status = await getViaPage(expertPage, `/user/id~${strangerId}`);
            expect(status).toBe(404);
        } finally {
            await strangerCtx.close();
        }
    });

    test('expert who HAS a booking from this user CAN view it (real counterparty)', async () => {
        const expertId = await getAccountId('expert1@dev.test');
        const uid = [...Array(16)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
        const startAt = Math.floor(Date.now() / 1000) + 86400 * 9;

        const slotId = await withConnection(async (c) => {
            const [res]: any = await c.execute(
                `INSERT INTO ${tn('time_slots')}
                 (expert_id, start_at, end_at, duration_min, cost, is_online, location, max_users, booked_count, status, uid, created_at)
                 VALUES (?, ?, ?, 60, 0, 1, 'https://meet.example.com/m03-test', 1, 1, 'booked', ?, ?)`,
                [expertId, startAt, startAt + 3600, uid, Math.floor(Date.now() / 1000)],
            );
            return res.insertId;
        });
        await withConnection(async (c) => {
            await c.execute(
                `INSERT INTO ${tn('bookings')} (user_id, bookable_type, bookable_id, status, created_at)
                 VALUES (?, 'time_slot', ?, 'confirmed', UNIX_TIMESTAMP())`,
                [user2Id, slotId],
            );
        });

        try {
            const status = await getViaPage(expertPage, `/user/id~${user2Id}`);
            expect(status).toBe(200);
        } finally {
            await withConnection(async (c) => {
                await c.execute(`DELETE FROM ${tn('bookings')} WHERE bookable_id = ? AND bookable_type = 'time_slot'`, [slotId]);
                await c.execute(`DELETE FROM ${tn('time_slots')} WHERE id = ?`, [slotId]);
            });
        }
    });
});
