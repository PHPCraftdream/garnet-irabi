import * as React from 'react';
import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';

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
