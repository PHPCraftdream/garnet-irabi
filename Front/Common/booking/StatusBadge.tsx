import * as React from 'react';
import {STATUS_CLASS} from './statusClass';

interface Props {
    status: string;
    label?: string;
}

export const UniversalBadge: React.FC<Props> = ({status, label}) => {
    const statusCls = STATUS_CLASS[status] || 'status-muted';
    return (
        <span className="universal-status-badge" data-status={statusCls}>
            {label || status}
        </span>
    );
};
