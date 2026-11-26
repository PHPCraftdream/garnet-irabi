import * as React from 'react';
import {I18nForeground as t} from '@/I18nGen/I18nForeground';
import {penaltyPreview} from '@/Common/booking/actions/outcomes/penaltyPreview';
import {SlotInfo} from '@/Islands/User/Bookings/card/bookingCardTypes';

const bookingPenaltyKeptByExpert = t.Booking_PenaltyKeptByExpert;
const bookingRefundAmount = t.Booking_RefundAmount;
const bookingRefundInfo = t.Booking_RefundInfo;

interface Props {
    booking?: {bookable_type: string; bookable_id: number; status: string};
    slots: Record<number, SlotInfo>;
}

/**
 * Сколько вернётся и сколько останется у преподавателя — перед тем, как
 * человек нажмёт «Отменить».
 *
 * Суммы считаются общим `penaltyPreview`, тем же, что и на других экранах:
 * если обещание разойдётся со списанием, доверия к обещанию не останется.
 */
export const CancelRefundDetails: React.FC<Props> = ({booking, slots}) => {
    if (!booking || booking.bookable_type !== 'time_slot') return null;

    const slot = slots[booking.bookable_id];
    const cost = slot?.cost ?? 0;
    if (!slot || cost <= 0) return null;

    const preview = penaltyPreview(booking.status, {
        cost,
        penaltyPercent: slot.cancellation_penalty_percent ?? 0,
        startAt: slot.start_at,
    });

    if (!preview.applies) {
        return (
            <div className="booking-refund-info" data-test-id="cancel-refund-info">
                {bookingRefundInfo()} {cost} &#x20bd;
            </div>
        );
    }

    return (
        <div className="booking-penalty-info" data-test-id="cancel-penalty-preview">
            <div className="booking-penalty-amount">
                {bookingPenaltyKeptByExpert([slot.cancellation_penalty_percent, preview.penaltyAmount])}
            </div>
            <div className="booking-refund-amount">
                {bookingRefundAmount([preview.refundAmount])}
            </div>
        </div>
    );
};
