/**
 * Task #54 — expert public-profile editing (audit 16-feature-completeness, §3.2).
 *
 * Covers the new /expert/~profile GET/POST endpoints:
 *   1. GET renders the edit form (display_name / specialization / bio).
 *   2. POST persists the three fields to expert_profiles for the CURRENT expert.
 *   3. The public page /expert/id~N reflects the saved values automatically
 *      (same ExpertProfiles source — no change to the public component).
 *   4. Validation: empty display_name → 400; oversized bio/specialization → 400.
 *   5. Unapproved expert: GET 200 (page reachable, like ~slots), POST 403
 *      (mayMutate defense-in-depth — same invariant as every other mutating
 *      /expert/~* endpoint, security audit A-02).
 *
 * The expert-tests project authenticates the `page` fixture as the seeded
 * expert (testuser_setup_expert@irabi.test) via storageState, so no explicit
 * login is needed.
 */
import { test, expect, tn } from '../helpers/scoped-test';
import { withConnection } from '../helpers/db';
import type { Page } from '@playwright/test';

const EXPERT_LOGIN = 'testuser_setup_expert@irabi.test';

interface ProfileRow {
    display_name: string;
    bio: string;
    specialization: string;
}

async function getExpertId(): Promise<number> {
    return withConnection(async (c) => {
        const [rows] = await c.execute<any[]>(
            `SELECT id FROM ${tn('accounts')} WHERE login = ?`,
            [EXPERT_LOGIN],
        );
        return Number(rows[0]?.id ?? 0);
    });
}

async function getProfile(expertId: number): Promise<ProfileRow> {
    return withConnection(async (c) => {
        const [rows] = await c.execute<any[]>(
            `SELECT display_name, bio, specialization FROM ${tn('expert_profiles')} WHERE account_id = ?`,
            [expertId],
        );
        return {
            display_name: String(rows[0]?.display_name ?? ''),
            bio: String(rows[0]?.bio ?? ''),
            specialization: String(rows[0]?.specialization ?? ''),
        };
    });
}

async function setProfile(expertId: number, p: ProfileRow): Promise<void> {
    await withConnection(async (c) => {
        await c.execute(
            `UPDATE ${tn('expert_profiles')}
             SET display_name = ?, bio = ?, specialization = ?
             WHERE account_id = ?`,
            [p.display_name, p.bio, p.specialization, expertId],
        );
    });
}

async function getApproved(expertId: number): Promise<boolean> {
    return withConnection(async (c) => {
        const [rows] = await c.execute<any[]>(
            `SELECT value FROM ${tn('accounts_data')} WHERE account_id = ? AND param = 'IS_APPROVED'`,
            [expertId],
        );
        return String(rows[0]?.value ?? '1') === '1';
    });
}

async function setApproved(expertId: number, approved: boolean): Promise<void> {
    await withConnection(async (c) => {
        await c.execute(
            `INSERT INTO ${tn('accounts_data')} (account_id, param, value)
             VALUES (?, 'IS_APPROVED', ?)
             ON DUPLICATE KEY UPDATE value = VALUES(value)`,
            [expertId, approved ? '1' : '0'],
        );
        await c.execute(
            `UPDATE ${tn('expert_profiles')} SET is_approved = ? WHERE account_id = ?`,
            [approved ? 1 : 0, expertId],
        );
    });
}

interface PostResult {
    status: number;
    body: any;
}

async function postProfile(page: Page, body: Record<string, unknown>): Promise<PostResult> {
    return page.evaluate(async (payload) => {
        const csrf = (window as any).__GARNET_CSRF__ || '';
        const res = await fetch('/expert/~profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ ...payload, CSRF_TOKEN: csrf }),
        });
        return { status: res.status, body: await res.json().catch(() => null) };
    }, body);
}

// Unique marker so we can distinguish our write from seed data and assert
// it propagates end-to-end without colliding with other workers' runs.
const MARKER = `QA54-${Date.now()}`;
const SAVE_DISPLAY_NAME = `Display ${MARKER}`;
const SAVE_SPECIALIZATION = `Spec ${MARKER}`;
const SAVE_BIO = `Bio text ${MARKER}`;

test.describe.configure({ mode: 'serial' });

test.describe('Task #54: expert public-profile editing', () => {
    let expertId = 0;
    let initialProfile: ProfileRow = {display_name: '', bio: '', specialization: ''};
    let initialApproved = true;

    test.beforeAll(async () => {
        expertId = await getExpertId();
        expect(expertId).toBeGreaterThan(0);
        initialProfile = await getProfile(expertId);
        initialApproved = await getApproved(expertId);
    });

    test.afterAll(async () => {
        if (expertId > 0) {
            await setProfile(expertId, initialProfile);
            await setApproved(expertId, initialApproved);
        }
    });

    test('GET /expert/~profile renders the edit form with current values', async ({ page }) => {
        const resp = await page.goto('/system/expert/~profile');
        expect(resp?.status()).toBe(200);

        await expect(page.locator('[data-test-id="expert-profile-display-name"]')).toBeVisible({ timeout: 10000 });
        await expect(page.locator('[data-test-id="expert-profile-specialization"]')).toBeVisible();
        await expect(page.locator('[data-test-id="expert-profile-bio"]')).toBeVisible();
        await expect(page.locator('[data-test-id="expert-profile-save"]')).toBeVisible();
    });

    test('POST saves display_name / specialization / bio to expert_profiles', async ({ page }) => {
        // Ensure approved so mayMutate() passes (defense-in-depth A-02).
        await setApproved(expertId, true);
        await page.goto('/system/expert/~profile');

        const result = await postProfile(page, {
            display_name: SAVE_DISPLAY_NAME,
            specialization: SAVE_SPECIALIZATION,
            bio: SAVE_BIO,
        });

        expect(result.status).toBe(200);
        expect(result.body?.success).toBe(true);
        expect(result.body?.profile?.display_name).toBe(SAVE_DISPLAY_NAME);

        const profile = await getProfile(expertId);
        expect(profile.display_name).toBe(SAVE_DISPLAY_NAME);
        expect(profile.specialization).toBe(SAVE_SPECIALIZATION);
        expect(profile.bio).toBe(SAVE_BIO);
    });

    test('public page /expert/id~N reflects the saved values', async ({ page }) => {
        const resp = await page.goto(`/expert/id~${expertId}`);
        expect(resp?.status()).toBe(200);

        const island = page.locator('[data-test-id="expert-profile"]');
        await expect(island).toBeVisible({ timeout: 10000 });
        await expect(island).toContainText(SAVE_DISPLAY_NAME);
        await expect(island).toContainText(SAVE_SPECIALIZATION);
        await expect(island).toContainText(SAVE_BIO);
    });

    test('validation: empty display_name → 400, nothing saved', async ({ page }) => {
        await page.goto('/system/expert/~profile');
        const before = await getProfile(expertId);

        const result = await postProfile(page, { display_name: '   ', specialization: 'irrelevant', bio: '' });

        expect(result.status).toBe(400);
        expect(result.body?.error).toBeTruthy();

        const after = await getProfile(expertId);
        expect(after).toEqual(before);
    });

    test('validation: bio over 2000 chars → 400', async ({ page }) => {
        await page.goto('/system/expert/~profile');

        const result = await postProfile(page, {
            display_name: 'X',
            specialization: '',
            bio: 'b'.repeat(2001),
        });

        expect(result.status).toBe(400);
    });

    test('validation: specialization over 255 chars → 400', async ({ page }) => {
        await page.goto('/system/expert/~profile');

        const result = await postProfile(page, {
            display_name: 'X',
            specialization: 's'.repeat(256),
            bio: '',
        });

        expect(result.status).toBe(400);
    });

    test('A-02: unapproved expert GET 200 but POST 403 (mayMutate defense-in-depth)', async ({ page }) => {
        await setApproved(expertId, false);
        try {
            // GET stays reachable for unapproved experts — same as ~slots.
            // Filling the profile before approval is the intended UX.
            const getResp = await page.goto('/system/expert/~profile');
            expect(getResp?.status()).toBeLessThan(400);

            // The save is rejected at the API level: mayMutate() requires
            // isApproved() OR staff rank. This matches every other mutating
            // /expert/~* endpoint in ExpertPanelController.
            const postResult = await postProfile(page, {
                display_name: `Should Not Save ${MARKER}`,
                specialization: '',
                bio: '',
            });
            expect(postResult.status).toBe(403);

            // Confirm nothing was written.
            const profile = await getProfile(expertId);
            expect(profile.display_name).not.toContain('Should Not Save');
        } finally {
            await setApproved(expertId, true);
        }
    });
});
