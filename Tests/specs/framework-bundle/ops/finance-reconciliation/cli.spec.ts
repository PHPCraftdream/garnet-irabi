/**
 * Коды выхода CLI-команды аудита: чем она отвечает вызывающему.
 *
 * Часть разобранного finance-reconciliation.spec.ts.
 */

import { test, expect, tn, getDbPrefix } from '../../../../helpers/scoped-test';
import { withConnection } from '../../../../helpers/db/db';
import {
    runFinanceAudit,
    seedBalance,
    seedLedger,
    truncateRelevantTables,
    BASE,
} from './helpers';

test.describe.configure({ mode: 'serial' });

test.describe('CMDFinanceAudit — CLI exit codes', () => {
    const acc = BASE + 50;

    test.beforeAll(async () => {
        await truncateRelevantTables();
    });

    test.afterEach(async () => {
        await withConnection(async (conn) => {
            await conn.execute(`DELETE FROM ${tn('balance_ledger')} WHERE account_id = ?`, [acc]);
            await conn.execute(`DELETE FROM ${tn('account_balance')} WHERE account_id = ?`, [acc]);
        });
    });

    test('clean worker — exit 0, report says CLEAN', async () => {
        const res = runFinanceAudit(getDbPrefix());
        const out = res.stdout + res.stderr;
        expect(res.exitCode, `finance-audit stdout:\n${out}`).toBe(0);
        expect(out).toContain('Result: CLEAN — no discrepancies detected.');
        // The idempotency-index smoke is part of every clean run.
        expect(out).toMatch(/\[e\] idempotency index — OK/);
    });

    test('dirty worker — exit 1, report says DISCREPANCIES FOUND', async () => {
        // Seed ONE controlled discrepancy on an otherwise-clean worker.
        await seedBalance(acc, 999);
        await seedLedger({ accountId: acc, isCredit: true, amount: 1, entryType: 'top_up' });

        const res = runFinanceAudit(getDbPrefix());
        const out = res.stdout + res.stderr;
        expect(res.exitCode).toBe(1);
        expect(out).toContain('Result: DISCREPANCIES FOUND');
        expect(out).toContain(`account=${acc}  cached=999  ledger_sum=1  diff=+998`);
    });
});

// ─────────────────────────────────────────────────────────────────────────
// 3. Cron tick — always exits 0, logs per-category counts
// ─────────────────────────────────────────────────────────────────────────
