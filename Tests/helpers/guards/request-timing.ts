/**
 * Request timing for failed tests: a green test prints nothing, a failed one (a timeout too)
 * prints one JSON report and attaches it to the test.
 *
 * The dev server pins every Playwright worker to ONE single-threaded `php -S` process
 * (`X-Test-Worker`), so a slow or leaked request blocks the next navigation of that worker.
 * A navigation that times out is then a symptom; the report names the cause: requests still
 * pending (with their age, also those left over from earlier tests) and the slowest finished ones.
 *
 * Listeners only read; nothing here waits, retries or changes what the test does.
 * Read it with: grep "\[request timing\]" in the run log.
 */
import type { BrowserContext, Request, TestInfo } from '@playwright/test';

interface Entry {
	method: string;
	path: string;
	type: string;
	startedAt: number;
	endedAt?: number;
	status?: number;
	failure?: string;
}

/** Newest requests of this worker process; a worker runs one test at a time. */
const BUFFER: Entry[] = [];
const BUFFER_LIMIT = 1000;
const BY_REQUEST = new WeakMap<Request, Entry>();
const TRACKED = new WeakSet<BrowserContext>();

function pathOf(url: string): string {
	try {
		return new URL(url).pathname;
	} catch {
		return url;
	}
}

/** Starts recording the requests of every page of the context. Idempotent. */
export function trackRequestTiming(ctx: BrowserContext): void {
	if (TRACKED.has(ctx)) return;
	TRACKED.add(ctx);

	ctx.on('request', (req) => {
		const entry: Entry = {
			method: req.method(),
			path: pathOf(req.url()),
			type: req.resourceType(),
			startedAt: Date.now(),
		};
		BY_REQUEST.set(req, entry);
		BUFFER.push(entry);
		if (BUFFER.length > BUFFER_LIMIT) BUFFER.shift();
	});
	ctx.on('response', (res) => {
		const entry = BY_REQUEST.get(res.request());
		if (entry) entry.status = res.status();
	});
	ctx.on('requestfinished', (req) => {
		const entry = BY_REQUEST.get(req);
		if (entry) entry.endedAt = Date.now();
	});
	ctx.on('requestfailed', (req) => {
		const entry = BY_REQUEST.get(req);
		if (!entry) return;
		entry.endedAt = Date.now();
		entry.failure = req.failure()?.errorText ?? 'failed';
	});
}

/**
 * Prints and attaches the request report when the test did not end as expected.
 * `since` is `Date.now()` taken before the test body: `testInfo.duration` is not the elapsed time at teardown.
 * A request still in flight when the page closes ends as `net::ERR_ABORTED`: a long one at the top of
 * `slowest` is the request the test was waiting for.
 */
export async function reportRequestTiming(testInfo: TestInfo, since: number): Promise<void> {
	if (testInfo.status === testInfo.expectedStatus) return;
	const now = Date.now();

	const pending = BUFFER.filter((e) => e.endedAt === undefined).map((e) => ({
		method: e.method,
		path: e.path,
		type: e.type,
		ageMs: now - e.startedAt,
		startedBeforeTest: e.startedAt < since,
	}));
	const finished = BUFFER.filter((e) => e.endedAt !== undefined && e.startedAt >= since - 1000);
	const slowest = finished
		.map((e) => ({
			method: e.method,
			path: e.path,
			type: e.type,
			durationMs: (e.endedAt ?? now) - e.startedAt,
			startedAtMs: e.startedAt - since,
			status: e.status,
			failure: e.failure,
		}))
		.sort((a, b) => b.durationMs - a.durationMs)
		.slice(0, 8);
	const failed = finished.filter((e) => e.failure).map((e) => ({ method: e.method, path: e.path, failure: e.failure }));

	const body = JSON.stringify(
		{
			test: testInfo.titlePath.join(' › '),
			status: testInfo.status,
			retry: testInfo.retry,
			worker: testInfo.workerIndex,
			durationMs: testInfo.duration,
			requestsSeen: finished.length + pending.length,
			pending,
			slowest,
			failed,
		},
		null,
		2,
	);
	await testInfo.attach('request-timing', { body, contentType: 'application/json' });
	process.stdout.write(`[request timing] ${body}\n`);
}
