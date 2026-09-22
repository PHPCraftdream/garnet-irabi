import * as React from 'react';
import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';
import {FiltersState, ExpertMap, TimeOfDay, SlotType, OnlineFilter} from '../types';
import {ExpertFilterField} from './Filters/ExpertFilterField';
import {FilterChipGroup} from './Filters/FilterChipGroup';
import {PriceRangeFilterField} from './Filters/PriceRangeFilterField';

interface SlotsFiltersProps {
    filters: FiltersState;
    experts: ExpertMap;
    onChange: (filters: FiltersState) => void;
}

export const SlotsFilters: React.FC<SlotsFiltersProps> = ({filters, experts, onChange}) => {
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

    return (
        <div data-test-id="slots-filters">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                {/* Expert filter */}
                <div>
                    <ExpertFilterField experts={experts} expertIds={filters.expertIds} onChange={ids => updateFilter('expertIds', ids)} />
                </div>

                {/* Price range */}
                <div>
                    <PriceRangeFilterField priceMin={filters.priceMin} priceMax={filters.priceMax} onChange={(key, value) => updateFilter(key, value)} />
                </div>

                {/* Time of day */}
                <div>
                    <label className="label-mini">{t.Slot_Time()}</label>
                    <FilterChipGroup options={[['all', t.Admin_Tab_All()], ['morning', t.Slots_Morning()], ['day', t.Slots_Day()], ['evening', t.Slots_Evening()]] as [TimeOfDay, string][]} value={filters.timeOfDay} onChange={val => updateFilter('timeOfDay', val)} testIdPrefix="filter-time" />
                </div>

                {/* Slot type */}
                <div>
                    <label className="label-mini">{t.Slot_Type()}</label>
                    <FilterChipGroup options={[['all', t.Admin_Tab_All()], ['individual', t.Slots_Individual()], ['group', t.Slots_Group()]] as [SlotType, string][]} value={filters.slotType} onChange={val => updateFilter('slotType', val)} testIdPrefix="filter-type" />
                </div>

                {/* Online/Offline */}
                <div>
                    <label className="label-mini">{t.Slots_Online()} / {t.Slots_Offline()}</label>
                    <FilterChipGroup options={[['all', t.Admin_Tab_All()], ['online', t.Slots_Online()], ['offline', t.Slots_Offline()]] as [OnlineFilter, string][]} value={filters.onlineFilter} onChange={val => updateFilter('onlineFilter', val)} testIdPrefix="filter-online" />
                </div>
            </div>
        </div>
    );
};
