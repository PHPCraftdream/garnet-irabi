import * as React from 'react';
import {AntiHookComponent} from '@react-carburetor/core';
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

export class CommentsFilters extends AntiHookComponent<Props> {
    /** Обеспечивает работу соответствующей части интерфейса панели администратора. */
    private readonly author = (value: string) => this.props.onChange({authorId: parseInt(value, 10) || 0});
    /** Обеспечивает работу соответствующей части интерфейса панели администратора. */
    private readonly expert = (value: string) => this.props.onChange({expertId: parseInt(value, 10) || 0});
    /** Обеспечивает работу соответствующей части интерфейса панели администратора. */
    private readonly dateFrom = (event: React.ChangeEvent<HTMLInputElement>) => this.props.onChange({dateFrom:
        event.target.value});
    /** Обеспечивает работу соответствующей части интерфейса панели администратора. */
    private readonly dateTo = (event: React.ChangeEvent<HTMLInputElement>) => this.props.onChange({dateTo:
        event.target.value});
    /** Обеспечивает работу соответствующей части интерфейса панели администратора. */
    private readonly search = (event: React.ChangeEvent<HTMLInputElement>) => this.props.onChange({search:
        event.target.value});
    /** Обеспечивает работу соответствующей части интерфейса панели администратора. */
    private readonly hidden = (event: React.ChangeEvent<HTMLInputElement>) => this.props.onChange({hiddenOnly:
        event.target.checked});

    /** Формирует представление данных для соответствующего раздела панели. */
    private renderPeople() {
        const {state, authorOptions, expertOptions} = this.props;
        return (
            <>
                <div className="filter-cell">
                    <label>{t.Comment_Author()}</label>
                    <Combobox
                        options={authorOptions}
                        value={String(state.authorId)}
                        onChange={this.author}
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
                        onChange={this.expert}
                        placeholder={t.Admin_Filter_SelectExpert()}
                        searchPlaceholder={t.Admin_Filter_SearchExpert()}
                        emptyText={t.Admin_Filter_All()}
                        testId="comments-expert-filter"
                    />
                </div>
            </>
        );
    }

    /** Формирует представление данных для соответствующего раздела панели. */
    private renderDates() {
        const {state} = this.props;
        return (
            <>
                <div className="filter-cell">
                    <label htmlFor="comments-date-from">{t.Admin_Filter_DateFrom()}</label>
                    <DateInput
                        id="comments-date-from"
                        value={state.dateFrom}
                        onChange={this.dateFrom}
                        data-test-id="comments-date-from"
                    />
                </div>
                <div className="filter-cell">
                    <label htmlFor="comments-date-to">{t.Admin_Filter_DateTo()}</label>
                    <DateInput
                        id="comments-date-to"
                        value={state.dateTo}
                        onChange={this.dateTo}
                        data-test-id="comments-date-to"
                    />
                </div>
            </>
        );
    }

    /** Формирует представление данных для соответствующего раздела панели. */
    private renderSearchAndReset() {
        const {state, loading, onReset} = this.props;
        return (
            <>
                <div className="filter-cell">
                    <label htmlFor="comments-search">{t.Comment_Filter_Search()}</label>
                    <input
                        id="comments-search"
                        type="text"
                        value={state.search}
                        onChange={this.search}
                        className="admin-filter-field"
                        data-test-id="comments-search"
                    />
                </div>
                <div className="filter-cell">
                    <label htmlFor="comments-hidden-only" className="widget-header-actions">
                        <input
                            id="comments-hidden-only"
                            type="checkbox"
                            checked={state.hiddenOnly}
                            onChange={this.hidden}
                            data-test-id="comments-hidden-only"
                        />
                        <span>{t.Comment_Filter_HiddenOnly()}</span>
                    </label>
                </div>
                <div className="filter-actions">
                    <button
                        type="button"
                        className="admin-filter-reset"
                        onClick={onReset}
                        disabled={loading}
                        data-test-id="comments-reset"
                        aria-label={t.Admin_Filter_ResetAll()}
                        title={t.Admin_Filter_ResetAll()}
                    >
                        {'× '}{t.Admin_Filter_ResetAll()}
                    </button>
                </div>
            </>
        );
    }

    /** Формирует представление данных для соответствующего раздела панели. */
    render() {
        return (
            <div className="admin-bookings-filters">
                {this.renderPeople()}
                {this.renderDates()}
                {this.renderSearchAndReset()}
            </div>
        );
    }
}
