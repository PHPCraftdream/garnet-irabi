import { Page, expect } from '@playwright/test';
import mysql from 'mysql2/promise';

import { tn } from './scoped-test';
import { DB as DB_CONFIG } from './db';

/**
 * Clear test data for a specific login, or all test data if no login provided.
 */
export async function clearTestData(login?: string) {
	const connection = await mysql.createConnection(DB_CONFIG);
	// Without an explicit login we wipe *test* accounts (irabi.test) but preserve
	// dev seed accounts (*@dev.test) which provide stable demo data for tests.
	const pattern = login ?? '%@irabi.test';
	const op = login ? '=' : 'LIKE';
	try {
		await connection.execute(
			`DELETE FROM ${tn('bookings')} WHERE user_id IN (SELECT id FROM ${tn('accounts')} WHERE login ${op} ?)`,
			[pattern]
		);
		await connection.execute(
			`DELETE FROM ${tn('balance_ledger')} WHERE account_id IN (SELECT id FROM ${tn('accounts')} WHERE login ${op} ?)`,
			[pattern]
		);
		await connection.execute(
			`DELETE FROM ${tn('account_balance')} WHERE account_id IN (SELECT id FROM ${tn('accounts')} WHERE login ${op} ?)`,
			[pattern]
		);
		await connection.execute(
			`DELETE FROM ${tn('time_slots')} WHERE expert_id IN (SELECT id FROM ${tn('accounts')} WHERE login ${op} ?)`,
			[pattern]
		);
		await connection.execute(
			`DELETE FROM ${tn('expert_profiles')} WHERE account_id IN (SELECT id FROM ${tn('accounts')} WHERE login ${op} ?)`,
			[pattern]
		);
		// Delete sessions belonging to test accounts
		try {
			const [sessionRows] = await connection.execute<any[]>(
				`SELECT DISTINCT s.id FROM ${tn('session')} s
				 JOIN ${tn('session_data')} sd ON sd.sessionId = s.id
				 WHERE sd.param = 'auth_login' AND sd.value ${op} ?`,
				[pattern]
			);
			if (sessionRows.length > 0) {
				const sessionIds = (sessionRows as any[]).map((r: any) => r.id);
				await connection.execute(
					`DELETE FROM ${tn('session_data')} WHERE sessionId IN (${sessionIds.map(() => '?').join(',')})`,
					sessionIds
				);
				await connection.execute(
					`DELETE FROM ${tn('session')} WHERE id IN (${sessionIds.map(() => '?').join(',')})`,
					sessionIds
				);
			}
		} catch (e) {
			console.log('Session cleanup warning:', (e as any)?.message);
		}
		await connection.execute(
			`DELETE ad FROM ${tn('accounts_data')} ad JOIN ${tn('accounts')} a ON a.id = ad.account_id WHERE a.login ${op} ?`,
			[pattern]
		);
		await connection.execute(
			`DELETE al FROM ${tn('admin_action_log')} al WHERE al.actor_login ${op} ? OR al.target_login ${op} ?`,
			[pattern, pattern]
		);
		await connection.execute(
			`DELETE FROM ${tn('invite_registrations')} WHERE account_id IN (SELECT id FROM ${tn('accounts')} WHERE login ${op} ?)`,
			[pattern]
		);
		await connection.execute(
			`DELETE FROM ${tn('invite_tokens')} WHERE label LIKE 'Test: %'`
		);
		await connection.execute(
			`DELETE FROM ${tn('accounts')} WHERE login ${op} ?`,
			[pattern]
		);
		console.log(login ? `Test data cleared for: ${login}` : 'All test data cleared');
	} catch (e) {
		console.error('Error clearing test data:', e);
	} finally {
		await connection.end();
	}
}

/**
 * Tick the 152-ФЗ PD-consent checkbox so the auth submit button enables.
 * The button stays disabled until BOTH `pdConsent` and `csrfReady` are
 * true — checking the box triggers the `start-session` POST that mints
 * the CSRF cookie. We wait for the submit button to become enabled,
 * which is the visible proof that the start-session round-trip
 * completed; otherwise the caller's next `waitForResponse(POST)` would
 * race against the in-flight start-session and capture it instead of
 * the real submit response.
 *
 * Use in specs that drive the email/magic-link flow manually rather
 * than via `registerAccount` / `loginAccount`, which already do this.
 */
export async function tickPdConsent(page: Page): Promise<void> {
	const consent = page.locator('[data-test-id="auth-consent-pd"]');
	if (!(await consent.isVisible({ timeout: 2000 }).catch(() => false))) {
		return;
	}
	if (!(await consent.isChecked())) {
		await consent.check();
	}
	// Drain the start-session round-trip — wait for the submit button to
	// become enabled. The caller's next waitForResponse(POST) will then
	// see the actual auth submit instead of the start-session response.
	const submitBtn = page.locator('[data-test-id="auth-submit-btn"]');
	await submitBtn.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
	const handle = await submitBtn.elementHandle();
	if (handle) {
		await page.waitForFunction(
			(el) => !(el as HTMLButtonElement).disabled,
			handle,
			{ timeout: 5000 },
		).catch(() => {});
	}
}

/**
 * Register or login via email (dev mode: .test emails auto-authenticate).
 * Creates a one-time invite token in DB, then navigates to /first-step/token~{token}.
 */
export async function registerAccount(page: Page, login: string): Promise<void> {
	// Create a test invite token in DB for this registration
	const tokenStr = 'test_' + login.replace(/[@.]/g, '_') + '_' + Date.now();
	const connection = await mysql.createConnection(DB_CONFIG);
	try {
		await connection.execute(
			`INSERT INTO ${tn('invite_tokens')} (token, label, expires_at, max_uses, uses_left, is_disabled, created_at, created_by)
			 VALUES (?, ?, NULL, 1, 1, 0, UNIX_TIMESTAMP(), NULL)`,
			[tokenStr, `Test: ${login}`]
		);
	} finally {
		await connection.end();
	}

	// Start the registration from a pristine session. CRITICAL on the
	// single-scope prod run: a context can arrive here already carrying
	// another account's session cookie (e.g. a role's shared session). The
	// old approach clicked the UI logout button, which `closeAuthSession`s
	// the *current* session row — and if that row belongs to a shared role
	// (setup_expert), a later `clearTestData` deletes it outright, logging
	// that role out for the rest of the run. Clearing cookies instead makes
	// the server mint a BRAND-NEW session for this registration: we never
	// touch (hijack, log out, or delete) whatever session the context
	// happened to hold. Scope routing is header-based (X-Test-Worker +
	// run-test-garnet-team), not cookie-based, so it survives the clear.
	await page.context().clearCookies();

	// Note: no `waitForLoadState('networkidle')` after `goto` here — `expect(loginInput)`
	// below already polls up to 20s.
	await page.goto(`/first-step/token~${tokenStr}`);

	const loginInput = page.locator('[data-test-id="auth-login-input"]');
	await expect(loginInput).toBeVisible({ timeout: 20000 });
	await loginInput.fill(login);
	// 152-ФЗ consent gate: PD checkbox must be ticked before submit-btn enables
	// (see Auth2.tsx — `disabled = … || !pdConsent || !csrfReady`).
	await page.locator('[data-test-id="auth-consent-pd"]').check();
	const submitBtn = page.locator('[data-test-id="auth-submit-btn"]');
	await expect(submitBtn).toBeEnabled({ timeout: 5000 });
	await submitBtn.click();

	// Dev .test emails auto-authenticate via AJAX (goTo with pushState).
	// Wait until auth form disappears (auth-submit-btn gone = auth complete).
	await page.waitForFunction(
		() => document.querySelector('[data-test-id="auth-submit-btn"]') === null,
		{ timeout: 30000 }
	);

	// Do a full navigation to / to ensure React mounts cleanly (not via pushState AJAX).
	// Caller is responsible for waiting on the next thing it needs (a locator,
	// an expect, …). Stripping the unconditional `networkidle` here saves ~500ms
	// per registration before the caller's first polling action.
	await page.goto('/');
	console.log(`Registration successful for ${login}`);
}

/**
 * Login via email (dev mode: .test emails auto-authenticate).
 */
export async function loginAccount(page: Page, login: string): Promise<void> {
	await page.goto('/');

	const loginInput = page.locator('[data-test-id="auth-login-input"]');
	await expect(loginInput).toBeVisible({ timeout: 20000 });
	await loginInput.fill(login);
	// 152-ФЗ consent gate: PD checkbox must be ticked before submit-btn enables.
	await page.locator('[data-test-id="auth-consent-pd"]').check();
	const submitBtn = page.locator('[data-test-id="auth-submit-btn"]');
	await expect(submitBtn).toBeEnabled({ timeout: 5000 });
	await submitBtn.click();

	await page.waitForFunction(
		() => document.querySelector('[data-test-id="auth-submit-btn"]') === null,
		{ timeout: 30000 }
	);
	await page.goto('/');
	await page.waitForLoadState('networkidle');
	console.log(`Login successful for ${login}`);
}

/**
 * Save the post-registration profile via direct DB update.
 * Account::fromSession() re-reads from DB on every request, so a direct UPDATE
 * is immediately reflected on the next page navigation.
 */
export async function fillProfileForm(
	page: Page,
	login: string,
	options: {
		name: string;
		accountType: 'user' | 'expert';
		timezone?: string;
	}
): Promise<void> {
	// Retry up to 5 times with 1s delay in case the account hasn't been committed yet
	// (the PHP server's async INSERT may not be visible immediately after registration)
	let affectedRows = 0;
	for (let attempt = 1; attempt <= 5; attempt++) {
		const connection = await mysql.createConnection(DB_CONFIG);
		try {
			const [result]: any = await connection.execute(
				`UPDATE ${tn('accounts')} SET name = ?, type = ?, time_zone = ? WHERE login = ?`,
				[options.name, options.accountType, options.timezone ?? 'UTC', login]
			);
			affectedRows = result.affectedRows;
			console.log(`Profile updated in DB for ${login}: affectedRows=${affectedRows}, name=${options.name} (attempt ${attempt})`);
		} finally {
			await connection.end();
		}
		if (affectedRows > 0) break;
		if (attempt < 5) {
			console.log(`Account not found yet for ${login}, retrying in 1s...`);
			await new Promise(resolve => setTimeout(resolve, 1000));
		}
	}
	if (affectedRows === 0) {
		throw new Error(`No rows updated for login=${login} — account not found in DB after 5 attempts`);
	}

	// Reload — Account::fromSession() re-reads from DB, so name is now set.
	// No `networkidle` between `goto` and the assertion below — the
	// `not.toBeVisible({timeout:10000})` already polls for the form's
	// absence, so any 500ms idle wait first is dead weight.
	await page.goto('/');
	await expect(page.locator('[data-test-id="form-save-btn"]')).not.toBeVisible({ timeout: 10000 });
	console.log('Profile form saved successfully');
}
