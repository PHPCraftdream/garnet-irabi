import {I18nForeground as t} from '@/I18nGen/I18nForeground';
import type {BookingViewer} from '@/Common/booking/actions/rules/bookingAction';
import {isConfirmed} from '@/Common/booking/status/isConfirmed';

/** Подпись поля причины. */
export const actionReasonLabel = (viewer: BookingViewer, status?: string): string => {
    if (viewer === 'expert') {
        return isConfirmed(status) ? t.Booking_CancelLessonReasonLabel() : t.Booking_RejectReasonLabel();
    }

    return isConfirmed(status) ? t.User_Cancel_ReasonLabel() : t.User_Withdraw_ReasonLabel();
};

/** Подсказка внутри поля причины. */
