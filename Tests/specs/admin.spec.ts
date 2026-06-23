import { test, expect } from '../helpers/scoped-test';
import type { Page, BrowserContext } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

import { newScopedContext } from '../helpers/scoped-test';
test.describe.configure({ mode: 'serial' });

// The Garnet Admin console (`/__garnet/`) is a LOCAL dev tool: it's gated by a
// `.garnet_admin` token file on the dev machine and a `localhost`-scoped
// cookie, and the route isn't enabled on a deployed box (it 404s there). The
// whole suite is meaningless against an external server — skip on PW_PROD.
// Applied per-describe (see SKIP_ON_PROD calls) so the describe's own
// beforeEach/afterEach don't run either — a module-level beforeEach skip would
// still let afterEach fire with an undefined context and crash.
const SKIP_ON_PROD = () =>
	test.skip(process.env.PW_PROD === '1', 'local-only: /__garnet/ admin console is a dev tool, absent on the remote box');

const GARNET_ROOT = process.env.GARNET_ROOT || path.resolve(__dirname, '../../');
const TOKEN_FILE = path.join(GARNET_ROOT, '.garnet_admin');
const TEST_TOKEN = 'deadbeef1234567890abcdef12345678';

function writeActiveToken(token: string = TEST_TOKEN) {
	fs.writeFileSync(TOKEN_FILE, JSON.stringify({
		token,
		status: 'active',
		created: Math.floor(Date.now() / 1000),
	}, null, 2));
}

function writePendingToken(token: string = TEST_TOKEN) {
	fs.writeFileSync(TOKEN_FILE, JSON.stringify({
		token,
		status: 'pending',
		created: Math.floor(Date.now() / 1000),
	}, null, 2));
}

function removeTokenFile() {
	if (fs.existsSync(TOKEN_FILE)) fs.unlinkSync(TOKEN_FILE);
}

async function loginAsAdmin(page: Page) {
	writeActiveToken();
	await page.context().addCookies([{
		name: 'garnet_admin',
		value: TEST_TOKEN,
		domain: 'localhost',
		path: '/',
		httpOnly: true,
		sameSite: 'Lax',
	}]);
}

// Helper: exact button by name
const btn = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

test.describe('Admin — unauthenticated', () => {
	SKIP_ON_PROD();
	test('shows login page without cookie', async ({ page }) => {
		removeTokenFile();
		await page.goto('/__garnet/');
		await Promise.all([
			expect(page).toHaveTitle(/Garnet Admin/),
			expect(page.locator('text=php garnet admin')).toBeVisible(),
			expect(page.locator('h1', { hasText: 'Garnet Admin' })).toBeVisible(),
		]);
	});

	test('shows denied page for invalid token', async ({ page }) => {
		removeTokenFile();
		await page.goto(`/__garnet/?token=invalidtoken123`);
		await expect(page.locator('text=Access Denied')).toBeVisible();
	});

	test('shows denied page for already-used token', async ({ page }) => {
		// active status means already activated — re-activation should fail
		writeActiveToken();
		await page.goto(`/__garnet/?token=${TEST_TOKEN}`);
		await expect(page.locator('text=Access Denied')).toBeVisible();
	});

	test('activates pending token and redirects to dashboard', async ({ page }) => {
		writePendingToken();
		await page.goto(`/__garnet/?token=${TEST_TOKEN}`);
		// Should redirect to /__garnet/ with cookie set and show dashboard
		await page.waitForURL('**/__garnet/', { timeout: 5000 });
		await Promise.all([
			expect(page).toHaveTitle('Garnet Admin'),
			expect(page.locator('h1', { hasText: 'Garnet Admin' })).toBeVisible({ timeout: 10000 }),
		]);
	});
});

test.describe('Admin — dashboard UI', () => {
	SKIP_ON_PROD();
	// Shared context across this describe — read-only UI assertions against
	// the same dashboard render. The exec endpoint is stubbed at context level
	// so no test opens a real `php garnet` subprocess whose stream teardown
	// would churn the shared page (the benign SSE network error it emitted is
	// also allowlisted in console-guards). Each test resets via page.goto.
	let context: BrowserContext;
	let page: Page;

	test.beforeAll(async ({ browser }) => {
		context = await newScopedContext(browser);
		page = await context.newPage();
		await loginAsAdmin(page);
		await context.route('**/__garnet/api/exec*', route => route.fulfill({
			status: 200,
			contentType: 'text/event-stream',
			body: `event: done\ndata: 0\n\n`,
		}));
	});

	test.beforeEach(async () => {
		await page.goto('/__garnet/');
	});

	test.afterAll(async () => {
		await context.close();
		removeTokenFile();
	});

	test('dashboard renders header and title', async () => {
		await Promise.all([
			expect(page.locator('h1', { hasText: 'Garnet Admin' })).toBeVisible({ timeout: 10000 }),
			expect(btn(page, 'Logout')).toBeVisible({ timeout: 10000 }),
		]);
	});

	test('app switcher is visible with select and Switch button', async () => {
		const select = page.locator('select');
		await expect(select).toBeVisible({ timeout: 10000 });

		const switchBtn = btn(page, 'Switch');
		await Promise.all([
			expect(switchBtn).toBeVisible(),

		// Switch button disabled when current app already selected
			expect(switchBtn).toBeDisabled(),
		]);
	});

	test('command buttons are visible and enabled', async () => {
		await Promise.all([
			expect(btn(page, 'Build')).toBeVisible({ timeout: 10000 }),
			expect(btn(page, 'Build:Watch')).toBeVisible(),
			expect(btn(page, 'Prepare')).toBeVisible(),
			expect(btn(page, 'Migration')).toBeVisible(),
		]);

		await Promise.all([
			expect(btn(page, 'Build')).toBeEnabled(),
			expect(btn(page, 'Migration')).toBeEnabled(),
		]);
	});

	test('output terminal is visible with Clear button', async () => {
		await Promise.all([
			expect(page.locator('pre')).toBeVisible({ timeout: 10000 }),
			expect(btn(page, 'Clear')).toBeVisible(),
			expect(page.locator('h2', { hasText: 'Output' })).toBeVisible(),
		]);
	});

	test('Clear button empties the terminal', async () => {
		await page.route('/__garnet/api/exec*', async route => {
			await route.fulfill({
				status: 200,
				contentType: 'text/event-stream',
				body: `data: ${JSON.stringify('Hello output')}\n\nevent: done\ndata: 0\n\n`,
			});
		});

		await btn(page, 'Build').click();

		const pre = page.locator('pre');
		const before = await pre.innerText();
		expect(before.length).toBeGreaterThan(0);

		await btn(page, 'Clear').click();
		await expect(pre).toHaveText('');
	});

	test('Stop button not visible when idle', async () => {
		await expect(btn(page, 'Stop')).not.toBeVisible({ timeout: 5000 });
	});
});

test.describe('Admin — command execution', () => {
	SKIP_ON_PROD();
	let context: BrowserContext;
	let page: Page;

	test.beforeEach(async ({ browser }) => {
		context = await newScopedContext(browser);
		page = await context.newPage();
		await loginAsAdmin(page);
	});

	test.afterEach(async () => {
		await context.close();
	});

	test.afterAll(() => {
		removeTokenFile();
	});

	test('Build command sends SSE request and shows output', async () => {
		await page.route('/__garnet/api/exec*', async route => {
			const url = route.request().url();
			expect(url).toContain('cmd=build');
			await route.fulfill({
				status: 200,
				contentType: 'text/event-stream',
				body: `data: ${JSON.stringify('Building...')}\n\ndata: ${JSON.stringify('Done!')}\n\nevent: done\ndata: 0\n\n`,
			});
		});

		await page.goto('/__garnet/');
		await btn(page, 'Build').click({ timeout: 10000 });

		const pre = page.locator('pre');
		await Promise.all([
			expect(pre).toContainText('$ php garnet build', { timeout: 5000 }),
			expect(pre).toContainText('Building...', { timeout: 5000 }),
			expect(pre).toContainText('Done (exit 0)', { timeout: 5000 }),
		]);
	});

	test('Migration command sends correct cmd param', async () => {
		let capturedCmd = '';
		await page.route('/__garnet/api/exec*', async route => {
			const url = new URL(route.request().url());
			capturedCmd = url.searchParams.get('cmd') ?? '';
			await route.fulfill({
				status: 200,
				contentType: 'text/event-stream',
				body: `event: done\ndata: 0\n\n`,
			});
		});

		await page.goto('/__garnet/');
		await btn(page, 'Migration').click({ timeout: 10000 });

		// The click fires a fetch/EventSource asynchronously after the
		// handler returns. Under heavy parallel load the request may
		// still be in flight by the time `expect` runs — poll instead
		// of asserting synchronously.
		await expect.poll(() => capturedCmd, { timeout: 5000 }).toBe('migration');
	});

	test('Stop button appears while command runs and stops it', async () => {
		// Inject a fake EventSource that stays open indefinitely
		await page.addInitScript(() => {
			(window as any).__fakeEsSessions = [] as any[];
			const OriginalEventSource = window.EventSource;
			(window as any).EventSource = class FakeEventSource extends EventTarget {
				url: string;
				readyState = 0; // CONNECTING
				static CONNECTING = 0;
				static OPEN = 1;
				static CLOSED = 2;
				onmessage: ((e: MessageEvent) => void) | null = null;
				onerror: ((e: Event) => void) | null = null;
				onopen: ((e: Event) => void) | null = null;

				constructor(url: string) {
					super();
					this.url = url;
					(window as any).__fakeEsSessions.push(this);
					// Simulate open
					setTimeout(() => {
						this.readyState = 1;
						const e = new Event('open');
						if (this.onopen) this.onopen(e);
						// Send one data event
						const msg = new MessageEvent('message', { data: JSON.stringify('Running...') });
						if (this.onmessage) this.onmessage(msg);
					}, 50);
				}

				close() {
					this.readyState = 2;
				}

				addEventListener(type: string, listener: any) {
					super.addEventListener(type, listener);
				}
			};
		});

		await page.goto('/__garnet/');
		const buildBtn = btn(page, 'Build');
		await buildBtn.click({ timeout: 10000 });

		// Stop button appears because isRunning = true
		const stopBtn = btn(page, 'Stop');
		await Promise.all([
			expect(stopBtn).toBeVisible({ timeout: 3000 }),

		// Command buttons are disabled while running
			expect(buildBtn).toBeDisabled(),
		]);
		await stopBtn.click();

		// Stop button disappears after stopping
		await Promise.all([
			expect(stopBtn).not.toBeVisible({ timeout: 3000 }),

		// Command buttons re-enabled
			expect(buildBtn).toBeEnabled({ timeout: 3000 }),

		// Output shows stopped message
			expect(page.locator('pre')).toContainText('Stopped'),
		]);
	});

	test('running new command replaces previous output', async () => {
		await page.route('/__garnet/api/exec*', async route => {
			const url = new URL(route.request().url());
			const cmd = url.searchParams.get('cmd') ?? '';
			await route.fulfill({
				status: 200,
				contentType: 'text/event-stream',
				body: `data: ${JSON.stringify(`output-of-${cmd}`)}\n\nevent: done\ndata: 0\n\n`,
			});
		});

		await page.goto('/__garnet/');

		await btn(page, 'Build').click({ timeout: 10000 });
		await expect(page.locator('pre')).toContainText('output-of-build', { timeout: 5000 });

		await btn(page, 'Prepare').click({ timeout: 10000 });
		await Promise.all([
			expect(page.locator('pre')).toContainText('$ php garnet prepare', { timeout: 5000 }),
		// Old output replaced
			expect(page.locator('pre')).not.toContainText('output-of-build'),
		]);
	});
});

test.describe('Admin — app switching', () => {
	SKIP_ON_PROD();
	let context: BrowserContext;
	let page: Page;

	test.beforeEach(async ({ browser }) => {
		context = await newScopedContext(browser);
		page = await context.newPage();
		await loginAsAdmin(page);
		await page.goto('/__garnet/');
	});

	test.afterEach(async () => {
		await context.close();
	});

	test.afterAll(() => {
		removeTokenFile();
	});

	test('Switch button enabled after selecting different app', async () => {
		const select = page.locator('select');
		await expect(select).toBeVisible({ timeout: 10000 });

		const options = await select.locator('option').all();
		if (options.length < 2) {
			test.skip();
			return;
		}

		const currentValue = await select.inputValue();
		const allValues = await Promise.all(options.map(o => o.getAttribute('value')));
		const otherValue = allValues.find(v => v !== currentValue);
		if (!otherValue) {
			test.skip();
			return;
		}

		await select.selectOption(otherValue);
		await expect(btn(page, 'Switch')).toBeEnabled();
	});

	test('Switch app calls API and shows confirmation', async () => {
		const select = page.locator('select');
		await expect(select).toBeVisible({ timeout: 10000 });

		const options = await select.locator('option').all();
		if (options.length < 2) {
			test.skip();
			return;
		}

		await page.route('/__garnet/api/app-use', async route => {
			const body = JSON.parse(route.request().postData() ?? '{}');
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ ok: true, app: body.app }),
			});
		});

		const currentValue = await select.inputValue();
		const allValues = await Promise.all(options.map(o => o.getAttribute('value')));
		const otherValue = allValues.find(v => v !== currentValue);
		if (!otherValue) {
			test.skip();
			return;
		}

		await select.selectOption(otherValue);
		await btn(page, 'Switch').click();

		await Promise.all([
			expect(page.locator('pre')).toContainText(`Switched to: ${otherValue}`, { timeout: 5000 }),
			expect(btn(page, 'Switch')).toBeDisabled({ timeout: 3000 }),
		]);
	});
});

test.describe('Admin — logout', () => {
	SKIP_ON_PROD();
	test('logout redirects to login page', async ({ page }) => {
		await loginAsAdmin(page);
		await page.goto('/__garnet/');

		await expect(btn(page, 'Logout')).toBeVisible({ timeout: 10000 });
		await btn(page, 'Logout').click();

		await page.waitForURL('**/__garnet/', { timeout: 5000 });
		await expect(page.locator('text=php garnet admin')).toBeVisible({ timeout: 5000 });

		removeTokenFile();
	});

	test('API returns 401 after logout', async ({ page }) => {
		await loginAsAdmin(page);

		// Delete the token file to simulate missing auth
		removeTokenFile();

		const response = await page.request.get('/__garnet/api/status');
		expect(response.status()).toBe(401);
	});
});
