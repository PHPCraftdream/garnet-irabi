import * as React from 'react';
import {Combobox} from '@common/Components/ui/Combobox';
import {DateInput} from '@common/Components/ui/DateInput';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';

/**
 * Панель фильтров разделов админки.
 *
 * Ячейки описываются данными, а не вёрсткой: у каждого раздела свой набор, но
 * сама обвязка — подпись, поле, кнопка сброса — была написана в четырёх местах
 * одинаково, и каждое повторение добавляло уровень вложенности.
 */
export type FilterCell =
    | {kind: 'select'; id: string; label: string; value: string; options: {value: string; label: string}[]; onChange: (v: string) => void}
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

const Cell: React.FC<{cell: FilterCell}> = ({cell}) => {
    if (cell.kind === 'person') {
        return (
            <div className="filter-cell">
                <label>{cell.label}</label>
                <Combobox
                    options={cell.options}
                    value={String(cell.value)}
                    onChange={v => cell.onChange(parseInt(v, 10) || 0)}
                    placeholder={cell.placeholder}
                    searchPlaceholder={cell.searchPlaceholder}
                    emptyText={t.Admin_Filter_All()}
                    testId={cell.id}
                />
            </div>
        );
    }

    if (cell.kind === 'select') {
        return (
            <div className="filter-cell">
                <label htmlFor={cell.id}>{cell.label}</label>
                <select
                    id={cell.id}
                    value={cell.value}
                    onChange={e => cell.onChange(e.target.value)}
                    className="form-control"
                    data-test-id={cell.id}
                >
                    {cell.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
            </div>
        );
    }

    if (cell.kind === 'date') {
        return (
            <div className="filter-cell">
                <label htmlFor={cell.id}>{cell.label}</label>
                <DateInput id={cell.id} value={cell.value} onChange={e => cell.onChange(e.target.value)} data-test-id={cell.id} />
            </div>
        );
    }

    return (
        <div className="filter-cell">
            <label htmlFor={cell.id}>{cell.label}</label>
            <input
                id={cell.id}
                type="text"
                value={cell.value}
                onChange={e => cell.onChange(e.target.value)}
                className="form-control"
                data-test-id={cell.id}
            />
        </div>
    );
};

interface Props {
    cells: FilterCell[];
    loading: boolean;
    resetTestId: string;
    onReset: () => void;
}

export const AdminFilterBar: React.FC<Props> = ({cells, loading, resetTestId, onReset}) => (
    <div className="admin-bookings-filters">
        {cells.map(cell => <Cell key={cell.id} cell={cell} />)}
        <div className="filter-actions">
            <button
                type="button"
                className="btn btn-secondary"
                onClick={onReset}
                disabled={loading}
                data-test-id={resetTestId}
                aria-label={t.Admin_Filter_ResetAll()}
                title={t.Admin_Filter_ResetAll()}
            >
                {'× '}{t.Admin_Filter_ResetAll()}
            </button>
        </div>
    </div>
);
