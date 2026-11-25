import * as React from 'react';
import {STATUS_CLASS} from './STATUS_CLASS';

interface Props {
    status: string;
    label?: string;
}

/** Рисует универсальную плашку статуса с классом темы. */
export const UniversalBadge: React.FC<Props> = ({status, label}) => {
    const statusCls = STATUS_CLASS[status] || 'status-muted';
    return (
        <span className="universal-status-badge" data-status={statusCls}>
            {label || status}
        </span>
    );
};
