/**
 * M-01 regression (docs/security-audit/12-ms-postfix-authorization-review.md):
 * ExpertController::get__main() ('/expert/id~N') checked only
 * expert_profiles.is_approved, which does NOT get cascade-cleared when a
 * moderator disables the account or demotes it away from type=expert. A
 * disabled or demoted expert's profile (including future free slot ids and
 * booking counters) remained fully visible via the direct URL.
 *
 * The fix gates on UserEntityConfig::isApprovedActiveExpert() — the same
 * account-level predicate (type=expert, account IS_APPROVED, not
 * IS_DISABLED) already enforced by the booking path — instead of the
 * expert_profiles row alone.
 */
import { test, expect, tn } from '../helpers/scoped-test';
import { newScopedContext } from '../helpers/scoped-test';
import { withConnection } from '../helpers/db';
import type { BrowserContext, Page } from '@playwright/test';

async function getExpertId(): Promise<number> {
    return withConnection(async (c) => {
        const [rows] = await c.execute<any[]>(`SELECT id FROM ${tn('accounts')} WHERE login = 'expert1@dev.test'`);
        return rows[0]?.id ?? 0;
    });
}

async function seedFreeSlot(expertId: number): Promise<number> {
    return withConnection(async (c) => {
        const startAt = Math.floor(Date.now() / 1000) + 86400 * 8;
        const uid = [...Array(16)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
        const [res]: any = await c.execute(
            `INSERT INTO ${tn('time_slots')}
             (expert_id, start_at, end_at, duration_min, cost, is_online, location, max_users, booked_count, status, uid, created_at)
             VALUES (?, ?, ?, 60, 0, 1, 'https://meet.example.com/m01-test', 1, 0, 'free', ?, ?)`,
            [expertId, startAt, startAt + 3600, uid, Math.floor(Date.now() / 1000)],
        );
        return res.insertId;
    });
}

async function setAccountFlag(accountId: number, flag: string, value: string): Promise<void> {
    await withConnection(async (c) => {
        await c.execute(
            `INSERT INTO ${tn('accounts_data')} (account_id, param, value)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE value = VALUES(value)`,
            [accountId, flag, value],
        );
    });
}

async function setAccountType(accountId: number, type: string): Promise<void> {
    await withConnection(async (c) => {
        await c.execute(`UPDATE ${tn('accounts')} SET type = ? WHERE id = ?`, [type, accountId]);
    });
}

async function getViaPage(page: Page, path: string): Promise<{ status: number; body: string }> {
    return page.evaluate(async (path: string) => {
        const res = await fetch(path);
        return { status: res.status, body: await res.text() };
    }, path);
}

test.describe('M-01: /expert/id~N requires an active approved expert', () => {
    test.describe.configure({ mode: 'serial' });
    let expertId = 0;
    let slotId = 0;
    let ctx: BrowserContext;
    let page: Page;

    test.beforeAll(async ({ browser }) => {
        expertId = await getExpertId();
        expect(expertId).toBeGreaterThan(0);
        slotId = await seedFreeSlot(expertId);
        expect(slotId).toBeGreaterThan(0);

        ctx = await newScopedContext(browser);
        page = await ctx.newPage();
        await page.goto('/');
    });

    test.afterAll(async () => {
        await withConnection(async (c) => {
            await c.execute(`DELETE FROM ${tn('time_slots')} WHERE id = ?`, [slotId]);
        });
        await setAccountFlag(expertId, 'IS_DISABLED', '0');
        await setAccountFlag(expertId, 'IS_APPROVED', '1');
        await setAccountType(expertId, 'expert');
        await ctx?.close().catch(() => {});
    });

    test('baseline: active approved expert profile is reachable and lists the slot', async () => {
        const { status, body } = await getViaPage(page, `/expert/id~${expertId}`);
        expect(status).toBe(200);
        // Match the slot id inside the rendered island's JSON payload rather
        // than a bare substring — a raw numeric id can coincidentally match
        // unrelated digits elsewhere on the page (asset hashes, other ids).
        expect(body).toMatch(new RegExp(`\"id\":${slotId}\\b`));
    });

    test('disabled expert profile stays reachable but anonymised, slot id not leaked', async () => {
        // Disabled accounts are shown anonymised elsewhere (news feed, IM
        // partner name) rather than 404'd — the profile page follows the
        // same pattern: page renders, but future free slots and counters
        // are redacted.
        await setAccountFlag(expertId, 'IS_DISABLED', '1');
        try {
            const { status, body } = await getViaPage(page, `/expert/id~${expertId}`);
            expect(status).toBe(200);
            expect(body).not.toMatch(new RegExp(`\"id\":${slotId}\\b`));
        } finally {
            await setAccountFlag(expertId, 'IS_DISABLED', '0');
        }
    });

    test('demoted (type=user) expert profile 404s, slot id not leaked', async () => {
        await setAccountType(expertId, 'user');
        try {
            const { status, body } = await getViaPage(page, `/expert/id~${expertId}`);
            expect(status).toBe(404);
            expect(body).not.toMatch(new RegExp(`\"id\":${slotId}\\b`));
        } finally {
            await setAccountType(expertId, 'expert');
        }
    });

    test('unapproved (account-level IS_APPROVED=0) expert profile 404s', async () => {
        await setAccountFlag(expertId, 'IS_APPROVED', '0');
        try {
            const { status } = await getViaPage(page, `/expert/id~${expertId}`);
            expect(status).toBe(404);
        } finally {
            await setAccountFlag(expertId, 'IS_APPROVED', '1');
        }
    });
});
