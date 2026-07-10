import * as React from 'react';
import {I18nForeground as t} from '../../I18nGen/I18nForeground';
import {formatTs} from '@common/Utils/DateUtils';
import {appUrl} from '@common/Utils/appUrl';

interface UpcomingSlot {
    id: number;
    start_at: number;
    duration_min: number;
    booked_count: number;
    max_users: number;
    label: string;
}

interface ExpertUpcomingProps {
    slots: UpcomingSlot[];
}

export const ExpertUpcoming: React.FC<ExpertUpcomingProps> = ({slots}) => (
    <div data-test-id="expert-upcoming">
        <div className="section-header-row">
            <h2 className="section-heading mb-0">{t.Teaching_MySlots()}</h2>
            {slots.length > 0 && (
                <a href={appUrl('/expert/~slots')} className="view-all-link">{t.Dash_ViewAll()}</a>
            )}
        </div>
        {slots.length === 0 ? (
            <div className="empty-state-card">
                <p className="text-muted font-medium">{t.Feed_NoUpcoming()}</p>
                <a href={appUrl('/expert/~slots')} className="btn btn-primary btn-sm mt-2">{t.Menu_ManageSlots()}</a>
            </div>
        ) : (
            <div className="space-y-2">
                {slots.map(slot => (
                    <div key={slot.id} className="booking-row" data-test-id={`expert-slot-${slot.id}`}>
                        <div>
                            <div className="text-sm font-medium text-on-surface">{slot.label}</div>
                            <div className="text-xs text-muted">
                                {formatTs(slot.start_at)} &middot; {slot.duration_min} {t.Slot_Duration_Min()}
                            </div>
                        </div>
                        <span className="count-badge-accent">
                            {slot.booked_count}/{slot.max_users}
                        </span>
                    </div>
                ))}
            </div>
        )}
    </div>
);
