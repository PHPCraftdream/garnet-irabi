import {I18nForeground as t} from '@/I18nGen/I18nForeground';
import type {BookingViewer} from '@/Common/booking/actions/rules/bookingAction';
import {isConfirmed} from '@/Common/booking/status/isConfirmed';

/** Развёрнутое предупреждение о последствиях действия. */
export const actionImpact = (viewer: BookingViewer, status?: string): string => {
    if (viewer === 'expert') {
        return isConfirmed(status) ? t.Booking_CancelLessonImpact() : t.Booking_DeclineImpact();
    }

    return isConfirmed(status) ? t.Booking_CancelImpact() : t.Booking_WithdrawImpact();
};

/** Рассчитывает удержание и возврат при отмене брони. */
/** Рассчитывает удержание и возврат при отмене брони. */
