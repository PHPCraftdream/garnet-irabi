import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';
import type {BookingViewer} from '../rules/bookingAction';
import {isConfirmed} from '../../status/isConfirmed';

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
