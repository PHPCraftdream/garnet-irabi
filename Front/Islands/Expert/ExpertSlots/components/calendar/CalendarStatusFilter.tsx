import * as React from 'react';
import {I18nForeground as t} from '../../../../../I18nGen/I18nForeground';
import {translateStatus} from '../../../../../Common/booking/status/statusHelpers';
import {Slot} from '../../types';
import {STATUS_FILTERS} from './logic/STATUS_FILTERS';

export type StatusFilter = typeof STATUS_FILTERS[number];

/**
 * `pending` — не статус слота, а состояние брони на нём, поэтому считается
 * отдельной веткой везде, где встречается.
 */
const hasPendingBooking = (slot: Slot) => slot.booking_status === 'pending';

const countFor = (slots: Slot[], f: StatusFilter): number =>
    f === 'pending'
        ? slots.filter(hasPendingBooking).length
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

interface StatusOptionProps {
    filter: StatusFilter;
    active: boolean;
    count?: number;
    onChange: (filter: StatusFilter) => void;
}

class StatusOption extends React.Component<StatusOptionProps> {
    /** Обработать соответствующее действие пользователя. */
    private readonly select = () => this.props.onChange(this.props.filter);

    /** Отобразить соответствующую часть интерфейса. */
    public render() {
        const {filter, active, count} = this.props;
        return (
            <button
                type="button"
                className={active ? 'expert-calendar-status-active' : 'expert-calendar-status-button'}
                onClick={this.select}
                data-test-id={`filter-status-${filter}`}
            >
                {labelFor(filter)}
                {filter !== 'all' && ` (${count})`}
            </button>
        );
    }
}

/** Фильтр по состоянию — показываются только те кнопки, за которыми что-то есть. */
export class CalendarStatusFilter extends React.Component<Props> {
    /** Отобразить соответствующую часть интерфейса. */
    private readonly renderFilter = (filter: StatusFilter) => (
        <StatusOption
            key={filter}
            filter={filter}
            active={this.props.value === filter}
            count={filter === 'all' ? undefined : countFor(this.props.slots, filter)}
            onChange={this.props.onChange}
        />
    );

    /** Отобразить соответствующую часть интерфейса. */
    public render() {
        const visible: StatusFilter[] = [];
        for (const filter of STATUS_FILTERS) {
            if (filter === 'all' || countFor(this.props.slots, filter) > 0) visible.push(filter);
        }
        return <div className="expert-calendar-filters"
        data-test-id="expert-status-filter">{visible.map(this.renderFilter)}</div>;
    }
}
