import * as React from 'react';
import {I18nForeground as t} from '../../I18nGen/I18nForeground';
import {isConfirmed} from '../../Common/booking/bookingAction';
import {formatTs} from '@common/Utils/DateUtils';
import {translateStatus} from '../../Common/booking/statusHelpers';
import {UniversalBadge} from '../../Common/booking/StatusBadge';
import {UserLink} from '@common/Components/UserPreviewModal/UserLink';
import {ExternalLink} from '@common/Components/ExternalLink';
import {appUrl} from '@common/Utils/appUrl';

interface BookingItem {
    id: number;
    start_at: number;
    expert_id: number;
    expert_name: string;
    status: string;
    label: string;
    is_online?: boolean;
    location?: string;
}

/**
 * Место встречи — только у подтверждённой брони.
 *
 * До подтверждения ссылки нет и быть не должно: преподаватель ещё не сказал
 * «да», а комната уже была бы открыта.
 */
const MeetingLine: React.FC<{booking: BookingItem}> = ({booking}) => {
    const visible = isConfirmed(booking.status) && (booking.location || booking.is_online !== undefined);
    if (!visible || !booking.location) return null;

    const isUrl = /^https?:\/\//i.test(booking.location);

    return (
        <div className="text-xs text-muted mt-0.5 truncate">
            {isUrl
                ? <ExternalLink href={booking.location} className="text-accent hover:underline">{booking.location}</ExternalLink>
                : booking.location}
        </div>
    );
};

const BookingRow: React.FC<{booking: BookingItem}> = ({booking}) => (
    <div className="booking-row" data-test-id={`upcoming-booking-${booking.id}`}>
        <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-on-surface">{booking.label}</div>
            <div className="text-sm text-muted">
                {booking.expert_id > 0
                    ? (
                        <UserLink
                            id={booking.expert_id}
                            name={booking.expert_name}
                            isExpert
                            className="text-accent hover:underline"
                            onClick={e => e.stopPropagation()}
                        />
                    )
                    : booking.expert_name}
                {' '}&middot; {formatTs(booking.start_at)}
            </div>
            <MeetingLine booking={booking} />
        </div>
        <UniversalBadge status={booking.status} label={translateStatus(booking.status)} />
    </div>
);

/** Ближайшие занятия ученика. */
export const UpcomingBookings: React.FC<{bookings: BookingItem[]}> = ({bookings}) => (
    <div data-test-id="upcoming-bookings">
        <div className="section-header-row">
            <h2 className="section-heading mb-0">{t.Dash_Upcoming()}</h2>
            {bookings.length > 0 && (
                <a href={appUrl('/bookings')} className="view-all-link">{t.Dash_ViewAll()}</a>
            )}
        </div>
        {bookings.length === 0 && (
            <div className="empty-state-card">
                <p className="text-muted mb-1 font-medium">{t.Dash_StartLearning()}</p>
                <a href={appUrl('/slots')} className="btn btn-primary btn-sm">{t.Menu_BrowseSlots()}</a>
            </div>
        )}
        {bookings.length > 0 && (
            <div className="space-y-2">
                {bookings.map(b => <BookingRow key={b.id} booking={b} />)}
            </div>
        )}
    </div>
);
