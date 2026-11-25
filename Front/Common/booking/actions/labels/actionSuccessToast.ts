import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';
import type {BookingViewer} from '../rules/bookingAction';
import {isConfirmed} from '../../status/isConfirmed';

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
