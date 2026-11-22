import * as React from 'react';
import {UniversalBadge} from '../../../../../Common/booking/StatusBadge';
import {translateStatus} from '../../../../../Common/booking/statusHelpers';
import {outcomeLabel} from '../../../../../Common/booking/bookingAction';
import {Booking} from '../bookingCardTypes';

export const BookingStatus: React.FC<{booking: Booking}> = ({booking}) => (
    <span data-test-id={`booking-status-${booking.id}`}>
        <UniversalBadge status={booking.status} label={outcomeLabel(booking) || translateStatus(booking.status)} />
    </span>
);
