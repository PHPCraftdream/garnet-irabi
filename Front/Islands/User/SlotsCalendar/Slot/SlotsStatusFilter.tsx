import * as React from 'react';
import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';
import {isConfirmed} from '../../../../Common/booking/bookingAction';
import {SlotItem, SlotStatusFilter} from '../types';

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

interface StatusChipProps {
    tab: TabDef;
    count: number;
    active: boolean;
    onChange: (filter: SlotStatusFilter) => void;
}

class StatusChip extends React.Component<StatusChipProps> {
    private readonly select = () => this.props.onChange(this.props.tab.key);

    public render() {
        const {tab, count, active} = this.props;
        return (
            <button
                type="button"
                role="tab"
                aria-selected={active}
                className={active ? 'slot-filter-chip-active' : 'slot-filter-chip'}
                onClick={this.select}
                data-test-id={tab.testId}
            >
                {tab.label}
                <span className={active ? 'slot-status-count-active' : 'slot-status-count'}>{count}</span>
            </button>
        );
    }
}

export class SlotsStatusFilter extends React.Component<Props> {
    // Keep the original reference-based memoization.
    private countsCache?: {slots: SlotItem[]; bookedIds: Set<number>; slotStatuses: Record<string, string>; counts: FilterCounts};

    private counts(): FilterCounts {
        const {slots, bookedIds, slotStatuses} = this.props;
        const cached = this.countsCache;
        if (cached && cached.slots === slots && cached.bookedIds === bookedIds && cached.slotStatuses === slotStatuses) return cached.counts;

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
                else if (isConfirmed(status)) confirmed++;
                else if (status === 'cancelled') cancelled++;
                if (status !== 'cancelled' && slot.start_at < nowSec) past++;
            } else {
                free++;
            }
        }
        const counts = {all: slots.length, free, mine, pending, confirmed, cancelled, past};
        this.countsCache = {slots, bookedIds, slotStatuses, counts};
        return counts;
    }

    private readonly renderChip = (tab: TabDef) => (
        <StatusChip
            key={tab.key}
            tab={tab}
            count={this.counts()[tab.key]}
            active={this.props.activeFilter === tab.key}
            onChange={this.props.onChange}
        />
    );

    public render() {
        const {isModerator, currentAccountId} = this.props;
        const isRegularUser = !isModerator && currentAccountId > 0;
        const baseTabs: TabDef[] = [
            {key: 'all', label: t.Slots_FilterAll(), testId: 'slot-status-filter-all'},
            {key: 'free', label: t.Slots_FilterFree(), testId: 'slot-status-filter-free'},
        ];

        if (!isRegularUser) {
            return <div className="slot-status-filters" role="tablist" data-test-id="slot-status-filters">{baseTabs.map(this.renderChip)}</div>;
        }

        const mineTabs: TabDef[] = [
            {key: 'pending', label: t.Slots_FilterPending(), testId: 'slot-status-filter-pending'},
            {key: 'confirmed', label: t.Slots_FilterConfirmed(), testId: 'slot-status-filter-confirmed'},
            {key: 'cancelled', label: t.Slots_FilterCancelled(), testId: 'slot-status-filter-cancelled'},
        ];
        return (
            <div className="slot-status-filters" role="tablist" data-test-id="slot-status-filters">
                {baseTabs.map(this.renderChip)}
                <span className="slot-status-mine-label" data-test-id="slot-status-filter-mine-label">{t.Slots_FilterMine()}:</span>
                {mineTabs.map(this.renderChip)}
            </div>
        );
    }
}
