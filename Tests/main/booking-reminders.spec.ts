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
import { test, expect, tn, getDbPrefix } from '../helpers/scoped-test';
import { withConnection } from '../helpers/db/db';
import { runServerCommand } from '../helpers/db/server-command';
import { ADMIN_LOGIN, EXPERT_LOGIN, USER_LOGIN, EXPERT_MODERATOR_LOGIN } from '../helpers/auth/logins';

function runReminderCron(): void {
    // Без DB_PREFIX_OVERRIDE крон ходит в общие таблицы, а спек засеивает
    // изолированные для своего воркера. Первая проверка от этого падала, а
    // вторая — «суточное не ушло» — проходила ВХОЛОСТУЮ: не ушло ничего
    // вообще, потому что крон не видел ни одной засеянной строки. Пустой
    // прогон, подтверждающий отрицание, — худший вид зелёного теста.
    runServerCommand(['cron', 'booking-reminders'], getDbPrefix());
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

async function accountIdByLogin(login: string): Promise<number> {
    return withConnection(async conn => {
        const [rows] = await conn.execute<any[]>(
            `SELECT id FROM ${tn('accounts')} WHERE login = ?`, [login],
        );

        return Number(rows[0]?.id ?? 0);
    });
}

/** Бронь через N секунд у КОНКРЕТНОГО эксперта/ученика (не фиксированных 1/2). */
async function seedLessonFor(expertId: number, userId: number, startInSeconds: number): Promise<{ slotId: number; bookingId: number }> {
    return withConnection(async conn => {
        const now = Math.floor(Date.now() / 1000);
        const startAt = now + startInSeconds;

        const [slot] = await conn.execute<any>(
            `INSERT INTO ${tn('time_slots')}
                 (expert_id, start_at, end_at, duration_min, max_users, status, uid, created_at)
             VALUES (?, ?, ?, 60, 1, 'booked', ?, ?)`,
            [expertId, startAt, startAt + 3600, String(now).slice(-10) + String(startInSeconds + expertId).slice(0, 5), now],
        );
        const slotId = Number(slot.insertId);

        const [booking] = await conn.execute<any>(
            `INSERT INTO ${tn('bookings')}
                 (user_id, bookable_type, bookable_id, status, created_at, confirmed_at)
             VALUES (?, 'time_slot', ?, 'confirmed', ?, ?)`,
            [userId, slotId, now, now],
        );

        return { slotId, bookingId: Number(booking.insertId) };
    });
}

async function queuedBodiesFor(accountId: number): Promise<string[]> {
    return withConnection(async conn => {
        const [rows] = await conn.execute<any[]>(
            `SELECT body_html FROM ${tn('email_queue')} WHERE account_id = ? ORDER BY id ASC`,
            [accountId],
        );

        return rows.map(r => String(r.body_html));
    });
}

/**
 * D-241 (UAT 20.09): two reminders built in the SAME cron tick got glued
 * into one email — `HtmlMinify::get()` is a singleton whose `minify()`
 * never reset its output buffer between calls, so recipient N's email
 * carried every prior recipient's content in front of its own. Framework
 * fix + unit regression live in garnet-framework's HtmlMinifySpec; this
 * is the black-box confirmation that a REAL two-recipient cron tick in
 * THIS app doesn't cross-contaminate.
 */
test('два напоминания в одном тике крона не склеиваются в одну рассылку', async () => {
    const expertAId = await accountIdByLogin(EXPERT_LOGIN);
    const studentAId = await accountIdByLogin(USER_LOGIN);
    const expertBId = await accountIdByLogin(EXPERT_MODERATOR_LOGIN);
    const studentBId = await accountIdByLogin(ADMIN_LOGIN);

    expect(expertAId).toBeGreaterThan(0);
    expect(studentAId).toBeGreaterThan(0);
    expect(expertBId).toBeGreaterThan(0);
    expect(studentBId).toBeGreaterThan(0);

    // Both due for the SAME (2h) lead — both get built inside the same
    // php run_cmd.php process, which is exactly the condition D-241 needs.
    await seedLessonFor(expertAId, studentAId, 3600);
    await seedLessonFor(expertBId, studentBId, 3600);

    runReminderCron();

    const [studentABodies, studentBBodies, expertABodies, expertBBodies] = await Promise.all([
        queuedBodiesFor(studentAId),
        queuedBodiesFor(studentBId),
        queuedBodiesFor(expertAId),
        queuedBodiesFor(expertBId),
    ]);

    expect(studentABodies.length).toBeGreaterThan(0);
    expect(studentBBodies.length).toBeGreaterThan(0);
    expect(expertABodies.length).toBeGreaterThan(0);
    expect(expertBBodies.length).toBeGreaterThan(0);

    // Order-independent check FIRST: whichever email the cron happens to
    // build last is where a leaking buffer shows up (a name-substring check
    // on the wrong side of build order stays green even with the bug — the
    // FIRST body built in a process has nothing yet to leak from). One
    // rendered document == exactly one "<!doctype html>", regardless of
    // which of the four this run happened to build last.
    const allBodies = [...studentABodies, ...studentBBodies, ...expertABodies, ...expertBBodies];
    for (const body of allBodies) {
        const doctypeCount = (body.match(/<!doctype html>/gi) ?? []).length;
        expect(doctypeCount, `email body should be exactly one document, found ${doctypeCount}:\n${body}`).toBe(1);
    }

    for (const body of studentABodies) {
        expect(body).toContain('Setup Expert');
        expect(body).not.toContain('Setup Expert-Mod');
    }
    for (const body of studentBBodies) {
        expect(body).toContain('Setup Expert-Mod');
    }
    for (const body of expertABodies) {
        expect(body).toContain('Setup User');
        expect(body).not.toContain('Setup Admin');
    }
    for (const body of expertBBodies) {
        expect(body).toContain('Setup Admin');
    }
});
