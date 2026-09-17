/**
 * D-164: investigated as a suspected "major" bug — an already-used
 * (single-use) invite link supposedly shows the ordinary registration form
 * instead of explaining the link is spent. The persona's own reproduction
 * token, checked directly against production, turned out to have
 * `uses_left = 1` and ZERO rows in `invite_registrations`: nobody had ever
 * actually completed a registration through it — the finding conflated
 * "I've visited this link before" with "this link has been consumed". A
 * genuinely exhausted token (uses_left = 0), tested directly, already
 * renders the correct error page — `RegisterController::renderError()` maps
 * `FwInviteTokenService::validate()`'s 'exhausted' reason straight to
 * `Invite_Error_Exhausted` (WorkDir/uat-defects.md has the full writeup).
 *
 * This is not a fix — there was nothing to fix. This test locks the
 * already-correct behaviour in place so a real future regression here
 * doesn't get lost in the noise of a closed "not a bug" ticket.
 */
import { test, expect, tn } from '../helpers/scoped-test';
import { newScopedContext } from '../helpers/scoped-test';
import { withConnection } from '../helpers/db/db';

function generateToken(): string {
	return [...Array(32)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
}

async function createToken(usesLeft: number): Promise<string> {
	const token = generateToken();
	await withConnection(async (c) => {
		await c.execute(
			`INSERT INTO ${tn('invite_tokens')} (token, uses_left, is_disabled, expires_at, account_type, created_at, created_by)
			 VALUES (?, ?, 0, NULL, 'user', UNIX_TIMESTAMP(), 1)`,
			[token, usesLeft],
		);
	});
	return token;
}

async function deleteToken(token: string): Promise<void> {
	await withConnection(async (c) => {
		await c.execute(`DELETE FROM ${tn('invite_tokens')} WHERE token = ?`, [token]);
	});
}

test.describe('D-164 (not a bug): the invite-link error path correctly tells exhausted from valid', () => {
	let freshToken = '';
	let exhaustedToken = '';

	test.beforeAll(async () => {
		freshToken = await createToken(1);
		exhaustedToken = await createToken(0);
	});

	test.afterAll(async () => {
		await deleteToken(freshToken);
		await deleteToken(exhaustedToken);
	});

	test('a token with a use remaining shows the registration form, not an error', async ({ browser }) => {
		const context = await newScopedContext(browser);
		try {
			const page = await context.newPage();
			await page.goto(`/system/first-step/token~${freshToken}`);

			await expect(page.locator('[data-test-id="auth-submit-btn"]')).toBeVisible({ timeout: 15000 });
			await expect(page.locator('[data-test-id="invite-error"]')).toHaveCount(0);
		} finally {
			await context.close();
		}
	});

	test('an exhausted token (uses_left=0) shows the invite-error page, not the form', async ({ browser }) => {
		const context = await newScopedContext(browser);
		try {
			const page = await context.newPage();
			await page.goto(`/system/first-step/token~${exhaustedToken}`);

			await expect(page.locator('[data-test-id="invite-error"]')).toBeVisible({ timeout: 15000 });
			await expect(page.getByText('Лимит регистраций по этой ссылке исчерпан.')).toBeVisible();
			await expect(page.locator('[data-test-id="auth-submit-btn"]')).toHaveCount(0);
		} finally {
			await context.close();
		}
	});

	test('the SAME token flips from form to error the moment its last use is consumed', async ({ browser }) => {
		const context = await newScopedContext(browser);
		try {
			const page = await context.newPage();

			// Before: one use left, shows the form (exactly the state the
			// original D-164 report's token was actually in — and mistook for "used").
			await page.goto(`/system/first-step/token~${freshToken}`);
			await expect(page.locator('[data-test-id="auth-submit-btn"]')).toBeVisible({ timeout: 15000 });

			// Simulates FwInviteTokenService::consume()'s effect (the CAS
			// decrement) without driving the full email-code registration flow.
			await withConnection(async (c) => {
				await c.execute(`UPDATE ${tn('invite_tokens')} SET uses_left = 0 WHERE token = ?`, [freshToken]);
			});

			// After: same URL, now correctly refuses with the exhausted reason.
			await page.goto(`/system/first-step/token~${freshToken}`);
			await expect(page.locator('[data-test-id="invite-error"]')).toBeVisible({ timeout: 15000 });
			await expect(page.locator('[data-test-id="auth-submit-btn"]')).toHaveCount(0);
		} finally {
			await context.close();
		}
	});
});
