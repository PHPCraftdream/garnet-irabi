import * as React from 'react';
import {SupportStatus} from './supportTypes';
import {statusLabel} from './supportStatus';

const STATUS_CLASS: Record<string, string> = {
    open:              'status-info',
    investigation:     'status-active',
    in_progress:       'status-warning',
    waiting_user:      'status-notice',
    waiting_support:   'status-danger',
    escalated:         'status-special',
    on_hold:           'status-muted',
    resolved:          'status-success',
    rejected:          'status-muted',
};

export const StatusBadge: React.FC<{status: SupportStatus}> = ({status}) => {
    const statusCls = STATUS_CLASS[status] || 'status-muted';
    return (
        <span className={`common-status-pill ${statusCls}`}>
            {statusLabel(status)}
        </span>
    );
};
