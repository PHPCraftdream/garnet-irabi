import * as React from 'react';
import {AntiHookComponent} from '@react-carburetor/core';
import {I18nForeground as t} from '../../../../../I18nGen/I18nForeground';
import type {SupportStatus} from '../../../../Comms/Support/parts/supportTypes';

const admin_Tab_All = t.Admin_Tab_All;

type StatusFilterValue = 'all' | SupportStatus;

interface StatusBarProps {
    total: number;
    statuses: SupportStatus[];
    counts: Record<string, number>;
    active: StatusFilterValue;
    statusLabel: (s: SupportStatus) => string;
    onSelect: (s: StatusFilterValue) => void;
}

interface ChipProps {
    status: StatusFilterValue;
    active: boolean;
    label: string;
    count: number;
    onSelect: StatusBarProps['onSelect'];
}

class FilterChip extends AntiHookComponent<ChipProps> {
    /** Обновляет состояние интерфейса или передаёт действие пользователя обработчику. */
    private readonly select = () => this.props.onSelect(this.props.status);

    /** Формирует представление данных для соответствующего раздела панели. */
    render() {
        const {status, active, label, count} = this.props;
        return (
            <button type="button" data-test-id={`support-filter-${status}`} aria-selected={active}
                className="admin-support-status-chip" onClick={this.select}>
                {label} <span className="admin-support-status-count">({count})</span>
            </button>
        );
    }
}

    /** Обеспечивает работу соответствующей части интерфейса панели администратора. */
export function SupportStatusBar({total, statuses, counts, active, statusLabel, onSelect}: StatusBarProps) {
    const chips: React.ReactNode[] = [];
    for (const status of statuses) {
        chips.push(<FilterChip key={status} status={status} active={active === status} label={statusLabel(status)}
            count={counts[status]} onSelect={onSelect} />);
    }
    return (
        <div className="admin-support-status-bar">
            <FilterChip status="all" active={active === 'all'} label={admin_Tab_All()} count={total}
        onSelect={onSelect} />
            {chips}
        </div>
    );
}
