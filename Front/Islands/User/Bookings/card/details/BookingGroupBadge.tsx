import * as React from 'react';
import {I18nForeground as t} from '../../../../../I18nGen/I18nForeground';

const slotGroupBadge = t.Slot_GroupBadge;

interface Props {
    bookingId: number;
    maxUsers?: number;
}

/** Показывает отметку о групповом занятии и его вместимость. */
export const BookingGroupBadge: React.FC<Props> = ({bookingId, maxUsers}) => (
    <p className="booking-group-badge-line">
        <span data-test-id={`booking-group-${bookingId}`}>
            {slotGroupBadge([String(maxUsers)])}
        </span>
    </p>
);
