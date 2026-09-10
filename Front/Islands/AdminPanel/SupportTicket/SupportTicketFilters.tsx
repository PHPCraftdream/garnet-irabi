import * as React from 'react';
import {Combobox} from '@common/Components/ui/Combobox';
import {DateInput} from '@common/Components/ui/DateInput';
import {I18nForeground as t} from '../../../I18nGen/I18nForeground';
import type {SupportStatus} from '../../Support/supportTypes';

export type DateField = 'updated_at' | 'created_at';

type StatusFilterValue = 'all' | SupportStatus;

interface StatusBarProps {
    total: number;
    statuses: SupportStatus[];
    counts: Record<string, number>;
    active: StatusFilterValue;
    statusLabel: (s: SupportStatus) => string;
    onSelect: (s: StatusFilterValue) => void;
}

const FilterChip: React.FC<{
    testId: string;
    active: boolean;
    label: string;
    count: number;
    onSelect: () => void;
}> = ({testId, active, label, count, onSelect}) => (
    <button
        type="button"
        data-test-id={testId}
        aria-selected={active}
        className={`admin-filter-btn ${active ? 'admin-filter-btn-active' : ''}`}
        onClick={onSelect}
    >
        {label} <span className="admin-filter-count">({count})</span>
    </button>
);

/** Состояния обращений. Показываются только те, за которыми что-то есть. */
export const SupportStatusBar: React.FC<StatusBarProps> = ({total, statuses, counts, active, statusLabel, onSelect}) => (
    <div className="admin-filter-bar">
        <FilterChip
            testId="support-filter-all"
            active={active === 'all'}
            label={t.Admin_Tab_All()}
            count={total}
            onSelect={() => onSelect('all')}
        />
        {statuses.map(status => (
            <FilterChip
                key={status}
                testId={`support-filter-${status}`}
                active={active === status}
                label={statusLabel(status)}
                count={counts[status]}
                onSelect={() => onSelect(status)}
            />
        ))}
    </div>
);

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
export const SupportTicketFilters: React.FC<FiltersProps> = (p) => (
    <div className="admin-bookings-filters mt-3">
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
        <div className="filter-cell">
            <label>{t.Admin_Filter_DateBy()}</label>
            <select
                className="form-select text-sm"
                value={p.dateField}
                onChange={e => p.onDateField(e.target.value as DateField)}
                data-test-id="support-date-field"
            >
                <option value="updated_at">{t.Admin_Filter_DateUpdated()}</option>
                <option value="created_at">{t.Admin_Filter_DateCreated()}</option>
            </select>
        </div>
        <div className="filter-cell">
            <label>{t.Admin_Filter_DateFrom()}</label>
            <DateInput className="text-sm" value={p.dateFrom} onChange={e => p.onDateFrom(e.target.value)} data-test-id="support-date-from" />
        </div>
        <div className="filter-cell">
            <label>{t.Admin_Filter_DateTo()}</label>
            <DateInput className="text-sm" value={p.dateTo} onChange={e => p.onDateTo(e.target.value)} data-test-id="support-date-to" />
        </div>
        <div className="filter-actions">
            {(p.userId || p.assigneeId || p.dateFrom || p.dateTo) && (
                <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    onClick={p.onReset}
                    data-test-id="support-filter-reset"
                    aria-label={t.Admin_Filter_ResetAll()}
                >
                    ×
                </button>
            )}
        </div>
    </div>
);
