import * as React from 'react';
import {I18nForeground as t} from '../../I18nGen/I18nForeground';
import {Combobox} from '@common/Components/ui/Combobox';
import {FiltersState, ExpertMap, TimeOfDay, SlotType, OnlineFilter} from './types';

interface SlotsFiltersProps {
    filters: FiltersState;
    experts: ExpertMap;
    onChange: (filters: FiltersState) => void;
}

export const SlotsFilters: React.FC<SlotsFiltersProps> = ({filters, experts, onChange}) => {
    const expertEntries = Object.entries(experts);

    const updateFilter = <K extends keyof FiltersState>(key: K, value: FiltersState[K]) => {
        onChange({...filters, [key]: value});
    };

    const _toggleExpert = (id: string) => {
        const next = new Set(filters.expertIds);
        if (next.has(id)) {
            next.delete(id);
        } else {
            next.add(id);
        }
        updateFilter('expertIds', next);
    };

    const allExpertsSelected = filters.expertIds.size === 0;

    return (
        <div data-test-id="slots-filters">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                {/* Expert filter */}
                <div>
                    <label className="label-mini">
                        {t.Slot_Expert()}
                    </label>
                    <Combobox
                        options={[
                            {value: '', label: t.Slots_AllExperts()},
                            ...expertEntries.map(([id, expert]) => ({value: id, label: expert.display_name})),
                        ]}
                        value={allExpertsSelected ? '' : (filters.expertIds.size === 1 ? [...filters.expertIds][0] : '')}
                        onChange={val => updateFilter('expertIds', val ? new Set([val]) : new Set())}
                        placeholder={t.Slots_AllExperts()}
                        searchPlaceholder={t.IM_Search() + '...'}
                        testId="filter-expert"
                    />
                </div>

                {/* Price range */}
                <div>
                    <label className="label-mini">
                        {t.Slots_PriceRange()}
                    </label>
                    <div className="flex gap-1 items-center">
                        <input
                            type="number"
                            className="form-control text-sm w-full"
                            placeholder="min"
                            aria-label={t.A11y_PriceMin()}
                            value={filters.priceMin}
                            onChange={e => updateFilter('priceMin', e.target.value)}
                            min={0}
                            data-test-id="filter-price-min"
                        />
                        <span className="text-xs text-muted" aria-hidden="true">—</span>
                        <input
                            type="number"
                            className="form-control text-sm w-full"
                            placeholder="max"
                            aria-label={t.A11y_PriceMax()}
                            value={filters.priceMax}
                            onChange={e => updateFilter('priceMax', e.target.value)}
                            min={0}
                            data-test-id="filter-price-max"
                        />
                    </div>
                </div>

                {/* Time of day */}
                <div>
                    <label className="label-mini">
                        {t.Slot_Time()}
                    </label>
                    <div className="flex flex-wrap gap-1" role="tablist">
                        {([
                            ['all', t.Admin_Tab_All()],
                            ['morning', t.Slots_Morning()],
                            ['day', t.Slots_Day()],
                            ['evening', t.Slots_Evening()],
                        ] as [TimeOfDay, string][]).map(([val, label]) => (
                            <button
                                key={val}
                                role="tab"
                                aria-selected={filters.timeOfDay === val}
                                className={`chip ${filters.timeOfDay === val ? 'chip-active' : ''}`}
                                onClick={() => updateFilter('timeOfDay', val)}
                                data-test-id={`filter-time-${val}`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Slot type */}
                <div>
                    <label className="label-mini">
                        {t.Slot_Type()}
                    </label>
                    <div className="flex flex-wrap gap-1" role="tablist">
                        {([
                            ['all', t.Admin_Tab_All()],
                            ['individual', t.Slots_Individual()],
                        ] as [SlotType, string][]).map(([val, label]) => (
                            <button
                                key={val}
                                role="tab"
                                aria-selected={filters.slotType === val}
                                className={`chip ${filters.slotType === val ? 'chip-active' : ''}`}
                                onClick={() => updateFilter('slotType', val)}
                                data-test-id={`filter-type-${val}`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Online/Offline */}
                <div>
                    <label className="label-mini">
                        {t.Slots_Online()} / {t.Slots_Offline()}
                    </label>
                    <div className="flex flex-wrap gap-1" role="tablist">
                        {([
                            ['all', t.Admin_Tab_All()],
                            ['online', t.Slots_Online()],
                            ['offline', t.Slots_Offline()],
                        ] as [OnlineFilter, string][]).map(([val, label]) => (
                            <button
                                key={val}
                                role="tab"
                                aria-selected={filters.onlineFilter === val}
                                className={`chip ${filters.onlineFilter === val ? 'chip-active' : ''}`}
                                onClick={() => updateFilter('onlineFilter', val)}
                                data-test-id={`filter-online-${val}`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};
