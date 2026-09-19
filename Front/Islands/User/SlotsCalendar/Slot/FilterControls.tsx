import * as React from 'react';
import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';
import {Combobox} from '@common/Components/ui/Combobox';
import {ExpertMap} from '../types';

interface FilterChipGroupProps<T extends string> {
    options: readonly [T, string][];
    value: T;
    onChange: (value: T) => void;
    testIdPrefix: string;
}

export function FilterChipGroup<T extends string>({options, value, onChange, testIdPrefix}: FilterChipGroupProps<T>) {
    return (
        <div className="flex flex-wrap gap-1" role="tablist">
            {options.map(([val, label]) => (
                <button key={val} role="tab" aria-selected={value === val} className={`chip ${value === val ? 'chip-active' : ''}`} onClick={() => onChange(val)} data-test-id={`${testIdPrefix}-${val}`}>{label}</button>
            ))}
        </div>
    );
}

export const ExpertFilterField: React.FC<{experts: ExpertMap; expertIds: Set<string>; onChange: (ids: Set<string>) => void}> = ({experts, expertIds, onChange}) => {
    const expertEntries = Object.entries(experts);

    return (
        <>
            <label className="label-mini">
                {t.Slot_Expert()}
            </label>
            <Combobox
                options={[{value: '', label: t.Slots_AllExperts()}, ...expertEntries.map(([id, expert]) => ({value: id, label: expert.display_name}))]}
                value={expertIds.size === 0 ? '' : (expertIds.size === 1 ? [...expertIds][0] : '')}
                onChange={val => onChange(val ? new Set([val]) : new Set())}
                placeholder={t.Slots_AllExperts()}
                searchPlaceholder={t.IM_Search() + '...'}
                emptyText={t.Filter_NoResults()}
                testId="filter-expert"
            />
        </>
    );
};

export const PriceRangeFilterField: React.FC<{priceMin: string; priceMax: string; onChange: (key: 'priceMin' | 'priceMax', value: string) => void}> = ({priceMin, priceMax, onChange}) => {
    return (
        <>
            <label className="label-mini">
                {t.Slots_PriceRange()}
            </label>
            <div className="flex gap-1 items-center">
                <input type="number" className="form-control text-sm w-full" placeholder="min" aria-label={t.A11y_PriceMin()} value={priceMin} onChange={e => onChange('priceMin', e.target.value)} min={0} data-test-id="filter-price-min" />
                <span className="text-xs text-muted" aria-hidden="true">—</span>
                <input type="number" className="form-control text-sm w-full" placeholder="max" aria-label={t.A11y_PriceMax()} value={priceMax} onChange={e => onChange('priceMax', e.target.value)} min={0} data-test-id="filter-price-max" />
            </div>
        </>
    );
};
