/**
 * Prod globalTeardown — intentionally minimal.
 *
 * The remote scope (tables, token, uploads) is torn down by
 * `php garnet test:remote` via SSH after the Playwright process exits, so
 * there is nothing to drop from here. We only clean up the local per-role
 * storageState files so a stale session from this run can't be reused by a
 * later local run by mistake.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

export default async function globalTeardown(): Promise<void> {
    const authDir = path.resolve(__dirname, '.auth');
    for (const role of ['admin', 'expert', 'user', 'moderator', 'owner', 'expert-moderator', 'expert-admin']) {
        try {
            fs.rmSync(path.join(authDir, `${role}_w0.json`), { force: true });
        } catch { /* best-effort */ }
    }
    console.log('[prod-teardown] local prod storageState cleared (remote scope dropped by test:remote)');
}
