import * as React from 'react';
import {Combobox} from '@common/Components/ui/Combobox';
import {DateInput} from '@common/Components/ui/DateInput';
import {I18nForeground as t} from '@/I18nGen/I18nForeground';

const admin_Filter_ResetAll = t.Admin_Filter_ResetAll;

/**
 * Панель фильтров разделов админки.
 *
 * Ячейки описываются данными, а не вёрсткой: у каждого раздела свой набор, но
 * сама обвязка — подпись, поле, кнопка сброса — была написана в четырёх местах
 * одинаково, и каждое повторение добавляло уровень вложенности.
 */
export type FilterCell =
    | {kind: 'select'; id: string; label: string; value: string; options: {value: string; label: string}[];
        onChange: (v: string) => void}
    | {kind: 'text'; id: string; label: string; value: string; onChange: (v: string) => void}
    | {kind: 'date'; id: string; label: string; value: string; onChange: (v: string) => void}
    | {
          kind: 'person';
          id: string;
          label: string;
          value: number;
          options: {value: string; label: string}[];
          placeholder: string;
          searchPlaceholder: string;
          onChange: (v: number) => void;
      };

const renderOption = (option: {value: string; label: string}) => <option key={option.value}
        value={option.value}>{option.label}</option>;

class Cell extends React.Component<{cell: FilterCell}> {
    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    private readonly changePerson = (value: string) => {
        const {cell} = this.props;
        if (cell.kind === 'person') cell.onChange(parseInt(value, 10) || 0);
    };

    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    private readonly changeValue = (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const {cell} = this.props;
        if (cell.kind !== 'person') cell.onChange(event.target.value);
    };

    /** Формирует представление данных для соответствующего раздела панели. */
    private renderPerson(cell: Extract<FilterCell, {kind: 'person'}>) {
        return (
            <div className="filter-cell">
                <label>{cell.label}</label>
                <Combobox
                    options={cell.options}
                    value={String(cell.value)}
                    onChange={this.changePerson}
                    placeholder={cell.placeholder}
                    searchPlaceholder={cell.searchPlaceholder}
                    emptyText={t.Admin_Filter_All()}
                    testId={cell.id}
                />
            </div>
        );
    }

    /** Формирует представление данных для соответствующего раздела панели. */
    private renderSelect(cell: Extract<FilterCell, {kind: 'select'}>) {
        return (
            <div className="filter-cell">
                <label htmlFor={cell.id}>{cell.label}</label>
                <select
                    id={cell.id}
                    value={cell.value}
                    onChange={this.changeValue}
                    className="admin-filter-field"
                    data-test-id={cell.id}
                >
                    {cell.options.map(renderOption)}
                </select>
            </div>
        );
    }

    /** Формирует представление данных для соответствующего раздела панели. */
    private renderDate(cell: Extract<FilterCell, {kind: 'date'}>) {
        return (
            <div className="filter-cell">
                <label htmlFor={cell.id}>{cell.label}</label>
                <DateInput id={cell.id} value={cell.value} onChange={this.changeValue} data-test-id={cell.id} />
            </div>
        );
    }

    /** Формирует представление данных для соответствующего раздела панели. */
    private renderText(cell: Extract<FilterCell, {kind: 'text'}>) {
        return (
            <div className="filter-cell">
                <label htmlFor={cell.id}>{cell.label}</label>
                <input
                    id={cell.id}
                    type="text"
                    value={cell.value}
                    onChange={this.changeValue}
                    className="admin-filter-field"
                    data-test-id={cell.id}
                />
            </div>
        );
    }

    /** Формирует представление данных для соответствующего раздела панели. */
    public render() {
        const {cell} = this.props;
        if (cell.kind === 'person') return this.renderPerson(cell);
        if (cell.kind === 'select') return this.renderSelect(cell);
        if (cell.kind === 'date') return this.renderDate(cell);
        return this.renderText(cell);
    }
}

const renderCell = (cell: FilterCell) => <Cell key={cell.id} cell={cell} />;

interface Props {
    cells: FilterCell[];
    loading: boolean;
    resetTestId: string;
    onReset: () => void;
}

/** Отображает данные раздела и передаёт действия пользователя обработчикам. */
export const AdminFilterBar: React.FC<Props> = ({cells, loading, resetTestId, onReset}) => (
    <div className="admin-bookings-filters">
        {cells.map(renderCell)}
        <div className="filter-actions">
            <button
                type="button"
                className="admin-filter-reset"
                onClick={onReset}
                disabled={loading}
                data-test-id={resetTestId}
                aria-label={admin_Filter_ResetAll()}
                title={admin_Filter_ResetAll()}
            >
                {'× '}{admin_Filter_ResetAll()}
            </button>
        </div>
    </div>
);
