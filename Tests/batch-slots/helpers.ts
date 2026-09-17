/**
 * Подготовка для пакетного создания слотов.
 *
 * setupBatchExpert — это бывший «шаг 1» цепочки. Он вынесен сюда, чтобы
 * обе половины проверок (мастер и создание) могли начинаться с готового
 * одобренного эксперта: иначе разделить цепочку по файлам было бы
 * нельзя — вторая половина зависела бы от теста из первой.
 */

import { test, expect, tn } from '../helpers/scoped-test';
import { newScopedPage } from '../helpers/scoped-test';
import type { Page } from '@playwright/test';
import { registerAccount, fillProfileForm, clearTestData } from '../helpers/auth';
import mysql from 'mysql2/promise';
import { DB } from '../helpers/db';

export const EXPERT_LOGIN = `testuser_batch_${process.env.TEST_PARALLEL_INDEX ?? "0"}@irabi.test`;

/**
 * Task #165: fixtures in this file used to be hardcoded calendar dates
 * (e.g. '2026-04-06') that were future dates when the file was written but
 * inevitably rot into the past as time passes — which now trips the F-02
 * past-start-time rejection (task #164) for tests that need a FUTURE date.
 *
 * This helper computes a date `offsetDays` days from "now" (local time) and
 * formats it as `YYYY-MM-DD`, matching the `input[type="date"]` fill()
 * format used throughout this file. Pass a negative offset to deliberately
 * get a PAST date (used only where a test's whole point is exercising the
 * past-date rejection — see test 14).
 */
export function dateOffsetDays(offsetDays: number): string {
	const d = new Date();
	d.setDate(d.getDate() + offsetDays);
	const year = d.getFullYear();
	const month = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

/**
 * Returns the 1st day of the month `monthsAhead` months from now, as
 * `YYYY-MM-DD`. Batch previews that span multiple weeks (count/per_week)
 * render one calendar `<table>` per visible month, so starting mid-month
 * near a month boundary can make a 3-week proposal window spill into the
 * next month and break single-table locator assumptions. Starting on the
 * 1st keeps any window up to ~3 weeks safely within the same month.
 */
export function firstOfMonthAhead(monthsAhead: number): string {
	const d = new Date();
	d.setDate(1);
	d.setMonth(d.getMonth() + monthsAhead);
	const year = d.getFullYear();
	const month = String(d.getMonth() + 1).padStart(2, '0');
	return `${year}-${month}-01`;
}

/** Зарегистрировать эксперта, заполнить профиль и одобрить его. */
export async function setupBatchExpert(page: Page): Promise<void> {
		await registerAccount(page, EXPERT_LOGIN);
		await fillProfileForm(page, EXPERT_LOGIN, {
			name: 'Тест Пакетный',
			accountType: 'expert',
			timezone: 'Europe/Moscow',
		});

		const conn = await mysql.createConnection(DB);
		try {
			const [rows] = await conn.execute<any[]>(
				`SELECT id FROM ${tn('accounts')} WHERE login = ?`, [EXPERT_LOGIN]
			);
			if (rows.length > 0) {
				await conn.execute(
					`INSERT INTO ${tn('accounts_data')} (account_id, param, value)
					 VALUES (?, 'IS_APPROVED', '1')
					 ON DUPLICATE KEY UPDATE value = '1'`,
					[rows[0].id]
				);
			}
		} finally { await conn.end(); }

		// Reload to pick up new role
		await page.goto('/');
		await page.waitForLoadState('networkidle');
}
