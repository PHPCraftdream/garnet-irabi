import * as React from 'react';
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
}) => (
    <div className="section-soft mb-4">
        {title && <h2 className="mb-3 text-xl">{title}</h2>}
        <div className="flex flex-wrap items-center gap-2 mb-0" role="tablist" data-test-id="bookings-filters">
            {TABS.filter(tab => tab.key === 'all' || counts[tab.key] > 0).map(tab => (
                <button
                    key={tab.key}
                    type="button"
                    role="tab"
                    aria-selected={statusFilter === tab.key}
                    className={`chip ${statusFilter === tab.key ? 'chip-active' : ''}`}
                    onClick={() => onStatusChange(tab.key)}
                    data-test-id={tab.testId}
                >
                    {tab.label()}
                    <span className="chip-count">{counts[tab.key]}</span>
                </button>
            ))}
            {(showPast || counts.past > 0) && (
                <button
                    type="button"
                    className={`chip ${showPast ? 'chip-active' : ''} ml-auto`}
                    onClick={onTogglePast}
                    data-test-id="bookings-toggle-past"
                    aria-pressed={showPast}
                >
                    {showPast ? t.Bookings_HidePast() : t.Bookings_ShowPast()}
                    {!showPast && counts.past > 0 && <span className="chip-count">{counts.past}</span>}
                </button>
            )}
        </div>
    </div>
);
