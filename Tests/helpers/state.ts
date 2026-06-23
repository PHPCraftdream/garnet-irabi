import fs from 'fs';
import path from 'path';

const AUTH_DIR = path.join(__dirname, '../.auth');

export interface UserMeta {
	login: string;
}

export function saveUserMeta(role: string, meta: UserMeta) {
	fs.mkdirSync(AUTH_DIR, { recursive: true });
	fs.writeFileSync(path.join(AUTH_DIR, `${role}.meta.json`), JSON.stringify(meta, null, 2));
}

export function loadUserMeta(role: string): UserMeta {
	return JSON.parse(fs.readFileSync(path.join(AUTH_DIR, `${role}.meta.json`), 'utf-8'));
}

export function storageStatePath(role: string, workerIndex?: number): string {
	if (workerIndex !== undefined) {
		return path.join(AUTH_DIR, `${role}_w${workerIndex}.json`);
	}
	return path.join(AUTH_DIR, `${role}.json`);
}

export function hasStorageState(role: string, workerIndex?: number): boolean {
	return fs.existsSync(storageStatePath(role, workerIndex));
}

/**
 * Resolve the right storage state file for the current worker context.
 * In isolation mode each worker has its own auth state; otherwise the
 * legacy single-state-per-role file is used.
 */
export function resolveStorageStatePath(role: string): string {
	if (process.env.PW_WORKER_ISOLATION !== '0') {
		const idx = process.env.TEST_PARALLEL_INDEX ?? '0';
		return storageStatePath(role, parseInt(idx, 10));
	}
	return storageStatePath(role);
}
