/**
 * L-01/M-01 regression: /users/~preview must use the same expert detection
 * and cancellation filtering as ExpertController::get__main().
 *
 * Bug 1: Deprecated expert detection via expert_profiles existence instead of
 *   UserEntityConfig::isApprovedActiveExpert() (checks type='expert', IS_APPROVED,
 *   !IS_DISABLED).
 *
 * Bug 2: Cancellation count missing kind='cancel' filter, causing mismatch between
 *   preview popup and public expert profile page.
 */

import { test, expect, tn } from '../helpers/scoped-test';
import mysql from 'mysql2/promise';
import { DB } from '../helpers/db';

test.describe.configure({ mode: 'serial' });

const BASE_URL = process.env.BASE_URL || 'http://localhost:8001';

test.describe('L-01/M-01: /users/~preview matches ExpertController stats', () => {
    let expertId = 0;
    let viewerId = 0;
    const seededCancellations: number[] = [];

    test.afterAll(async () => {
        if (!seededCancellations.length) return;
        const conn = await mysql.createConnection(DB);
        try {
            await conn.execute(
                `DELETE FROM ${tn('expert_cancellations')} WHERE id IN (${seededCancellations.map(() => '?').join(',')})`,
                seededCancellations,
            );
        } finally { await conn.end(); }
    });

    test('preview cancellation count matches expert profile (kind=cancel filter)', async ({ page }) => {
        // Login as a regular user to view the preview
        await page.goto(`${BASE_URL}/system/`);
        await page.click('text=Выйти');
        await page.click('text=Войти');
        await page.fill('input[name="login"]', 'user1@dev.test');
        await page.fill('input[name="password"]', 'password');
        await page.click('button[type="submit"]');
        await page.waitForURL(`${BASE_URL}/system/`);

        viewerId = await page.evaluate(() => (window as unknown as { __GARNET_ACCOUNT_ID__: number }).__GARNET_ACCOUNT_ID__);
        expect(viewerId).toBeGreaterThan(0);

        // Get expert1 id
        const conn = await mysql.createConnection(DB);
        try {
            const [rows] = await conn.execute<any[]>(
                `SELECT id FROM ${tn('accounts')} WHERE login = 'expert1@dev.test' LIMIT 1`,
            );
            expertId = rows[0]?.id ?? 0;
        } finally { await conn.end(); }
        expect(expertId).toBeGreaterThan(0);

        // Get baseline cancellation count from public expert profile
        await page.goto(`${BASE_URL}/system/expert/id~${expertId}`);
        await expect(page.locator('[data-test-id="expert-profile"]')).toBeVisible({ timeout: 10000 });
        const baseCancelCount = Number(await page.locator('[data-test-id="expert-stat-cancellations"]').textContent() || '0');

        // Seed test data: 2 cancellations (kind='cancel') and 1 decline (kind='decline')
        const now = Math.floor(Date.now() / 1000);
        const conn2 = await mysql.createConnection(DB);
        try {
            const inserts = await Promise.all([0, 1].map((i) => conn2.execute(
                `INSERT INTO ${tn('expert_cancellations')}
                 (expert_id, slot_id, booking_id, user_id, reason, created_at, kind)
                 VALUES (?, 0, 0, 0, 'qa-cancel-test', ?, 'cancel')`,
                [expertId, now + i],
            )));
            for (const [ins] of inserts as any[]) {
                seededCancellations.push(Number(ins.insertId));
            }
            const [ins]: any = await conn2.execute(
                `INSERT INTO ${tn('expert_cancellations')}
                 (expert_id, slot_id, booking_id, user_id, reason, created_at, kind)
                 VALUES (?, 0, 0, 0, 'qa-decline-test', ?, 'decline')`,
                [expertId, now + 2],
            );
            seededCancellations.push(Number(ins.insertId));
        } finally { await conn2.end(); }

        // Check public expert profile: must show base + 2 (only kind='cancel')
        await page.goto(`${BASE_URL}/system/expert/id~${expertId}`);
        await expect(page.locator('[data-test-id="expert-stat-cancellations"]')).toHaveText(String(baseCancelCount + 2), { timeout: 10000 });

        // Check /users/~preview endpoint: must match the profile exactly
        const previewResponse = await page.evaluate(async ({ userId, baseUrl }) => {
            const w = window as any;
            const res = await fetch(`${baseUrl}/users/~preview`, {
                method: 'POST',
                headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: userId, CSRF_TOKEN: w.__GARNET_CSRF__ || '' }),
            });
            const body = await res.json().catch(() => null);
            return { status: res.status, body };
        }, { userId: expertId, baseUrl: BASE_URL });

        expect(previewResponse.status).toBe(200);
        expect(previewResponse.body?.user?.type).toBe('expert');
        expect(previewResponse.body?.user?.stats?.cancellations).toBe(baseCancelCount + 2);
        // Ensure declines (kind='decline') are NOT counted in cancellations
        expect(previewResponse.body?.user?.stats?.cancellations).not.toBe(baseCancelCount + 3);
    });
});