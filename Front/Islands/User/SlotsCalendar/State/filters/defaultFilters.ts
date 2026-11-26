import type {FiltersState} from '@/Islands/User/SlotsCalendar/State/view/types';

/** Фильтры календаря по умолчанию. */
export const DEFAULT_FILTERS: FiltersState = {
    expertIds: new Set(),
    priceMin: '',
    priceMax: '',
    timeOfDay: 'all',
    slotType: 'all',
    onlineFilter: 'all',
};
