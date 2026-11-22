import * as React from 'react';
import {AntiHookComponent} from '@react-carburetor/core';
import {Combobox} from '@common/Components/ui/Combobox';
import {DateInput} from '@common/Components/ui/DateInput';
import {I18nForeground as t} from '../../../../../I18nGen/I18nForeground';

export type DateField = 'updated_at' | 'created_at';

interface FiltersProps {
    userOptions: {value: string; label: string}[];
    assigneeOptions: {value: string; label: string}[];
    userId: string;
    assigneeId: string;
    dateField: DateField;
    dateFrom: string;
    dateTo: string;
    onUserId: (v: string) => void;
    onAssigneeId: (v: string) => void;
    onDateField: (v: DateField) => void;
    onDateFrom: (v: string) => void;
    onDateTo: (v: string) => void;
    onReset: () => void;
}

/**
 * Фильтры списка обращений.
 *
 * Кнопка сброса появляется, только когда есть что сбрасывать: постоянный
 * крестик рядом с пустыми фильтрами ничего не значит.
 */
export class SupportTicketFilters extends AntiHookComponent<FiltersProps> {
    private readonly changeField = (event: React.ChangeEvent<HTMLSelectElement>) => this.props.onDateField(event.target.value as DateField);
    private readonly changeFrom = (event: React.ChangeEvent<HTMLInputElement>) => this.props.onDateFrom(event.target.value);
    private readonly changeTo = (event: React.ChangeEvent<HTMLInputElement>) => this.props.onDateTo(event.target.value);

    private renderPeople() {
        const p = this.props;
        return (
            <>
                <div className="filter-cell">
                    <label>{t.Admin_Filter_User()}</label>
                    <Combobox
                        options={p.userOptions}
                        value={p.userId}
                        onChange={p.onUserId}
                        placeholder={t.Admin_Filter_All()}
                        searchPlaceholder={t.Admin_Filter_SearchUser()}
                        testId="support-user-filter"
                    />
                </div>
                <div className="filter-cell">
                    <label>{t.Admin_Filter_Assignee()}</label>
                    <Combobox
                        options={p.assigneeOptions}
                        value={p.assigneeId}
                        onChange={p.onAssigneeId}
                        placeholder={t.Admin_Filter_All()}
                        searchPlaceholder={t.Admin_Filter_SearchUser()}
                        testId="support-assignee-filter"
                    />
                </div>
            </>
        );
    }

    private renderDatesAndReset() {
        const p = this.props;
        return (
            <>
                <div className="filter-cell">
                    <label>{t.Admin_Filter_DateBy()}</label>
                    <select
                        className="create-slot-select"
                        value={p.dateField}
                        onChange={this.changeField}
                        data-test-id="support-date-field"
                    >
                        <option value="updated_at">{t.Admin_Filter_DateUpdated()}</option>
                        <option value="created_at">{t.Admin_Filter_DateCreated()}</option>
                    </select>
                </div>
                <div className="filter-cell">
                    <label>{t.Admin_Filter_DateFrom()}</label>
                    <DateInput value={p.dateFrom} onChange={this.changeFrom} data-test-id="support-date-from" />
                </div>
                <div className="filter-cell">
                    <label>{t.Admin_Filter_DateTo()}</label>
                    <DateInput value={p.dateTo} onChange={this.changeTo} data-test-id="support-date-to" />
                </div>
                <div className="filter-actions">
                    {(p.userId || p.assigneeId || p.dateFrom || p.dateTo) && (
                        <button
                            type="button"
                            className="booking-cancel-dismiss"
                            onClick={p.onReset}
                            data-test-id="support-filter-reset"
                            aria-label={t.Admin_Filter_ResetAll()}
                        >
                            ×
                        </button>
                    )}
                </div>
            </>
        );
    }

    render() {
        return (
            <div className="admin-bookings-filters" data-support-filters>
                {this.renderPeople()}
                {this.renderDatesAndReset()}
            </div>
        );
    }
}
