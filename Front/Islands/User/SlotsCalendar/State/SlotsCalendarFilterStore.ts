import {Carburetor} from '@react-carburetor/core';
import type {FiltersState, SlotStatusFilter} from './types';
import type {ReadonlyFiltersState} from './slotsCalendarSelectors';

export const DEFAULT_FILTERS: FiltersState = {
    expertIds: new Set(),
    priceMin: '',
    priceMax: '',
    timeOfDay: 'all',
    slotType: 'all',
    onlineFilter: 'all',
};

interface FilterState {
    filters: ReadonlyFiltersState;
    statusFilter: SlotStatusFilter;
    weekOffset: number;
}

export class SlotsCalendarFilterStore extends Carburetor<FilterState> {
    constructor() {
        super({filters: DEFAULT_FILTERS, statusFilter: 'all', weekOffset: 0});
    }

    public readonly setFilters = (filters: ReadonlyFiltersState) => {
        const state = this.getData();
        if (state.filters === filters) return;
        this.setData({...state, filters});
    };

    public readonly setStatusFilter = (statusFilter: SlotStatusFilter) => {
        const state = this.getData();
        if (state.statusFilter === statusFilter) return;
        this.setData({...state, statusFilter});
    };

    public readonly resetFilters = () => this.setFilters(DEFAULT_FILTERS);

    public readonly previousWeek = () => {
        const state = this.getData();
        this.setData({...state, weekOffset: state.weekOffset - 1});
    };

    public readonly nextWeek = () => {
        const state = this.getData();
        this.setData({...state, weekOffset: state.weekOffset + 1});
    };

    public readonly today = () => {
        const state = this.getData();
        if (state.weekOffset === 0) return;
        this.setData({...state, weekOffset: 0});
    };
}
