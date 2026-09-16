/**
 * Сдвиг занятия во времени: защита по владельцу и связка «сдвиг → крон → эффект».
 *
 * Проверяется не то, что команда что-то печатает, а два свойства, ради которых
 * инструмент вообще делался и на которых он опаснее всего ломается:
 *
 *  1. **Чужое занятие не двигается.** Инструмент живёт на боевом сайте, где у
 *     настоящего преподавателя идёт настоящее расписание. Защита проверяет
 *     владельца строк — преподавателя слота и каждого записавшегося ученика, —
 *     а не того, кто попросил. Достаточно одного нетестового участника, чтобы
 *     сдвиг был запрещён. Если эта проверка отвалится, инструмент начнёт
 *     переносить занятия живым людям и возвращать им деньги не по правилам.
 *  2. **Фаза — это обещание, выполненное к возврату команды, а не намерение.**
 *     Сдвиг сам по себе ничего не завершает: статусы переписывает крон. Поэтому
 *     инструмент дёргает крон сразу и в границах названного занятия. Если эта
 *     связка порвётся, `--to=past` будет молча оставлять занятие незавершённым,
 *     а проверяющий увидит «успех» и сделает неверный вывод.
 *
 * Команда дёргается процессом (`php run_cmd.php time-shift ...`), потому что
 * именно так её запускает человек: вызов сервиса напрямую прошёл бы мимо
 * затвора по режиму тестирования и мимо разбора аргументов.
 */
import { test, expect, tn, getDbPrefix } from './helpers/scoped-test';
import { withConnection } from './helpers/db';
import { runServerCommand } from './helpers/server-command';

const RUN_ID = `${process.env.TEST_PARALLEL_INDEX ?? '0'}-${Date.now()}`;

interface ShiftResult {
    status: number;
    stdout: string;
    stderr: string;
}

function runTimeShift(args: string[]): ShiftResult {
    // Без DB_PREFIX_OVERRIDE команда смотрела бы в общие таблицы, а спек
    // засеивает изолированные для своего воркера: она бы «не нашла занятие»
    // и тест провалился бы по причине, не имеющей отношения к проверяемому.
    // #396: runServerCommand ходит по SSH под PW_PROD=1 вместо локального
    // spawnSync — иначе на удалённом прогоне команда работала бы с данными
    // локальной установки, а не той, куда спек реально сеет строки.
    const res = runServerCommand(['time-shift', ...args], getDbPrefix(), 60000);

    // Отказ — ожидаемый исход половины этих проверок, а не сбой прогона.
    return {
        status: res.exitCode ?? 1,
        stdout: res.stdout,
        stderr: res.stderr,
    };
}

/**
 * Аккаунт с заданным окончанием логина: именно по нему инструмент отличает
 * тестового участника от живого, поэтому зона в тесте задаётся явно.
 */
async function seedAccount(zone: string, tag: string): Promise<number> {
    return withConnection(async conn => {
        const now = Math.floor(Date.now() / 1000);
        const login = `ts_${RUN_ID}_${tag}@shift-spec${zone}`;

        const [res] = await conn.execute<any>(
            `INSERT INTO ${tn('accounts')}
                 (login, login_type, name, type, reg_time, last_auth_time, last_online_time)
             VALUES (?, 'email', ?, 'user', ?, ?, ?)`,
            [login, `Shift Spec ${tag}`, now, now, now],
        );

        return Number(res.insertId);
    });
}

/** Занятие через сутки с одной подтверждённой бронью. */
async function seedLesson(expertId: number, userId: number): Promise<{ slotId: number; bookingId: number }> {
    return withConnection(async conn => {
        const now = Math.floor(Date.now() / 1000);
        const startAt = now + 86400 * 3;

        const [slot] = await conn.execute<any>(
            `INSERT INTO ${tn('time_slots')}
                 (expert_id, start_at, end_at, duration_min, max_users, status, uid, created_at)
             VALUES (?, ?, ?, 60, 1, 'booked', ?, ?)`,
            [expertId, startAt, startAt + 3600, `ts${RUN_ID}${expertId}`.slice(-16), now],
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

async function slotRow(slotId: number): Promise<{ startAt: number; endAt: number; status: string }> {
    return withConnection(async conn => {
        const [rows] = await conn.execute<any[]>(
            `SELECT start_at, end_at, status FROM ${tn('time_slots')} WHERE id = ?`,
            [slotId],
        );

        return {
            startAt: Number(rows[0]?.start_at ?? 0),
            endAt: Number(rows[0]?.end_at ?? 0),
            status: String(rows[0]?.status ?? ''),
        };
    });
}

async function bookingStatus(bookingId: number): Promise<string> {
    return withConnection(async conn => {
        const [rows] = await conn.execute<any[]>(
            `SELECT status FROM ${tn('bookings')} WHERE id = ?`,
            [bookingId],
        );

        return String(rows[0]?.status ?? '');
    });
}

async function reminderMark(bookingId: number): Promise<number | null> {
    return withConnection(async conn => {
        const [rows] = await conn.execute<any[]>(
            `SELECT reminded_2h_at FROM ${tn('bookings')} WHERE id = ?`,
            [bookingId],
        );

        return rows[0]?.reminded_2h_at ?? null;
    });
}

// Инструмент закрыт затвором режима тестирования — без файла-маркера команды
// нет вовсе. Прогон включает режим, если он был выключен, и возвращает всё
// как было: тот же маркер открывает и `clear-user`, поэтому оставлять его
// после себя нельзя.
let markerWasOurs = false;

test.beforeAll(() => {
    // #397: `php garnet test-mode ...` — same officially-supported command a
    // human runs, over the same local/remote path as runServerCommand()
    // itself. Poking .test-mode directly (the old approach) only ever
    // touched the LOCAL filesystem — a no-op against the remote app dir
    // under PW_PROD.
    const wasOn = runServerCommand(['test-mode', 'status']).stdout.includes('ON');
    if (!wasOn) {
        runServerCommand(['test-mode', 'on']);
        markerWasOurs = true;
    }
});

test.afterAll(() => {
    if (markerWasOurs) {
        runServerCommand(['test-mode', 'off']);
    }
});

test('занятие живого преподавателя не двигается, и отказ называет причину', async () => {
    const liveExpert = await seedAccount('.example.com', 'live-expert');
    const testUser = await seedAccount('.test', 'student-a');
    const { slotId } = await seedLesson(liveExpert, testUser);

    const before = await slotRow(slotId);
    const result = runTimeShift([`--slot=${slotId}`, '--to=2h-before']);

    const after = await slotRow(slotId);
    expect(after.startAt, 'чужое расписание обязано остаться нетронутым').toBe(before.startAt);
    expect(after.endAt, 'конец занятия тоже не должен сдвинуться').toBe(before.endAt);

    // Отказ без причины превращает границу инструмента в загадку: тот, кому
    // отказали, не может понять, что именно поправить.
    const said = result.stdout + result.stderr;
    expect(said, 'отказ должен назвать, кто именно нетестовый').toContain('не тестовый преподаватель');
});

test('занятие с живым учеником не двигается, даже если преподаватель тестовый', async () => {
    const testExpert = await seedAccount('.test', 'expert-b');
    const liveUser = await seedAccount('.example.com', 'live-student');
    const { slotId } = await seedLesson(testExpert, liveUser);

    const before = await slotRow(slotId);
    const result = runTimeShift([`--slot=${slotId}`, '--to=2h-before']);

    // Проверка идёт по КАЖДОМУ участнику, а не только по владельцу слота:
    // деньги за занятие принадлежат ученику, и вернуть их не по правилам —
    // ровно тот вред, ради которого эта защита и написана.
    expect((await slotRow(slotId)).startAt, 'деньги живого ученика трогать нельзя').toBe(before.startAt);
    expect(result.stdout + result.stderr).toContain('не тестовый ученик');
});

test('перенос в past завершает занятие и бронь — крон отрабатывает сразу', async () => {
    const expertId = await seedAccount('.test', 'expert-c');
    const userId = await seedAccount('.test', 'student-c');
    const { slotId, bookingId } = await seedLesson(expertId, userId);

    const result = runTimeShift([`--slot=${slotId}`, '--to=past']);
    expect(result.status, `команда должна отработать: ${result.stderr}`).toBe(0);

    // Сдвиг сам по себе статусы не переписывает — это делает крон завершения.
    // Инструмент обещает фазу к моменту возврата команды, а не намерение её
    // когда-нибудь достичь, поэтому крон дёргается тут же.
    expect(
        (await slotRow(slotId)).status,
        'после past занятие обязано быть завершено, а не просто лежать в прошлом',
    ).toBe('completed');

    expect(
        await bookingStatus(bookingId),
        'бронь завершается вместе с занятием, иначе она зависнет подтверждённой навсегда',
    ).toBe('completed');
});

test('перенос в 2h-before ставит отметку двухчасового напоминания', async () => {
    const expertId = await seedAccount('.test', 'expert-d');
    const userId = await seedAccount('.test', 'student-d');
    const { slotId, bookingId } = await seedLesson(expertId, userId);

    expect(await reminderMark(bookingId), 'до сдвига напоминать нечего').toBeNull();

    const result = runTimeShift([`--slot=${slotId}`, '--to=2h-before']);
    expect(result.status, `команда должна отработать: ${result.stderr}`).toBe(0);

    // Отметка ставится ДО отправки: письмо уходит в очередь со своими
    // повторами, и продублировать поставленное в очередь хуже, чем изредка
    // потерять одно напоминание. Значит отметка — надёжный признак того, что
    // связка «сдвиг → крон» отработала, даже если очередь ещё не унесена.
    expect(
        await reminderMark(bookingId),
        'сдвиг в окно напоминания обязан привести к отметке — иначе крон не дёрнулся',
    ).not.toBeNull();
});

test('уже завершённое занятие двигать отказываются — обратного пути нет', async () => {
    const expertId = await seedAccount('.test', 'expert-e');
    const userId = await seedAccount('.test', 'student-e');
    const { slotId } = await seedLesson(expertId, userId);

    runTimeShift([`--slot=${slotId}`, '--to=past']);
    expect((await slotRow(slotId)).status).toBe('completed');

    const back = runTimeShift([`--slot=${slotId}`, '--to=far']);

    // Возврат в будущее не расколдует завершённую бронь: крон уже переписал
    // статусы и, возможно, вернул деньги. Инструмент это не прячет — он
    // отказывает, потому что молчаливое «подвинул» дало бы состояние, которого
    // система сама породить не может, и наблюдать на нём поведение бессмысленно.
    expect(back.stdout + back.stderr, 'отказ должен объяснить, что пути назад нет').toContain('обратного пути нет');
});
