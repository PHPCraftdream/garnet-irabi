/**
 * Межпроцессный мьютекс воркеров на атомарном создании каталога во временной папке.
 *
 * Нужен там, где серверный ресурс один на всех воркеров, а не на воркера: именованные
 * блокировки MySQL (`GET_LOCK`) действуют на весь сервер и не знают о префиксе таблиц воркера,
 * поэтому два одновременных прогона одной cron-задачи из разных воркеров отказывают друг другу
 * («previous run still active»). Внутри одного процесса вход повторный: вложенный захват того же
 * имени только считает глубину.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const LOCK_TIMEOUT_MS = 60_000;
const depths = new Map<string, number>();

const sleep = (ms: number): void => {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
};

const lockPath = (name: string): string => path.join(os.tmpdir(), `${name}.lock`);

/** Берёт мьютекс; занятый дольше таймаута считается брошенным упавшим процессом. */
export function acquireProcessLock(name: string): void {
    const depth = depths.get(name) ?? 0;
    depths.set(name, depth + 1);
    if (depth > 0) return;
    const deadline = Date.now() + LOCK_TIMEOUT_MS;
    for (;;) {
        try {
            fs.mkdirSync(lockPath(name));
            return;
        } catch {
            if (Date.now() > deadline) fs.rmSync(lockPath(name), { recursive: true, force: true });
            else sleep(50);
        }
    }
}

/** Отдаёт мьютекс; каталог убирает самый внешний владелец. */
export function releaseProcessLock(name: string): void {
    const depth = (depths.get(name) ?? 1) - 1;
    if (depth > 0) {
        depths.set(name, depth);
        return;
    }
    depths.delete(name);
    fs.rmSync(lockPath(name), { recursive: true, force: true });
}

export function withProcessLock<T>(name: string, action: () => T): T {
    acquireProcessLock(name);
    try {
        return action();
    } finally {
        releaseProcessLock(name);
    }
}

/**
 * Общий и исключительный доступ между воркерами. Тест, который меняет общее для всех воркеров
 * состояние (файл конфигурации сервера), берёт исключительный доступ: новые тесты других воркеров
 * ждут у входа, идущие дорабатывают, и только потом состояние меняется. Каждый тест берёт общий
 * доступ автоматически (base-test). Протухшие записи (упавший воркер) игнорируются.
 */
export const EXCLUSIVE_RUN_LOCK = 'irabi-exclusive-run';

const STALE_MS = 10 * 60_000;
let exclusiveHeld = false;

const partPath = (name: string, part: string): string => path.join(os.tmpdir(), `${name}.${part}`);

function writerActive(name: string): boolean {
    try {
        return Date.now() - fs.statSync(partPath(name, 'writer')).mtimeMs < STALE_MS;
    } catch {
        return false;
    }
}

function liveReaders(name: string): number {
    const dir = partPath(name, 'readers');
    try {
        return fs.readdirSync(dir).filter((entry) => Date.now() - fs.statSync(path.join(dir, entry)).mtimeMs < STALE_MS).length;
    } catch {
        return 0;
    }
}

/** Берёт общий доступ и возвращает метку для releaseShared; владелец исключительного проходит сразу. */
export function acquireShared(name: string): string | null {
    if (exclusiveHeld) return null;
    const dir = partPath(name, 'readers');
    fs.mkdirSync(dir, { recursive: true });
    const token = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const deadline = Date.now() + 2 * LOCK_TIMEOUT_MS;
    for (;;) {
        if (!writerActive(name)) {
            fs.writeFileSync(path.join(dir, token), '');
            // Писатель мог встать между проверкой и записью: тогда уступаем ему.
            if (!writerActive(name)) return token;
            fs.rmSync(path.join(dir, token), { force: true });
        }
        if (Date.now() > deadline) return null;
        sleep(50);
    }
}

export function releaseShared(name: string, token: string | null): void {
    if (token) fs.rmSync(path.join(partPath(name, 'readers'), token), { force: true });
}

/** Берёт исключительный доступ: закрывает вход новым тестам и ждёт, пока идущие закончат. */
export function acquireExclusive(name: string): void {
    acquireProcessLock(`${name}-writers`);
    fs.mkdirSync(partPath(name, 'writer'), { recursive: true });
    exclusiveHeld = true;
    const deadline = Date.now() + 2 * LOCK_TIMEOUT_MS;
    while (liveReaders(name) > 0 && Date.now() < deadline) sleep(50);
}

export function releaseExclusive(name: string): void {
    exclusiveHeld = false;
    fs.rmSync(partPath(name, 'writer'), { recursive: true, force: true });
    releaseProcessLock(`${name}-writers`);
}
