import * as React from 'react';
import {I18nForeground as t} from '../../../../../I18nGen/I18nForeground';

interface Props {
    priceMin: string;
    priceMax: string;
    onChange: (key: 'priceMin' | 'priceMax', value: string) => void;
}

export class PriceRangeFilterField extends React.Component<Props> {
    private readonly changeMin = (event: React.ChangeEvent<HTMLInputElement>) => this.props.onChange('priceMin', event.target.value);
    private readonly changeMax = (event: React.ChangeEvent<HTMLInputElement>) => this.props.onChange('priceMax', event.target.value);

    public render() {
        const {priceMin, priceMax} = this.props;
        return (
            <>
                <label className="slot-filter-label">{t.Slots_PriceRange()}</label>
                <div className="slot-filter-price-row">
                    <input type="number" className="slot-filter-price-input" placeholder="min" aria-label={t.A11y_PriceMin()} value={priceMin} onChange={this.changeMin} min={0} data-test-id="filter-price-min" />
                    <span className="slot-filter-price-separator" aria-hidden="true">—</span>
                    <input type="number" className="slot-filter-price-input" placeholder="max" aria-label={t.A11y_PriceMax()} value={priceMax} onChange={this.changeMax} min={0} data-test-id="filter-price-max" />
                </div>
            </>
        );
    }
}
