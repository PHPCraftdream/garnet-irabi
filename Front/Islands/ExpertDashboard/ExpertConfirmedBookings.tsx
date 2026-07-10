import * as React from 'react';
import {I18nForeground as t} from '../../I18nGen/I18nForeground';
import {formatTs} from '@common/Utils/DateUtils';
import {UserLink} from '@common/Components/UserPreviewModal/UserLink';

export interface ConfirmedBookingItem {
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
    bookings: ConfirmedBookingItem[];
}

function getInitials(name: string): string {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return (name[0] || '?').toUpperCase();
}

export const ExpertConfirmedBookings: React.FC<Props> = ({bookings}) => {
    return (
        <div data-test-id="expert-confirmed-bookings">
            <div className="section-header-row">
                <h2 className="section-heading mb-0">
                    {t.Teaching_ConfirmedBookingsTitle()}
                    {bookings.length > 0 && (
                        <span className="ms-2 count-badge-success">
                            {bookings.length}
                        </span>
                    )}
                </h2>
            </div>

            {bookings.length === 0 ? (
                <div className="empty-state-card">
                    <p className="text-muted font-medium">{t.Teaching_NoConfirmedBookings()}</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {bookings.map(b => (
                        <div
                            key={b.booking_id}
                            className="booking-row"
                            data-test-id={`confirmed-booking-${b.booking_id}`}
                        >
                            <div className="flex items-center gap-3">
                                <div className="avatar-circle">
                                    {getInitials(b.user_name)}
                                </div>
                                <div>
                                    <div className="text-sm font-medium text-on-surface" data-test-id={`confirmed-user-link-${b.booking_id}`}>
                                        <UserLink
                                            id={b.user_id}
                                            name={b.user_name}
                                            className="text-accent hover:underline"
                                        />
                                    </div>
                                    <div className="text-xs text-muted">
                                        {formatTs(b.start_at)} &middot; {b.duration_min} {t.Slot_Duration_Min()}
                                        {b.cost > 0 && <> &middot; {b.cost} &#8381;</>}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
