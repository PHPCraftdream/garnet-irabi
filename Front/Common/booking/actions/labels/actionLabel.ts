import {I18nForeground as t} from '@/I18nGen/I18nForeground';
import type {BookingViewer} from '@/Common/booking/actions/rules/bookingAction';
import {isConfirmed} from '@/Common/booking/status/isConfirmed';

/** Надпись на кнопке действия. */
export const actionLabel = (viewer: BookingViewer, status?: string): string => {
    if (viewer === 'expert') {
        return isConfirmed(status) ? t.Booking_CancelLessonCard() : t.Booking_DeclineCard();
    }

    return isConfirmed(status) ? t.User_Cancel_Card() : t.User_Withdraw_Card();
};

/** Заголовок окна подтверждения. */
