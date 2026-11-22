import * as React from 'react';
import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';
import {formatTs} from '@common/Utils/Time/DateUtils';
import {appUrl} from '@common/Utils/Url/appUrl';

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

interface ExpertSlotRowProps {
    slot: ExpertSlotItem;
}

const ExpertSlotRow: React.FC<ExpertSlotRowProps> = ({slot}) => (
    <div>
        <div>
            <div className="user-dash-row-title">{slot.label}</div>
            <div className="user-dash-row-small">
                {formatTs(slot.start_at)}
                <span className="user-dash-muted"> &middot; {slot.duration_min} {t.Slot_Duration_Min()}</span>
            </div>
        </div>
        <span className="user-dash-count-badge">
            {slot.booked_count}/{slot.max_users} {t.Dash_Booked()}
        </span>
    </div>
);

function renderRow(slot: ExpertUpcomingSlotsProps['slots'][number]) { return <ExpertSlotRow key={slot.id} slot={slot} />; }

export const ExpertUpcomingSlots: React.FC<ExpertUpcomingSlotsProps> = ({slots}) => {
    if (slots.length === 0) return null;

    return (
        <div data-test-id="expert-slots">
            <div className="user-dash-section-header">
                <h2 className="user-dash-section-heading">{t.Dash_ExpertSlots()}</h2>
                <a href={appUrl('/expert/~slots')} className="user-dash-view-all">{t.Dash_ViewAll()}</a>
            </div>
            <div className="user-dash-list">
                {slots.map(renderRow)}
            </div>
        </div>
    );
};
