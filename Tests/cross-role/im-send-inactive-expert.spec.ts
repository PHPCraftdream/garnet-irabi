/**
 * M-02 regression (docs/security-audit/12-ms-postfix-authorization-review.md):
 * ImController::canMessage() allowed a regular user to message ANY account
 * with an expert_profiles row, regardless of the account's current type/
 * IS_APPROVED/IS_DISABLED — a disabled, unapproved, or demoted "expert"
 * remained a valid new-conversation target.
 *
 * The fix gates both the sender-is-expert and recipient-is-expert branches
 * of canMessage() on UserEntityConfig::isApprovedActiveExpert() instead of
 * bare expert_profiles existence. The existing-conversation bypass is
 * unchanged (ongoing conversations survive later business-rule changes).
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

async function cleanupConversation(a: number, b: number): Promise<void> {
    await withConnection(async (c) => {
        const [convs] = await c.execute<any[]>(
            `SELECT id FROM ${tn('im_conversations')} WHERE (participant_a = ? AND participant_b = ?) OR (participant_a = ? AND participant_b = ?)`,
            [a, b, b, a],
        );
        for (const conv of convs) {
            await c.execute(`DELETE FROM ${tn('im_messages')} WHERE conversation_id = ?`, [conv.id]);
            await c.execute(`DELETE FROM ${tn('im_conversations')} WHERE id = ?`, [conv.id]);
        }
    });
}

async function apiSend(page: Page, recipientId: number, message: string): Promise<{ status: number; body: any }> {
    return page.evaluate(async ({ recipientId, message }) => {
        let csrf = '';
        const island = document.querySelector('[data-island="im-page"]');
        if (island) {
            try {
                const props = JSON.parse(island.getAttribute('data-props') || '{}');
                csrf = props.csrf || '';
            } catch {}
        }
        if (!csrf) {
            document.querySelectorAll('[data-props]').forEach((el) => {
                try {
                    const p = JSON.parse(el.getAttribute('data-props') || '{}');
                    if (p.csrf) csrf = p.csrf;
                } catch {}
            });
        }
        if (!csrf) csrf = (window as any).__GARNET_CSRF__ || '';

        const fd = new FormData();
        fd.append('recipient_id', String(recipientId));
        fd.append('message', message);
        fd.append('CSRF_TOKEN', csrf);
        const res = await fetch('/im/~send', { method: 'POST', body: fd });
        const body = await res.json().catch(() => null);
        return { status: res.status, body };
    }, { recipientId, message });
}

test.describe('M-02: IM canMessage requires an active approved expert target', () => {
    test.describe.configure({ mode: 'serial' });
    let expertId = 0;
    let userCtx: BrowserContext;
    let userPage: Page;

    test.beforeAll(async ({ browser }) => {
        expertId = await getAccountId('expert1@dev.test');
        expect(expertId).toBeGreaterThan(0);
        await cleanupConversation(expertId, 0);

        ({ context: userCtx, page: userPage } = await devLogin(browser, 'user'));
        const userId = await getAccountId('user1@dev.test');
        await cleanupConversation(expertId, userId);
        await userPage.goto('/im/');
    });

    test.afterAll(async () => {
        await setAccountFlag(expertId, 'IS_DISABLED', '0');
        await setAccountFlag(expertId, 'IS_APPROVED', '1');
        await withConnection(async (c) => {
            await c.execute(`UPDATE ${tn('accounts')} SET type = 'expert' WHERE id = ?`, [expertId]);
        });
        const userId = await getAccountId('user1@dev.test');
        await cleanupConversation(expertId, userId);
        await userCtx?.close().catch(() => {});
    });

    test('baseline: user can message an active approved expert', async () => {
        const result = await apiSend(userPage, expertId, 'M-02 baseline: allowed');
        expect(result.status).toBe(200);

        // Remove the conversation this creates — otherwise the "existing
        // conversation" bypass in canMessage() would let every later
        // "should be blocked" test through regardless of the gate under test.
        const userId = await getAccountId('user1@dev.test');
        await cleanupConversation(expertId, userId);
    });

    test('user cannot message a disabled expert (403)', async () => {
        await setAccountFlag(expertId, 'IS_DISABLED', '1');
        try {
            const result = await apiSend(userPage, expertId, 'M-02: should be blocked (disabled)');
            expect(result.status).toBe(403);
        } finally {
            await setAccountFlag(expertId, 'IS_DISABLED', '0');
        }
    });

    test('user cannot message an unapproved expert (403)', async () => {
        await setAccountFlag(expertId, 'IS_APPROVED', '0');
        try {
            const result = await apiSend(userPage, expertId, 'M-02: should be blocked (unapproved)');
            expect(result.status).toBe(403);
        } finally {
            await setAccountFlag(expertId, 'IS_APPROVED', '1');
        }
    });

    test('user cannot message a demoted (type=user) expert-profile account (403)', async () => {
        await withConnection(async (c) => {
            await c.execute(`UPDATE ${tn('accounts')} SET type = 'user' WHERE id = ?`, [expertId]);
        });
        try {
            const result = await apiSend(userPage, expertId, 'M-02: should be blocked (demoted)');
            expect(result.status).toBe(403);
        } finally {
            await withConnection(async (c) => {
                await c.execute(`UPDATE ${tn('accounts')} SET type = 'expert' WHERE id = ?`, [expertId]);
            });
        }
    });
});
