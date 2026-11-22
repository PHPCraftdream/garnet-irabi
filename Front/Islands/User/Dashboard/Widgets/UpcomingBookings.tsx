import * as React from 'react';
import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';
import {isConfirmed} from '../../../../Common/booking/bookingAction';
import {formatTs} from '@common/Utils/Time/DateUtils';
import {translateStatus} from '../../../../Common/booking/statusHelpers';
import {UniversalBadge} from '../../../../Common/booking/StatusBadge';
import {UserLink} from '@common/Components/UserPreviewModal/UserLink';
import {ExternalLink} from '@common/Components/Layout/ExternalLink';
import {appUrl} from '@common/Utils/Url/appUrl';

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
        <div className="user-dash-meeting">
            {isUrl
                ? <ExternalLink href={booking.location} className="user-dash-link">{booking.location}</ExternalLink>
                : booking.location}
        </div>
    );
};

const stopPropagation = (event: React.MouseEvent) => event.stopPropagation();

const BookingRow: React.FC<{booking: BookingItem}> = ({booking}) => (
    <div data-test-id={`upcoming-booking-${booking.id}`}>
        <div className="user-dash-row-main">
            <div className="user-dash-row-title">{booking.label}</div>
            <div className="user-dash-row-meta">
                {booking.expert_id > 0
                    ? (
                        <UserLink
                            id={booking.expert_id}
                            name={booking.expert_name}
                            isExpert
                            className="user-dash-link"
                            onClick={stopPropagation}
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
function renderRow(b: BookingItem) { return <BookingRow key={b.id} booking={b} />; }

export const UpcomingBookings: React.FC<{bookings: BookingItem[]}> = ({bookings}) => (
    <div data-test-id="upcoming-bookings">
        <div className="user-dash-section-header">
            <h2 className="user-dash-section-heading">{t.Dash_Upcoming()}</h2>
            {bookings.length > 0 && (
                <a href={appUrl('/bookings')} className="user-dash-view-all">{t.Dash_ViewAll()}</a>
            )}
        </div>
        {bookings.length === 0 && (
            <div className="empty-state-card" data-user-dash-empty>
                <p className="user-dash-empty-label">{t.Dash_StartLearning()}</p>
                <a href={appUrl('/slots')} className="primary-action-button" data-user-dash-compact="true">{t.Menu_BrowseSlots()}</a>
            </div>
        )}
        {bookings.length > 0 && (
            <div className="user-dash-list">
                {bookings.map(renderRow)}
            </div>
        )}
    </div>
);
