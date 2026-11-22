import * as React from 'react';
import {AntiHookComponent} from '@react-carburetor/core';
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
export class PendingBookingRow extends AntiHookComponent<Props> {
    private readonly confirm = () => this.props.onConfirm(this.props.booking.booking_id);
    private readonly reject = () => this.props.onReject(this.props.booking.booking_id);

    render() {
        const {booking, confirming, rejecting} = this.props;
        return (
            <div data-test-id={`pending-booking-${booking.booking_id}`}>
                <BookingPerson
                    userId={booking.user_id}
                    userName={booking.user_name}
                    startAt={booking.start_at}
                    durationMin={booking.duration_min}
                    cost={booking.cost}
                    testId={`pending-user-link-${booking.booking_id}`}
                />
                <div className="expert-pending-actions">
                    <button className="compact-success-action" disabled={confirming} onClick={this.confirm} data-test-id={`pending-confirm-${booking.booking_id}`}>
                        {confirming ? '...' : t.Booking_Confirm()}
                    </button>
                    <button className="slot-remove-btn" disabled={rejecting} onClick={this.reject} data-test-id={`pending-reject-${booking.booking_id}`}>
                        {actionLabel('expert', 'pending')}
                    </button>
                </div>
            </div>
        );
    }
}
