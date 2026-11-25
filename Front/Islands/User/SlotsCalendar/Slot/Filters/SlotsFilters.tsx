import * as React from 'react';
import {I18nForeground as t} from '../../../../../I18nGen/I18nForeground';
import {ExpertMap, TimeOfDay, SlotType, OnlineFilter} from '../../State/view/types';
import type {ReadonlyFiltersState} from '../../State/filters/slotsCalendarSelectors';
import {ExpertFilterField} from './ExpertFilterField';
import {FilterChipGroup} from './FilterChipGroup';
import {PriceRangeFilterField} from './PriceRangeFilterField';

const slotTime = t.Slot_Time;
const adminTabAll = t.Admin_Tab_All;
const slotsMorning = t.Slots_Morning;
const slotsDay = t.Slots_Day;
const slotsEvening = t.Slots_Evening;
const slotType = t.Slot_Type;
const slotsIndividual = t.Slots_Individual;
const slotsGroup = t.Slots_Group;
const slotsOnline = t.Slots_Online;
const slotsOffline = t.Slots_Offline;

interface SlotsFiltersProps {
    filters: ReadonlyFiltersState;
    experts: ExpertMap;
    onChange: (filters: ReadonlyFiltersState) => void;
}

export class SlotsFilters extends React.Component<SlotsFiltersProps> {
    /** Сохраняет выбранные фильтры календаря. */
    private updateFilter<K extends keyof ReadonlyFiltersState>(
        key: K,
        value: ReadonlyFiltersState[K],
    ): void {
        this.props.onChange({...this.props.filters, [key]: value});
    }

    /** Обновляет фильтр экспертов. */
    private readonly changeExperts = (ids: Set<string>) =>
        this.updateFilter('expertIds', ids);
    /** Обновляет диапазон цены. */
    private readonly changePrice = (
        key: 'priceMin' | 'priceMax',
        value: string,
    ) => this.updateFilter(key, value);
    /** Обновляет фильтр времени суток. */
    private readonly changeTime = (value: TimeOfDay) =>
        this.updateFilter('timeOfDay', value);
    /** Обновляет тип занятия. */
    private readonly changeType = (value: SlotType) =>
        this.updateFilter('slotType', value);
    /** Обновляет фильтр формата занятия. */
    private readonly changeOnline = (value: OnlineFilter) =>
        this.updateFilter('onlineFilter', value);

    /** Рисует выбор экспертов. */
    private renderExpertFilter(experts: ExpertMap, filters: ReadonlyFiltersState) {
        return (
            <div>
                <ExpertFilterField
                    experts={experts}
                    expertIds={filters.expertIds}
                    onChange={this.changeExperts}
                />
            </div>
        );
    }

    /** Рисует диапазон цены. */
    private renderPriceRow(filters: ReadonlyFiltersState) {
        return (
            <div>
                <PriceRangeFilterField
                    priceMin={filters.priceMin}
                    priceMax={filters.priceMax}
                    onChange={this.changePrice}
                />
            </div>
        );
    }

    /** Рисует фильтр времени суток. */
    private renderTimeRow(filters: ReadonlyFiltersState) {
        return (
            <div>
                <label className="slot-filter-label">{slotTime()}</label>
                <FilterChipGroup
                    options={[
                        ['all', adminTabAll()],
                        ['morning', slotsMorning()],
                        ['day', slotsDay()],
                        ['evening', slotsEvening()],
                    ] as [TimeOfDay, string][]}
                    value={filters.timeOfDay}
                    onChange={this.changeTime}
                    testIdPrefix="filter-time"
                />
            </div>
        );
    }

    /** Рисует фильтр типа занятия. */
    private renderTypeRow(filters: ReadonlyFiltersState) {
        return (
            <div>
                <label className="slot-filter-label">{slotType()}</label>
                <FilterChipGroup
                    options={[
                        ['all', adminTabAll()],
                        ['individual', slotsIndividual()],
                        ['group', slotsGroup()],
                    ] as [SlotType, string][]}
                    value={filters.slotType}
                    onChange={this.changeType}
                    testIdPrefix="filter-type"
                />
            </div>
        );
    }

    /** Рисует фильтр онлайн-формата. */
    private renderOnlineRow(filters: ReadonlyFiltersState) {
        return (
            <div>
                <label className="slot-filter-label">
                    {slotsOnline()} / {slotsOffline()}
                </label>
                <FilterChipGroup
                    options={[
                        ['all', adminTabAll()],
                        ['online', slotsOnline()],
                        ['offline', slotsOffline()],
                    ] as [OnlineFilter, string][]}
                    value={filters.onlineFilter}
                    onChange={this.changeOnline}
                    testIdPrefix="filter-online"
                />
            </div>
        );
    }

    /** Рисует набор фильтров календаря. */
    public render() {
        const {filters, experts} = this.props;
        return (
            <div data-test-id="slots-filters">
                <div className="slot-filters-grid">
                    {this.renderExpertFilter(experts, filters)}
                    {this.renderPriceRow(filters)}
                    {this.renderTimeRow(filters)}
                    {this.renderTypeRow(filters)}
                    {this.renderOnlineRow(filters)}
                </div>
            </div>
        );
    }
}
