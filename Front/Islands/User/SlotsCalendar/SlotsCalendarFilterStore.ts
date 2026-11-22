import {Carburetor} from '@react-carburetor/core';
import {FiltersState, SlotStatusFilter} from './types';

export const DEFAULT_FILTERS: FiltersState = {
    expertIds: new Set(),
    priceMin: '',
    priceMax: '',
    timeOfDay: 'all',
    slotType: 'all',
    onlineFilter: 'all',
};

interface FilterState {
    filters: FiltersState;
    statusFilter: SlotStatusFilter;
    weekOffset: number;
}

class CalendarState extends Carburetor<FilterState> {
    public replace(state: FilterState) {
        const version = this.getVersion();
        this.setData(state);
        // A structurally equal replacement still changes the React snapshot reference.
        if (this.getVersion() === version) {
            this.markAllChanged();
            this.emitUpdate();
        }
    }
}

export class SlotsCalendarFilterStore {
    private readonly store = new CalendarState({filters: DEFAULT_FILTERS, statusFilter: 'all', weekOffset: 0});

    public readonly getSnapshot = () => this.store.getData();
    public readonly subscribe = (notify: () => void) => {
        const id = this.store.subscribe(notify);
        return () => this.store.unsubscribe(id);
    };

    public readonly setFilters = (filters: FiltersState) => {
        const state = this.store.getData();
        if (state.filters === filters) return;
        this.store.replace({...state, filters});
    };

    public readonly setStatusFilter = (statusFilter: SlotStatusFilter) => {
        const state = this.store.getData();
        if (state.statusFilter === statusFilter) return;
        this.store.replace({...state, statusFilter});
    };

    public readonly resetFilters = () => this.setFilters(DEFAULT_FILTERS);

    public readonly previousWeek = () => {
        const state = this.store.getData();
        this.store.replace({...state, weekOffset: state.weekOffset - 1});
    };

    public readonly nextWeek = () => {
        const state = this.store.getData();
        this.store.replace({...state, weekOffset: state.weekOffset + 1});
    };

    public readonly today = () => {
        const state = this.store.getData();
        if (state.weekOffset === 0) return;
        this.store.replace({...state, weekOffset: 0});
    };
}
