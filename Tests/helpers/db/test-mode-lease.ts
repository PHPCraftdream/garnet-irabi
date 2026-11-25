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

const BASE = path.join(os.tmpdir(), 'irabi-test-mode-lease');
const LOCK = `${BASE}.lock`;
const STATE = `${BASE}.json`;
const LOCK_TIMEOUT_MS = 60_000;
const STALE_LEASE_MS = 2 * 60 * 60 * 1000;

interface Lease {
    holders: number;
    wasOn: boolean;
    touched: number;
}

const sleep = (ms: number): void => {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
};

/** Межпроцессная блокировка через атомарное создание каталога. */
function withLock<T>(action: () => T): T {
    const deadline = Date.now() + LOCK_TIMEOUT_MS;
    for (;;) {
        try {
            fs.mkdirSync(LOCK);
            break;
        } catch {
            if (Date.now() > deadline) fs.rmSync(LOCK, { recursive: true, force: true });
            else sleep(50);
        }
    }
    try {
        return action();
    } finally {
        fs.rmSync(LOCK, { recursive: true, force: true });
    }
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
    withLock(() => {
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
    withLock(() => {
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
