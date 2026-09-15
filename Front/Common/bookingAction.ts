import {I18nForeground as t} from '../I18nGen/I18nForeground';

/**
 * Всё, что зависит от пары «кто смотрит» и «в каком состоянии бронь».
 *
 * Эти два вопроса решались заново в каждом месте, где бронь можно отменить, —
 * и каждый раз одним и тем же тернарником `status === 'confirmed' ? A : B`.
 * Цена такой россыпи оказалась не теоретической:
 *
 *  - D-101: `booking_status === 'confirmed' ? Подтверждено : Ждёт` в каталоге
 *    показывал ожидание на завершённом и на отменённом занятии — всё, что не
 *    `confirmed`, молча становилось ожиданием;
 *  - D-095 и D-099: названия действий развели в одном экране из двух, потому
 *    что второй экран рисует те же брони своим кодом;
 *  - подпись цены действия успела разойтись по трём компонентам за один день.
 *
 * Здесь одно место, где эта развилка описана. Прямые сравнения с 'confirmed'
 * ради отрисовки заводить заново не нужно.
 */

/** Чьими глазами смотрят на бронь. */
export type BookingViewer = 'user' | 'expert';

/** Условия удержания неустойки — приходят из слота. */
export interface PenaltyTerms {
    cost: number;
    penaltyPercent: number;
    startAt: number;
}

export interface PenaltyPreview {
    /** Удержание применяется: бронь подтверждена, занятие впереди, процент ненулевой. */
    applies: boolean;
    penaltyAmount: number;
    refundAmount: number;
}

/** Бронь ещё можно отменить: она либо ждёт ответа, либо подтверждена. */
export const isActionable = (status?: string): boolean =>
    status === 'pending' || status === 'confirmed';

/**
 * Можно ли действовать с бронью ПРЯМО СЕЙЧАС — статус плюс время.
 *
 * D-195: время участвовало только в расчёте суммы возврата, но не в решении
 * «показывать ли действие». В секунду начала занятия удержание переставало
 * применяться, подсказка переключалась на «деньги вернутся полностью» — а
 * сервер ровно с этого момента отменять отказывался. Экран обещал выгодное
 * действие, которого уже не было, в момент наибольшего волнения ученика.
 *
 * Правило симметрично для обеих сторон прилавка: подтверждённую бронь после
 * начала занятия не отменяет ни ученик (BookingsController::post__cancel),
 * ни преподаватель (ExpertBookingsService). Заявка, которую так и не
 * подтвердили, отменяется и после начала — иначе деньги за несостоявшееся
 * занятие остались бы запертыми.
 *
 * Время неизвестно — не запрещаем: сервер всё равно проверит, а прятать
 * действие из-за отсутствия данных хуже, чем показать лишнее.
 */
export const canActNow = (status?: string, startAt?: number): boolean => {
    if (!isActionable(status)) return false;
    if (!isConfirmed(status)) return true;
    if (typeof startAt !== 'number' || startAt <= 0) return true;

    return startAt > Math.floor(Date.now() / 1000);
};

/**
 * Подтверждена ли бронь. Отдельная функция, а не сравнение по месту: именно
 * здесь трижды рождалась ошибка «всё, что не confirmed, — это pending».
 */
export const isConfirmed = (status?: string): boolean => status === 'confirmed';

/**
 * Итог потерянной брони — тем же словом, каким назвали действие на входе.
 *
 * До этого вход и выход говорили по-разному: кнопка «Снять заявку», окно
 * «Снятие неподтверждённой заявки», а через секунду карточка объявляла
 * «Отменён» и история операций — «отменили» (D-135). Человек не понимал, одно
 * это действие или два разных.
 *
 * Различать помогает `confirmed_at`: подтверждения не было — значит бронь не
 * отменяли, а сняли (ученик) или отклонили (преподаватель). Отдельного столбца
 * заводить не пришлось, и старые записи читаются правильно задним числом.
 *
 * Пустая роль — бронь из времён, когда мы ещё не записывали, чьё это решение.
 * Такой оставляем прежнее сухое «Отменён»: угадывать хуже, чем промолчать.
 */
export const outcomeLabel = (booking: {
    status?: string;
    confirmed_at?: number | null;
    cancelled_role?: string | null;
}): string => {
    if (booking.status !== 'cancelled') return '';

    const wasConfirmed = !!booking.confirmed_at;
    if (wasConfirmed) return t.Booking_Status_Cancelled();

    switch (booking.cancelled_role) {
        case 'user':
            return t.Booking_Status_Withdrawn();
        case 'expert':
            return t.Booking_Status_Declined();
        default:
            return t.Booking_Status_Cancelled();
    }
};

/**
 * Кто потерял бронь и каким действием — одной фразой.
 *
 * Живёт здесь, а не в карточке, потому что ровно эту фразу показывают два
 * разных экрана: карточка брони и строка истории операций. Пока их было две
 * копии, они разъезжались (D-124 — почин на карточке, забытая мини-карточка).
 *
 * `viewerIsStudent` решает, говорить «вы» или называть вторую сторону.
 */
export const cancelActorLabel = (opts: {
    role?: string | null;
    wasConfirmed: boolean;
    viewerIsStudent: boolean;
}): string => {
    const {role, wasConfirmed, viewerIsStudent} = opts;

    switch (role) {
        case 'user':
            if (!wasConfirmed) {
                return viewerIsStudent ? t.Booking_WithdrawnByYou() : t.Booking_WithdrawnByStudent();
            }

            return viewerIsStudent ? t.Booking_CancelledByYou() : t.Booking_CancelledByStudent();
        case 'expert':
            if (wasConfirmed) {
                return viewerIsStudent
                    ? t.Booking_CancelledLessonByExpert()
                    : t.Booking_CancelledLessonByYouAsExpert();
            }

            return viewerIsStudent ? t.Booking_CancelledByExpert() : t.Booking_CancelledByYouAsExpert();
        case 'moderator':
            return t.Booking_CancelledByModerator();
        case 'system':
            return t.Booking_CancelledBySystem();
        default:
            return '';
    }
};

/** Надпись на кнопке действия. */
export const actionLabel = (viewer: BookingViewer, status?: string): string => {
    if (viewer === 'expert') {
        return isConfirmed(status) ? t.Booking_CancelLessonCard() : t.Booking_DeclineCard();
    }

    return isConfirmed(status) ? t.User_Cancel_Card() : t.User_Withdraw_Card();
};

/** Заголовок окна подтверждения. */
export const actionTitle = (viewer: BookingViewer, status?: string): string => {
    if (viewer === 'expert') {
        return isConfirmed(status) ? t.Booking_CancelLessonTitle() : t.Booking_RejectTitle();
    }

    return isConfirmed(status) ? t.User_Cancel_Title() : t.User_Withdraw_Title();
};

/** Подпись поля причины. */
export const actionReasonLabel = (viewer: BookingViewer, status?: string): string => {
    if (viewer === 'expert') {
        return isConfirmed(status) ? t.Booking_CancelLessonReasonLabel() : t.Booking_RejectReasonLabel();
    }

    return isConfirmed(status) ? t.User_Cancel_ReasonLabel() : t.User_Withdraw_ReasonLabel();
};

/** Подсказка внутри поля причины. */
export const actionReasonPlaceholder = (viewer: BookingViewer, status?: string): string => {
    if (viewer === 'expert') {
        return isConfirmed(status)
            ? t.Booking_CancelLessonReasonPlaceholder()
            : t.Booking_RejectReasonPlaceholder();
    }

    return isConfirmed(status) ? t.User_Cancel_ReasonPlaceholder() : t.User_Withdraw_ReasonPlaceholder();
};

/** Надпись на кнопке отправки в окне. */
export const actionSubmitLabel = (viewer: BookingViewer, status?: string): string => {
    if (viewer === 'expert') {
        return isConfirmed(status) ? t.Booking_CancelLessonSubmit() : t.Booking_Reject();
    }

    return isConfirmed(status) ? t.User_Cancel_Submit() : t.User_Withdraw_Submit();
};

/** Тост после успешного действия. */
export const actionSuccessToast = (viewer: BookingViewer, status?: string): string => {
    if (viewer === 'expert') {
        return isConfirmed(status) ? t.Booking_CancelLessonSuccess() : t.Booking_RejectSuccess();
    }

    return isConfirmed(status) ? t.User_Cancel_Success() : t.User_Withdraw_Success();
};

/**
 * Развёрнутое предупреждение о последствиях — то, что показывается внутри окна.
 * Четыре текста: обе стороны прилавка × два состояния брони.
 *
 * Каждый называет **обе половины цены** — что станет с деньгами и что со
 * счётчиком. До этого карточка говорила про деньги, а окно про счётчик, и
 * полную цену действия человек мог собрать только сам, из двух экранов
 * (нашёл expert-3 при живом отказе по заявке #20). Исключение — ученик,
 * отменяющий подтверждённую бронь: там сумма возврата зависит от неустойки и
 * считается отдельно, `penaltyPreview`, повторять её словами нельзя.
 */
export const actionImpact = (viewer: BookingViewer, status?: string): string => {
    if (viewer === 'expert') {
        return isConfirmed(status) ? t.Booking_CancelLessonImpact() : t.Booking_DeclineImpact();
    }

    return isConfirmed(status) ? t.Booking_CancelImpact() : t.Booking_WithdrawImpact();
};

/**
 * Удержание считается по тем же трём условиям, что и на сервере
 * (`computeRefundAmounts`): бронь была подтверждена, занятие ещё не началось,
 * процент ненулевой. Расхождение здесь означало бы, что экран обещает одну
 * сумму, а списывается другая.
 */
export const penaltyPreview = (status: string | undefined, terms: PenaltyTerms): PenaltyPreview => {
    const cost = terms.cost ?? 0;
    const pct = terms.penaltyPercent ?? 0;
    const applies = isConfirmed(status)
        && cost > 0
        && pct > 0
        && terms.startAt > Math.floor(Date.now() / 1000);

    const penaltyAmount = applies ? Math.floor(cost * pct / 100) : 0;

    return {applies, penaltyAmount, refundAmount: cost - penaltyAmount};
};

/** Короткая подпись цены действия — рядом с кнопкой, до нажатия. */
export const actionCostHint = (
    viewer: BookingViewer,
    status: string | undefined,
    terms?: PenaltyTerms,
): string => {
    // Цена есть только у действия, которое возможно. Раньше здесь стоял
    // isActionable() без времени, и после начала занятия подсказка обещала
    // полный возврат за отмену, которую сервер уже не пропускал (D-195).
    if (!canActNow(status, terms?.startAt)) return '';

    if (viewer === 'expert') {
        return isConfirmed(status) ? t.Booking_CostHint_CancelLesson() : t.Booking_CostHint_Decline();
    }

    if (!isConfirmed(status)) return t.Booking_CostHint_Withdraw();

    const preview = terms ? penaltyPreview(status, terms) : null;

    return preview?.applies
        ? t.Booking_CostHint_CancelPenalty([preview.penaltyAmount, terms!.penaltyPercent])
        : t.Booking_CostHint_CancelFree();
};

/**
 * Что ждёт ученика дальше, пока заявка не подтверждена: во что обойдётся
 * отмена после подтверждения и что будет, если преподаватель промолчит.
 * Второй пункт до этого не отвечался нигде вообще.
 */
export const pendingTerms = (viewer: BookingViewer, status: string | undefined, terms?: PenaltyTerms): string[] => {
    if (viewer === 'expert' || status !== 'pending') return [];

    const out: string[] = [];
    const cost = terms?.cost ?? 0;
    const pct = terms?.penaltyPercent ?? 0;

    if (cost > 0 && pct > 0) {
        out.push(t.Booking_CancelTerms_AfterConfirm([pct, Math.floor(cost * pct / 100)]));
    }

    out.push(t.Booking_CancelTerms_Unanswered());

    return out;
};
