import * as React from 'react';
import {I18nForeground as t} from '../../I18nGen/I18nForeground';
import {formatTs} from '@common/Utils/DateUtils';
import {appUrl} from '@common/Utils/appUrl';

interface ExpertSlotItem {
    id: number;
    start_at: number;
    duration_min: number;
    booked_count: number;
    max_users: number;
    label: string;
}

interface ExpertUpcomingSlotsProps {
    slots: ExpertSlotItem[];
}

export const ExpertUpcomingSlots: React.FC<ExpertUpcomingSlotsProps> = ({slots}) => {
    if (slots.length === 0) return null;

    return (
        <div data-test-id="expert-slots">
            <div className="section-header-row">
                <h2 className="section-heading mb-0">{t.Dash_ExpertSlots()}</h2>
                <a href={appUrl('/expert/~slots')} className="view-all-link">{t.Dash_ViewAll()}</a>
            </div>
            <div className="space-y-2">
                {slots.map(slot => (
                    <div key={slot.id} className="booking-row">
                        <div>
                            <div className="text-sm font-medium text-on-surface">{slot.label}</div>
                            <div className="text-xs text-muted">
                                {formatTs(slot.start_at)}
                                <span className="text-muted"> &middot; {slot.duration_min} {t.Slot_Duration_Min()}</span>
                            </div>
                        </div>
                        <span className="count-badge-accent">
                            {slot.booked_count}/{slot.max_users} {t.Dash_Booked()}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
};
