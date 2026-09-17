/**
 * Подготовка для сверки финансов: сеяние балансов, проводок, слотов и
 * броней, запуск аудита и восстановление таблиц.
 *
 * Здесь же снимок и восстановление: проверки сверки чистят таблицы
 * целиком — иначе чужие строки делают расхождение, которого нет, — и
 * обязаны вернуть их на место после себя.
 */

import { test, expect, tn } from '../../../../helpers/scoped-test';
import { withConnection, DB } from '../../../../helpers/db/db';
import type { Connection } from 'mysql2/promise';
import { runServerCommand } from '../../../../helpers/db/server-command';

export const BASE = 2_000_000 + Math.floor(Math.random() * 100_000);

/**
 * Run the finance-audit CLI against the worker-isolated tables. Returns
 * captured stdout+stderr and the process exit code. Same shape as the
 * db-backup / log-rotation cron runners.
 */
export function runFinanceAudit(prefix: string): { stdout: string; stderr: string; exitCode: number | null } {
    return runServerCommand(['finance-audit'], prefix, 60000);
}

/**
 * Run the finance-audit CRON task (not the standalone command). The cron
 * tick always exits 0 — discrepancies surface as a non-zero return value
 * logged by AppCronService, not as a CLI failure.
 */
export function runFinanceAuditCron(prefix: string): { stdout: string; stderr: string; exitCode: number | null } {
    return runServerCommand(['cron', 'finance-audit'], prefix, 60000);
}

/**
 * Insert a balance row. Returns nothing — caller cleans up by account_id.
 */
export async function seedBalance(accountId: number, balance: number): Promise<void> {
    await withConnection(async (conn) => {
        await conn.execute(
            `INSERT INTO ${tn('account_balance')} (account_id, balance, updated_at) VALUES (?, ?, ?)`,
            [accountId, balance, Math.floor(Date.now() / 1000)],
        );
    });
}

/**
 * Insert a ledger row. Mirrors what FwBalanceLedger::addEntry() writes,
 * minus the recalculate() call — we want to construct controlled state,
 * not run the real money path. bypassUnique=true skips the idempotency
 * UNIQUE guard via INSERT IGNORE so a test can insert a deliberately
 * duplicate-shaped row to corrupt state.
 */
export async function seedLedger(args: {
    accountId: number;
    isCredit: boolean;
    amount: number;
    entryType: string;
    refType?: string | null;
    refId?: number | null;
    note?: string;
}): Promise<void> {
    await withConnection(async (conn) => {
        await conn.execute(
            `INSERT INTO ${tn('balance_ledger')}
             (account_id, is_credit, amount, entry_type, ref_type, ref_id, note, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                args.accountId,
                args.isCredit ? 1 : 0,
                args.amount,
                args.entryType,
                args.refType ?? null,
                args.refId ?? null,
                args.note ?? 'spec seed',
                Math.floor(Date.now() / 1000),
            ],
        );
    });
}

/**
 * Insert a time_slot with a paid cost and return its auto-increment id.
 * startOffsetSec lets a test place start_at in the future (default, for the
 * booked-before-start cases) or in the past.
 */
export async function seedSlot(
    cost: number,
    expertId: number,
    penaltyPercent = 0,
    startOffsetSec = 86400,
): Promise<number> {
    return withConnection(async (conn) => {
        const [r]: any = await conn.execute(
            `INSERT INTO ${tn('time_slots')}
             (expert_id, start_at, end_at, duration_min, cost, is_online, location,
              max_users, booked_count, status, uid, created_at, cancellation_penalty_percent)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                expertId,
                Math.floor(Date.now() / 1000) + startOffsetSec,
                Math.floor(Date.now() / 1000) + startOffsetSec + 3600,
                60,
                cost,
                1,
                '',
                1,
                0,
                'free',
                'spec' + Math.random().toString(36).slice(2, 10),
                Math.floor(Date.now() / 1000),
                penaltyPercent,
            ],
        );
        return Number(r.insertId);
    });
}

/**
 * Insert a booking and return its auto-increment id. confirmedBeforeCancel
 * sets confirmed_at to a timestamp before cancelled_at, matching the
 * "previousStatus was confirmed" shape computeRefundAmounts() keys off.
 */
export async function seedBooking(
    userId: number,
    slotId: number,
    status: string,
    confirmedBeforeCancel = false,
): Promise<number> {
    return withConnection(async (conn) => {
        const now = Math.floor(Date.now() / 1000);
        const [r]: any = await conn.execute(
            `INSERT INTO ${tn('bookings')}
             (user_id, bookable_type, bookable_id, status, created_at, confirmed_at, cancelled_at)
             VALUES (?, 'time_slot', ?, ?, ?, ?, ?)`,
            [
                userId,
                slotId,
                status,
                now,
                confirmedBeforeCancel ? now - 60 : null,
                status === 'cancelled' ? now : null,
            ],
        );
        return Number(r.insertId);
    });
}

// Per-test-run unique ID ranges. Workers are isolated, but using a
// high random base keeps the dev-stand run (where DB_PREFIX_OVERRIDE
// falls through to db_ir when PW_WORKER_ISOLATION=0) from ever colliding
// with seed data.

/** The four tables the reconciliation reads. */
const RECONCILED_TABLES = ['balance_ledger', 'account_balance', 'bookings', 'time_slots'] as const;

/**
 * Seeded worker tables come pre-populated by the test:provision clone of the
 * dev seed — which itself contains ~12 known "cancelled_no_refund" orphans
 * (the audit's H-2 scenario, demonstrably present even in seed data). That
 * seeded state is exactly what the audit exists to surface, but it makes
 * "clean worker → exit 0" assertions impossible without a controlled
 * baseline.
 *
 * IMPORTANT: `project` tags (framework-bundle / cross-role / booking) are
 * ONLY test-selection/reporting labels — they do NOT map to separate DB
 * scopes. Any spec file, regardless of project, can be scheduled onto the
 * SAME physical worker (and therefore the SAME test_worker_N_* tables) as
 * this file over the course of one run. A bare `DELETE FROM` with no WHERE
 * on these four tables would wipe every OTHER spec's shared fixture data
 * (testuser_setup_* and user1@dev.test balances, bookings, slots) for the rest
 * of that worker's run the moment this file happens to share a worker with
 * them — confirmed as a real corruption source this session. So: snapshot
 * every row before truncating, and restore the snapshot in a file-level
 * afterAll once this file's own tests are done.
 */
const snapshotRows: Partial<Record<typeof RECONCILED_TABLES[number], any[]>> = {};
export let snapshotTaken = false;

export async function truncateRelevantTables(): Promise<void> {
    await withConnection(async (conn) => {
        if (!snapshotTaken) {
            for (const t of RECONCILED_TABLES) {
                const [rows] = await conn.execute<any[]>(`SELECT * FROM ${tn(t)}`);
                snapshotRows[t] = rows;
            }
            snapshotTaken = true;
        }
        for (const t of RECONCILED_TABLES) {
            await conn.execute(`DELETE FROM ${tn(t)}`);
        }
    });
}

/**
 * Real (non-generated) column names for a table, in ordinal order. Skips
 * generated/virtual columns (e.g. bookings.active_dup_key) — MySQL refuses
 * INSERT VALUES against them; see isolation-setup.ts::cloneTemplateTo()
 * for the matching pattern this mirrors.
 */
export async function insertableColumns(conn: Connection, tableName: string): Promise<string[]> {
    const [rows] = await conn.execute<any[]>(
        `SELECT COLUMN_NAME FROM information_schema.columns
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
               AND (EXTRA NOT LIKE '%GENERATED%' OR EXTRA IS NULL)
         ORDER BY ORDINAL_POSITION`,
        [tableName],
    );
    return rows.map((r) => r.COLUMN_NAME as string);
}

/** Restores the pre-truncate snapshot — see truncateRelevantTables() above. */
export async function restoreSnapshot(): Promise<void> {
    if (!snapshotTaken) return;
    await withConnection(async (conn) => {
        await conn.execute('SET FOREIGN_KEY_CHECKS = 0');
        try {
            for (const t of RECONCILED_TABLES) {
                await conn.execute(`DELETE FROM ${tn(t)}`);
                const rows = snapshotRows[t] ?? [];
                if (!rows.length) continue;
                const realCols = await insertableColumns(conn, tn(t));
                const cols = realCols.filter((c) => c in rows[0]);
                const colList = cols.map((c) => `\`${c}\``).join(', ');
                const rowPlaceholder = `(${cols.map(() => '?').join(', ')})`;
                // Bulk-insert in chunks — row-by-row INSERTs would be far too
                // slow when this file runs late in a full-suite run with
                // thousands of accumulated rows across other specs' fixtures.
                const CHUNK = 500;
                for (let i = 0; i < rows.length; i += CHUNK) {
                    const chunk = rows.slice(i, i + CHUNK);
                    const sql = `INSERT INTO ${tn(t)} (${colList}) VALUES ${chunk.map(() => rowPlaceholder).join(', ')}`;
                    const params = chunk.flatMap((row) => cols.map((c) => row[c]));
                    await conn.execute(sql, params);
                }
            }
        } finally {
            await conn.execute('SET FOREIGN_KEY_CHECKS = 1');
        }
    });
    snapshotTaken = false;
}

// File-level afterAll (not scoped to one describe) — restores the snapshot
// once regardless of which of the 3 describes below actually ran/failed,
// since truncateRelevantTables() only snapshots on its FIRST call.
test.afterAll(async () => {
    await restoreSnapshot();
});

// ─────────────────────────────────────────────────────────────────────────
// 1. Per-category clean vs dirty detection
