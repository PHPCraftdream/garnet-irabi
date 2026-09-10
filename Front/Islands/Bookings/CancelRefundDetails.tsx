import * as React from 'react';
import {I18nForeground as t} from '../../I18nGen/I18nForeground';
import {penaltyPreview} from '../../Common/bookingAction';
import {SlotInfo} from './card/bookingCardTypes';

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
            <div className="user-cancel-info-bar" data-test-id="cancel-refund-info">
                {t.Booking_RefundInfo()} {cost} &#x20bd;
            </div>
        );
    }

    return (
        <div className="user-cancel-info-bar space-y-1" data-test-id="cancel-penalty-preview">
            <div className="text-warning">
                {t.Booking_PenaltyKeptByExpert([slot.cancellation_penalty_percent, preview.penaltyAmount])}
            </div>
            <div className="text-muted">
                {t.Booking_RefundAmount([preview.refundAmount])}
            </div>
        </div>
    );
};
