import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';
import type {BookingViewer} from '../rules/bookingAction';
import {isConfirmed} from '../../status/isConfirmed';

/** Заголовок окна подтверждения. */
export const actionTitle = (viewer: BookingViewer, status?: string): string => {
    if (viewer === 'expert') {
        return isConfirmed(status) ? t.Booking_CancelLessonTitle() : t.Booking_RejectTitle();
    }

    return isConfirmed(status) ? t.User_Cancel_Title() : t.User_Withdraw_Title();
};

/** Подпись поля причины. */
