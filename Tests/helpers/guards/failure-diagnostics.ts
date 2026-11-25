/**
 * Failure diagnostics for flaky specs: a green run prints nothing, a failed one
 * (including a timeout) prints one JSON report and attaches it to the test.
 *
 * Probes only read. A failing probe lands in the report as `probeError`; it never
 * throws, never waits and never changes what the test did.
 *
 * Use:
 *   const diag = createDiagnostics(async () => ({ balance: await getBalance(LOGIN) }));
 *   test.beforeEach(() => diag.reset());
 *   test.afterEach(async ({}, testInfo) => { await diag.report(testInfo); });
 *   diag.note('click', { at: 'before flag' });
 *
 * Read it with: grep "\[failure diagnostics\]" in the run log.
 */
import type { TestInfo } from '@playwright/test';

interface Entry {
	atMs: number;
	label: string;
	value: unknown;
}

export interface Diagnostics {
	/** Starts a clean record for the next test. */
	reset(): void;
	/** Adds a labelled measurement stamped with the time since `reset()`. */
	note(label: string, value: unknown): void;
	/** Prints and attaches the record when the test did not end as expected. */
	report(testInfo: TestInfo): Promise<void>;
}

export function createDiagnostics(probe?: () => Promise<Record<string, unknown>>): Diagnostics {
	let entries: Entry[] = [];
	let startedAt = performance.now();

	return {
		reset(): void {
			entries = [];
			startedAt = performance.now();
		},
		note(label: string, value: unknown): void {
			entries.push({ atMs: Math.round(performance.now() - startedAt), label, value });
		},
		async report(testInfo: TestInfo): Promise<void> {
			if (testInfo.status === testInfo.expectedStatus) return;
			let state: Record<string, unknown> = {};
			if (probe) {
				try {
					state = await probe();
				} catch (error) {
					state = { probeError: String(error) };
				}
			}
			const body = JSON.stringify(
				{
					test: testInfo.titlePath.join(' › '),
					status: testInfo.status,
					retry: testInfo.retry,
					worker: testInfo.workerIndex,
					durationMs: testInfo.duration,
					entries,
					state,
				},
				null,
				2,
			);
			await testInfo.attach('failure-diagnostics', { body, contentType: 'application/json' });
			process.stdout.write(`[failure diagnostics] ${body}\n`);
		},
	};
}
