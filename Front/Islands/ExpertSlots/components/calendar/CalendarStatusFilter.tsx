import * as React from 'react';
import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';
import {translateStatus} from '../../../../Common/booking/statusHelpers';
import {Slot} from '../../types';

export const STATUS_FILTERS = ['all', 'pending', 'free', 'booked', 'completed', 'expired', 'cancelled'] as const;
export type StatusFilter = typeof STATUS_FILTERS[number];

/**
 * `pending` — не статус слота, а состояние брони на нём, поэтому считается
 * отдельной веткой везде, где встречается.
 */
const countFor = (slots: Slot[], f: StatusFilter): number =>
    f === 'pending'
        ? slots.filter(s => s.booking_status === 'pending').length
        : slots.filter(s => s.status === f).length;

const labelFor = (f: StatusFilter): string => {
    if (f === 'all') return t.Admin_Tab_All();
    if (f === 'pending') return t.Slot_Filter_Pending();
    return translateStatus(f);
};

interface Props {
    slots: Slot[];
    value: StatusFilter;
    onChange: (f: StatusFilter) => void;
}

/** Фильтр по состоянию — показываются только те кнопки, за которыми что-то есть. */
export const CalendarStatusFilter: React.FC<Props> = ({slots, value, onChange}) => (
    <div className="flex gap-1 mb-2" data-test-id="expert-status-filter">
        {STATUS_FILTERS
            .filter(f => f === 'all' || countFor(slots, f) > 0)
            .map(f => (
                <button
                    key={f}
                    type="button"
                    className={`status-filter-btn ${value === f ? 'status-filter-btn-active' : ''}`}
                    onClick={() => onChange(f)}
                    data-test-id={`filter-status-${f}`}
                >
                    {labelFor(f)}
                    {f !== 'all' && ` (${countFor(slots, f)})`}
                </button>
            ))}
    </div>
);
