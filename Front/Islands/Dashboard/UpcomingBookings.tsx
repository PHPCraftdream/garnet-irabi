import * as React from 'react';
import {I18nForeground as t} from '../../I18nGen/I18nForeground';
import {formatTs} from '@common/Utils/DateUtils';
import {translateStatus} from '../../Common/statusHelpers';
import {UniversalBadge} from '../../Common/StatusBadge';
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

interface UpcomingBookingsProps {
    bookings: BookingItem[];
}

export const UpcomingBookings: React.FC<UpcomingBookingsProps> = ({bookings}) => (
    <div data-test-id="upcoming-bookings">
        <div className="section-header-row">
            <h2 className="section-heading mb-0">{t.Dash_Upcoming()}</h2>
            {bookings.length > 0 && (
                <a href={appUrl('/bookings')} className="view-all-link">{t.Dash_ViewAll()}</a>
            )}
        </div>
        {bookings.length === 0 ? (
            <div className="empty-state-card">
                <p className="text-muted mb-1 font-medium">{t.Dash_StartLearning()}</p>
                <a href={appUrl('/slots')} className="btn btn-primary btn-sm">{t.Menu_BrowseSlots()}</a>
            </div>
        ) : (
            <div className="space-y-2">
                {bookings.map(b => {
                    const showMeeting = b.status === 'confirmed' && (b.location || b.is_online !== undefined);
                    const isUrl = !!b.location && /^https?:\/\//i.test(b.location);
                    return (
                        <div key={b.id} className="booking-row">
                            <div className="min-w-0 flex-1">
                                <div className="text-sm font-medium text-on-surface">{b.label}</div>
                                <div className="text-sm text-muted">
                                    {b.expert_id > 0 ? (
                                        <UserLink id={b.expert_id} name={b.expert_name} isExpert className="text-accent hover:underline" onClick={e => e.stopPropagation()} />
                                    ) : b.expert_name} &middot; {formatTs(b.start_at)}
                                </div>
                                {showMeeting && b.location && (
                                    <div className="text-xs text-muted mt-0.5 truncate">
                                        {isUrl ? (
                                            <ExternalLink href={b.location} className="text-accent hover:underline">{b.location}</ExternalLink>
                                        ) : b.location}
                                    </div>
                                )}
                            </div>
                            <UniversalBadge status={b.status} label={translateStatus(b.status)} />
                        </div>
                    );
                })}
            </div>
        )}
    </div>
);
