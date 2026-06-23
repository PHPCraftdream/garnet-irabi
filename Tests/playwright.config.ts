import { defineConfig, devices } from '@playwright/test';
import * as path from 'node:path';

const baseURL = process.env.BASE_URL || 'http://localhost:8001';

// The harness now lives inside the app at `<app>/Tests/`. Point the DB
// helper (helpers/db.ts) and any CLI spawns at the app root unless the
// caller already supplied an explicit override. `__dirname` is this
// config's dir (`<app>/Tests`), so `..` is the app root.
if (!process.env.PW_APP_DIR) {
	process.env.PW_APP_DIR = path.resolve(__dirname, '..');
}

// Which Apps/<App>/Tests subtree the app-level projects glob into.
// Defaults to IRabi while it's the only app in the monorepo; override
// per-invocation: `PW_APP_NAME=MyApp npx playwright test`. The framework-
// level projects (specs/framework-bundle/, specs/admin.spec.ts) don't
// look at this — they live next to the config and ignore which app
// happens to be running on the server.
const APP_NAME = process.env.PW_APP_NAME ?? 'IRabi';

// Per-worker DB-prefix isolation is ON by default — every worker reads/
// writes its own `test_worker_${idx}_*` tables, so workers > 1 are
// race-free. Opt out with `PW_WORKER_ISOLATION=0` for the rare case
// where you really need to hit the legacy `db_*` tables (debugging
// against live data, comparing failure modes pre/post isolation).
const ISOLATION = process.env.PW_WORKER_ISOLATION !== '0';
const PIDX = process.env.TEST_PARALLEL_INDEX ?? '0';
function authState(role: string): string {
    return ISOLATION ? `.auth/${role}_w${PIDX}.json` : `.auth/${role}.json`;
}

// Setup projects run the per-role registration UI flow. Under isolation
// mode (the default) globalSetup does that work in bulk, so the project
// tests would just sit at `setup.skip(...)` and pollute the run summary
// with 5 unconditional skips. Conditionally drop them — and the matching
// dependencies on dependent projects — when isolation is on.
const setupDeps = (...names: string[]) => ISOLATION ? [] : names;

export default defineConfig({
	globalSetup:    './global-setup.ts',
	globalTeardown: './global-teardown.ts',
	// testDir is this Tests/ dir. App-role specs sit at the top level
	// (admin/, expert/, user/, …) and the framework-bundle specs under
	// specs/framework-bundle/. The testMatch globs below disambiguate.
	testDir: '.',
	// Per-file `mode: 'serial'` audit completed (#152). Every spec that relies on
	// shared beforeAll state (DB seeds, slot pre-creation, cross-test ID sharing)
	// now declares `test.describe.configure({ mode: 'serial' })` explicitly, so the
	// default can safely fan out. Files that are purely read-only or self-contained
	// are either `mode: 'parallel'` or have no configure call (inheriting this
	// default). Safe to flip from `false` to `true`.
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	// 1 retry locally (was 0) — under workers>1 + isolation a handful of
	// UI specs flake on toast-intercept, in-flight XHR races and similar
	// timing edges. Each one is a genuine timing bug that can be fixed
	// in the spec, but until they're individually addressed a single
	// retry hides the noise without masking real regressions (a real
	// bug fails both attempts).
	retries: process.env.CI ? 2 : 1,
	// Parallelism. Each worker gets its own DB scope
	// (test_worker_${idx}_*) via WorkerScopeMiddleware, so flag flips
	// and approval toggles on shared seed accounts can't race. Tune
	// via `PW_WORKERS=N` env var; drop to 1 for sequential debugging.
	//
	// Default 6: empirical sweet spot after #151+#152. Sweep at
	// PW_WORKERS={4,6,8,10,12,14,16} on a freshly restarted dev stack
	// (32 php-cgi workers, fullyParallel=true, shared template-login):
	//   4 → 174s wall, 581 passed (under-parallel, timeouts)
	//   6 → 127s wall, 600 passed         ← sweet spot
	//   8 → 129s wall, 598 passed (flake)
	//  10 → 129s wall, 599 passed (flake)
	//  12 → 135s wall, 600 passed
	//  14 → 140s wall, 600 passed
	//  16 → 164s wall, 600 passed
	// Pure test time (wall − setup) bottoms at 10–14 workers (~95s),
	// but setup time scales linearly with worker count (clone +
	// per-worker storageState fan-out) and eats the win above 8. Six
	// is both the fastest end-to-end and the most stable on this box.
	// Pair with `php garnet serve` default of 32 php-cgi workers so
	// the FastCGI pool absorbs burst load without saturating.
	workers: process.env.PW_WORKERS ? Number(process.env.PW_WORKERS) : 6,
	// Reporter: `list` only by default — fast progress in the terminal,
	// nothing written to disk. The HTML report is a few-MB
	// JSON-plus-rendering pass that we don't need on every local run,
	// so it's opt-in via `PW_HTML=1 npm test` or `npm run test:report`.
	reporter: process.env.PW_HTML === '1'
		? [['list'], ['html', { open: 'never' }]]
		: 'list',
	// 90s per-test cap (was 60s). Even with isolation, busy stretches
	// where all 6 workers hit the php-cgi pool at once leave individual
	// `expect(locator).toBeVisible` waiting longer than they would in
	// a sequential run.
	timeout: 90000,
	// Action/navigation defaults are 0 (= no timeout, falls back to the
	// per-test 90s cap). A misbehaving click then chews up 90 seconds
	// before the test gives up — and during that window the worker is
	// blocked. Cap at 10s/15s so flakes fail fast and the retry can
	// salvage the run. Per-call `{timeout: N}` overrides this for the
	// handful of places we genuinely need to wait longer (auth flows,
	// data-grid hydration).
	expect: { timeout: 5000 },
	use: {
		baseURL,
		trace: 'on-first-retry',
		screenshot: 'only-on-failure',
		// Video recording costs ~20s on a 600-test run because Playwright
		// captures the stream for every test (even on success — the
		// `retain-on-failure` mode just deletes successful videos
		// afterwards). Off by default; opt in with `PW_VIDEO=1 npm test`
		// or the `npm run test:video` shortcut when you actually need the
		// recording to debug a flake.
		video: process.env.PW_VIDEO === '1' ? 'retain-on-failure' : 'off',
		headless: process.env.HEADLESS !== 'false',
		actionTimeout: 10000,
		navigationTimeout: 15000,
		// Chromium tuning — these are all "stop doing things we don't
		// need in a test environment". No measurable wall-time win
		// individually, but they shave the per-worker browser startup
		// cost and remove background syncing/translation that can
		// race with the test's own JS.
		chromiumSandbox: false,
		launchOptions: {
			args: [
				'--disable-background-networking',
				'--disable-background-timer-throttling',
				'--disable-backgrounding-occluded-windows',
				'--disable-breakpad',
				'--disable-component-update',
				'--disable-default-apps',
				'--disable-extensions',
				'--disable-features=Translate,BackForwardCache',
				'--disable-ipc-flooding-protection',
				'--disable-renderer-backgrounding',
				'--disable-sync',
				'--metrics-recording-only',
				'--mute-audio',
				'--no-first-run',
				'--no-default-browser-check',
			],
		},
		// Tag every HTTP request the browser makes with the worker index
		// so the server-side WorkerScopeMiddleware swaps the DB prefix
		// to `test_worker_${idx}_*` for the lifetime of that request.
		// Server side is dev-gated regardless (env=dev + dev-dir check),
		// so the header is a no-op in production even if leaked. Opt out
		// with `PW_WORKER_ISOLATION=0` to drop back to legacy `db_*`.
		extraHTTPHeaders: ISOLATION ? {
			'X-Test-Worker': process.env.TEST_PARALLEL_INDEX ?? '0',
		} : {},
	},
	projects: [
		// ── Setup: register & authenticate each role once (legacy mode only) ──
		// Skipped wholesale under PW_WORKER_ISOLATION=1 (default) — globalSetup
		// handles registration + dev-login per worker there.
		...(ISOLATION ? [] : [
			{ name: 'setup:admin',     testMatch: `**/Tests/setup/admin.setup.ts` },
			{ name: 'setup:expert',    testMatch: `**/Tests/setup/expert.setup.ts` },
			{ name: 'setup:user',      testMatch: `**/Tests/setup/user.setup.ts` },
			{ name: 'setup:moderator', testMatch: `**/Tests/setup/moderator.setup.ts` },
			{ name: 'setup:owner',     testMatch: `**/Tests/setup/owner.setup.ts` },
		]),

		// ── IRabi single-role flows (use saved storageState) ──────────────────
		{
			name: 'admin-tests',
			testMatch: `**/Tests/admin/**/*.spec.ts`,
			dependencies: setupDeps('setup:admin', 'setup:moderator', 'setup:expert', 'setup:user'),
			use: {
				...devices['Desktop Chrome'],
				storageState: authState('admin'),
			},
		},
		{
			name: 'expert-tests',
			testMatch: `**/Tests/expert/**/*.spec.ts`,
			dependencies: setupDeps('setup:expert', 'setup:user'),
			use: {
				...devices['Desktop Chrome'],
				storageState: authState('expert'),
			},
		},
		{
			name: 'user-tests',
			testMatch: `**/Tests/user/**/*.spec.ts`,
			dependencies: setupDeps('setup:expert', 'setup:user'),
			use: {
				...devices['Desktop Chrome'],
				storageState: authState('user'),
			},
		},
		{
			name: 'moderator-tests',
			testMatch: `**/Tests/moderator/**/*.spec.ts`,
			dependencies: setupDeps('setup:moderator', 'setup:expert', 'setup:user'),
			use: {
				...devices['Desktop Chrome'],
				storageState: authState('moderator'),
			},
		},
		{
			name: 'owner-tests',
			testMatch: `**/Tests/owner/**/*.spec.ts`,
			dependencies: setupDeps('setup:owner', 'setup:moderator'),
			use: {
				...devices['Desktop Chrome'],
				storageState: authState('owner'),
			},
		},

		// ── IRabi cross-role: multiple contexts ───────────────────────────────
		{
			name: 'cross-role',
			testMatch: `**/Tests/cross-role/**/*.spec.ts`,
			dependencies: setupDeps('setup:admin', 'setup:expert', 'setup:user', 'setup:moderator', 'setup:owner'),
			use: { ...devices['Desktop Chrome'] },
		},

		// ── Framework core tests (no app coupling, framework primitives only) ─
		{
			name: 'framework-tests',
			testMatch: '**/Tests/specs/framework/**/*.spec.ts',
			use: { ...devices['Desktop Chrome'] },
		},

		// ── FrameworkBundle root tests (middleware integration, no UI auth) ──
		{
			name: 'framework-bundle-tests',
			testMatch: '**/Tests/specs/framework-bundle/*.spec.ts',
			use: { ...devices['Desktop Chrome'] },
		},

		// ── FrameworkBundle admin-UI tests (StaticPages, Logs, MailLog, …) ───
		{
			name: 'framework-bundle-admin-tests',
			testMatch: '**/Tests/specs/framework-bundle/admin/**/*.spec.ts',
			dependencies: setupDeps('setup:admin', 'setup:moderator', 'setup:expert', 'setup:user'),
			use: {
				...devices['Desktop Chrome'],
				storageState: authState('admin'),
			},
		},

		// ── FrameworkBundle cross-role tests (Support, Messaging full flow) ──
		{
			name: 'framework-bundle-cross-role-tests',
			testMatch: '**/Tests/specs/framework-bundle/cross-role/**/*.spec.ts',
			dependencies: setupDeps('setup:admin', 'setup:expert', 'setup:user', 'setup:moderator', 'setup:owner'),
			use: { ...devices['Desktop Chrome'] },
		},

		// ── IRabi top-level self-contained tests ──────────────────────────────
		{
			name: 'main-tests',
			testMatch: `**/Tests/*.spec.ts`,
			testIgnore: `**/Tests/user-flow.spec.ts`,
			use: { ...devices['Desktop Chrome'] },
		},
		{
			name: 'user-flow',
			testMatch: `**/Tests/user-flow.spec.ts`,
			dependencies: ['main-tests'],
			use: { ...devices['Desktop Chrome'] },
		},

		// ── Garnet admin panel (/__garnet/) ───────────────────────────────────
		{
			name: 'garnet-admin-tests',
			testMatch: '**/Tests/specs/admin.spec.ts',
			use: { ...devices['Desktop Chrome'] },
		},
	],
});
