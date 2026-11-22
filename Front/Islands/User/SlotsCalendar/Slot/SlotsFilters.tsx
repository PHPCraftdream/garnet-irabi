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

export class SlotsFilters extends React.Component<SlotsFiltersProps> {
    private updateFilter<K extends keyof FiltersState>(key: K, value: FiltersState[K]): void {
        this.props.onChange({...this.props.filters, [key]: value});
    }

    private readonly changeExperts = (ids: Set<string>) => this.updateFilter('expertIds', ids);
    private readonly changePrice = (key: 'priceMin' | 'priceMax', value: string) => this.updateFilter(key, value);
    private readonly changeTime = (value: TimeOfDay) => this.updateFilter('timeOfDay', value);
    private readonly changeType = (value: SlotType) => this.updateFilter('slotType', value);
    private readonly changeOnline = (value: OnlineFilter) => this.updateFilter('onlineFilter', value);

    public render() {
        const {filters, experts} = this.props;
        return (
            <div data-test-id="slots-filters">
                <div className="slot-filters-grid">
                    <div>
                        <ExpertFilterField experts={experts} expertIds={filters.expertIds} onChange={this.changeExperts} />
                    </div>
                    <div>
                        <PriceRangeFilterField priceMin={filters.priceMin} priceMax={filters.priceMax} onChange={this.changePrice} />
                    </div>
                    <div>
                        <label className="slot-filter-label">{t.Slot_Time()}</label>
                        <FilterChipGroup options={[['all', t.Admin_Tab_All()], ['morning', t.Slots_Morning()], ['day', t.Slots_Day()], ['evening', t.Slots_Evening()]] as [TimeOfDay, string][]} value={filters.timeOfDay} onChange={this.changeTime} testIdPrefix="filter-time" />
                    </div>
                    <div>
                        <label className="slot-filter-label">{t.Slot_Type()}</label>
                        <FilterChipGroup options={[['all', t.Admin_Tab_All()], ['individual', t.Slots_Individual()], ['group', t.Slots_Group()]] as [SlotType, string][]} value={filters.slotType} onChange={this.changeType} testIdPrefix="filter-type" />
                    </div>
                    <div>
                        <label className="slot-filter-label">{t.Slots_Online()} / {t.Slots_Offline()}</label>
                        <FilterChipGroup options={[['all', t.Admin_Tab_All()], ['online', t.Slots_Online()], ['offline', t.Slots_Offline()]] as [OnlineFilter, string][]} value={filters.onlineFilter} onChange={this.changeOnline} testIdPrefix="filter-online" />
                    </div>
                </div>
            </div>
        );
    }
}
