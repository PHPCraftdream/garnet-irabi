/**
 * Общая аренда маркера режима тестирования для параллельных воркеров.
 *
 * Маркер один на приложение, а специи включают его в beforeAll и выключают в
 * afterAll, «если включили мы». Два воркера с такими специями гоняются:
 * первый увидел «выключен», включил; второй увидел «включён» и не стал
 * владельцем; первый закончил и выключил маркер под вторым — команда второго
 * падает с «доступен только в режиме тестирования». Здесь маркер включает
 * первый арендатор, а выключает последний, и только если до первого он был
 * выключен.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runServerCommand } from './server-command';
import { withProcessLock } from './process-lock';

const LOCK_NAME = 'irabi-test-mode-lease';
const BASE = path.join(os.tmpdir(), LOCK_NAME);
const STATE = `${BASE}.json`;
const STALE_LEASE_MS = 2 * 60 * 60 * 1000;

interface Lease {
    holders: number;
    wasOn: boolean;
    touched: number;
}

function readLease(): Lease | null {
    try {
        return JSON.parse(fs.readFileSync(STATE, 'utf8')) as Lease;
    } catch {
        return null;
    }
}

/** Берёт аренду: первый арендатор включает маркер, если он был выключен. */
export function acquireTestMode(): void {
    withProcessLock(LOCK_NAME, () => {
        let lease = readLease();
        if (!lease || lease.holders <= 0 || Date.now() - lease.touched > STALE_LEASE_MS) {
            const wasOn = runServerCommand(['test-mode', 'status']).stdout.includes('ON');
            if (!wasOn) runServerCommand(['test-mode', 'on']);
            lease = { holders: 0, wasOn, touched: Date.now() };
        }
        lease.holders++;
        lease.touched = Date.now();
        fs.writeFileSync(STATE, JSON.stringify(lease));
    });
}

/** Отдаёт аренду: последний арендатор возвращает маркер в исходное состояние. */
export function releaseTestMode(): void {
    withProcessLock(LOCK_NAME, () => {
        const lease = readLease();
        if (!lease) return;
        lease.holders--;
        if (lease.holders > 0) {
            fs.writeFileSync(STATE, JSON.stringify(lease));
            return;
        }
        if (!lease.wasOn) runServerCommand(['test-mode', 'off']);
        fs.rmSync(STATE, { force: true });
    });
}
