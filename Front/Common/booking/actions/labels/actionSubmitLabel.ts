import {I18nForeground as t} from '@/I18nGen/I18nForeground';
import type {BookingViewer} from '@/Common/booking/actions/rules/bookingAction';
import {isConfirmed} from '@/Common/booking/status/isConfirmed';

/** Надпись на кнопке отправки в окне. */
export const actionSubmitLabel = (viewer: BookingViewer, status?: string): string => {
    if (viewer === 'expert') {
        return isConfirmed(status) ? t.Booking_CancelLessonSubmit() : t.Booking_Reject();
    }

    return isConfirmed(status) ? t.User_Cancel_Submit() : t.User_Withdraw_Submit();
};

/** Тост после успешного действия. */
