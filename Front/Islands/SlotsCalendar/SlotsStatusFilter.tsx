import * as React from 'react';
import {useMemo} from 'react';
import {I18nForeground as t} from '../../I18nGen/I18nForeground';
import {SlotItem, SlotStatusFilter} from './types';

interface Props {
    slots: SlotItem[];
    bookedIds: Set<number>;
    slotStatuses: Record<string, string>;
    activeFilter: SlotStatusFilter;
    onChange: (filter: SlotStatusFilter) => void;
    isModerator: boolean;
    currentAccountId: number;
}

interface TabDef {
    key: SlotStatusFilter;
    label: string;
    testId: string;
}

interface FilterCounts {
    all: number;
    free: number;
    mine: number;
    pending: number;
    confirmed: number;
    cancelled: number;
    past: number;
}

export const SlotsStatusFilter: React.FC<Props> = ({
    slots,
    bookedIds,
    slotStatuses,
    activeFilter,
    onChange,
    isModerator,
    currentAccountId,
}) => {
    const isRegularUser = !isModerator && currentAccountId > 0;

    const counts = useMemo<FilterCounts>(() => {
        const nowSec = Math.floor(Date.now() / 1000);
        let free = 0;
        let mine = 0;
        let pending = 0;
        let confirmed = 0;
        let cancelled = 0;
        let past = 0;

        for (const slot of slots) {
            if (bookedIds.has(slot.id)) {
                mine++;
                const status = slotStatuses[String(slot.id)] || '';
                if (status === 'pending') pending++;
                else if (status === 'confirmed') confirmed++;
                else if (status === 'cancelled') cancelled++;
                if (status !== 'cancelled' && slot.start_at < nowSec) past++;
            } else {
                free++;
            }
        }

        return {all: slots.length, free, mine, pending, confirmed, cancelled, past};
    }, [slots, bookedIds, slotStatuses]);

    const renderChip = (tab: TabDef) => {
        const count = counts[tab.key];
        const isActive = activeFilter === tab.key;
        return (
            <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`chip ${isActive ? 'chip-active' : ''}`}
                onClick={() => onChange(tab.key)}
                data-test-id={tab.testId}
            >
                {tab.label}
                <span className="chip-count">{count}</span>
            </button>
        );
    };

    // Base tabs shown to every viewer.
    const baseTabs: TabDef[] = [
        {key: 'all', label: t.Slots_FilterAll(), testId: 'slot-status-filter-all'},
        {key: 'free', label: t.Slots_FilterFree(), testId: 'slot-status-filter-free'},
    ];

    // Moderators / admins / owners / guests have no personal bookings here.
    if (!isRegularUser) {
        return (
            <div className="flex flex-wrap items-center gap-2" role="tablist" data-test-id="slot-status-filters">
                {baseTabs.map(renderChip)}
            </div>
        );
    }

    // Regular user: "All", "Free", then a plain "Мои:" label and the three
    // booking-status tabs (pending / confirmed / cancelled) in the same row.
    const mineTabs: TabDef[] = [
        {key: 'pending', label: t.Slots_FilterPending(), testId: 'slot-status-filter-pending'},
        {key: 'confirmed', label: t.Slots_FilterConfirmed(), testId: 'slot-status-filter-confirmed'},
        {key: 'cancelled', label: t.Slots_FilterCancelled(), testId: 'slot-status-filter-cancelled'},
    ];

    return (
        <div className="flex flex-wrap items-center gap-2" role="tablist" data-test-id="slot-status-filters">
            {baseTabs.map(renderChip)}
            <span className="text-muted text-sm ml-2" data-test-id="slot-status-filter-mine-label">
                {t.Slots_FilterMine()}:
            </span>
            {mineTabs.map(renderChip)}
        </div>
    );
};
