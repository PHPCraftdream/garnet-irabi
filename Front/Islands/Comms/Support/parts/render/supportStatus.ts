import {SupportStatus} from '../supportTypes';
import {I18nForeground as t} from '../../../../../I18nGen/I18nForeground';

export function statusLabel(status: SupportStatus): string {
    const map: Record<SupportStatus, () => string> = {
        open: () => t.Support_Status_Open(),
        investigation: () => t.Support_Status_Investigation(),
        in_progress: () => t.Support_Status_InProgress(),
        waiting_user: () => t.Support_Status_WaitingUser(),
        waiting_support: () => t.Support_Status_WaitingSupport(),
        escalated: () => t.Support_Status_Escalated(),
        on_hold: () => t.Support_Status_OnHold(),
        resolved: () => t.Support_Status_Resolved(),
        rejected: () => t.Support_Status_Rejected(),
    };
    return (map[status] || (() => status))();
}

export const ALL_STATUSES: SupportStatus[] = [
    'open', 'investigation', 'in_progress', 'waiting_user', 'waiting_support',
    'escalated', 'on_hold', 'resolved', 'rejected',
];
