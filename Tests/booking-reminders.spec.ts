/**
 * Напоминания о занятии: за сутки и за два часа.
 *
 * Проверяется не факт отправки, а два свойства, на которых такая фича ломается
 * в проде:
 *
 *  1. Повторный прогон крона НЕ шлёт второе письмо. Крон ходит каждые пять
 *     минут, а окно суточного напоминания длится почти сутки — без отметки
 *     человек получил бы сотни одинаковых писем и перестал бы читать все
 *     письма платформы разом.
 *  2. Напоминание, до которого «уже поздно», не уходит. Если крон не работал
 *     полдня, письмо «занятие завтра» за десять минут до начала — не забота, а
 *     сообщение о поломке; нижняя граница окна это отсекает.
 *
 * Задача дёргается процессом (`php run_cmd.php cron booking-reminders`), потому
 * что именно так она запускается на хосте: вызов сервиса в обход регистрации
 * не заметил бы незарегистрированную задачу — а без регистрации не уходит
 * вообще ничего.
 */
import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import { test, expect, tn, getDbPrefix } from './helpers/scoped-test';
import { withConnection } from './helpers/db';

const APP_DIR = path.resolve(__dirname, '..');

function runReminderCron(): void {
    // Без DB_PREFIX_OVERRIDE крон ходит в общие таблицы, а спек засеивает
    // изолированные для своего воркера. Первая проверка от этого падала, а
    // вторая — «суточное не ушло» — проходила ВХОЛОСТУЮ: не ушло ничего
    // вообще, потому что крон не видел ни одной засеянной строки. Пустой
    // прогон, подтверждающий отрицание, — худший вид зелёного теста.
    execFileSync('php', ['run_cmd.php', 'cron', 'booking-reminders'], {
        cwd: APP_DIR,
        env: { ...process.env, DB_PREFIX_OVERRIDE: getDbPrefix() },
        encoding: 'utf8',
    });
}

/** Занятие через N секунд с одной подтверждённой бронью. */
async function seedLesson(startInSeconds: number): Promise<{ slotId: number; bookingId: number }> {
    return withConnection(async conn => {
        const now = Math.floor(Date.now() / 1000);
        const startAt = now + startInSeconds;

        const [slot] = await conn.execute<any>(
            `INSERT INTO ${tn('time_slots')}
                 (expert_id, start_at, end_at, duration_min, max_users, status, uid, created_at)
             VALUES (?, ?, ?, 60, 1, 'booked', ?, ?)`,
            [1, startAt, startAt + 3600, String(now).slice(-10) + String(startInSeconds).slice(0, 5), now],
        );
        const slotId = Number(slot.insertId);

        const [booking] = await conn.execute<any>(
            `INSERT INTO ${tn('bookings')}
                 (user_id, bookable_type, bookable_id, status, created_at, confirmed_at)
             VALUES (?, 'time_slot', ?, 'confirmed', ?, ?)`,
            [2, slotId, now, now],
        );

        return { slotId, bookingId: Number(booking.insertId) };
    });
}

async function marks(bookingId: number): Promise<{ oneDay: number | null; twoHours: number | null }> {
    return withConnection(async conn => {
        const [rows] = await conn.execute<any[]>(
            `SELECT reminded_1d_at, reminded_2h_at FROM ${tn('bookings')} WHERE id = ?`,
            [bookingId],
        );

        return { oneDay: rows[0]?.reminded_1d_at ?? null, twoHours: rows[0]?.reminded_2h_at ?? null };
    });
}

async function queuedCount(): Promise<number> {
    return withConnection(async conn => {
        const [rows] = await conn.execute<any[]>(`SELECT COUNT(*) AS cnt FROM ${tn('email_queue')}`);

        return Number(rows[0]?.cnt ?? 0);
    });
}

test('напоминание уходит один раз, повторный тик крона его не дублирует', async () => {
    // Час до начала: попадает в окно двухчасового напоминания и не попадает в
    // суточное — так проверяется и выбор срока, а не только факт отправки.
    const { bookingId } = await seedLesson(3600);

    const before = await queuedCount();
    runReminderCron();

    const afterFirst = await marks(bookingId);
    expect(afterFirst.twoHours, 'двухчасовое напоминание должно быть отмечено').not.toBeNull();
    expect(afterFirst.oneDay, 'суточное для занятия через час слать поздно').toBeNull();

    const queuedAfterFirst = await queuedCount();
    expect(queuedAfterFirst, 'письмо должно попасть в очередь').toBeGreaterThan(before);

    runReminderCron();
    expect(
        await queuedCount(),
        'повторный прогон крона обязан не слать второе письмо',
    ).toBe(queuedAfterFirst);
});

test('занятию, до которого меньше двух часов, суточное напоминание не шлётся', async () => {
    const { bookingId } = await seedLesson(600);

    runReminderCron();

    expect(
        (await marks(bookingId)).oneDay,
        'письмо «занятие завтра» за десять минут до начала — сообщение о поломке, а не забота',
    ).toBeNull();
});
