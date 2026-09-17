import * as React from 'react';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import {formatTs} from '@common/Utils/Time/DateUtils';
import {UserLink} from '@common/Components/UserPreviewModal/UserLink';
import {actionLabel} from '../../../Common/booking/bookingAction';

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

export function getInitials(name: string): string {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();

    return (name[0] || '?').toUpperCase();
}

/** Кто записался и когда занятие. */
export const BookingPerson: React.FC<{
    userId: number;
    userName: string;
    startAt: number;
    durationMin: number;
    cost: number;
    testId: string;
}> = ({userId, userName, startAt, durationMin, cost, testId}) => (
    <div className="flex items-center gap-3">
        <div className="avatar-circle">{getInitials(userName)}</div>
        <div>
            <div className="text-sm font-medium text-on-surface" data-test-id={testId}>
                <UserLink id={userId} name={userName} className="text-accent hover:underline" />
            </div>
            <div className="text-xs text-muted">
                {formatTs(startAt)} &middot; {durationMin} {t.Slot_Duration_Min()}
                {cost > 0 && <> &middot; {cost} &#8381;</>}
            </div>
        </div>
    </div>
);

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
