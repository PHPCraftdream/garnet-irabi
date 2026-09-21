/**
 * D-261 (UAT round, expert-3/Менахем Зельцер): the batch slot wizard
 * ("Пакетное создание слотов") had no field for "% неустойки при
 * отмене" anywhere — neither on the params step nor the preview step —
 * unlike the single "Создать слот" form, which has always had it. The
 * backend (ExpertSlotsService::batchSlots) already fully supported
 * `cancellation_penalty_percent`, falling back to the site-wide default
 * when the field is absent — so every batch-created slot silently got
 * whatever that default happens to be (observed as 0% in the report),
 * with no way for the expert to override it. A student confirmed this
 * live: cancelling a confirmed booking on a batch-created slot cost 0%
 * penalty.
 */
import { test, expect, tn } from '../helpers/scoped-test';
import { newScopedPage } from '../helpers/scoped-test';
import type { Page } from '@playwright/test';
import { clearTestData } from '../helpers/auth/auth';
import mysql from 'mysql2/promise';
import { DB } from '../helpers/db/db';
import { EXPERT_LOGIN, firstOfMonthAhead, setupBatchExpert } from './helpers';

test.describe.configure({ mode: 'serial' });

test.describe('D-261: batch wizard lets you set the cancellation penalty %', () => {
    let page: Page;
    const targetMonth = firstOfMonthAhead(6);
    const PENALTY = 35;

    test.beforeAll(async ({ browser }) => {
        page = await newScopedPage(browser);
        await setupBatchExpert(page);
        await page.goto('/expert/~slots');
    });

    test.afterAll(async () => {
        const conn = await mysql.createConnection(DB);
        try {
            await conn.execute(
                `DELETE ts FROM ${tn('time_slots')} ts JOIN ${tn('accounts')} a ON a.id = ts.expert_id
                 WHERE a.login = ? AND ts.start_at >= UNIX_TIMESTAMP(?)`,
                [EXPERT_LOGIN, `${targetMonth} 00:00:00`],
            );
        } finally {
            await conn.end();
        }
        await page.close();
        await clearTestData(EXPERT_LOGIN);
    });

    test('setting a non-default penalty % on the batch form creates slots with that value', async () => {
        await page.locator('[data-test-id="open-batch-slot-modal"]').click();
        const batchModal = page.locator('[data-test-id="batch-slot-modal"]');
        await expect(batchModal).toBeVisible({ timeout: 5000 });

        await batchModal.locator('input[name="start_date"]').fill(targetMonth);
        await batchModal.locator('input[name="per_week"]').fill('2');
        await batchModal.locator('input[name="count"]').fill('2');
        await batchModal.locator('input[name="batch_time"]').fill('11:00');
        await batchModal.locator('input[name="batch_cost"]').fill('600');

        const penaltyInput = batchModal.locator('[data-test-id="batch-penalty-percent"]');
        await expect(penaltyInput).toBeVisible({ timeout: 5000 });
        await penaltyInput.fill(String(PENALTY));

        await batchModal.locator('#batchForm button[type="submit"]').click();
        await expect(batchModal.locator('#batchPreview')).toBeVisible({ timeout: 5000 });

        const [batchResponse] = await Promise.all([
            page.waitForResponse(resp => resp.url().includes('/expert/~batchSlots') && resp.request().method() === 'POST'),
            (async () => {
                await batchModal.locator('#batchCreateBtn').click();
                await page.locator('#confirmModalOk').click();
            })(),
        ]);
        expect(batchResponse.ok()).toBe(true);
        const body = await batchResponse.json().catch(() => null);
        expect(body?.success).toBe(true);
        expect(body?.created).toBeGreaterThan(0);

        const conn = await mysql.createConnection(DB);
        try {
            const [rows] = await conn.execute<any[]>(
                `SELECT ts.cancellation_penalty_percent FROM ${tn('time_slots')} ts
                 JOIN ${tn('accounts')} a ON a.id = ts.expert_id
                 WHERE a.login = ? AND ts.start_at >= UNIX_TIMESTAMP(?)`,
                [EXPERT_LOGIN, `${targetMonth} 00:00:00`],
            );
            expect(rows.length).toBeGreaterThan(0);
            for (const row of rows) {
                expect(Number(row.cancellation_penalty_percent)).toBe(PENALTY);
            }
        } finally {
            await conn.end();
        }
    });
});
