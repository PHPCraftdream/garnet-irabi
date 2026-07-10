import * as React from 'react';
import {SupportStatus} from './supportTypes';
import {I18nForeground as t} from '../../I18nGen/I18nForeground';

export function statusLabel(status: SupportStatus): string {
    const map: Record<SupportStatus, () => string> = {
        open: () => t.Support_Status_Open(),
        investigation: () => t.Support_Status_Investigation(),
        in_progress: () => t.Support_Status_InProgress(),
        waiting_user: () => t.Support_Status_WaitingUser(),
        waiting_support: () => t.Support_Status_WaitingSupport(),
        escalated: () => t.Support_Status_Escalated(),
        on_hold: () => t.Support_Status_OnHold(),
        deferred: () => t.Support_Status_Deferred(),
        low_priority: () => t.Support_Status_LowPriority(),
        resolved: () => t.Support_Status_Resolved(),
        rejected: () => t.Support_Status_Rejected(),
    };
    return (map[status] || (() => status))();
}

const STATUS_CLASS: Record<string, string> = {
    open:              'status-info',
    investigation:     'status-active',
    in_progress:       'status-warning',
    waiting_user:      'status-notice',
    waiting_support:   'status-danger',
    escalated:         'status-special',
    on_hold:           'status-muted',
    deferred:          'status-muted',
    low_priority:      'status-muted',
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

export const ALL_STATUSES: SupportStatus[] = [
    'open', 'investigation', 'in_progress', 'waiting_user', 'waiting_support',
    'escalated', 'on_hold', 'deferred', 'low_priority', 'resolved', 'rejected',
];
