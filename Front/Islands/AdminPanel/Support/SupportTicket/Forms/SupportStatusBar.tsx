import * as React from 'react';
import {I18nForeground as t} from '../../../../../I18nGen/I18nForeground';
import type {SupportStatus} from '../../../../Comms/Support/parts/supportTypes';

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
