/**
 * Денежный путь: отказ пересчёта эксперту не роняет бронь — и не исчезает.
 *
 * `SlotsController::post__book` записывает эксперту строку журнала
 * `booking_payment` и вызывает `recalculate($expertId)` в своём finally.
 * Исключение из finally заменило бы исход уже записанной брони, поэтому
 * провал приходится глотать — но раньше он глотался в `catch (Throwable) {}`
 * без единой записи. Следствие: журнал уже с новой строкой, кэш
 * `account_balance.balance` — прежний, `getBalance()` (а значит и экран
 * эксперта) показывает неверную сумму, и починить это некому: сверка
 * (BalanceReconciliationService) только ОБНАРУЖИВАЕТ расхождение, повтора в
 * запросе нет, кэш выровняется лишь на следующей денежной операции.
 *
 * Провал тут не экзотика: `recalculate()` берёт именной лок
 * `irabi_bal_<accountId>` с таймаутом AccountBalance::LOCK_TIMEOUT_SECONDS
 * и кидает AccountLockAcquireException, если лок занят — а держаться он
 * может долго (см. докблок AccountBalance::releaseLock()).
 *
 * Проверка держит лок эксперта чужим соединением и бронирует слот. Утверждаем
 * три вещи: бронь проходит, кэш эксперта расходится с журналом (то самое
 * следствие) и в ERROR_LOGGER есть запись об этом (то самое новое поведение).
 */
import { test, expect, tn } from '../../helpers/scoped-test';
import { newScopedContext } from '../../helpers/scoped-test';
import mysql from 'mysql2/promise';
import { spawnSync } from 'node:child_process';
import type { BrowserContext } from '@playwright/test';
import { DB } from '../../helpers/db/db';
import { isProd, remoteRuntimeDir } from '../../helpers/db/ssh-bridge';
import { runServerCommand, APP_ROOT } from '../../helpers/db/server-command';
import { roleLogin } from '../../helpers/auth/role-login';

const SLOT_COST = 640;
/** Заведомо больше LOCK_TIMEOUT_SECONDS (10), чтобы запрос гарантированно не дождался. */
const HOLD_SECONDS = 25;
const LOG_CAT = 'balance_recalc_failed';

let ctx: BrowserContext;
let expertId = 0;
let userId = 0;
let slotId = 0;
let testModeWasOurs = false;

const q = (s: string): string => `'${s.replace(/'/g, "'\\''")}'`;

/** Одна ssh-команда в каталоге рантайма; stdout+stderr обратно. */
function ssh(remoteCmd: string, timeoutMs = 30000): string {
    const res = spawnSync(
        'php',
        ['garnet', 'ssh', remoteCmd, `--cwd=${remoteRuntimeDir()}`, '--no-tty'],
        { cwd: APP_ROOT, encoding: 'utf8', timeout: timeoutMs },
    );

    return (res.stdout ?? '') + (res.stderr ?? '');
}

async function sql<T = any>(query: string, params: any[] = []): Promise<T[]> {
    const conn = await mysql.createConnection(DB);
    try {
        const [rows] = await conn.execute<any[]>(query, params);

        return rows as T[];
    } finally { await conn.end(); }
}

async function cachedBalance(accountId: number): Promise<number> {
    const rows = await sql(`SELECT balance FROM ${tn('account_balance')} WHERE account_id = ?`, [accountId]);

    return rows.length ? Number(rows[0].balance) : 0;
}

async function ledgerSum(accountId: number): Promise<number> {
    const rows = await sql(
        `SELECT COALESCE(SUM(CASE WHEN is_credit = 1 THEN amount ELSE -amount END), 0) AS s
         FROM ${tn('balance_ledger')} WHERE account_id = ?`,
        [accountId],
    );

    return Number(rows[0]?.s ?? 0);
}

/** Свести кэш с журналом: соседние проверки оставляют его расхождённым (D-220). */
async function syncCache(accountId: number): Promise<void> {
    const sum = await ledgerSum(accountId);
    await sql(
        `UPDATE ${tn('account_balance')} SET balance = ?, updated_at = UNIX_TIMESTAMP() WHERE account_id = ?`,
        [sum, accountId],
    );
}

test.describe('money: отказ пересчёта эксперту записывается, а не теряется', () => {
    // Лок держится ТОЛЬКО живым соединением, а под PW_PROD ssh-bridge
    // выполняет каждый SQL-вызов отдельным процессом — держать лок из
    // процесса проверки там нельзя. Поэтому держатель запускается на самом
    // хосте (`php garnet test:hold-lock`, test-mode gated), и путь этот
    // осмыслен именно против внешнего стенда.
    test.skip(!isProd(), 'нужен держатель лока отдельным соединением на хосте: test:hold-lock по SSH');
    test.describe.configure({ mode: 'serial' });

    test.beforeAll(async ({ browser }) => {
        const wasOn = runServerCommand(['test-mode', 'status']).stdout.includes('ON');

        if (!wasOn) {
            runServerCommand(['test-mode', 'on']);
            testModeWasOurs = true;
        }

        ctx = await newScopedContext(browser);
        const page = await ctx.newPage();
        await page.goto('/');
        await roleLogin(page, 'user');

        expertId = Number((await sql(`SELECT id FROM ${tn('accounts')} WHERE login = ?`, ['expert1@dev.test']))[0]?.id ?? 0);
        userId = Number((await sql(`SELECT id FROM ${tn('accounts')} WHERE login = ?`, ['testuser_setup_user@irabi.test']))[0]?.id ?? 0);
        expect(expertId).toBeGreaterThan(0);
        expect(userId).toBeGreaterThan(0);

        await syncCache(expertId);
        await syncCache(userId);

        // Денег покупателю — через журнал И кэш, чтобы они остались согласованы.
        await sql(
            `INSERT INTO ${tn('balance_ledger')}
             (account_id, is_credit, amount, entry_type, ref_type, ref_id, note, created_at)
             VALUES (?, 1, ?, 'top_up', '', 0, 'recalc-lock spec top-up', UNIX_TIMESTAMP())`,
            [userId, SLOT_COST * 2],
        );
        await syncCache(userId);

        const startAt = Math.floor(Date.now() / 1000) + 86400 * 9;
        const uid = [...Array(16)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
        const inserted: any = await sql(
            `INSERT INTO ${tn('time_slots')}
             (expert_id, start_at, end_at, duration_min, cost, is_online, location, max_users, status, uid, created_at)
             VALUES (?, ?, ?, 60, ?, 1, 'https://meet.example.com/recalc-lock', 1, 'free', ?, UNIX_TIMESTAMP())`,
            [expertId, startAt, startAt + 3600, SLOT_COST, uid],
        );
        slotId = Number((inserted as any).insertId ?? 0);

        if (!slotId) {
            slotId = Number((await sql(`SELECT id FROM ${tn('time_slots')} WHERE uid = ?`, [uid]))[0]?.id ?? 0);
        }
        expect(slotId).toBeGreaterThan(0);
    });

    test('бронь проходит, кэш эксперта отстаёт от журнала, и провал есть в логе', async () => {
        const page = ctx.pages()[0] ?? await ctx.newPage();

        // CSRF и адрес брони отдаёт сам продукт — тем же вызовом, каким их
        // берёт витрина слотов.
        const dataResp = await page.request.post('/slots/~bookData', { form: { slot_id: slotId } });
        expect(dataResp.status()).toBe(200);
        const data = await dataResp.json();
        expect(data.csrf).toBeTruthy();

        const expertCacheBefore = await cachedBalance(expertId);
        const expertLedgerBefore = await ledgerSum(expertId);
        expect(expertCacheBefore).toBe(expertLedgerBefore);

        // Держатель лока — на хосте, в фоне: nohup, чтобы он пережил закрытие
        // ssh-сессии, и пауза, чтобы GET_LOCK успел взяться до брони.
        const held = ssh(
            `nohup php garnet test:hold-lock ${q(`irabi_bal_${expertId}`)} ${HOLD_SECONDS} > WorkDir/hold-lock-spec.log 2>&1 &`
            + ' sleep 2; cat WorkDir/hold-lock-spec.log',
        );
        expect(held, `держатель лока не поднялся: ${held}`).toContain('HELD lock');

        const bookResp = await page.request.post(String(data.bookUrl ?? '/slots/~book'), {
            form: { CSRF_TOKEN: String(data.csrf), 'slot_ids[]': String(slotId) },
            timeout: 60000,
        });

        // 1. Бронь не страдает от того, что кэш пересчитать не удалось.
        expect(bookResp.status()).toBe(200);
        const booked = await bookResp.json();
        expect(booked.success).toBe(true);

        // 2. Журнал эксперту записан, а кэш — нет: то самое расхождение.
        expect(await ledgerSum(expertId)).toBe(expertLedgerBefore + SLOT_COST);
        expect(await cachedBalance(expertId)).toBe(expertCacheBefore);

        // 3. И об этом есть запись. Логгер дедуплицирует одинаковый текст до
        //    одной записи в день, поэтому утверждаем наличие, а не прирост.
        const logFile = `WorkDir/Logs/$(date +%F)/ERROR_LOGGER-${LOG_CAT}.log`;
        const logText = ssh(`cat ${logFile} 2>&1 || true`);
        expect(logText, `в ${logFile} нет записи о провале пересчёта:\n${logText}`)
            .toContain('SlotsController::post__book expert');
        expect(logText).toContain(String(expertId));
    });

    test.afterAll(async () => {
        if (slotId) {
            await sql(
                `DELETE FROM ${tn('balance_ledger')} WHERE ref_type = 'booking' AND ref_id IN
                 (SELECT id FROM ${tn('bookings')} WHERE bookable_type = 'time_slot' AND bookable_id = ?)`,
                [slotId],
            );
            await sql(`DELETE FROM ${tn('bookings')} WHERE bookable_type = 'time_slot' AND bookable_id = ?`, [slotId]);
            await sql(`DELETE FROM ${tn('time_slots')} WHERE id = ?`, [slotId]);
        }

        if (expertId) await syncCache(expertId);
        if (userId) await syncCache(userId);
        await ctx?.close();
        // Не оставлять за собой файл в WorkDir хоста.
        ssh('rm -f WorkDir/hold-lock-spec.log');

        if (testModeWasOurs) {
            runServerCommand(['test-mode', 'off']);
        }
    });
});
