import * as React from 'react';
import {I18nForeground as t} from '../../../../../I18nGen/I18nForeground';

interface Props {
    bookingId: number;
    maxUsers?: number;
}

export const BookingGroupBadge: React.FC<Props> = ({bookingId, maxUsers}) => (
    <p className="booking-group-badge-line">
        <span data-test-id={`booking-group-${bookingId}`}>
            {t.Slot_GroupBadge([String(maxUsers)])}
        </span>
    </p>
);
