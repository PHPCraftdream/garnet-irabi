import {SupportStatus} from '@/Islands/Comms/Support/parts/supportTypes';
import {I18nForeground as t} from '@/I18nGen/I18nForeground';

const statusLabels: Record<SupportStatus, () => string> = {
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

/** Возвращает подпись статуса обращения. */
export function statusLabel(status: SupportStatus): string {
    const label = statusLabels[status];
    return label ? label() : status;
}
