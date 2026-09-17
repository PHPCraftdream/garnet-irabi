/**
 * Вывод крон-тика аудита.
 *
 * Часть разобранного finance-reconciliation.spec.ts.
 */

import { test, expect, tn, getDbPrefix } from '../../../helpers/scoped-test';
import { withConnection } from '../../../helpers/db';
import {
    runFinanceAuditCron,
    seedBalance,
    seedLedger,
    truncateRelevantTables,
    BASE,
} from './helpers';

test.describe.configure({ mode: 'serial' });

test.describe('cron finance-audit — tick output', () => {
    const acc = BASE + 60;

    test.beforeAll(async () => {
        await truncateRelevantTables();
    });

    test.afterEach(async () => {
        await withConnection(async (conn) => {
            await conn.execute(`DELETE FROM ${tn('balance_ledger')} WHERE account_id = ?`, [acc]);
            await conn.execute(`DELETE FROM ${tn('account_balance')} WHERE account_id = ?`, [acc]);
        });
    });

    test('clean worker — cron exits 0 and logs zero counts', async () => {
        const res = runFinanceAuditCron(getDbPrefix());
        const out = res.stdout + res.stderr;
        expect(res.exitCode).toBe(0);
        expect(out).toMatch(/OK/);
        // The single per-category-count line, all zeros on a clean run.
        expect(out).toMatch(/finance-audit: cache_vs_ledger=0 booking_pairing=0 orphans=0 global_zero_breach=0 negatives=0 idempotency_index=ok/);
    });

    test('dirty worker — cron still exits 0 and logs the non-zero count', async () => {
        // One controlled discrepancy — the cron tick must NOT fail (it
        // returns the mismatch count as a "did work" signal), but the
        // log line must reflect the real state.
        await seedBalance(acc, 999);
        await seedLedger({ accountId: acc, isCredit: true, amount: 1, entryType: 'top_up' });

        const res = runFinanceAuditCron(getDbPrefix());
        const out = res.stdout + res.stderr;
        expect(res.exitCode).toBe(0);
        expect(out).toMatch(/OK/);
        // The cache_vs_ledger count is non-zero; the rest stay zero because
        // we only corrupted that one category.
        expect(out).toMatch(/finance-audit: cache_vs_ledger=[1-9]\d* booking_pairing=0 orphans=0 global_zero_breach=0 negatives=0 idempotency_index=ok/);
    });
});
