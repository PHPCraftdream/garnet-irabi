import {I18nForeground as t} from '@/I18nGen/I18nForeground';
import type {BookingViewer, PenaltyTerms} from '@/Common/booking/actions/rules/bookingAction';
import {canActNow} from '@/Common/booking/actions/rules/canActNow';
import {isConfirmed} from '@/Common/booking/status/isConfirmed';
import {penaltyPreview} from './penaltyPreview';

/** Короткая подпись цены действия рядом с кнопкой. */
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
