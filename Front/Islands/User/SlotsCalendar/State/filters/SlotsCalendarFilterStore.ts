import {Carburetor} from '@react-carburetor/core';
import {DEFAULT_FILTERS} from './defaultFilters';
import type {SlotStatusFilter} from '@/Islands/User/SlotsCalendar/State/view/types';
import type {ReadonlyFiltersState} from './slotsCalendarSelectors';

interface FilterState {
    filters: ReadonlyFiltersState;
    statusFilter: SlotStatusFilter;
    weekOffset: number;
}

export class SlotsCalendarFilterStore extends Carburetor<FilterState> {
    /** Создаёт состояние компонента. */
    constructor() {
        super({filters: DEFAULT_FILTERS, statusFilter: 'all', weekOffset: 0});
    }

    /** Обновляет данные календаря. */
    public readonly setFilters = (filters: ReadonlyFiltersState) => {
        const state = this.getData();
        if (state.filters === filters) return;
        this.setData({...state, filters});
    };

    /** Обновляет данные календаря. */
    public readonly setStatusFilter = (statusFilter: SlotStatusFilter) => {
        const state = this.getData();
        if (state.statusFilter === statusFilter) return;
        this.setData({...state, statusFilter});
    };

    /** Обновляет данные календаря. */
    public readonly resetFilters = () => this.setFilters(DEFAULT_FILTERS);

    /** Обновляет данные календаря. */
    public readonly previousWeek = () => {
        const state = this.getData();
        this.setData({...state, weekOffset: state.weekOffset - 1});
    };

    /** Обновляет данные календаря. */
    public readonly nextWeek = () => {
        const state = this.getData();
        this.setData({...state, weekOffset: state.weekOffset + 1});
    };

    /** Обновляет данные календаря. */
    public readonly today = () => {
        const state = this.getData();
        if (state.weekOffset === 0) return;
        this.setData({...state, weekOffset: 0});
    };
}
