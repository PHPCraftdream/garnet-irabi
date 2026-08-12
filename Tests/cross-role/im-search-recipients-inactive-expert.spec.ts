/**
 * M-02 regression, search side (docs/security-audit/12-ms-postfix-authorization-review.md
 * covers the send-side canMessage() gate; this file covers the companion gap found in a
 * later code-smell audit): ImController::searchRecipients() determined "is this account
 * an expert" purely from expert_profiles row existence, so a disabled, unapproved, or
 * demoted (type != 'expert') account still showed up in the new-message recipient search
 * — even though canMessage() would reject actually messaging them.
 *
 * The fix gates both the current-user-is-expert branch and the expert-lookup branch of
 * searchRecipients() on UserEntityConfig::isApprovedActiveExpert() instead of bare
 * expert_profiles existence, matching canMessage()'s already-correct gate.
 */
import { test, expect, tn } from '../helpers/scoped-test';
import { newScopedContext } from '../helpers/scoped-test';
import { withConnection } from '../helpers/db';
import { roleLogin } from '../helpers/role-login';
import type { BrowserContext, Page } from '@playwright/test';

async function devLogin(browser: any, role: string): Promise<{ context: BrowserContext; page: Page }> {
    const context = await newScopedContext(browser);
    const page = await context.newPage();
    await page.goto('/');
    await roleLogin(page, role);
    await page.goto('/');
    return { context, page };
}

async function getAccountId(login: string): Promise<number> {
    return withConnection(async (c) => {
        const [rows] = await c.execute<any[]>(`SELECT id FROM ${tn('accounts')} WHERE login = ?`, [login]);
        return rows[0]?.id ?? 0;
    });
}

async function setAccountFlag(accountId: number, flag: string, value: string): Promise<void> {
    await withConnection(async (c) => {
        await c.execute(
            `INSERT INTO ${tn('accounts_data')} (account_id, param, value)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE value = VALUES(value)`,
            [accountId, flag, value],
        );
    });
}

async function searchRecipients(page: Page, query: string): Promise<{ status: number; body: any }> {
    return page.evaluate(async (searchQuery) => {
        let csrf = '';
        document.querySelectorAll('[data-props]').forEach((el) => {
            try {
                const p = JSON.parse(el.getAttribute('data-props') || '{}');
                if (p.csrf) csrf = p.csrf;
            } catch {}
        });
        if (!csrf) csrf = (window as any).__GARNET_CSRF__ || '';

        const fd = new FormData();
        fd.append('query', searchQuery);
        fd.append('CSRF_TOKEN', csrf);
        const res = await fetch('/im/~searchRecipients', { method: 'POST', body: fd });
        const body = await res.json().catch(() => null);
        return { status: res.status, body };
    }, query);
}

test.describe('M-02 (search side): searchRecipients excludes non-active-approved experts', () => {
    test.describe.configure({ mode: 'serial' });
    let expertId = 0;
    let userCtx: BrowserContext;
    let userPage: Page;

    test.beforeAll(async ({ browser }) => {
        expertId = await getAccountId('expert1@dev.test');
        expect(expertId).toBeGreaterThan(0);

        ({ context: userCtx, page: userPage } = await devLogin(browser, 'user'));
        await userPage.goto('/im/');
    });

    test.afterAll(async () => {
        await setAccountFlag(expertId, 'IS_DISABLED', '0');
        await setAccountFlag(expertId, 'IS_APPROVED', '1');
        await withConnection(async (c) => {
            await c.execute(`UPDATE ${tn('accounts')} SET type = 'expert' WHERE id = ?`, [expertId]);
        });
        await userCtx?.close().catch(() => {});
    });

    test('baseline: active approved expert appears in search results', async () => {
        const result = await searchRecipients(userPage, '');
        expect(result.status).toBe(200);
        const ids = (result.body?.recipients ?? []).map((r: any) => Number(r.id));
        expect(ids).toContain(expertId);
    });

    test('disabled expert is excluded from search results', async () => {
        await setAccountFlag(expertId, 'IS_DISABLED', '1');
        try {
            const result = await searchRecipients(userPage, '');
            expect(result.status).toBe(200);
            const ids = (result.body?.recipients ?? []).map((r: any) => Number(r.id));
            expect(ids).not.toContain(expertId);
        } finally {
            await setAccountFlag(expertId, 'IS_DISABLED', '0');
        }
    });

    test('unapproved expert is excluded from search results', async () => {
        await setAccountFlag(expertId, 'IS_APPROVED', '0');
        try {
            const result = await searchRecipients(userPage, '');
            expect(result.status).toBe(200);
            const ids = (result.body?.recipients ?? []).map((r: any) => Number(r.id));
            expect(ids).not.toContain(expertId);
        } finally {
            await setAccountFlag(expertId, 'IS_APPROVED', '1');
        }
    });

    test('demoted (type=user) expert-profile account is excluded from search results', async () => {
        await withConnection(async (c) => {
            await c.execute(`UPDATE ${tn('accounts')} SET type = 'user' WHERE id = ?`, [expertId]);
        });
        try {
            const result = await searchRecipients(userPage, '');
            expect(result.status).toBe(200);
            const ids = (result.body?.recipients ?? []).map((r: any) => Number(r.id));
            expect(ids).not.toContain(expertId);
        } finally {
            await withConnection(async (c) => {
                await c.execute(`UPDATE ${tn('accounts')} SET type = 'expert' WHERE id = ?`, [expertId]);
            });
        }
    });
});
