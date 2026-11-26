import * as React from 'react';
import {UniversalBadge} from '@/Common/booking/status/StatusBadge';
import {translateStatus} from '@/Common/booking/status/statusHelpers';
import {outcomeLabel} from '@/Common/booking/actions/outcomes/outcomeLabel';
import {Booking} from '@/Islands/User/Bookings/card/bookingCardTypes';

/** Показывает локализованный статус и исход отмены, если он известен. */
export const BookingStatus: React.FC<{booking: Booking}> = ({booking}) => (
    <span data-test-id={`booking-status-${booking.id}`}>
        <UniversalBadge status={booking.status} label={outcomeLabel(booking) || translateStatus(booking.status)} />
    </span>
);
