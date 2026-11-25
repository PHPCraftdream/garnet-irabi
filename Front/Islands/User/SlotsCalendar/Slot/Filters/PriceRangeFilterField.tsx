import * as React from 'react';
import {I18nForeground as t} from '../../../../../I18nGen/I18nForeground';

const slotsPriceRange = t.Slots_PriceRange;
const a11yPriceMin = t.A11y_PriceMin;
const a11yPriceMax = t.A11y_PriceMax;

interface Props {
    priceMin: string;
    priceMax: string;
    onChange: (key: 'priceMin' | 'priceMax', value: string) => void;
}

export class PriceRangeFilterField extends React.Component<Props> {
    /** Передаёт новое минимальное значение фильтра цены. */
    private readonly changeMin = (event: React.ChangeEvent<HTMLInputElement>) =>
        this.props.onChange('priceMin', event.target.value);
    /** Передаёт новое максимальное значение фильтра цены. */
    private readonly changeMax = (event: React.ChangeEvent<HTMLInputElement>) =>
        this.props.onChange('priceMax', event.target.value);

    /** Рисует поле минимальной цены. */
    private renderMin(priceMin: string) {
        return (
            <input
                type="number"
                className="slot-filter-price-input"
                placeholder="min"
                aria-label={a11yPriceMin()}
                value={priceMin}
                onChange={this.changeMin}
                min={0}
                data-test-id="filter-price-min"
            />
        );
    }

    /** Рисует поле максимальной цены. */
    private renderMax(priceMax: string) {
        return (
            <input
                type="number"
                className="slot-filter-price-input"
                placeholder="max"
                aria-label={a11yPriceMax()}
                value={priceMax}
                onChange={this.changeMax}
                min={0}
                data-test-id="filter-price-max"
            />
        );
    }

    /** Собирает строку диапазона цены. */
    public render() {
        const {priceMin, priceMax} = this.props;
        return (
            <>
                <label className="slot-filter-label">{slotsPriceRange()}</label>
                <div className="slot-filter-price-row">
                    {this.renderMin(priceMin)}
                    <span className="slot-filter-price-separator" aria-hidden="true">—</span>
                    {this.renderMax(priceMax)}
                </div>
            </>
        );
    }
}
