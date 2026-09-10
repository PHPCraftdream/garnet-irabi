import {I18nForeground as t} from '../../../I18nGen/I18nForeground';

export interface AccountData {
    id: number;
    login: string;
    name: string;
    type: string;
    IS_ADMIN: string | number | null;
    IS_OWNER: string | number | null;
    IS_MODERATOR: string | number | null;
    IS_APPROVED: string | number | null;
    IS_DISABLED: string | number | null;
    reg_time?: number;
    last_online_time?: number;
    photo?: string;
    avatar?: string | null;
    avatar_full?: string | null;
}

export interface ExpertProfile {
    display_name: string;
    bio: string;
    photo: string | null;
}

export interface SlotRow {
    id: number;
    start_at: number | null;
    duration_min: number;
    cost: number;
    status: string;
    is_online: number | null;
    location: string | null;
}

export interface BookingRow {
    id: number;
    bookable_type: string;
    bookable_id: number;
    status: string;
    created_at: number;
    expert_id?: number;
    expert_name?: string;
    slot: {start_at: number; duration_min: number; cost: number} | null;
}

export interface LedgerRow {
    id: number;
    is_credit: number;
    amount: number;
    entry_type: string;
    note: string | null;
    created_at: number;
    party_id?: number | null;
    party_name?: string | null;
}

export interface BalanceRow {
    balance: number;
    updated_at: number;
}

export interface TicketRow {
    id: number;
    subject: string;
    status: string;
    created_at: number;
    updated_at: number;
}

export interface ExpertCancellationRow {
    id: number;
    slot_id: number;
    booking_id: number;
    user_id: number;
    reason: string;
    created_at: number;
    slot_start_at: number | null;
    user_name: string | null;
}

export interface UserCancellationRow {
    id: number;
    slot_id: number;
    booking_id: number;
    expert_id: number;
    reason: string;
    created_at: number;
    slot_start_at: number | null;
    expert_name: string | null;
}

export interface UserDetailData {
    account: AccountData;
    expertProfile: ExpertProfile | null;
    slots: SlotRow[];
    balance: BalanceRow | null;
    ledger: LedgerRow[];
    bookings: BookingRow[];
    tickets: TicketRow[];
    expertCancelCount: number;
    userCancelCount: number;
    expertDeclineCount: number;
    userDeclineCount: number;
    expertCancellations: ExpertCancellationRow[];
    userCancellations: UserCancellationRow[];
}

export const BOOKING_STATUS_CLS: Record<string, string> = {
    pending:   'status-warning',
    confirmed: 'bg-success',
    completed: 'status-info',
    cancelled: 'bg-secondary',
};

export const SLOT_STATUS_CLS: Record<string, string> = {
    free:      'status-muted',
    booked:    'bg-primary',
    completed: 'status-info',
    cancelled: 'bg-secondary',
};

export const TICKET_STATUS_CLS: Record<string, string> = {
    open:             'status-warning',
    investigation:    'status-info',
    in_progress:      'bg-primary',
    waiting_user:     'status-warning',
    waiting_support:  'status-warning',
    escalated:        'bg-danger',
    on_hold:          'bg-secondary',
    deferred:         'bg-secondary',
    low_priority:     'bg-secondary',
    resolved:         'bg-success',
    rejected:         'bg-secondary',
};

export function ticketStatusLabel(status: string): string {
    switch (status) {
        case 'open':             return t.Support_Status_Open();
        case 'investigation':    return t.Support_Status_Investigation();
        case 'in_progress':      return t.Support_Status_InProgress();
        case 'waiting_user':     return t.Support_Status_WaitingUser();
        case 'waiting_support':  return t.Support_Status_WaitingSupport();
        case 'escalated':        return t.Support_Status_Escalated();
        case 'on_hold':          return t.Support_Status_OnHold();
        case 'deferred':         return t.Support_Status_Deferred();
        case 'low_priority':     return t.Support_Status_LowPriority();
        case 'resolved':         return t.Support_Status_Resolved();
        case 'rejected':         return t.Support_Status_Rejected();
        default:                 return status;
    }
}
