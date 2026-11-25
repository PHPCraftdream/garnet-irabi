import * as React from 'react';

interface FilterChipGroupProps<T extends string> {
    options: readonly [T, string][];
    value: T;
    onChange: (value: T) => void;
    testIdPrefix: string;
}

interface FilterChipProps<T extends string> {
    value: T;
    label: string;
    active: boolean;
    onChange: (value: T) => void;
    testId: string;
}

class FilterChip<T extends string> extends React.Component<FilterChipProps<T>> {
    /** Выбирает значение фильтра. */
    private readonly select = () => this.props.onChange(this.props.value);

    /** Отрисовывает кнопку фильтра. */
    public render() {
        const {label, active, testId} = this.props;
        return (
            <button
                role="tab"
                aria-selected={active}
                className={
                    active ? 'slot-filter-chip-active' : 'slot-filter-chip'
                }
                onClick={this.select}
                data-test-id={testId}
            >
                {label}
            </button>
        );
    }
}

export class FilterChipGroup<T extends string> extends React.Component<
    FilterChipGroupProps<T>
> {
    /** Создает кнопку для выбранного значения. */
    private readonly renderChip = ([value, label]: [T, string]) => (
        <FilterChip
            key={value}
            value={value}
            label={label}
            active={this.props.value === value}
            onChange={this.props.onChange}
            testId={`${this.props.testIdPrefix}-${value}`}
        />
    );

    /** Рисует набор переключаемых значений фильтра. */
    public render() {
        return (
            <div className="slot-filter-chips" role="tablist">
                {this.props.options.map(this.renderChip)}
            </div>
        );
    }
}
