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

export const BOOKING_STATUS_TONE: Record<string, string> = {
    pending:   'warning',
    confirmed: 'success',
    completed: 'info',
    cancelled: 'secondary',
};
