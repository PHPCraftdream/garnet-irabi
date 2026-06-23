/**
 * User -- News feed: actor display-name resolution
 *
 * The news feed used to show stale names captured in the event payload
 * at creation time.  Now the backend re-resolves the actor's CURRENT
 * display name when serving the feed (NewsService::decorateFeedItems).
 *
 * This spec seeds a personal news event whose payload contains a stale
 * "#999" name, then asserts the rendered feed shows the actor's real
 * current name instead.
 */

import { test, expect, tn } from '../helpers/scoped-test';
import mysql from 'mysql2/promise';
import { DB } from '../helpers/db';

test.describe.configure({ mode: 'serial' });

const RESOLVED_NAME = 'Имя Резолвинг';
const STALE_NAME    = '#999';
const USER_LOGIN    = 'testuser_setup_user@irabi.test';
const EXPERT_LOGIN  = 'testuser_setup_expert@irabi.test';

let userId: number;
let actorId: number;
let insertedEventId: number;
let prevAccountName: string;
let prevDisplayName: string | null = null;
let hadExpertProfile = false;

test.describe('News feed -- actor name resolution', () => {

    test('entry: set a known actor name and seed a stale-payload personal news event', async () => {
        const conn = await mysql.createConnection(DB);
        try {
            // Resolve user (audience) and actor (expert) account ids
            const [userRows] = await conn.execute<any[]>(
                `SELECT id FROM ${tn('accounts')} WHERE login = ?`, [USER_LOGIN],
            );
            expect(userRows.length, 'setup user not found').toBeGreaterThan(0);
            userId = Number(userRows[0].id);

            const [actorRows] = await conn.execute<any[]>(
                `SELECT id, name FROM ${tn('accounts')} WHERE login = ?`, [EXPERT_LOGIN],
            );
            expect(actorRows.length, 'setup expert not found').toBeGreaterThan(0);
            actorId = Number(actorRows[0].id);
            prevAccountName = actorRows[0].name ?? '';

            // Update accounts.name
            await conn.execute(
                `UPDATE ${tn('accounts')} SET name = ? WHERE id = ?`,
                [RESOLVED_NAME, actorId],
            );

            // Update expert_profiles.display_name if the row exists
            const [epRows] = await conn.execute<any[]>(
                `SELECT display_name FROM ${tn('expert_profiles')} WHERE account_id = ?`,
                [actorId],
            );
            if (epRows.length > 0) {
                hadExpertProfile = true;
                prevDisplayName = epRows[0].display_name;
                await conn.execute(
                    `UPDATE ${tn('expert_profiles')} SET display_name = ? WHERE account_id = ?`,
                    [RESOLVED_NAME, actorId],
                );
            }

            // Insert a personal new_message event with a STALE name in payload
            const now = Math.floor(Date.now() / 1000);
            const payload = JSON.stringify({
                sender_id: actorId,
                name: STALE_NAME,
                preview: 'тест',
            });
            const [insertResult] = await conn.execute<any>(
                `INSERT INTO ${tn('news_events')}
                    (event_type, audience_type, audience_id, actor_id, target_key, payload, created_at)
                 VALUES ('new_message', 'personal', ?, ?, NULL, ?, ?)`,
                [userId, actorId, payload, now],
            );
            insertedEventId = Number(insertResult.insertId);
            expect(insertedEventId).toBeGreaterThan(0);
        } finally {
            await conn.end();
        }
    });

    test('feed shows the resolved current name, not the stale #999', async ({ page }) => {
        test.skip(!insertedEventId, 'no seeded event');

        await page.goto('/system/', { waitUntil: 'domcontentloaded' });
        const feed = page.locator('[data-test-id="news-feed"]');
        await expect(feed).toBeVisible({ timeout: 10_000 });

        // The feed loads its items asynchronously via POST /news/~feed — wait for it,
        // then for the seeded event row to actually render before reading the name.
        await page.waitForResponse(
            r => r.url().includes('/news/~feed') && r.request().method() === 'POST',
            { timeout: 10_000 },
        ).catch(() => {});

        const eventRow = page.locator(`[data-test-id="news-event-${insertedEventId}"]`);
        await expect(eventRow).toBeVisible({ timeout: 10_000 });

        const text = await eventRow.textContent() ?? '';
        expect(text).toContain(RESOLVED_NAME);
        expect(text).not.toContain(STALE_NAME);
    });

    test('exit: cleanup', async () => {
        const conn = await mysql.createConnection(DB);
        try {
            // Delete the seeded news event
            if (insertedEventId) {
                await conn.execute(
                    `DELETE FROM ${tn('news_events')} WHERE id = ?`,
                    [insertedEventId],
                );
            }

            // Restore accounts.name
            if (actorId) {
                await conn.execute(
                    `UPDATE ${tn('accounts')} SET name = ? WHERE id = ?`,
                    [prevAccountName, actorId],
                );
            }

            // Restore expert_profiles.display_name
            if (hadExpertProfile && actorId) {
                await conn.execute(
                    `UPDATE ${tn('expert_profiles')} SET display_name = ? WHERE account_id = ?`,
                    [prevDisplayName, actorId],
                );
            }
        } finally {
            await conn.end();
        }
    });

});
