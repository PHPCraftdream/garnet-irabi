import * as React from 'react';
import {AntiHookComponent} from '@react-carburetor/core';
import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';
import {BookingCounts, StatusFilter} from './bookingCardTypes';

const TABS: {key: StatusFilter; label: () => string; testId: string}[] = [
    {key: 'all', label: () => t.Bookings_FilterAll(), testId: 'bookings-filter-all'},
    {key: 'pending', label: () => t.Bookings_FilterPending(), testId: 'bookings-filter-pending'},
    {key: 'confirmed', label: () => t.Bookings_FilterConfirmed(), testId: 'bookings-filter-confirmed'},
    {key: 'cancelled', label: () => t.Bookings_FilterCancelled(), testId: 'bookings-filter-cancelled'},
    {key: 'completed', label: () => t.Bookings_FilterCompleted(), testId: 'bookings-filter-completed'},
];

interface Props {
    title: string;
    counts: BookingCounts;
    statusFilter: StatusFilter;
    showPast: boolean;
    onStatusChange: (s: StatusFilter) => void;
    onTogglePast: () => void;
}

class FilterTab extends AntiHookComponent<{tab: typeof TABS[number]; count: number; selected: boolean; onStatusChange: (s: StatusFilter) => void}> {
    private readonly select = () => this.props.onStatusChange(this.props.tab.key);

    render() {
        const {tab, count, selected} = this.props;
        return (
            <button
                type="button"
                role="tab"
                aria-selected={selected}
                className={selected ? 'slot-filter-chip-active' : 'slot-filter-chip'}
                onClick={this.select}
                data-test-id={tab.testId}
            >
                {tab.label()}
                <span className={selected ? 'slot-status-count-active' : 'slot-status-count'}>{count}</span>
            </button>
        );
    }
}

/**
 * Фильтры списка броней.
 *
 * Пустые состояния не показываются вовсе: вкладка «Отменены (0)» ничего не
 * сообщает, но занимает место и создаёт впечатление, что там что-то есть.
 */
export const BookingsFilterTabs: React.FC<Props> = ({
    title,
    counts,
    statusFilter,
    showPast,
    onStatusChange,
    onTogglePast,
}) => {
    const tabs: React.ReactNode[] = [];
    for (const tab of TABS) {
        if (tab.key !== 'all' && counts[tab.key] <= 0) continue;
        tabs.push(<FilterTab key={tab.key} tab={tab} count={counts[tab.key]} selected={statusFilter === tab.key} onStatusChange={onStatusChange} />);
    }
    return (
    <div className="section-soft" data-bookings-filters>
        {title && <h2>{title}</h2>}
        <div className="booking-card-filter-row" role="tablist" data-test-id="bookings-filters">
            {tabs}
            {(showPast || counts.past > 0) && (
                <button
                    type="button"
                    className={showPast ? 'slot-filter-chip-active' : 'slot-filter-chip'} data-bookings-past
                    onClick={onTogglePast}
                    data-test-id="bookings-toggle-past"
                    aria-pressed={showPast}
                >
                    {showPast ? t.Bookings_HidePast() : t.Bookings_ShowPast()}
                    {!showPast && counts.past > 0 && <span className="slot-status-count">{counts.past}</span>}
                </button>
            )}
        </div>
    </div>
    );
};
