import * as React from 'react';
import {STATUS_CLASS} from './statusClass';

interface Props {
    status: string;
    label?: string;
    className?: string;
}

export const UniversalBadge: React.FC<Props> = ({status, label, className = ''}) => {
    const statusCls = STATUS_CLASS[status] || 'status-muted';
    return (
        // carburetor-disable-next-line require-function-class
        <span className={`universal-status-badge ${className}`} data-status={statusCls}>
            {label || status}
        </span>
    );
};
