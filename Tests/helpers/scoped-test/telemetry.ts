/**
 * Учёт создаваемых контекстов: их цена заметна в прогоне.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// ── Browser-context telemetry ────────────────────────────────────────────────
//
// Every BrowserContext creation is an opportunity to overpay: ~150-250ms per
// context, ~63 newScopedContext + ~37 _sharedContext = ~100/run at our last
// measurement. Append one JSONL line per creation to a per-worker file;
// global-teardown.ts aggregates and prints a summary at the end of the run.
// Opt out with PW_CTX_TELEMETRY=0 if it ever gets in the way.
//
// Files land under tests/.ctx-stats/worker-{idx}.jsonl, cleared at the
// start of every run by global-setup.ts.
export const CTX_STATS_DIR = path.resolve(__dirname, '..', '..', '.ctx-stats');
export function recordCtxEvent(kind: string, project?: string): void {
    if (process.env.PW_CTX_TELEMETRY === '0') return;
    try {
        fs.mkdirSync(CTX_STATS_DIR, { recursive: true });
        const idx = process.env.TEST_PARALLEL_INDEX ?? '0';
        fs.appendFileSync(
            path.join(CTX_STATS_DIR, `worker-${idx}.jsonl`),
            JSON.stringify({ kind, project: project ?? null, ts: Date.now() }) + '\n',
        );
    } catch { /* best-effort, never block a test on telemetry */ }
}
