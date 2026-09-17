import * as React from 'react';
import {Combobox} from '@common/Components/ui/Combobox';
import {DateInput} from '@common/Components/ui/DateInput';
import {I18nForeground as t} from '../../../../I18nGen/I18nForeground';

export interface CommentsFilterState {
    authorId: number;
    expertId: number;
    dateFrom: string;
    dateTo: string;
    search: string;
    hiddenOnly: boolean;
}

interface Props {
    state: CommentsFilterState;
    authorOptions: {value: string; label: string}[];
    expertOptions: {value: string; label: string}[];
    loading: boolean;
    onChange: (patch: Partial<CommentsFilterState>) => void;
    onReset: () => void;
}

export const CommentsFilters: React.FC<Props> = ({state, authorOptions, expertOptions, loading, onChange, onReset}) => (
    <div className="admin-bookings-filters">
        <div className="filter-cell">
            <label>{t.Comment_Author()}</label>
            <Combobox
                options={authorOptions}
                value={String(state.authorId)}
                onChange={v => onChange({authorId: parseInt(v, 10) || 0})}
                placeholder={t.Admin_Filter_SelectUser()}
                searchPlaceholder={t.Admin_Filter_SearchUser()}
                emptyText={t.Admin_Filter_All()}
                testId="comments-author-filter"
            />
        </div>
        <div className="filter-cell">
            <label>{t.Comment_Expert()}</label>
            <Combobox
                options={expertOptions}
                value={String(state.expertId)}
                onChange={v => onChange({expertId: parseInt(v, 10) || 0})}
                placeholder={t.Admin_Filter_SelectExpert()}
                searchPlaceholder={t.Admin_Filter_SearchExpert()}
                emptyText={t.Admin_Filter_All()}
                testId="comments-expert-filter"
            />
        </div>
        <div className="filter-cell">
            <label htmlFor="comments-date-from">{t.Admin_Filter_DateFrom()}</label>
            <DateInput
                id="comments-date-from"
                value={state.dateFrom}
                onChange={e => onChange({dateFrom: e.target.value})}
                data-test-id="comments-date-from"
            />
        </div>
        <div className="filter-cell">
            <label htmlFor="comments-date-to">{t.Admin_Filter_DateTo()}</label>
            <DateInput
                id="comments-date-to"
                value={state.dateTo}
                onChange={e => onChange({dateTo: e.target.value})}
                data-test-id="comments-date-to"
            />
        </div>
        <div className="filter-cell">
            <label htmlFor="comments-search">{t.Comment_Filter_Search()}</label>
            <input
                id="comments-search"
                type="text"
                value={state.search}
                onChange={e => onChange({search: e.target.value})}
                className="form-control"
                data-test-id="comments-search"
            />
        </div>
        <div className="filter-cell">
            <label htmlFor="comments-hidden-only" className="flex items-center gap-2">
                <input
                    id="comments-hidden-only"
                    type="checkbox"
                    checked={state.hiddenOnly}
                    onChange={e => onChange({hiddenOnly: e.target.checked})}
                    data-test-id="comments-hidden-only"
                />
                <span>{t.Comment_Filter_HiddenOnly()}</span>
            </label>
        </div>
        <div className="filter-actions">
            <button
                type="button"
                className="btn btn-secondary"
                onClick={onReset}
                disabled={loading}
                data-test-id="comments-reset"
                aria-label={t.Admin_Filter_ResetAll()}
                title={t.Admin_Filter_ResetAll()}
            >
                {'× '}{t.Admin_Filter_ResetAll()}
            </button>
        </div>
    </div>
);
