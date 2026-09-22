import * as React from 'react';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {actionLabel} from '../../../Common/booking/bookingAction';
import {BookingPerson} from './BookingPerson';

export interface PendingBookingItem {
    booking_id: number;
    user_id: number;
    user_name: string;
    slot_id: number;
    start_at: number;
    duration_min: number;
    cost: number;
    created_at: number;
}

interface Props {
    booking: PendingBookingItem;
    confirming: boolean;
    rejecting: boolean;
    onConfirm: (bookingId: number) => void;
    onReject: (bookingId: number) => void;
}

/** Заявка, ждущая решения преподавателя. */
export const PendingBookingRow: React.FC<Props> = ({booking, confirming, rejecting, onConfirm, onReject}) => (
    <div className="booking-row" data-test-id={`pending-booking-${booking.booking_id}`}>
        <BookingPerson
            userId={booking.user_id}
            userName={booking.user_name}
            startAt={booking.start_at}
            durationMin={booking.duration_min}
            cost={booking.cost}
            testId={`pending-user-link-${booking.booking_id}`}
        />
        <div className="flex gap-2 flex-shrink-0">
            <button
                className="btn btn-sm btn-success"
                disabled={confirming}
                onClick={() => onConfirm(booking.booking_id)}
                data-test-id={`pending-confirm-${booking.booking_id}`}
            >
                {confirming ? '...' : t.Booking_Confirm()}
            </button>
            {/* Название берётся из общего словаря действий: заявка, а не
                занятие, — значит «Отклонить заявку», как и на других экранах. */}
            <button
                className="btn btn-sm btn-outline-danger"
                disabled={rejecting}
                onClick={() => onReject(booking.booking_id)}
                data-test-id={`pending-reject-${booking.booking_id}`}
            >
                {actionLabel('expert', 'pending')}
            </button>
        </div>
    </div>
);
