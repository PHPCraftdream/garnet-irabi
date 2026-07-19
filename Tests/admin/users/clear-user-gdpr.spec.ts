/**
 * Admin — Irreversible account erasure (GDPR / 152-ФЗ F-02)
 *
 * State machine: AccountSM[scratch] × AdminActionLogSM(action='clear_user')
 *
 * Covers the HTTP path to ClearUserService::clearByEmail() that opens up the
 * previously test-mode-gated CLI-only hard-delete to a properly authorized
 * owner/admin. The CLI gate in CMDClearUser.php is intentionally NOT touched
 * — this spec exercises the new HTTP endpoint at POST /admin/~clearUser.
 *
 * Scenarios:
 *   1. Owner/admin clears a scratch user with matching confirm_login →
 *      success, account row gone, admin_action_log entry written.
 *   2. Wrong confirm_login (does not match the account email) → 400,
 *      account NOT deleted.
 *   3. Plain moderator calling clearUser → 403, account NOT deleted
 *      (owner-only gate; not even a rank-guard rejection — access denied
 *      outright regardless of target).
 *   4. Rank guard: moderator attempting on an owner/admin target via the
 *      owner endpoint is still 403 (moderator never gets past isOwner()).
 *
 * Uses a per-run scratch account (unique email) so other specs are unaffected
 * by the destructive cascade. The seeded testuser_setup_* accounts must NOT
 * be targets — that would break every subsequent spec.
 */

import { test, expect, tn } from '../../helpers/scoped-test';
import mysql from 'mysql2/promise';
import { DB } from '../../helpers/db';
import { OWNER_LOGIN, ADMIN_LOGIN } from '../../helpers/logins';

test.describe.configure({ mode: 'serial' });

// Per-run unique email so parallel workers / retries never collide on a
// leftover row from a previous attempt. Each describe block below gets its
// OWN suffixed email (not one shared constant) — admin_action_log rows are
// never deleted by cleanupScratchByEmail(), so if two describes reused the
// same address, the happy-path block's 'clear_user' log entry would still
// be sitting there when a later block asserts "no log entry for this email".
const RUN_ID = `${process.env.TEST_PARALLEL_INDEX ?? '0'}-${Date.now()}`;
const scratchEmail = (suffix: string) => `scratch_clear_gdpr_${RUN_ID}_${suffix}@irabi.test`;
const SCRATCH_NAME = 'GDPR Scratch User';

async function insertScratchAccount(email: string, name: string): Promise<number> {
    const conn = await mysql.createConnection(DB);
    try {
        const now = Math.floor(Date.now() / 1000);
        await conn.execute(
            `INSERT INTO ${tn('accounts')}
                (login, login_type, name, type, reg_time, last_auth_time, last_online_time)
             VALUES (?, 'email', ?, 'user', ?, ?, ?)`,
            [email, name, now, now, now]
        );
        const [rows] = await conn.execute<any[]>(
            `SELECT id FROM ${tn('accounts')} WHERE login = ?`, [email]
        );
        return rows[0]?.id ?? 0;
    } finally {
        await conn.end();
    }
}

async function accountExists(accountId: number): Promise<boolean> {
    const conn = await mysql.createConnection(DB);
    try {
        const [rows] = await conn.execute<any[]>(
            `SELECT 1 FROM ${tn('accounts')} WHERE id = ? LIMIT 1`, [accountId]
        );
        return rows.length > 0;
    } finally {
        await conn.end();
    }
}

async function accountExistsByEmail(email: string): Promise<boolean> {
    const conn = await mysql.createConnection(DB);
    try {
        const [rows] = await conn.execute<any[]>(
            `SELECT 1 FROM ${tn('accounts')} WHERE login = ? LIMIT 1`, [email]
        );
        return rows.length > 0;
    } finally {
        await conn.end();
    }
}

async function countClearUserLog(targetLogin: string): Promise<number> {
    const conn = await mysql.createConnection(DB);
    try {
        const [rows] = await conn.execute<any[]>(
            `SELECT COUNT(*) AS cnt FROM ${tn('admin_action_log')}
             WHERE target_login = ? AND action = 'clear_user'`,
            [targetLogin]
        );
        return rows[0]?.cnt ?? 0;
    } finally {
        await conn.end();
    }
}

/**
 * POST /admin/~clearUser via the page's own fetch, mirroring sendPost.ts
 * exactly (JSON body + CSRF_TOKEN from window.__GARNET_CSRF__) — a raw
 * Playwright `request.post()` shares cookies but not the page's JS globals,
 * so it never carries the CSRF token and every call gets rejected with
 * "Ошибка проверки токена CSRF" before reaching the isOwner()/rank-guard
 * checks this spec is actually meant to exercise. The caller must have
 * already done `await page.goto('/admin/')` so __GARNET_CSRF__ is set.
 */
async function postClearUser(
    page: import('@playwright/test').Page,
    params: { user_id: string; confirm_login: string },
): Promise<{ status: number; body: any }> {
    return page.evaluate(async (payload) => {
        const csrf = (window as any).__GARNET_CSRF__ || '';
        const res = await fetch('/admin/~clearUser', {
            method: 'POST',
            headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...payload, CSRF_TOKEN: csrf }),
        });
        const text = await res.text();
        let body: any = null;
        try { body = JSON.parse(text); } catch { body = text; }
        return { status: res.status, body };
    }, params);
}

async function cleanupScratchByEmail(email: string): Promise<void> {
    const conn = await mysql.createConnection(DB);
    try {
        const [rows] = await conn.execute<any[]>(
            `SELECT id FROM ${tn('accounts')} WHERE login = ?`, [email]
        );
        const id = rows[0]?.id;
        if (!id) return;
        // Best-effort cleanup of any straggler rows tied to the scratch id.
        // ClearUserService already removes most of these on success; this
        // only matters when a test failed mid-flight and left rows behind.
        for (const t of [
            'accounts_data', 'bookings', 'support_tickets', 'payments',
            'account_balance', 'balance_ledger', 'expert_profiles',
        ]) {
            try {
                await conn.execute(
                    `DELETE FROM ${tn(t)} WHERE account_id = ?`, [id]
                );
            } catch { /* table may not exist or column may differ — ignore */ }
        }
        await conn.execute(`DELETE FROM ${tn('accounts')} WHERE id = ?`, [id]);
    } finally {
        await conn.end();
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('F-02: owner/admin clearUser — happy path', () => {
    const SCRATCH_EMAIL = scratchEmail('happy');
    let scratchId = 0;

    test.afterAll(async () => {
        if (!scratchId) return;
        // Defensive: if the success test ran, the row is already gone; this
        // is a no-op. If a prior test failed before the clear, remove the
        // scratch so subsequent runs start clean.
        await cleanupScratchByEmail(SCRATCH_EMAIL);
    });

    test('entry: scratch account exists, no clear_user log entry yet', async () => {
        await cleanupScratchByEmail(SCRATCH_EMAIL);
        scratchId = await insertScratchAccount(SCRATCH_EMAIL, SCRATCH_NAME);
        expect(scratchId).toBeGreaterThan(0);
        expect(await accountExists(scratchId)).toBe(true);

        const logBefore = await countClearUserLog(SCRATCH_EMAIL);
        expect(logBefore).toBe(0);
    });

    test('admin POST clearUser with matching confirm_login → success, account gone, log written', async ({ ownerPage }) => {
        if (!scratchId) { test.skip(); return; }

        await ownerPage.goto('/admin/');
        const { status, body } = await postClearUser(ownerPage, {
            user_id: String(scratchId),
            confirm_login: SCRATCH_EMAIL,
        });
        expect(status).toBe(200);
        expect(body.success).toBe(true);
        expect(typeof body.total).toBe('number');
        expect(body.total).toBeGreaterThanOrEqual(1); // at least the accounts row

        // The accounts row MUST be gone — the core invariant.
        expect(await accountExists(scratchId)).toBe(false);
        expect(await accountExistsByEmail(SCRATCH_EMAIL)).toBe(false);

        // The single admin_action_log entry is the only remaining trace.
        const logAfter = await countClearUserLog(SCRATCH_EMAIL);
        expect(logAfter).toBe(1);
    });
});

// ── Negative: confirm_login mismatch ─────────────────────────────────────────

test.describe('F-02: clearUser rejects confirm_login mismatch', () => {
    const SCRATCH_EMAIL = scratchEmail('mismatch');
    let scratchId = 0;

    test.afterAll(async () => {
        if (scratchId) await cleanupScratchByEmail(SCRATCH_EMAIL);
    });

    test('entry: scratch account exists', async () => {
        await cleanupScratchByEmail(SCRATCH_EMAIL);
        scratchId = await insertScratchAccount(SCRATCH_EMAIL, SCRATCH_NAME);
        expect(scratchId).toBeGreaterThan(0);
    });

    test('admin POST clearUser with WRONG confirm_login → 400, account NOT deleted', async ({ ownerPage }) => {
        if (!scratchId) { test.skip(); return; }

        await ownerPage.goto('/admin/');
        const { status, body } = await postClearUser(ownerPage, {
            user_id: String(scratchId),
            confirm_login: 'someone_else@irabi.test',
        });
        expect(status).toBe(400);
        expect(body.success).not.toBe(true);

        // Account MUST still exist — the mismatch must short-circuit before
        // any deletion runs.
        expect(await accountExists(scratchId)).toBe(true);
        // And no log entry should have been written.
        expect(await countClearUserLog(SCRATCH_EMAIL)).toBe(0);
    });
});

// ── Negative: plain moderator (not owner/admin) is denied outright ───────────

test.describe('F-02: moderator cannot call clearUser (owner-only)', () => {
    const SCRATCH_EMAIL = scratchEmail('modblock');
    let scratchId = 0;

    test.afterAll(async () => {
        if (scratchId) await cleanupScratchByEmail(SCRATCH_EMAIL);
    });

    test('entry: scratch account exists', async () => {
        await cleanupScratchByEmail(SCRATCH_EMAIL);
        scratchId = await insertScratchAccount(SCRATCH_EMAIL, SCRATCH_NAME);
        expect(scratchId).toBeGreaterThan(0);
    });

    test('moderator POST clearUser on a regular user → 403, account NOT deleted', async ({ moderatorPage }) => {
        if (!scratchId) { test.skip(); return; }

        await moderatorPage.goto('/admin/');
        const { status } = await postClearUser(moderatorPage, {
            user_id: String(scratchId),
            confirm_login: SCRATCH_EMAIL,
        });
        expect(status).toBe(403);
        expect(await accountExists(scratchId)).toBe(true);
        expect(await countClearUserLog(SCRATCH_EMAIL)).toBe(0);
    });
});

// ── Rank guard: even with the right role ladder, moderator can't touch owner/admin ──
//
// Note: clearUser gates on isOwner() FIRST, so a moderator never reaches the
// actorMayActOn() rank guard — they get 403 from the role gate regardless of
// target. This test documents that fact: even targeting an owner/admin
// (which actorMayActOn would refuse anyway) yields 403 from the isOwner()
// check, not from the rank guard. Either way the target survives.

test.describe('F-02: rank guard — moderator cannot clear owner/admin', () => {
    let ownerId = 0;
    let adminId = 0;

    test('entry: resolve owner and admin ids', async () => {
        ownerId = await getAccountIdByLogin(OWNER_LOGIN);
        adminId = await getAccountIdByLogin(ADMIN_LOGIN);
        expect(ownerId).toBeGreaterThan(0);
        expect(adminId).toBeGreaterThan(0);
    });

    test('moderator POST clearUser on owner → 403, owner still exists', async ({ moderatorPage }) => {
        if (!ownerId) { test.skip(); return; }
        await moderatorPage.goto('/admin/');
        const { status } = await postClearUser(moderatorPage, {
            user_id: String(ownerId), confirm_login: OWNER_LOGIN,
        });
        expect(status).toBe(403);
        expect(await accountExists(ownerId)).toBe(true);
    });

    test('moderator POST clearUser on admin → 403, admin still exists', async ({ moderatorPage }) => {
        if (!adminId) { test.skip(); return; }
        await moderatorPage.goto('/admin/');
        const { status } = await postClearUser(moderatorPage, {
            user_id: String(adminId), confirm_login: ADMIN_LOGIN,
        });
        expect(status).toBe(403);
        expect(await accountExists(adminId)).toBe(true);
    });
});

async function getAccountIdByLogin(login: string): Promise<number> {
    const conn = await mysql.createConnection(DB);
    try {
        const [rows] = await conn.execute<any[]>(
            `SELECT id FROM ${tn('accounts')} WHERE login = ?`, [login]
        );
        return rows[0]?.id ?? 0;
    } finally {
        await conn.end();
    }
}
